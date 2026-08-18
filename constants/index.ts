export const SITE_CONFIG = {
  name: "Shivam Chaturvedi",
  // Title and description track the CV verbatim in positioning: the person a
  // recruiter finds here must be the person the CV describes, or the two
  // documents argue with each other in front of the hiring manager.
  title: "AI Application Engineer | Next.js, TypeScript & LLM Applications",
  description:
    "Shivam Chaturvedi — AI Application Engineer building production AI-powered applications with Next.js, React, TypeScript, Supabase and the Anthropic API, on a foundation of 4+ years in market and competitive intelligence.",
  // The single canonical production origin. `www` is what the deployment
  // actually serves — the apex 308-redirects to it — so every canonical signal
  // (metadataBase, og:url, JSON-LD, sitemap, robots) has to name this exact
  // host. Held here once rather than repeated per call site, which is how the
  // apex and www drifted apart to begin with. No trailing slash: callers
  // append their own path.
  url: "https://www.shivamchaturvedi.com",
  linkedin: "https://www.linkedin.com/in/shivamchaturvedi96/",
  // The live CV. Hyphenated, lowercase, no spaces: a filename with spaces
  // becomes %20 in every link, every share and every recruiter's address bar.
  // `/resume.pdf` (the June file) is gone; next.config.js permanently redirects
  // that path here so any link already sent out still resolves.
  resumeUrl: "/shivam-chaturvedi-cv.pdf",
  ebookPdfUrl: "/ebook.pdf",
};

/**
 * schema.org `knowsAbout` for the Person block in the marketing layout.
 *
 * Mirrors the CV's Technical Skills section in the vocabulary a recruiter or an
 * aggregator actually searches for. Held here rather than inline in the layout
 * because it is site copy — and because the vendor-neutrality test guards
 * app/ against vendor names, which is a rule about the AI layer, not about
 * whether a CV may list the APIs it uses.
 */
export const KNOWS_ABOUT = [
  "AI Application Development",
  "Large Language Model Applications",
  "Anthropic API",
  "Prompt Engineering",
  "Next.js",
  "React",
  "TypeScript",
  "Supabase",
  "PostgreSQL",
  "Vercel",
  "Competitive Intelligence",
  "Market Research",
];

// Both the desktop and mobile navs render from this one array, so an entry
// removed here disappears from both.
//
// "Research Notes" (/blog) is deliberately absent while all three notes are
// still unwritten — a primary nav item leading to three "Upcoming" cards reads
// as an unfinished site. The route, the page and RESEARCH_NOTES below are all
// left intact; restoring the section is putting this line back:
//   { name: "Research Notes", href: "/blog" },
// and re-adding the footer quick link plus the /blog entry in sitemap.xml.
export const NAV_LINKS = [
  { name: "Projects", href: "/#projects" },
  { name: "About", href: "/#about" },
  { name: "Research", href: "/#portfolio" },
  { name: "Contact", href: "/#contact" },
];

export const HERO_CONTENT = {
  badge: "AI Application Engineer",
  headline:
    "Building AI-powered applications through research, product thinking, and modern full-stack technologies.",
  subheadline:
    "I build production AI applications with Next.js, TypeScript, Supabase and the Anthropic API — bringing 4+ years of market and competitive intelligence to the part most engineers skip: understanding the problem before building for it.",
  ctas: [
    {
      text: "View Projects",
      href: "#projects",
      primary: true,
      icon: "LayoutDashboard",
    },
    // `download` makes the browser save the PDF instead of navigating into a
    // viewer, and names the saved file — a recruiter ends up with
    // "Shivam-Chaturvedi-CV.pdf" in Downloads rather than a stray "cv.pdf".
    {
      text: "Download CV",
      href: SITE_CONFIG.resumeUrl,
      primary: false,
      icon: "Download",
      download: "Shivam-Chaturvedi-CV.pdf",
    },
    {
      text: "Connect on LinkedIn",
      href: SITE_CONFIG.linkedin,
      primary: false,
      icon: "Linkedin",
      external: true,
    },
  ],
  // Every figure here is the CV's figure. They diverged once (the site claimed
  // "100+ Research Engagements" where the CV says 40+ engagements and 100+
  // reports) and a recruiter reading both would have caught it.
  metrics: [
    { value: "4+", label: "Years Experience" },
    { value: "40+", label: "Research Engagements" },
    { value: "100+", label: "Intelligence Reports" },
    { value: "30+", label: "Countries Covered" },
  ],
};

