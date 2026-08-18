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
  /** Elements that are chrome, not content. Removed before reading text. */
  const CHROME_SELECTORS = [
    "script", "style", "noscript", "svg", "canvas", "iframe",
    "nav", "header", "footer", "aside",
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '[aria-hidden="true"]',
  ];

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
   * Visible text with the furniture stripped.
   *
   * Works on a detached clone so the live page is never mutated. `innerText`
   * rather than `textContent` because it respects CSS visibility and line
   * breaks — it returns roughly what a person sees, which is what the model is
   * being asked to read.
   */
  function visibleText() {
    let root;
    try {
      root = document.body.cloneNode(true);
      for (const el of root.querySelectorAll(CHROME_SELECTORS.join(","))) el.remove();
    } catch {
      root = document.body;
    }
    const text = (root.innerText || root.textContent || "");
    return text.replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT);
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
