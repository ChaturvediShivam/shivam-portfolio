/**
 * Popup controller.
 *
 * Owns the whole flow: read the tab, ask the server to structure it, let the
 * person correct it, then save. Nothing is written until they press Save — the
 * confirmation step is the feature, not a formality.
 *
 * The network calls happen HERE rather than in the injected script. An
 * extension popup with `host_permissions` is exempt from CORS and carries the
 * user's session cookie; a content script is subject to both. That is also the
 * security boundary: the API sends no CORS headers, so an ordinary web page
 * cannot make the same request.
 */

const DEFAULT_BASE_URL = "https://www.shivamchaturvedi.com";

const el = (id) => document.getElementById(id);
const steps = ["idle", "busy", "review", "done", "error"];

/** Only ever one step visible; avoids half-states after a fast retry. */
function show(step, busyLabel) {
  for (const name of steps) el(`step-${name}`).hidden = name !== step;
  if (busyLabel) el("busy-label").textContent = busyLabel;
}

function setNotice(node, text) {
  node.hidden = !text;
  if (text) node.textContent = text;
}

async function getBaseUrl() {
  const stored = await chrome.storage.sync.get("baseUrl");
  return (stored.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

let currentTab = null;
let capture = null;

/* ------------------------------------------------------------------ tab --- */

async function loadTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  el("page-title").textContent = tab?.title || "Untitled page";
  let host = "";
  try {
    host = new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {
    host = tab?.url || "";
  }
  el("page-domain").textContent = host;

  // chrome:// and the Web Store are closed to extensions by policy. Saying so
  // up front is better than a failed capture that looks like a bug.
  const capturable = /^https?:/.test(tab?.url || "");
  el("capture").disabled = !capturable;
  if (!capturable) {
    el("page-domain").textContent = "This page cannot be captured — open a job posting first.";
  }
}

/* -------------------------------------------------------------- capture --- */

async function runCapture() {
  show("busy", "Reading the page…");
  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ["extractor.js"],
    }).then(() =>
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => captureCurrentPage(),
      }),
    );

    const page = injected?.result;
    if (!page || !page.url) throw new Error("Nothing could be read from this page.");

    show("busy", "Structuring…");
    const base = await getBaseUrl();
    const response = await fetch(`${base}/api/capture`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(page),
    });

    if (response.status === 401 || response.status === 403) return showSignIn(base);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `The server returned ${response.status}.`);
    }

    capture = await response.json();
    renderReview(capture);
    show("review");
  } catch (error) {
    showError(error.message || "Capture failed.");
  }
}

/* --------------------------------------------------------------- review --- */

const FIELD_IDS = {
  title: "f-title",
  company: "f-company",
  location: "f-location",
  location_type: "f-location-type",
  employment_type: "f-employment",
  seniority: "f-seniority",
  salary_min: "f-salary-min",
  salary_max: "f-salary-max",
  salary_currency: "f-currency",
  deadline_at: "f-deadline",
  job_url: "f-url",
  job_description: "f-description",
};

function renderReview(result) {
  const { job, provenance } = result;

  for (const [field, id] of Object.entries(FIELD_IDS)) {
    const input = el(id);
    const value = job[field];
    input.value = value == null ? "" : String(value);
  }

  // A chip only where something was actually found. An empty field carries no
  // badge, which is how "not available" stays visibly different from "found".
  for (const chip of document.querySelectorAll(".prov")) {
    const source = provenance[chip.dataset.prov];
    if (source) {
      chip.dataset.source = source;
      // Three different claims, so three different words. "guess" is the one
      // that matters: it is the only value nobody actually read off the page.
      chip.textContent = source === "page" ? "page" : source === "ai" ? "AI" : "guess";
    } else {
      delete chip.dataset.source;
      chip.textContent = "";
    }
  }

  updateCount();
  setNotice(el("notice"), result.notice);

  // Skills, experience and contacts are shown but not saved: the opportunity
  // has no column for them, and inventing one for V1 would be building schema
  // to hold data nobody has asked to query yet. Visible so the capture is not
  // silently throwing away what it found.
  const extras = [
    ["Skills", (job.skills || []).join(", ")],
    ["Experience", job.experience],
    ["Contact", [job.contact_name, job.contact_email].filter(Boolean).join(" · ")],
    ["Source", job.source],
  ].filter(([, value]) => value);

  el("extras").hidden = extras.length === 0;
  el("extras-list").innerHTML = "";
  for (const [term, value] of extras) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    el("extras-list").append(dt, dd);
  }

  renderDuplicate(result.duplicate);
}