export const ABOUT_CONTENT = {
  title: "The Evolution of My Research Framework",
  narrative: [
    {
      era: "Foundation in Risk & Verification",
      role: "ZIGRAM",
      text: "Built political exposure and risk profiles across 30+ countries. This established the core discipline: verify before asserting, triangulate before trusting, and maintain judgment under incomplete data.",
    },
    {
      era: "Expansion into Market Intelligence",
      role: "Jasper Colin Research",
      text: "Moved into market and competitive intelligence across SaaS, healthcare, industrial safety, and HVAC — learning how markets mature, how products compete, and what drives buyer decisions at the enterprise level.",
    },
    {
      era: "Research in the AI Era",
      role: "Today",
      text: "Today I use AI to accelerate discovery and organization, then apply human judgment to validate, structure, and decide. Speed scales the work; judgment protects the quality.",
    },
  ],
  philosophy:
    "Clear research starts with good questions, careful verification, and honest judgment. — S.C.",
};

export const RESEARCH_OS = [
  {
    step: 1,
    title: "Understanding the Core Problem",
    desc: "Breaking the business question down into what really needs to be answered",
  },
  {
    step: 2,
    title: "Defining the Goal",
    desc: "Setting clear, specific research objectives that guide the rest of the work",
  },
  {
    step: 3,
    title: "Building the Research Plan",
    desc: "Creating a practical plan that covers sources, methods, and success criteria",
  },
  {
    step: 4,
    title: "Gathering Information",
    desc: "Collecting data from public records, industry sources, and trusted databases",
  },
  {
    step: 5,
    title: "Cross-Checking Information",
    desc: "Verifying facts across multiple sources before using them in analysis",
  },
  {
    step: 6,
    title: "Resolving Data Gaps",
    desc: "Addressing missing or conflicting information with targeted follow-up",
  },
  {
    step: 7,
    title: "Connecting the Dots",
    desc: "Bringing findings together into a clear, structured picture",
  },
  {
    step: 8,
    title: "Final Review",
    desc: "Checking that the output directly answers the original question and is ready to use",
  },
];

export const CORE_PILLARS = [
  {
    title: "Investigative Research",
    desc: "A foundation in global due diligence and risk profiling, with strong attention to accuracy and detail.",
    icon: "Search",
  },
  {
    title: "Market & Competitive Intelligence",
    desc: "Analyzing technology adoption patterns and company-level dynamics across AI, SaaS, and other B2B sectors.",
    icon: "BarChart",
  },
  {
    title: "AI-Assisted Research",
    desc: "Using LLMs to speed up discovery and organization, with careful human review at every step.",
    icon: "Cpu",
  },
];

