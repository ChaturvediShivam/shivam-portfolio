import { test, expect, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PORTS } from "../playwright.config";
import {
  SAMPLE_PDF,
  CORRUPT_PDF,
  EMPTY_PDF,
  OVERSIZED_PDF,
  UNSUPPORTED_TXT,
  SCANNED_PDF,
} from "./global-setup";

/**
 * The public demo in a real browser.
 *
 * This suite proves what jsdom cannot: that pdfjs actually extracts text from a
 * real PDF, that the Turnstile widget loads and yields a token, that the Server
 * Action round-trips, and that the page holds together at five widths.
 *
 * ADDRESSES
 *
 * Every test presents a unique x-forwarded-for. The per-visitor limiter is real
 * and allows three analyses an hour; without distinct addresses the fourth test
 * in the file would fail for reasons that have nothing to do with it. The
 * limiter itself is exercised deliberately, by reusing one address.
 */

let addressCounter = 0;
/** A unique documentation-range address per caller. */
function nextAddress(): string {
  addressCounter += 1;
  return `203.0.113.${(addressCounter % 250) + 1}`;
}

async function openDemo(page: Page, port: number = PORTS.full, address = nextAddress()) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": address });
  await page.goto(`http://localhost:${port}/demo`);
  return address;
}

/**
 * Click Analyze the way a visitor can.
 *
 * The button stays disabled until Turnstile has handed back a token, which
 * takes about two seconds. Waiting for enablement is not a workaround — it is
 * the state a real click happens in.
 */
async function submit(page: Page) {
  await expect(analyzeButton(page)).toBeEnabled({ timeout: 30_000 });
  await analyzeButton(page).click();
}

const analyzeButton = (page: Page) => page.getByRole("button", { name: /analyze resume|try again/i });
const jdBox = (page: Page) => page.getByLabel(/paste a job description/i);
const fileInput = (page: Page) => page.locator('input[type="file"]');

/**
 * The page's own failure alert.
 *
 * Next injects `#__next-route-announcer__` with role="alert" on every page for
 * its own routing announcements, so a bare getByRole("alert") always matches at
 * least one element and can never assert absence.
 */
const failureAlert = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** Server Action posts, captured with their bodies. */
function captureActionPosts(page: Page): Request[] {
  const posts: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/demo")) posts.push(request);
  });
  return posts;
}

/** Waits for either a result or a failure, so no test hangs on the wrong one. */
async function waitForOutcome(page: Page) {
  await expect(
    page.getByRole("heading", { name: /match score/i }).or(failureAlert(page)),
  ).toBeVisible({ timeout: 90_000 });
}

