export const SITE_CONFIG = {
  name: "Shivam Chaturvedi",
  title: "Strategic Research Analyst | Competitive & Market Intelligence | Due Diligence",
  description:
    "Authority-first portfolio of Shivam Chaturvedi — strategic intelligence, competitive analysis, market intelligence, due diligence, and AI-assisted research for high-stakes decisions.",
  linkedin: "https://www.linkedin.com/in/shivamchaturvedi96/",
  resumeUrl: "/resume.pdf",
  ebookPdfUrl: "/ebook.pdf",
  ebookCoverUrl: "/ebook-cover.png",
};

export const NAV_LINKS = [
  { name: "About", href: "/#about" },
  { name: "Portfolio", href: "/#portfolio" },
  { name: "Research Notes", href: "/blog" },
  { name: "Contact", href: "/#contact" },
];

export const HERO_CONTENT = {
  badge: "Strategic Research Analyst",
  headline:
    "Turning fragmented information into strategic intelligence, competitive insight, and risk-backed business decisions.",
  subheadline:
    "I support leadership and advisory teams with due diligence, competitive intelligence, market mapping, and AI-assisted research — converting scattered signals into structured, decision-ready insight.",
  ctas: [
    {
      text: "View Portfolio",
      href: "#portfolio",
      primary: true,
      icon: "LayoutDashboard",
    },
    {
      text: "Download Resume",
      href: SITE_CONFIG.resumeUrl,
      primary: false,
      icon: "Download",
      download: true,
    },
    {
      text: "Connect on LinkedIn",
      href: SITE_CONFIG.linkedin,
      primary: false,
      icon: "Linkedin",
      external: true,
    },
  ],
  metrics: [
    { value: "4", label: "Years Experience" },
    { value: "100+", label: "Research Engagements" },
    { value: "25+", label: "Countries Covered" },
    { value: "Multi-Industry", label: "Expertise" },
  ],
};

export const ABOUT_CONTENT = {
  title: "The Evolution of My Research Framework",
  narrative: [
    {
      era: "Foundation in Risk & Verification",
      role: "ZIGRAM",
      text: "Built political exposure and risk profiles across 25+ countries. This established the core discipline: verify before asserting, triangulate before trusting, and maintain judgment under incomplete data.",
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
  location: "Available Globally (Remote-first)",
  availability: "Open to strategic research and advisory opportunities",
  preferredRoles:
    "Strategic Research Analyst, Competitive Intelligence Analyst, Market Intelligence Analyst, Financial Analyst (FP&A), AI-Assisted Research Roles",
  preferredIndustries:
    "Technology, AI, SaaS, Financial Services, Consulting, Industrial B2B",
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