export const PORTFOLIO_CASE_STUDIES = [
  {
    title: "Global Due Diligence & Risk Research",
    objective:
      "Build detailed risk profiles across multiple jurisdictions to support AML/KYC and enhanced due diligence decisions.",
    scope:
      "200+ risk profiles across 30+ countries in Asia, Europe, Africa, and the Middle East over an 18-month period.",
    challenge:
      "Fragmented public records, inconsistent data quality across regions, and limited transparency in high-risk jurisdictions.",
    methodology:
      "Systematic multi-source collection from government gazettes, official registries, corporate filings, and adverse media.",
    validation:
      "Cross-verification through independent sources; every red flag was corroborated before inclusion.",
    outcome:
      "De-risked client onboarding and compliance decisions across 30+ jurisdictions by replacing single-source assumptions with multi-source validated risk profiles.",
    learning:
      "Accuracy in fragmented environments depends on source triangulation, not single-source completeness.",
  },
  {
    title: "Technology Adoption & Market Intelligence",
    objective:
      "Map adoption patterns of AI and cloud platforms across B2B segments by industry, revenue, and company size.",
    scope:
      "60+ B2B companies analyzed across North America, Europe, and APAC; three structured datasets built over a 9-month period.",
    challenge:
      "Avoiding sample bias by precisely identifying actual decision-makers and confirmed deployments rather than broad assumptions.",
    methodology:
      "Decomposed requirements, built screening questionnaires, and conducted targeted secondary research across public filings and press releases.",
    validation:
      "Confirmed technology deployment claims against official company statements and credible third-party reports.",
    outcome:
      "Accelerated GTM and survey-design decisions by segmenting 60+ confirmed B2B adopters by industry, revenue band, and deployment maturity.",
    learning:
      "Precision in screening architecture determines the quality of market intelligence outputs.",
  },
  {
    title: "Commercial HVAC Market Intelligence",
    objective:
      "Capture market dynamics, key players, and demand drivers in the commercial HVAC sector for strategic positioning.",
    scope:
      "45+ companies mapped across 10 countries; market sizing, product profiles, and demand drivers compiled over 4 months.",
    challenge:
      "Navigating technical product categories, regional market fragmentation, and inconsistent publicly available market sizing data.",
    methodology:
      "Developed sector-specific SOPs, mapped industry KPIs, and collected structured data on competitors, products, and regional trends.",
    validation:
      "Triangulated data across industry reports, manufacturer catalogs, and regional trade sources to resolve inconsistencies.",
    outcome:
      "Informed market-entry and product-positioning decisions with demand-segment intelligence and competitive benchmarks across 10 countries.",
    learning:
      "Domain onboarding is faster when terminology and product taxonomies are locked down early.",
  },
  {
    title: "Industrial Safety Equipment Competitive Intelligence",
    objective:
      "Profile the competitive landscape for industrial safety equipment to inform product positioning and market entry.",
    scope:
      "35+ competitors profiled across 12+ product categories in 8 countries, synthesized from datasheets and certification records over 3 months.",
    challenge:
      "Wide range of product categories, varying certification standards, and sparse public pricing or specification data.",
    methodology:
      "Built a competitive monitoring framework capturing product lines, certifications, geographic presence, and go-to-market channels.",
    validation:
      "Cross-referenced manufacturer datasheets, certification databases, and distributor listings to confirm claims.",
    outcome:
      "Reduced competitive blind spots for product and pricing decisions by mapping 35+ players across certifications, channels, and positioning gaps.",
    learning:
      "Certification and channel data are often more revealing than public pricing in B2B industrial markets.",
  },
];

