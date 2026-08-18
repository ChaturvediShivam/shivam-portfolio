/**
 * Page extractor. Injected into the active tab by the popup.
 *
 * MUST be entirely self-contained: `chrome.scripting.executeScript` serialises
 * the function and runs it in the page's world, so it can close over nothing
 * and import nothing.
 *
 * It reads, and never writes. It touches no page state, dispatches no events and
 * leaves no trace — a capture must not alter the page someone is looking at, and
 * must not be detectable as anything other than a read.
 *
 * Interpretation happens on the server. This returns raw material: title, URL,
 * metadata, structured-data blocks, and visible text.
 */
function captureCurrentPage() {
  const MAX_TEXT = 60000;

  function meta(selector, attribute) {
    const el = document.querySelector(selector);
    const value = el && el.getAttribute(attribute || "content");
    return value ? value.trim().slice(0, 2000) : null;
  }

  /**
   * Structured data blocks, parsed here rather than shipped as strings.
   *
   * A malformed block is skipped rather than failing the capture: pages
   * routinely carry one broken JSON-LD tag alongside three good ones, and
   * losing the whole capture to the broken one would be absurd.
   */
  function jsonLd() {
    const blocks = [];
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      const raw = node.textContent;
      if (!raw || raw.length > 500000) continue;
      try {
        blocks.push(JSON.parse(raw));
      } catch {
        /* skip this block */
      }
      if (blocks.length >= 20) break;
    }
    return blocks;
  }

  /**
   * Visible text, read from the narrowest element that still holds the posting.
   *
   * This used to strip navigation out of a DETACHED CLONE of <body>, which
   * quietly broke it: `innerText` is layout-dependent, and an element outside
   * the document has no layout, so it silently degrades to textContent-like
   * behaviour. The result pulled in hidden elements and lost the paragraph
   * breaks that make a posting readable — measured on a live page, the
   * "cleaned" clone came back LONGER (8,199 chars) than the real rendered text
   * (4,688), which is the tell.
   *
   * Reading a live container instead keeps `innerText` doing its job — CSS
   * visibility respected, real line breaks — and still mutates nothing, because
   * nothing is removed from anything. `<main>` and `<article>` already exclude
   * the site chrome the removal pass was trying to delete.
   */
  function visibleText() {
    const containers = ["main", '[role="main"]', "article", "#content", "#main"];
    for (const selector of containers) {
      const node = document.querySelector(selector);
      const scoped = node && node.innerText ? node.innerText.trim() : "";
      // A container holding almost nothing is a layout wrapper, not the
      // posting; fall through rather than capture an empty shell.
      if (scoped.length >= 200) return normalize(scoped);
    }
    return normalize((document.body && document.body.innerText) || "");
  }

  /** Collapse runs of spaces (including nbsp) and blank lines; cap the length. */
  function normalize(text) {
    return text
      .replace(/[^\S\n]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_TEXT);
  }

  /**
   * The first heading. On a page with no structured data this is the single
   * most reliable statement of the role: the document title normally appends
   * the company and the job board, the heading usually does not.
   */
  function heading() {
    const h1 = document.querySelector("h1");
    const text = h1 && h1.innerText ? h1.innerText.trim() : "";
    return text && text.length <= 200 ? text : null;
  }

  /**
   * A selection is a strong hint: someone highlighting the posting body is
   * telling us where it is. Ignored when it is too short to be a posting —
   * an accidental double-click should not replace the whole page.
   */
  function selection() {
    const text = String(window.getSelection() || "").trim();
    return text.length >= 200 ? text.slice(0, MAX_TEXT) : null;
  }

  return {
    url: location.href,
    title: (document.title || "").trim().slice(0, 500),
    h1: heading(),
    text: visibleText(),
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
