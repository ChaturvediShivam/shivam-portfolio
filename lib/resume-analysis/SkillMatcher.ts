/**
 * Skill recognition and matching (Resume AI · Phase 3).
 *
 * Deterministic, dictionary-driven. A skill is recognised by matching against a
 * curated vocabulary of canonical names and their aliases — no model, no
 * embedding, no fuzzy distance.
 *
 * A dictionary is the right tool here rather than a limitation. Skill names are
 * a closed, slow-moving vocabulary with well-known synonyms, and the failure
 * modes of the alternatives are worse: string similarity matches "Java" to
 * "JavaScript", and a model hallucinates skills the resume never claimed. The
 * cost is that an unlisted skill is invisible, which is why `RELATED` exists and
 * why unknown JD terms still flow through keyword matching rather than being
 * dropped.
 *
 * Matching is token-boundary based throughout. Substring matching would find
 * "R" in every word and "Go" inside "going", producing skills the operator
 * never listed — the single most damaging error this module can make, because
 * it inflates the score with evidence that does not exist.
 */

import { tokenize } from "./KeywordExtractor";

export interface SkillDefinition {
  /** Canonical id, lowercase. */
  id: string;
  /** How it should be shown to the operator. */
  label: string;
  /** Alternate spellings and abbreviations, all lowercase. */
  aliases: string[];
  /**
   * Canonical ids that partly evidence this one. Directional and deliberately
   * conservative: knowing PostgreSQL is evidence of SQL, not the reverse.
   */
  implies?: string[];
}

/**
 * Curated skill vocabulary.
 *
 * Scoped to what appears in the job searches this CRM serves. It is data, not
 * logic — extending it is adding a row, and nothing else changes.
 */
const SKILLS: SkillDefinition[] = [
  // Languages
  { id: "javascript", label: "JavaScript", aliases: ["js", "ecmascript", "es6", "es2015"] },
  { id: "typescript", label: "TypeScript", aliases: ["ts"], implies: ["javascript"] },
  { id: "python", label: "Python", aliases: ["py", "python3"] },
  { id: "go", label: "Go", aliases: ["golang"] },
  { id: "java", label: "Java", aliases: [] },
  { id: "csharp", label: "C#", aliases: ["c#", "c sharp", "dotnet", ".net"] },
  { id: "cpp", label: "C++", aliases: ["c++", "cplusplus"] },
  { id: "ruby", label: "Ruby", aliases: ["ruby on rails", "rails"] },
  { id: "php", label: "PHP", aliases: [] },
  { id: "rust", label: "Rust", aliases: [] },
  { id: "kotlin", label: "Kotlin", aliases: [] },
  { id: "swift", label: "Swift", aliases: [] },
  { id: "scala", label: "Scala", aliases: [] },
  { id: "sql", label: "SQL", aliases: [] },
  { id: "bash", label: "Bash", aliases: ["shell", "shell scripting", "zsh"] },

  // Frontend
  { id: "react", label: "React", aliases: ["react.js", "reactjs"], implies: ["javascript"] },
  { id: "nextjs", label: "Next.js", aliases: ["next.js", "nextjs"], implies: ["react"] },
  { id: "vue", label: "Vue", aliases: ["vue.js", "vuejs"], implies: ["javascript"] },
  { id: "angular", label: "Angular", aliases: ["angularjs"], implies: ["typescript"] },
  { id: "svelte", label: "Svelte", aliases: ["sveltekit"], implies: ["javascript"] },
  { id: "tailwind", label: "Tailwind CSS", aliases: ["tailwindcss", "tailwind css"], implies: ["css"] },
  { id: "css", label: "CSS", aliases: ["css3", "scss", "sass"] },
  { id: "html", label: "HTML", aliases: ["html5"] },

  // Backend / infra
  { id: "nodejs", label: "Node.js", aliases: ["node", "node.js", "nodejs"], implies: ["javascript"] },
  { id: "express", label: "Express", aliases: ["express.js"], implies: ["nodejs"] },
  { id: "django", label: "Django", aliases: [], implies: ["python"] },
  { id: "flask", label: "Flask", aliases: [], implies: ["python"] },
  { id: "spring", label: "Spring", aliases: ["spring boot", "springboot"], implies: ["java"] },
  { id: "graphql", label: "GraphQL", aliases: [] },
  { id: "rest", label: "REST APIs", aliases: ["rest api", "rest apis", "restful"] },
  { id: "grpc", label: "gRPC", aliases: [] },
  { id: "microservices", label: "Microservices", aliases: ["micro services"] },
  { id: "event_sourcing", label: "Event Sourcing", aliases: ["event-sourcing"] },

  // Data
  { id: "postgresql", label: "PostgreSQL", aliases: ["postgres", "psql"], implies: ["sql"] },
  { id: "mysql", label: "MySQL", aliases: [], implies: ["sql"] },
  { id: "mongodb", label: "MongoDB", aliases: ["mongo"] },
  { id: "redis", label: "Redis", aliases: [] },
  { id: "elasticsearch", label: "Elasticsearch", aliases: ["elastic search", "opensearch"] },
  { id: "kafka", label: "Kafka", aliases: ["apache kafka"] },
  { id: "rabbitmq", label: "RabbitMQ", aliases: ["rabbit mq"] },
  { id: "snowflake", label: "Snowflake", aliases: [] },
  { id: "spark", label: "Spark", aliases: ["apache spark", "pyspark"] },

  // Cloud / platform
  { id: "aws", label: "AWS", aliases: ["amazon web services"] },
  { id: "gcp", label: "GCP", aliases: ["google cloud", "google cloud platform"] },
  { id: "azure", label: "Azure", aliases: ["microsoft azure"] },
  { id: "docker", label: "Docker", aliases: ["containers", "containerisation", "containerization"] },
  { id: "kubernetes", label: "Kubernetes", aliases: ["k8s"], implies: ["docker"] },
  { id: "terraform", label: "Terraform", aliases: ["hcl"] },
  { id: "ansible", label: "Ansible", aliases: [] },
  { id: "ci_cd", label: "CI/CD", aliases: ["ci/cd", "cicd", "continuous integration", "continuous delivery", "continuous deployment"] },
  { id: "github_actions", label: "GitHub Actions", aliases: ["gh actions"], implies: ["ci_cd"] },
  { id: "vercel", label: "Vercel", aliases: [] },
  { id: "linux", label: "Linux", aliases: ["unix"] },

  // Practice
  { id: "git", label: "Git", aliases: ["github", "gitlab", "version control"] },
  { id: "agile", label: "Agile", aliases: ["scrum", "kanban"] },
  { id: "testing", label: "Testing", aliases: ["unit testing", "integration testing", "tdd", "test driven development"] },
  { id: "observability", label: "Observability", aliases: ["monitoring", "prometheus", "grafana", "datadog"] },
  { id: "security", label: "Security", aliases: ["appsec", "infosec"] },
  { id: "accessibility", label: "Accessibility", aliases: ["a11y", "wcag"] },
  { id: "mentoring", label: "Mentoring", aliases: ["mentorship", "coaching"] },
  { id: "stakeholder_management", label: "Stakeholder Management", aliases: ["stakeholder engagement"] },
  { id: "data_analysis", label: "Data Analysis", aliases: ["analytics", "data analytics"] },
  { id: "machine_learning", label: "Machine Learning", aliases: ["ml", "deep learning"] },
];