export const SKILLS_EVIDENCE_MAP = {
  researchIntelligence: [
    {
      skill: "Secondary Research",
      source: "ZIGRAM & Jasper Colin Research",
      meaning:
        "Finding and synthesizing existing information from public records, reports, databases, and credible media rather than collecting original data.",
      usage:
        "Used on every due diligence and market project—ranging from government gazettes for risk profiles to industry reports for HVAC and technology adoption studies.",
    },
    {
      skill: "Information Gathering",
      source: "Jasper Colin Research",
      meaning:
        "Collecting structured facts from a wide range of sources in a systematic way so they can be analyzed and compared.",
      usage:
        "Built company, competitor, and market datasets across SaaS, industrial safety, and HVAC engagements by pulling from filings, press releases, and trade sources.",
    },
    {
      skill: "SOP Development",
      source: "Jasper Colin Research / ROS",
      meaning:
        "Documenting repeatable research procedures that keep quality consistent across projects and team members.",
      usage:
        "Created step-by-step guides for sector-specific market research and due diligence checks, reducing rework and onboarding time for new topics.",
    },
    {
      skill: "Thematic Clustering",
      source: "AI-Assisted Workflow",
      meaning:
        "Grouping findings by recurring themes, patterns, or topics to reveal structure in large amounts of unstructured information.",
      usage:
        "Applied when synthesizing research notes, open-source data, and LLM-assisted summaries into clear categories for analysis and reporting.",
    },
  ],
  dueDiligence: [
    {
      skill: "PEP Profiling",
      source: "ZIGRAM",
      meaning:
        "Identifying politically exposed persons and mapping their networks, roles, and risk exposure for compliance purposes.",
      usage:
        "Built profiles across 30+ countries as part of enhanced due diligence, helping compliance teams assess exposure.",
    },
    {
      skill: "AML & KYC Research",
      source: "ZIGRAM",
      meaning:
        "Researching individuals and entities for anti-money laundering and know-your-customer checks, looking for ownership, affiliations, and red flags.",
      usage:
        "Conducted on hundreds of risk profiles, connecting corporate records, beneficial ownership, and adverse media.",
    },
    {
      skill: "Risk Profiling",
      source: "ZIGRAM",
      meaning:
        "Assessing the level and nature of risk associated with a person, company, or jurisdiction based on verified signals.",
      usage:
        "Produced risk profiles across regions with fragmented public records, triangulating sources before flagging anything.",
    },
    {
      skill: "Adverse Media Screening",
      source: "ZIGRAM",
      meaning:
        "Searching news, legal records, and public sources for negative information about a subject.",
      usage:
        "Screened subjects across jurisdictions and languages, verifying whether negative coverage was credible and relevant before inclusion in profiles.",
    },
    {
      skill: "Global Due Diligence",
      source: "ZIGRAM",
      meaning:
        "Running end-to-end background checks that span multiple countries, legal systems, and data sources.",
      usage:
        "Completed 200+ profiles across Asia, Europe, Africa, and the Middle East over an 18-month period.",
    },
  ],
  marketResearch: [
    {
      skill: "Technology Adoption Analysis",
      source: "Jasper Colin Research",
      meaning:
        "Mapping how and where companies adopt specific technologies by segment, size, and industry.",
      usage:
        "Analyzed 60+ B2B companies across North America, Europe, and APAC to inform survey design and go-to-market strategy.",
    },
    {
      skill: "Company Profiling",
      source: "Jasper Colin Research & ZIGRAM",
      meaning:
        "Building structured summaries of a company's business, positioning, products, leadership, and relevant risks.",
      usage:
        "Used in both due diligence and competitive research, covering startups to large industrials across multiple sectors.",
    },
    {
      skill: "Cross-Industry Analysis",
      source: "Jasper Colin Research",
      meaning:
        "Comparing trends, players, and dynamics across different industries to identify common patterns or transferable insights.",
      usage:
        "Worked across SaaS, healthcare, industrial safety, and HVAC to compare how markets mature and how buying decisions are made.",
    },
    {
      skill: "Sectoral Mapping",
      source: "Jasper Colin Research",
      meaning:
        "Creating structured overviews of an entire sector: key players, products, demand drivers, and competitive dynamics.",
      usage:
        "Mapped the commercial HVAC landscape across 10 countries and the industrial safety market across 8 countries.",
    },
  ],
  validation: [
    {
      skill: "Multi-Source Triangulation",
      source: "ZIGRAM / ROS",
      meaning:
        "Confirming a fact by checking it against independent sources rather than relying on one data point.",
      usage:
        "Used on every risk profile and market dataset—especially important when public records were fragmented or inconsistent.",
    },
    {
      skill: "Information Verification",
      source: "ZIGRAM & Jasper Colin Research",
      meaning:
        "Checking that sources, claims, and data points are accurate, current, and relevant before using them.",
      usage:
        "Verified deployment claims, company ownership, and market figures against official statements, filings, and third-party reports.",
    },
    {
      skill: "Quality Assurance (QA)",
      source: "ZIGRAM",
      meaning:
        "Reviewing research output for accuracy, consistency, and completeness before it is delivered.",
      usage:
        "Performed QA on batches of risk profiles and due diligence reports, catching source gaps and inconsistencies before client delivery.",
    },
    {
      skill: "Audit & Correction",
      source: "ZIGRAM",
      meaning:
        "Going back through completed work to find errors, update stale facts, and fix weak sourcing.",
      usage:
        "Audited existing profiles against new findings, updating records and flagging items that needed re-verification.",
    },
  ],
  aiResearch: [
    {
      skill: "AI-Assisted Discovery",
      source: "AI-Assisted Workflow",
      meaning:
        "Using large language models to accelerate initial searches, summarize sources, and explore unfamiliar topics.",
      usage:
        "Used to quickly map new industries and identify source types before deeper manual verification.",
    },
    {
      skill: "Human-in-the-Loop Validation",
      source: "AI-Assisted Workflow / ROS",
      meaning:
        "Keeping human judgment at the center by reviewing, correcting, and confirming everything AI produces.",
      usage:
        "Every AI-assisted summary or claim is cross-checked against original sources before being included in final output.",
    },
    {
      skill: "Prompt-Driven Exploration",
      source: "AI-Assisted Workflow",
      meaning:
        "Designing clear, specific prompts to guide AI tools toward useful, structured research output.",
      usage:
        "Used to generate structured comparisons, source suggestions, and first-pass analyses that are then refined manually.",
    },
    {
      skill: "Workflow Acceleration",
      source: "Jasper Colin Research",
      meaning:
        "Speeding up repetitive research steps with better tools, templates, and processes without lowering quality.",
      usage:
        "Applied through SOPs, research templates, and AI-assisted drafting to deliver faster while maintaining accuracy.",
    },
  ],
  researchInfrastructure: [
    {
      tool: "LLMs (Claude, GPT, Gemini)",
      source: "AI-Assisted Workflow",
      meaning:
        "Large language models used to assist with discovery, summarization, and structuring of research material.",
      usage:
        "Used to explore unfamiliar sectors quickly, draft structured summaries, and generate source leads—always followed by human verification.",
    },
    {
      tool: "Public Records & Official Gazettes",
      source: "ZIGRAM",
      meaning:
        "Government-published sources such as registries, gazettes, and official notices used to verify facts about people and companies.",
      usage:
        "Primary source for ownership, directorship, and legal-history checks in due diligence across 30+ countries.",
    },
    {
      tool: "Industry-Specific Indices",
      source: "Jasper Colin Research",
      meaning:
        "Specialized data sources, rankings, and reports focused on particular industries or market segments.",
      usage:
        "Used to benchmark competitors, size markets, and validate claims in HVAC, industrial safety, and technology adoption projects.",
    },
  ],
};

