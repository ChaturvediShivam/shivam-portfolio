/**
 * Page extractor. Injected into the active tab by the popup.
 *
 * MUST be entirely self-contained: `chrome.scripting.executeScript` serialises
 * the function and runs it in the page's world, so it can close over nothing
 * and import nothing.
 *
 * It reads, and never writes. It touches no page state, dispatches no events and
 * leaves no trace — a capture must not alter the page someone is looking at.
 *
 * WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY IS NOT
 *
 * It COLLECTS structure and never interprets it. Deciding which section is the
 * employer's job description and which is the job board's own editorial happens
 * on the server, in TypeScript, under test. This file only reports what the DOM
 * says, because it is the only place that can: a heading, a list item and a
 * paragraph are indistinguishable once flattened into text, and guessing which
 * is which from a blob is the class of heuristic that misread "Written by Surely
 * Remote" as a remote job.
 *
 * That split also keeps the risky half stable. This file needs an extension
 * reload to update; the classification rules do not.
 */
function captureCurrentPage() {
  var MAX_TEXT = 60000;
  var MAX_SECTIONS = 60;
  var MAX_SECTION_CHARS = 12000;
  var MAX_LABELS = 40;

  /* ------------------------------------------------------------- helpers --- */

  function txt(node) {
    if (!node) return "";
    var value = node.innerText || node.textContent || "";
    return value.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  function normalize(text) {
    return text.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT);
  }

  function meta(selector, attribute) {
    var el = document.querySelector(selector);
    var value = el && el.getAttribute(attribute || "content");
    return value ? value.trim().slice(0, 2000) : null;
  }

  /**
   * Containers whose contents are never part of the posting.
   *
   * `header` is deliberately NOT here: inside a job page it usually holds the
   * role title and its metadata, and excluding it would throw away the very
   * fields we came for. Real chrome is navigation, footers, sidebars of unrelated
   * links, and the recommendation rails every board bolts on.
   */
  var CHROME_SELECTOR = [
    "nav", "footer", "aside",
    '[role="navigation"]', '[role="contentinfo"]', '[role="search"]',
    '[aria-hidden="true"]',
    "[hidden]",
  ].join(",");

  /** Class/id words that mark a block as chrome even outside a chrome element. */
  var CHROME_WORDS =
    /(^|[-_ ])(nav|navbar|menu|breadcrumb|footer|sidebar|cookie|consent|banner|advert|ads?|promo|share|social|subscribe|newsletter|related|recommend|similar|suggested|more-jobs|otherjobs|carousel|modal|popup|toast|skip-link)([-_ ]|$)/i;

  function isChrome(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.closest && el.closest(CHROME_SELECTOR)) return true;

    // Walk a bounded number of ancestors checking class and id. Bounded because
    // deeply nested framework markup makes an unbounded walk expensive on a
    // click the person is waiting for.
    var node = el;
    for (var depth = 0; node && depth < 8; depth += 1) {
      var name = (node.className && typeof node.className === "string" ? node.className : "") + " " + (node.id || "");
      if (name.trim() && CHROME_WORDS.test(name)) return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * The element most likely to hold the posting.
   *
   * Tried in order of how specific the signal is: an explicit JobPosting
   * microdata scope, then the document's own main/article landmarks, then a
   * couple of conventional ids. Falls back to <body>, which is always correct
   * and merely less precise.
   */
  function postingRoot() {
    var candidates = [
      '[itemtype*="JobPosting"]',
      "main",
      '[role="main"]',
      "article",
      "#content",
      "#main",
      ".job-details",
      "#job-details",
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var node = document.querySelector(candidates[i]);
      if (node && txt(node).length >= 200) return node;
    }
    return document.body || document.documentElement;
  }

  /* ------------------------------------------------------------ sections --- */

  var BLOCK_TAGS = /^(H1|H2|H3|H4|H5|H6|P|LI|BLOCKQUOTE|PRE|TD|DD|DT|FIGCAPTION)$/;
  var HEADING_TAGS = /^H([1-6])$/;

  /**
   * Every text block inside the root, in document order, tagged by kind.
   *
   * A TreeWalker rather than querySelectorAll so the chrome check can reject a
   * whole subtree in one decision instead of re-testing every descendant.
   * Blocks nested inside another block (a <p> inside an <li>) are skipped, so
   * the same words are never reported twice.
   */
  function textBlocks(root) {
    var blocks = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el) {
        if (isChrome(el)) return NodeFilter.FILTER_REJECT;
        return BLOCK_TAGS.test(el.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });

    var seen = [];
    var node = walker.nextNode();
    while (node && blocks.length < 400) {
      // Skip a block whose text an already-accepted ancestor reported.
      var nested = false;
      for (var i = 0; i < seen.length; i += 1) {
        if (seen[i].contains && seen[i].contains(node)) {
          nested = true;
          break;
        }
      }
      if (!nested) {
        var text = txt(node);
        if (text) {
          var heading = HEADING_TAGS.exec(node.tagName);
          blocks.push({
            kind: heading ? "heading" : node.tagName === "LI" ? "item" : "text",
            level: heading ? Number(heading[1]) : 0,
            text: text.slice(0, 2000),
          });
          seen.push(node);
          if (seen.length > 200) seen.shift();
        }
      }
      node = walker.nextNode();
    }
    return blocks;
  }

  /**
   * Group blocks into heading-delimited sections.
   *
   * Text appearing before the first heading becomes a section with a null
   * heading — on most postings that is the role overview, which is employer
   * content and would otherwise be dropped.
   *
   * List items keep a "• " marker. A requirements list flattened into one
   * paragraph loses the fact that it was twelve separate requirements, and that
   * is most of what makes a description readable later.
   */
  function collectSections(root) {
    var blocks = textBlocks(root);
    var sections = [];
    var current = { heading: null, level: 0, parts: [] };

    function flush() {
      var text = current.parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (current.heading || text) {
        sections.push({
          heading: current.heading,
          level: current.level,
          text: text.slice(0, MAX_SECTION_CHARS),
        });
      }
    }

    for (var i = 0; i < blocks.length; i += 1) {
      var block = blocks[i];
      if (block.kind === "heading" && block.text.length <= 140) {
        flush();
        current = { heading: block.text, level: block.level, parts: [] };
      } else {
        current.parts.push(block.kind === "item" ? "• " + block.text : block.text);
      }
      if (sections.length >= MAX_SECTIONS) break;
    }
    flush();

    return sections.slice(0, MAX_SECTIONS);
  }

  /* -------------------------------------------------------------- labels --- */

  /**
   * Explicitly labelled values, from the two shapes that state a label/value
   * relationship in markup rather than by layout: a definition list, and a
   * two-column table row.
   *
   * Worth lifting separately even though the text parser can often recover the
   * same pairs after flattening, because here the DOM is asserting the
   * relationship. That is page evidence; the flattened version is a guess.
   */
  function collectLabels(root) {
    var labels = [];

    function add(label, value) {
      if (labels.length >= MAX_LABELS) return;
      var l = (label || "").replace(/\s+/g, " ").replace(/[:\s]+$/, "").trim();
      var v = (value || "").replace(/\s+/g, " ").trim();
      if (!l || !v || l.length > 40 || v.length > 200) return;
      labels.push({ label: l, value: v });
    }

    var lists = root.querySelectorAll("dl");
    for (var i = 0; i < lists.length && i < 10; i += 1) {
      if (isChrome(lists[i])) continue;
      var terms = lists[i].querySelectorAll("dt");
      for (var j = 0; j < terms.length; j += 1) {
        var dd = terms[j].nextElementSibling;
        if (dd && dd.tagName === "DD") add(txt(terms[j]), txt(dd));
      }
    }

    var rows = root.querySelectorAll("tr");
    for (var r = 0; r < rows.length && r < 60; r += 1) {
      if (isChrome(rows[r])) continue;
      var cells = rows[r].children;
      if (cells.length === 2) add(txt(cells[0]), txt(cells[1]));
    }

    return labels;
  }

  /* ---------------------------------------------------------------- misc --- */

  function jsonLd() {
    var blocks = [];
    var nodes = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < nodes.length; i += 1) {
      var raw = nodes[i].textContent;
      if (!raw || raw.length > 500000) continue;
      try {
        blocks.push(JSON.parse(raw));
      } catch (e) {
        /* one broken block must not lose the whole capture */
      }
      if (blocks.length >= 20) break;
    }
    return blocks;
  }

  /**
   * Visible text, read from the posting root.
   *
   * Reads a LIVE element: `innerText` is layout-dependent, so reading a detached
   * clone silently degrades to textContent — hidden elements come back and
   * paragraph breaks are lost. (Measured on a live page, a "cleaned" clone came
   * back longer than the real rendered text, which was the tell.)
   */
  function visibleText(root) {
    var scoped = txt(root);
    if (scoped.length >= 200) return normalize(scoped);
    return normalize(txt(document.body));
  }

  /** The first heading. Usually the role alone, where the document title also carries the company. */
  function heading(root) {
    var candidates = root.querySelectorAll("h1, h2");
    for (var i = 0; i < candidates.length; i += 1) {
      if (isChrome(candidates[i])) continue;
      var text = txt(candidates[i]);
      if (text && text.length <= 200) return text;
    }
    var h1 = document.querySelector("h1");
    var fallback = txt(h1);
    return fallback && fallback.length <= 200 ? fallback : null;
  }

  /**
   * The posting's canonical address.
   *
   * Preferred over `location.href` because it is the clean URL without tracking
   * parameters, which is what duplicate detection compares. Required to name a
   * real path: some boards point canonical at their own homepage, and adopting
   * that would file every job under one URL and collapse them all into
   * duplicates of each other.
   */
  function canonical() {
    var link = document.querySelector('link[rel="canonical"]');
    var href = link && link.href;
    if (!href) return null;
    try {
      var parsed = new URL(href, location.href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      if (parsed.pathname.length <= 1) return null;
      return parsed.toString();
    } catch (e) {
      return null;
    }
  }

  /** A selection is a strong hint. Ignored when too short to be a posting. */
  function selection() {
    var text = String(window.getSelection() || "").trim();
    return text.length >= 200 ? text.slice(0, MAX_TEXT) : null;
  }

  var root = postingRoot();

  return {
    url: location.href,
    canonicalUrl: canonical(),
    title: (document.title || "").trim().slice(0, 500),
    h1: heading(root),
    text: visibleText(root),
    sections: collectSections(root),
    labels: collectLabels(root),
    selection: selection(),
    jsonLd: jsonLd(),
    meta: {
      description: meta('meta[name="description"]'),
      ogTitle: meta('meta[property="og:title"]'),
      ogSiteName: meta('meta[property="og:site_name"]'),
      ogDescription: meta('meta[property="og:description"]'),
    },
  };
}