async function renderDuplicate(duplicate) {
  const box = el("duplicate");
  if (!duplicate) {
    box.hidden = true;
    return;
  }
  const base = await getBaseUrl();
  const where = duplicate.archived_at ? "archived" : String(duplicate.stage).replace(/_/g, " ");
  el("duplicate-text").textContent = `Already tracked as “${duplicate.title}” (${where}).`;
  el("duplicate-link").href = `${base}/admin/opportunities/${duplicate.id}`;
  box.hidden = false;
}

function updateCount() {
  const length = el("f-description").value.length;
  el("desc-count").textContent = length ? `${length.toLocaleString()} chars` : "";
}

/* ----------------------------------------------------------------- save --- */

async function save() {
  const title = el("f-title").value.trim();
  if (!title) {
    setNotice(el("form-error"), "A role title is required.");
    el("f-title").focus();
    return;
  }

  setNotice(el("form-error"), null);
  el("save").disabled = true;
  show("busy", "Saving…");

  const payload = { stage: el("f-stage").value };
  for (const [field, id] of Object.entries(FIELD_IDS)) {
    payload[field] = el(id).value.trim() || null;
  }
  // Recording the date only when the capture is filed as already applied; an
  // "Applied on" of today would otherwise be wrong for everything merely saved.
  if (payload.stage === "applied") payload.applied_at = new Date().toISOString().slice(0, 10);

  try {
    const base = await getBaseUrl();
    const response = await fetch(`${base}/api/capture/save`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) return showSignIn(base);

    if (response.status === 409) {
      // Not an error to recover from — the work is already done. Send them to it.
      show("done");
      el("done-title").textContent = "Already in CareerCRM";
      el("done-link").textContent = "Open the existing opportunity";
      el("done-link").href = `${base}${body.url}`;
      return;
    }

    if (!response.ok) {
      const detail = body.fieldErrors ? Object.values(body.fieldErrors).join(" ") : body.error;
      setNotice(el("form-error"), detail || `The server returned ${response.status}.`);
      show("review");
      return;
    }

    show("done");
    el("done-title").textContent = "Saved to CareerCRM";
    el("done-link").textContent = "Open the opportunity";
    el("done-link").href = `${base}${body.url}`;
  } catch (error) {
    setNotice(el("form-error"), error.message || "Could not reach CareerCRM.");
    show("review");
  } finally {
    el("save").disabled = false;
  }
}

/* ---------------------------------------------------------------- error --- */

function showError(message) {
  el("error-text").textContent = message;
  el("error-action").hidden = true;
  show("error");
}

function showSignIn(base) {
  el("error-text").textContent = "You are not signed in to CareerCRM in this browser, or this account is not the admin.";
  el("error-action").hidden = false;
  el("error-action").href = `${base}/admin/login`;
  show("error");
}

/* ------------------------------------------------------------------ wire --- */

document.addEventListener("DOMContentLoaded", async () => {
  await loadTab();

  el("base-url").value = await getBaseUrl();
  el("settings-toggle").addEventListener("click", () => {
    const panel = el("settings");
    panel.hidden = !panel.hidden;
    el("settings-toggle").setAttribute("aria-expanded", String(!panel.hidden));
  });
  el("base-url").addEventListener("change", (event) => {
    chrome.storage.sync.set({ baseUrl: event.target.value.trim().replace(/\/+$/, "") });
  });

  el("capture").addEventListener("click", runCapture);
  el("save").addEventListener("click", save);
  el("back").addEventListener("click", () => show("idle"));
  el("retry").addEventListener("click", () => show("idle"));
  el("capture-another").addEventListener("click", () => show("idle"));
  el("f-description").addEventListener("input", updateCount);
});
