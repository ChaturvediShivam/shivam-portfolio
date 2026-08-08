/**
 * Bundled sample resume and job description for the public demo.
 *
 * Entirely fictional. Jordan Ellis does not exist, the companies do not exist,
 * and the contact details use the reserved example.com domain and the 555-01xx
 * block that is set aside for fiction. Nothing here is drawn from a real person.
 *
 * The pair is tuned to score in the mid-to-high seventies rather than near 100.
 * A sample that scores perfectly demonstrates nothing: there are no gaps to
 * explain, no recommendations to make, and the AI review has no work to do. The
 * resume is deliberately strong on React/TypeScript/Next.js and deliberately
 * silent on the posting's infrastructure requirements, so the analysis produces
 * real strengths, real gaps, and advice worth reading.
 *
 * Stored as strings rather than files under content/ so Next bundles them with
 * the server action — no filesystem read, no path resolution, nothing to trace.
 */

/**
 * Deliberate gaps, kept in one place so a future edit does not close them by
 * accident: the posting asks for AWS, Docker, Kubernetes, Terraform, Python and
 * observability tooling, and the resume names none of them.
 */
export const SAMPLE_DELIBERATE_GAPS = [
  "aws",
  "docker",
  "kubernetes",
  "terraform",
  "python",
  "observability",
] as const;

export const SAMPLE_RESUME_TEXT = `JORDAN ELLIS
Senior Frontend Engineer
jordan.ellis@example.com | (555) 0134 | Seattle, WA
github.com/jordan-ellis | linkedin.com/in/jordan-ellis

SUMMARY
Senior frontend engineer with 6 years building and shipping production React and
TypeScript applications. Comfortable owning a feature from design review through
rollout and on-call. Strongest in design systems, rendering performance and
accessibility; most recently led a Next.js App Router migration, including
server-side rendering, for a commerce site serving 400k monthly visitors.
Regularly designs relational schemas and the GraphQL APIs over them.

SKILLS
Languages: TypeScript, JavaScript, HTML, CSS, SQL
Frameworks and libraries: React, Next.js, Node.js, Express, Tailwind CSS
Data and APIs: GraphQL, REST, PostgreSQL, Redis
Tooling: Git, GitHub Actions, Vercel, Jest, Playwright, Storybook, Vite
Practices: Automated testing, accessibility (WCAG 2.1 AA), code review, Agile,
mentoring, technical writing

EXPERIENCE
Senior Frontend Engineer, Lumen Retail
2022 - Present
- Build and ship customer-facing features in React and TypeScript across a
storefront serving 400k monthly visitors.
- Led the migration of a 120-page storefront from Create React App to the
Next.js App Router, cutting largest contentful paint from 4.1s to 1.6s and
lifting organic conversion 18% quarter over quarter.
- Design GraphQL APIs and the PostgreSQL schema behind them for 9 product
teams, removing roughly 40% of duplicated query code and eliminating a
recurring class of cache-invalidation bugs.
- Own automated testing and continuous delivery for checkout: a Playwright
regression suite covering 87% of flows took production escapes from 6 per
quarter to 1.
- Mentor engineers and take part in design and code review; ran the weekly
frontend guild and supported 4 engineers through promotion.

Frontend Engineer, Northwind Labs
2020 - 2022
- Shipped a TypeScript design system of 60+ React components consumed by 5
product squads, cutting new-feature setup time from days to hours.
- Improved rendering performance and accessibility across the customer portal:
initial bundle size down 34% (612KB to 404KB) through route-level code
splitting, and WCAG 2.1 AA violations from 47 to 0 with automated axe checks
added to continuous integration.
- Partnered with backend on a REST-to-GraphQL migration for the account area.

Software Engineer, Bright Harbor
2019 - 2020
- Built internal operations dashboards in React and Node.js against PostgreSQL,
replacing a spreadsheet workflow used daily by 30 staff.
- Added the team's first CI pipeline in GitHub Actions, taking the release cycle
from fortnightly and manual to daily and automated.

PROJECTS
Kanban Studio
Open-source project board built with Next.js, TypeScript and PostgreSQL.
1.2k GitHub stars, 40+ outside contributors, ships with a Playwright suite.

Type-Safe Forms
A small React and TypeScript form library with schema-driven validation.
Roughly 3k weekly npm downloads.

EDUCATION
B.S. Computer Science, University of Washington, 2019
`;

export const SAMPLE_JD_TEXT = `Senior Full Stack Engineer
Meridian AI - Remote (US)

About the role
Meridian AI builds tooling that helps operations teams act on model output
instead of merely reading it. You will own user-facing product surfaces end to
end, from the React application through the services and schema behind it, and
you will work directly with the founders on what ships next.

Requirements
- 5+ years of professional software engineering experience
- Deep expertise in React and TypeScript in production
- Experience with Next.js, including server-side rendering and the App Router
- Strong Node.js background and comfort owning backend services
- Experience designing and consuming GraphQL APIs
- Working knowledge of PostgreSQL and relational schema design
- A track record of automated testing and CI/CD discipline
- Experience deploying and operating services on AWS
- Comfort with Docker and containerised local development

Preferred
- Kubernetes in production
- Infrastructure as code with Terraform
- Python for data and evaluation tooling
- Observability practice: tracing, structured logging, alerting
- Prior experience shipping an LLM-backed product feature

Responsibilities
- Build and ship customer-facing features in React and TypeScript
- Design GraphQL APIs and the PostgreSQL schema behind them
- Own automated testing and continuous delivery for your surfaces
- Deploy, monitor and operate services in AWS
- Improve rendering performance and accessibility across the product
- Mentor engineers and take part in design and code review

Benefits
Remote-first within the US, equity, learning budget, and hardware of choice.
`;