/**
 * Lookup from every recognised surface form to its canonical id.
 *
 * Built once at module load. Multi-word forms are held separately because they
 * need phrase matching rather than a set lookup.
 */
const SINGLE_WORD = new Map<string, string>();
const MULTI_WORD: { phrase: string; id: string }[] = [];

for (const skill of SKILLS) {
  for (const form of [skill.id.replace(/_/g, " "), skill.label.toLowerCase(), ...skill.aliases]) {
    const normalized = form.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized.includes(" ")) MULTI_WORD.push({ phrase: normalized, id: skill.id });
    else SINGLE_WORD.set(normalized, skill.id);
  }
}

// Longest phrase first, so "google cloud platform" wins over "google cloud".
MULTI_WORD.sort((a, b) => b.phrase.length - a.phrase.length);

const BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

/** The catalogue, for callers that need to render or extend it. */
export function allSkills(): SkillDefinition[] {
  return SKILLS;
}

export function skillLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/**
 * Find every known skill mentioned in a piece of text.
 *
 * Returns canonical ids. Order is the vocabulary's, not the text's, so the
 * result is stable regardless of how the document was written.
 */
export function detectSkills(text: string): string[] {
  const tokens = tokenize(text);
  const joined = tokens.join(" ");
  const found = new Set<string>();

  for (const token of tokens) {
    const id = SINGLE_WORD.get(token);
    if (id) found.add(id);
  }

  for (const { phrase, id } of MULTI_WORD) {
    // Padded so the phrase matches whole tokens only.
    if (` ${joined} `.includes(` ${phrase} `)) found.add(id);
  }

  return SKILLS.filter((skill) => found.has(skill.id)).map((skill) => skill.id);
}

export type SkillRelation = "exact" | "related" | "none";

/**
 * How a resume's skills relate to one required skill.
 *
 * `related` fires only through the curated `implies` graph — Kubernetes
 * evidencing Docker, PostgreSQL evidencing SQL. It is never inferred from
 * spelling, because "Java" and "JavaScript" look related and are not.
 */
export function relate(required: string, resumeSkills: Set<string>): SkillRelation {
  if (resumeSkills.has(required)) return "exact";

  for (const owned of resumeSkills) {
    if (BY_ID.get(owned)?.implies?.includes(required)) return "related";
  }

  return "none";
}

/**
 * The line in `lines` that best evidences a skill, or null.
 *
 * Preferred over reporting the whole document: the operator's next question
 * after "matched" is always "where?", and answering it is what separates a
 * verifiable score from an assertion.
 */
export function findEvidence(skillId: string, lines: string[]): string | null {
  for (const line of lines) {
    if (detectSkills(line).includes(skillId)) return line;
  }
  return null;
}
