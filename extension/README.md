# CareerCRM Capture

Captures a job posting from whatever page is open and saves it to CareerCRM
after you have reviewed it. Not specific to any job board: structured data is
used when a site publishes it, and the page text is read when it does not.

## Install (unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select this `extension/` folder
4. Sign in to CareerCRM in the same browser — the extension uses that session
   and holds no key of its own

## Use

Open a job posting, click the extension, press **Capture page**. Review what it
found, correct anything, then **Save to CareerCRM**.

Fields are labelled by where they came from:

- **page** — the site published it (schema.org JobPosting or Open Graph). High confidence.
- **AI** — inferred from the page text. Worth a glance.
- empty — nobody found it. Never invented.

## Pointing at a local server

The gear icon sets the CareerCRM URL. `http://localhost:3000` is already
permitted in the manifest; any other origin needs adding to `host_permissions`
and a reload of the extension.

## Why it needs no API key

It reuses your normal signed-in session, so there is one secret in the system
rather than two, and signing out revokes the extension. The API sends no CORS
headers, which is what stops an ordinary web page from making the same request —
the extension is exempt only because you granted it host permission at install.