// ---------------------------------------------------------------------------
// 2 · Page render
// ---------------------------------------------------------------------------
test.describe("page render", () => {
  test("renders the heading, upload, job description box and submit", async ({ page }) => {
    await openDemo(page);

    await expect(page.getByRole("heading", { name: "Resume AI", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: /1 · Resume/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /2 · Job description/ })).toBeVisible();
    await expect(jdBox(page)).toBeVisible();
    await expect(analyzeButton(page)).toBeEnabled();
    await expect(fileInput(page)).toHaveCount(1);
  });

  test("loads without a failed request of its own", async ({ page }) => {
    // Asserted on responses rather than console text: a console line reading
    // "Failed to load resource" names no URL, so it cannot be told apart from a
    // real one. /_vercel/insights only exists when deployed on Vercel, so it
    // 404s locally by design and is not the page's fault.
    const broken: string[] = [];
    page.on("response", (response) => {
      const url = response.url();
      if (response.status() < 400) return;
      if (/challenges\.cloudflare|_vercel\/insights/.test(url)) return;
      broken.push(`${response.status()} ${url}`);
    });

    await openDemo(page);
    // Not networkidle: the Turnstile widget keeps a connection to Cloudflare
    // open, so the network never goes idle and the wait would simply time out.
    // The button becoming enabled means the widget finished its work, which is
    // the real "page is done loading" signal here.
    await expect(analyzeButton(page)).toBeEnabled({ timeout: 30_000 });

    expect(broken).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3 · Feature flag
// ---------------------------------------------------------------------------
test.describe("feature flag", () => {
  test("FEATURE_PUBLIC_DEMO=true renders the workspace", async ({ page }) => {
    await openDemo(page, PORTS.full);
    await expect(analyzeButton(page)).toBeVisible();
  });

  test("FEATURE_PUBLIC_DEMO=false renders the unavailable state", async ({ page }) => {
    await openDemo(page, PORTS.demoOff);

    await expect(page.getByText(/not available right now/i)).toBeVisible();
    await expect(analyzeButton(page)).toHaveCount(0);
    await expect(jdBox(page)).toHaveCount(0);
    // The page still explains itself rather than 404ing.
    await expect(page.getByRole("heading", { name: "Resume AI", level: 1 })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4 · Resume upload
// ---------------------------------------------------------------------------
test.describe("resume upload", () => {
  test("extracts text from a real PDF in the browser", async ({ page }) => {
    await openDemo(page);
    await fileInput(page).setInputFiles(SAMPLE_PDF);

    // The filename appearing is the signal that extraction finished.
    await expect(page.getByText(/Ready: resume\.pdf/i)).toBeVisible({ timeout: 30_000 });
  });

  test("the bundled sample needs no upload at all", async ({ page }) => {
    await openDemo(page);
    await expect(page.getByRole("button", { name: /use the sample resume/i })).toBeDisabled();
    await expect(page.getByText(/Sample resume — Jordan Ellis/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5 · Bad uploads
// ---------------------------------------------------------------------------
test.describe("bad uploads", () => {
  const cases: [string, string, RegExp][] = [
    ["a corrupted PDF", CORRUPT_PDF, /could not be read|could not be opened|no text/i],
    ["an empty file", EMPTY_PDF, /could not be read|could not be opened|empty|no text/i],
    ["an oversized file", OVERSIZED_PDF, /under 5 MB/i],
    ["an unsupported type", UNSUPPORTED_TXT, /PDF|DOCX|not accepted|unsupported/i],
    ["a scanned PDF with no text layer", SCANNED_PDF, /no text|scan/i],
  ];

  for (const [label, path, expected] of cases) {
    test(`rejects ${label} with a readable message`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await openDemo(page);
      await fileInput(page).setInputFiles(path);

      await expect(page.getByText(expected).first()).toBeVisible({ timeout: 30_000 });
      // A rejection is not a crash.
      expect(errors).toEqual([]);
      await expect(analyzeButton(page)).toBeEnabled();

      // Nothing from the machine room reaches the page.
      const body = (await page.locator("body").textContent()) ?? "";
      expect(body).not.toMatch(/pdfjs|InvalidPDF|worker\.js|at .*\.tsx?:\d/i);
    });
  }
});

// ---------------------------------------------------------------------------
// 6 · Job description validation
// ---------------------------------------------------------------------------
test.describe("job description", () => {
  test("empty falls back to the sample rather than blocking", async ({ page }) => {
    await openDemo(page);
    await jdBox(page).fill("Something");
    await jdBox(page).fill("");

    await expect(page.getByText(/Sample posting — Senior Full Stack/i)).toBeVisible();
  });

  test("whitespace-only is treated as empty", async ({ page }) => {
    await openDemo(page);
    await jdBox(page).fill("      \n\t  ");
    await expect(page.getByText(/Sample posting — Senior Full Stack/i)).toBeVisible();
  });

  test("a valid posting is accepted", async ({ page }) => {
    await openDemo(page);
    await jdBox(page).fill("Senior Full Stack Engineer. React, TypeScript, Node.js, AWS.");
    await expect(page.getByText(/^\d+ characters$/)).toBeVisible();
    await expect(jdBox(page)).toHaveAttribute("aria-invalid", "false");
  });

  test("a very large posting is marked invalid before submitting", async ({ page }) => {
    await openDemo(page);
    await jdBox(page).fill("x".repeat(20_001));

    await expect(jdBox(page)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/Too long by/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 7 · Turnstile
// ---------------------------------------------------------------------------
test.describe("turnstile", () => {
  test("the widget loads and yields a token", async ({ page }) => {
    await openDemo(page);

    // Turnstile renders into a shadow root rather than a top-level iframe, so
    // the hidden response input is what can actually be observed — and it is
    // the thing that matters, being what gets submitted.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const el = document.querySelector<HTMLInputElement>(
              'input[name="cf-turnstile-response"]',
            );
            return el?.value ? el.value.length : 0;
          }),
        { timeout: 30_000, message: "turnstile never produced a token" },
      )
      .toBeGreaterThan(0);

    // And the button only becomes usable once it has.
    await expect(analyzeButton(page)).toBeEnabled();
  });

  test("a submit with no token is refused, and retry works after", async ({ page }) => {
    // Blocking the script means onSuccess never fires, so the action is called
    // with a null token — the same shape as an expired or forged one.
    await page.route("**/challenges.cloudflare.com/**", (route) => route.abort());
    await openDemo(page);

    // The widget cannot load, so the challenge never completes. The button is
    // re-enabled by the failure path rather than trapping the visitor.
    await expect(analyzeButton(page)).toBeEnabled({ timeout: 30_000 });
    await analyzeButton(page).click();
    await expect(failureAlert(page)).toContainText(/could not verify/i, { timeout: 30_000 });
    // No analysis was produced.
    await expect(page.getByRole("heading", { name: /match score/i })).toHaveCount(0);

    // Unblock and retry: the button offers a retry rather than a dead end.
    await page.unroute("**/challenges.cloudflare.com/**");
    await expect(page.getByRole("button", { name: /try again/i })).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// 8 & 9 · Submission and request shape
// ---------------------------------------------------------------------------
test.describe("submission", () => {
  test("one click produces exactly one server action", async ({ page }) => {
    await openDemo(page);
    const posts = captureActionPosts(page);

    await submit(page);
    await waitForOutcome(page);

    expect(posts).toHaveLength(1);
  });

  test("a double click never produces two", async ({ page }) => {
    await openDemo(page);
    const posts = captureActionPosts(page);

    await expect(analyzeButton(page)).toBeEnabled({ timeout: 30_000 });
    await analyzeButton(page).dblclick();
    await waitForOutcome(page);
    await page.waitForTimeout(1_000);

    expect(posts).toHaveLength(1);
  });

  test("sends only resumeText, jobDescription and turnstileToken", async ({ page }) => {
    await openDemo(page);
    const posts = captureActionPosts(page);

    await jdBox(page).fill("Senior engineer. React and TypeScript required.");
    await submit(page);
    await waitForOutcome(page);

    expect(posts.length).toBeGreaterThan(0);
    const body = posts[0].postData() ?? "";

    expect(body).toContain("resumeText");
    expect(body).toContain("jobDescription");
    expect(body).toContain("turnstileToken");

    // Nothing the server computes may originate in the browser.
    for (const forbidden of [
      "ParsedResume",
      "overallScore",
      "skillMatches",
      "missingSkills",
      "matchedSkills",
      "breakdown",
      "sections",
    ]) {
      expect(body, `"${forbidden}" must never leave the browser`).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// 10 · Successful response
// ---------------------------------------------------------------------------
test.describe("successful analysis", () => {
  test("renders score, breakdown and both skill lists", async ({ page }) => {
    await openDemo(page);
    await submit(page);

    await expect(page.getByRole("heading", { name: /match score/i })).toBeVisible({
      timeout: 90_000,
    });

    // A real number, not a placeholder.
    const score = await page.locator("text=/^\\d{1,3}$/").first().textContent();
    expect(Number(score)).toBeGreaterThan(0);
    expect(Number(score)).toBeLessThanOrEqual(100);

    for (const category of ["Skills", "Experience", "Education", "Keywords", "Responsibilities"]) {
      await expect(page.getByText(category, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: /matched \(\d+\)/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /missing \(\d+\)/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /ai review/i })).toBeVisible();
  });

  test("an uploaded PDF scores end to end", async ({ page }) => {
    await openDemo(page);
    await fileInput(page).setInputFiles(SAMPLE_PDF);
    await expect(page.getByText(/Ready: resume\.pdf/i)).toBeVisible({ timeout: 30_000 });

    await jdBox(page).fill(
      "Senior Full Stack Engineer. Required: React, TypeScript, Next.js, Node.js, GraphQL, PostgreSQL, AWS, Docker.",
    );
    await submit(page);

    await expect(page.getByRole("heading", { name: /match score/i })).toBeVisible({
      timeout: 90_000,
    });
    // The PDF's own skills reached the scorer, which proves extraction worked.
    await expect(page.getByText("TypeScript", { exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 11 & 12 · AI unavailable paths
// ---------------------------------------------------------------------------
test.describe("AI unavailable", () => {
  test("FEATURE_AI off still scores, with the fallback message", async ({ page }) => {
    await openDemo(page, PORTS.aiOff);
    await submit(page);

    await expect(page.getByRole("heading", { name: /match score/i })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText(/AI review is temporarily unavailable/i)).toBeVisible();
    await expect(page.getByText(/score above is unaffected/i)).toBeVisible();
    // Degradation is not an error state.
    await expect(failureAlert(page)).toHaveCount(0);
  });

  test("an exhausted budget still scores, with no provider request", async ({ page }) => {
    // This server runs with AI_DEMO_DAILY_TOKEN_BUDGET=1, so the preflight fails
    // for real rather than being mocked.
    const external: string[] = [];
    page.on("request", (request) => {
      if (/anthropic|openai/i.test(request.url())) external.push(request.url());
    });

    await openDemo(page, PORTS.budgetSpent);
    await submit(page);

    await expect(page.getByRole("heading", { name: /match score/i })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText(/AI review is temporarily unavailable/i)).toBeVisible();
    expect(external).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 13 · Rate limiting
// ---------------------------------------------------------------------------
test.describe("rate limiting", () => {
  test("a fourth analysis from one visitor is refused with a retry hint", async ({ page }) => {
    const address = `203.0.113.${200 + (addressCounter % 40)}`;
    addressCounter += 1;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await openDemo(page, PORTS.aiOff, address);
      await submit(page);
      await waitForOutcome(page);
    }

    await openDemo(page, PORTS.aiOff, address);
    await submit(page);

    const alert = failureAlert(page);
    await expect(alert).toBeVisible({ timeout: 45_000 });
    await expect(alert).toContainText(/used all of this hour|try again shortly/i);
    await expect(page.getByRole("heading", { name: /match score/i })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 15 · Responsive
// ---------------------------------------------------------------------------
test.describe("responsive", () => {
  for (const width of [375, 390, 768, 1024, 1440]) {
    test(`lays out without horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openDemo(page);

      await expect(analyzeButton(page)).toBeVisible();
      await expect(jdBox(page)).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // A page that scrolls sideways on a phone is broken, whatever it renders.
      expect(overflow, `horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }
});

// ---------------------------------------------------------------------------
// 16 · Accessibility
// ---------------------------------------------------------------------------
test.describe("accessibility", () => {
  test("no serious or critical axe violations on load", async ({ page }) => {
    await openDemo(page);
    // next-themes resolves the theme after hydration, so the first frames put
    // one palette on the other's background and every contrast check fails
    // transiently. Waiting is what a visitor experiences.
    await expect(analyzeButton(page)).toBeEnabled({ timeout: 30_000 });

    const results = await new AxeBuilder({ page })
      // Scoped to the demo. The shared navbar and footer carry their own
      // pre-existing contrast issues, which belong to the marketing site rather
      // than to this feature and are out of scope for T11.
      .include("main")
      .exclude('iframe[src*="challenges.cloudflare.com"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(
      blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`),
      "serious or critical accessibility violations",
    ).toEqual([]);
  });

  test("no serious or critical violations on the results view", async ({ page }) => {
    await openDemo(page, PORTS.aiOff);
    await submit(page);
    await expect(page.getByRole("heading", { name: /match score/i })).toBeVisible({
      timeout: 90_000,
    });

    const results = await new AxeBuilder({ page })
      .include("main")
      .exclude('iframe[src*="challenges.cloudflare.com"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("the whole flow is reachable by keyboard", async ({ page }) => {
    await openDemo(page);
    // Disabled controls are not focusable, and the submit stays disabled until
    // Turnstile answers. Tabbing before then would be measuring the wrong page.
    await expect(analyzeButton(page)).toBeEnabled({ timeout: 30_000 });

    const reachable = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      const description = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "";
        return `${el.tagName}:${(el.textContent ?? "").trim().slice(0, 30) || el.getAttribute("aria-label") || el.id}`;
      });
      if (description) reachable.add(description);
    }

    const joined = [...reachable].join(" | ");
    expect(joined).toMatch(/TEXTAREA/);
    expect(joined).toMatch(/analyze resume/i);
  });

  test("focus moves to the results once they exist", async ({ page }) => {
    await openDemo(page, PORTS.aiOff);
    await submit(page);
    await expect(page.getByRole("heading", { name: /match score/i })).toBeVisible({
      timeout: 90_000,
    });

    const focused = await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.getAttribute("tabindex"),
    );
    expect(focused).toBe("-1");
  });
});

// ---------------------------------------------------------------------------
// 18 · Security
// ---------------------------------------------------------------------------
test.describe("security", () => {
  test("no secret, stack trace or internal detail reaches the browser", async ({ page }) => {
    const bodies: string[] = [];
    page.on("response", async (response) => {
      const type = response.headers()["content-type"] ?? "";
      if (!/text|json|javascript/i.test(type)) return;
      try {
        bodies.push(await response.text());
      } catch {
        /* streamed or already consumed */
      }
    });

    await openDemo(page);
    await submit(page);
    await waitForOutcome(page);

    const all = bodies.join("\n");
    const forbidden: [string, RegExp][] = [
      ["service role key", /SUPABASE_SERVICE_ROLE_KEY|service_role/],
      ["provider api key", /sk-ant-|AI_PROVIDER_API_KEY/],
      ["turnstile secret", /CLOUDFLARE_TURNSTILE_SECRET/],
      ["demo owner id", /DEMO_OWNER_ID|DEMO_IP_SALT/],
      ["sql", /\bselect .* from \b|insert into |relation "/i],
      ["postgres error codes", /PGRST\d|SQLSTATE|violates .* constraint/i],
      ["stack trace", /\bat .*\.tsx?:\d+:\d+/],
      ["server paths", /\/Users\/[a-z]+\/shivam-portfolio/i],
    ];

    for (const [label, pattern] of forbidden) {
      expect(all, `${label} must never reach the browser`).not.toMatch(pattern);
    }
  });

  test("the security headers are present on the public route", async ({ page }) => {
    const response = await page.goto(`http://localhost:${PORTS.full}/demo`);
    const headers = response?.headers() ?? {};

    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
});