export const WHO_I_HELP = [
  {
    title: "Advisory & Consulting Teams",
    desc: "Accelerated market, competitor, and industry intelligence for client-facing advisory work.",
    icon: "Building2",
  },
  {
    title: "Risk, Compliance & Legal Functions",
    desc: "Due diligence, PEP research, adverse media screening, and risk-backed compliance support.",
    icon: "ShieldCheck",
  },
  {
    title: "Strategy & Corporate Development",
    desc: "Structured competitive and market intelligence for M&A, entry, and strategic planning decisions.",
    icon: "Target",
  },
  {
    title: "Product, GTM & Commercial Teams",
    desc: "Segment mapping, technology adoption analysis, and market-gap intelligence for growth decisions.",
    icon: "Rocket",
  },
];

export const EBOOK_DATA = {
  title: "The Research Playbook",
  subtitle:
    "A practical framework for gathering, verifying, and structuring business research.",
  description:
    "Strong decisions depend on strong research. This playbook distills the process I use to scope questions, gather evidence, verify signals, and turn raw findings into clear, decision-ready recommendations.",
  takeaways: [
    "A clear framework for scoping and planning business research",
    "Practical techniques for competitive benchmarking",
    "Using AI to accelerate research while keeping human judgment central",
    "Turning raw findings into clear, credible recommendations",
  ],
};

export const CONTACT_INFO = {
  linkedin: "https://www.linkedin.com/in/shivamchaturvedi96/",
  location: "India-based — working remotely with US and global teams",
  availability: "Open to AI application engineering roles",
  preferredRoles:
    "AI Application Engineer, AI Engineer, Full-Stack Engineer (AI Products), Product Engineer, Forward-Deployed Engineer",
  preferredIndustries:
    "AI, Developer Tools, SaaS, Technology, Financial Services",
};

export const RESEARCH_NOTES = [
  {
    title: "The Evolution of Competitive Research in the AI Era",
    category: "Methodology",
    summary:
      "How research is shifting from collecting data to asking better questions and checking answers carefully in the age of LLMs.",
    slug: "evolution-of-ci-ai-era",
    status: "Upcoming",
  },
  {
    title: "The Validation Gap: Why Most Market Research Fails",
    category: "Quality Control",
    summary:
      "Why finding information is only the start, and how careful verification separates useful research from unreliable output.",
    slug: "the-validation-gap",
    status: "Upcoming",
  },
  {
    title: "Navigating Sparse Data in Global Due Diligence",
    category: "Investigation",
    summary:
      "Practical approaches for profiling people and businesses in jurisdictions with limited or scattered public records.",
    slug: "navigating-dark-data",
    status: "Upcoming",
  },
];

/**
 * Engineering projects — the portfolio's primary evidence for the AI Application
 * Engineer positioning.
 *
 * Every claim below is drawn from the project source itself (this repository for
 * CareerCRM, ~/Clients/Aviora for Aviora Estates) or from the CV. Nothing here is
 * an estimate, a projection, or a rounded-up number: these pages are read by
 * people who will ask follow-up questions in an interview, and a figure that
 * cannot survive "how did you measure that?" is worse than no figure.
 *
 * `PROJECTS[].slug` drives /projects/[slug]; the homepage grid renders the same
 * array, so a project added here appears in both without touching a component.
 */
export const PROJECTS = [
  {
    slug: "careercrm",
    name: "CareerCRM",
    tagline: "Personal AI-powered career and job-search operating system",
    period: "2026 — Present",
    role: "Sole designer and engineer",
    status: "In active personal use",
    featured: true,
    liveUrl: "/demo",
    liveLabel: "Try the Resume AI demo",
    repoUrl: null,
    stack: [
      "Next.js 15 (App Router)",
      "React 19",
      "TypeScript",
      "Tailwind CSS",
      "Supabase / PostgreSQL 17",
      "Anthropic API",
      "Vercel",
      "Sentry",
      "Vitest",
      "Playwright",
    ],
    problem:
      "A serious job search generates more state than a spreadsheet can hold: roles across a dozen boards, recruiters whose names blur together, which CV went to which company, what was said in a screening call three weeks ago, and which follow-up is now overdue. The information is not hard to find — it is hard to keep, and it decays fastest exactly when the search is most active.",
    solution:
      "A single private application that owns the whole pipeline: opportunities, companies, contacts, tasks, messages, calendar, documents and resume workflows, with an AI layer that summarises, drafts and answers questions over that data rather than over a blank page.",
    built: [
      "A full application pipeline with 19 stages from draft through offer, negotiation and acceptance, rendered as both a table and a kanban board.",
      "Opportunities, companies, contacts, tasks, messages, calendar and documents modules, each with a typed server-only data layer and validated Server Actions.",
      "A Resume AI workflow: deterministic ATS scoring, then AI review, section rewriting, cover-letter drafting, interview-question generation and LinkedIn optimisation.",
      "A public, anonymous demo of the resume analyser, throttled per visitor and bounded by its own token budget so a stranger can try the product without an account.",
      "A durable background job system for summarisation, sync and notification work.",
    ],
    architecture:
      "Next.js App Router with Server Components reading Postgres directly and Server Actions for every mutation, over a Supabase database where Row Level Security — not application code — is the authorization boundary. Every AI call is funnelled through a single gateway; every asynchronous task goes through a Postgres-backed queue. Migrations are additive-only and idempotent, so a schema change is safe to re-run against a live database.",
    aiImplementation:
      "One gateway is the only path to a model provider, so no caller can obtain a completion that skipped policy. A request passes through a feature flag, a burst rate limit, a versioned prompt registry, secret and PII redaction, an atomic token-budget reservation, the provider call, structured-output validation, consequence-classed tool authorization, and an audit row — in that order. The gateway depends on an AiProvider interface and never on a vendor SDK, which is verified by a test suite that exercises the whole file against a provider that has never heard of Anthropic.",
    decisions: [
      {
        title: "Provider-agnostic by construction, not by intention",
        detail:
          "The gateway is written against an interface, and the neutrality test runs it end to end against a fake provider. That converts 'we could swap models later' from a claim into something CI fails on if it stops being true.",
      },
      {
        title: "Token budget as one atomic SQL statement",
        detail:
          "Deriving a daily spend total by aggregating an audit log is racy — two concurrent calls both read the pre-spend total and both proceed — and gets slower with every call ever made. Budget enforcement is instead a single conditional INSERT … ON CONFLICT DO UPDATE against a counter row: correct under concurrency, constant time, and safe under a transaction-mode connection pooler.",
      },
      {
        title: "Fail closed on money, fail open on convenience",
        detail:
          "If the budget ledger cannot be read, the AI call is refused — an outage must never become unbounded spend. If the burst rate limiter cannot be read, the call is allowed, because the budget still bounds it underneath and refusing everything would turn a degraded database into a total outage.",
      },
      {
        title: "An append-only AI decision log enforced by trigger, not policy",
        detail:
          "Row Level Security is bypassed by the service-role key that server code holds, so RLS alone cannot make a table immutable. A BEFORE UPDATE OR DELETE trigger can — triggers are not bypassed by service_role — so the record of why the system did something cannot be rewritten by the system.",
      },
      {
        title: "Additive-only, idempotent migrations",
        detail:
          "Every migration guards each statement and never alters or drops an existing object, so it is safe to re-run and a partially applied migration is recoverable by running it again rather than by restoring a backup.",
      },
    ],
    challenges: [
      {
        title: "Billing accuracy for cached prompt tokens",
        detail:
          "The first budget implementation counted only input and output tokens. Providers also bill cache writes and cache reads, so the daily ceiling could be overspent by the size of the cached prefix on every single call. The fix was to make the budget count every token class the provider charges for, locked in by a token-accounting test suite.",
      },
      {
        title: "Claiming queued work safely behind a connection pooler",
        detail:
          "Supabase's transaction-mode pooler makes it unsafe to hold a transaction open across an HTTP round trip, which rules out the usual select-then-update claim. Jobs are leased in one statement using FOR UPDATE SKIP LOCKED, which also reclaims stale leases from workers that died mid-task.",
      },
      {
        title: "Stopping work, not just hiding it",
        detail:
          "Cancelling a streamed AI answer originally stopped the display while the provider call — and the billing — ran to completion. Breaking out of the stream now unwinds the gateway's cleanup path so the budget is reconciled against what was actually spent.",
      },
      {
        title: "Authentication is not authorization",
        detail:
          "The admin allowlist was originally enforced only at signup. Supabase's auth endpoint is reachable directly with the public anon key, so an account could be created without that route ever running. The allowlist was moved to every access point — middleware, API routes and Server Actions — and a regression suite now asserts that an authenticated non-admin is refused at each one.",
      },
    ],
    outcome:
      "The system is in daily personal use for a live job search. It ships with 1,025 unit tests across 66 files, twelve architecture decision records, and a CI pipeline that enforces lint, typecheck, tests and a production build on every pull request.",
    talkingPoints: [
      "Why the AI gateway is a chokepoint rather than a helper library — and what that buys you when a second AI feature is added.",
      "Why the token budget is a single SQL statement instead of a read-then-write in application code.",
      "How fail-closed and fail-open were chosen deliberately per control, rather than applied uniformly.",
      "Why Row Level Security is the authorization boundary when the database is reachable over PostgREST and the web app is not the only client.",
      "How a durable Postgres queue replaced the need for external queue infrastructure at this scale.",
      "What an append-only audit table actually requires once server code holds a key that bypasses RLS.",
    ],
  },
  {
    slug: "aviora-estates",
    name: "Aviora Estates",
    tagline: "Design-led booking site for an owner-managed luxury villa",
    period: "2026",
    role: "Client project — design and build",
    status: "Live in production",
    featured: true,
    liveUrl: "https://avioraestates.com",
    liveLabel: "avioraestates.com",
    repoUrl: null,
    stack: [
      "Next.js 15 (App Router, static generation)",
      "React 19",
      "TypeScript 5.7 (strict)",
      "Tailwind CSS",
      "Framer Motion",
      "GSAP",
      "react-day-picker",
      "next-themes",
      "Vercel",
    ],
    problem:
      "An owner-managed luxury villa near Noida needed a public presence that could take genuine booking enquiries without becoming a booking platform. The owner reviews every stay personally, so an instant-confirmation checkout would have made a promise the business does not keep.",
    solution:
      "A statically generated marketing site that presents the estate properly and routes every stay request through WhatsApp to the owner, carrying the dates and guest count already selected. The site collects the intent; a person makes the decision.",
    built: [
      "A responsive multi-page marketing site with a property detail page covering gallery, amenities, pricing and nearby locations.",
      "A booking request flow with a client-side date-range picker and guest count that hands off to WhatsApp with the selection preserved.",
      "A contact enquiry form and a waitlist modal for properties not yet released.",
      "Dark mode, plus SEO metadata, sitemap, robots and structured data.",
      "Trust-first content covering owner review, refund policy, ID verification and the security deposit.",
    ],
    architecture:
      "Statically generated Next.js on Vercel with no backend and no database in the delivered scope. Every page is prerendered; the only dynamic behaviour is client-side date selection, which composes a WhatsApp deep link rather than posting anywhere.",
    aiImplementation: null,
    decisions: [
      {
        title: "No payment processing, deliberately",
        detail:
          "Instant online payment would have implied instant confirmation, which the owner-review model does not offer. Keeping money out of the flow kept the site honest about how booking actually works, and removed PCI scope entirely.",
      },
      {
        title: "No guest data stored on a backend",
        detail:
          "Requests hand off to WhatsApp instead of being persisted. For a single-property site this removed the entire class of obligations that come with holding personal data, and removed the backend that would have needed maintaining after handover.",
      },
      {
        title: "Static generation over server rendering",
        detail:
          "The content changes rarely and the traffic is marketing traffic. Prerendering everything gave the fastest possible page loads and a site that cannot break at request time.",
      },
      {
        title: "Documented handover",
        detail:
          "The project ships with deployment, DNS and SSL notes plus a separated brand asset folder, so the client is not dependent on the original developer to redeploy or hand the site to someone else.",
      },
    ],
    challenges: [
      {
        title: "Communicating trust without a transaction",
        detail:
          "A luxury stay booked over WhatsApp needs to feel more credible than one booked through a payment form, not less. The answer was content rather than code: stating the owner-review process, refund policy, ID verification and deposit explicitly on the page instead of burying them in terms.",
      },
      {
        title: "Preserving selection across the handoff",
        detail:
          "The date range and guest count are chosen on the site but the conversation continues in WhatsApp. The request is composed into the deep link so the guest never re-types what they just selected and the owner receives a structured enquiry rather than 'is it available?'.",
      },
    ],
    outcome:
      "Live in production at avioraestates.com with the booking enquiry flow, contact form and waitlist in use, handed over with deployment and DNS documentation.",
    talkingPoints: [
      "When the right architecture is the one with no backend — and how to tell.",
      "Designing a conversion flow around a human approval step rather than around a checkout.",
      "Scoping a client project so the deliverable stays maintainable after handover.",
      "Why deferred features (iCal availability sync) were left as documented roadmap rather than half-built.",
    ],
  },
] as const;

export type Project = (typeof PROJECTS)[number];
