import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PROVIDER_IDS } from "@/lib/career-intelligence/providers/types";
import { DOCUMENT_KINDS, TAGGABLE_ENTITY_TYPES } from "@/types/career-intelligence";
import { OPPORTUNITY_STAGES } from "@/types/opportunity";

/**
 * Schema drift guard.
 *
 * Each of these enums is declared twice — once as a Postgres type, once as a
 * TypeScript const array — and nothing else keeps the two in step. A value
 * added to one and forgotten in the other does not fail the build: it fails at
 * runtime, in production, as a Postgres `invalid input value for enum` error on
 * whichever write first uses it.
 *
 * This test reconstructs each enum's effective state from the migration files
 * (initial `create type ... as enum` plus every subsequent `alter type ... add
 * value`, honouring BEFORE/AFTER placement) and compares it against the
 * TypeScript source of truth.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function migrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort() // filenames are timestamp-prefixed, so lexical order is apply order
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

const SQL = migrationSql();

/**
 * Rebuild an enum exactly as Postgres would after applying every migration.
 * Returns values in declaration order, which is also the enum's sort order.
 */
function effectiveEnum(typeName: string): string[] {
  const create = new RegExp(
    `create type ${typeName} as enum\\s*\\(([^)]*)\\)`,
    "i",
  ).exec(SQL);
  if (!create) throw new Error(`No "create type ${typeName} as enum" found in migrations`);

  const values = [...create[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  const addPattern = new RegExp(
    `alter type ${typeName} add value(?:\\s+if not exists)?\\s+'([^']+)'` +
      `(?:\\s+(before|after)\\s+'([^']+)')?`,
    "gi",
  );

  for (const m of SQL.matchAll(addPattern)) {
    const [, value, position, neighbour] = m;
    if (values.includes(value)) continue; // `if not exists` semantics

    if (!position) {
      values.push(value);
      continue;
    }
    const at = values.indexOf(neighbour);
    if (at === -1) {
      throw new Error(`${typeName}: '${value}' is placed relative to unknown value '${neighbour}'`);
    }
    values.splice(position.toLowerCase() === "before" ? at : at + 1, 0, value);
  }

  return values;
}

/**
 * A CHECK-constrained text column is the same drift hazard as an enum, so it is
 * parsed the same way.
 */
function checkConstraintValues(constraintName: string): string[] {
  const m = new RegExp(`constraint ${constraintName}[\\s\\S]*?in \\(([^)]*)\\)`, "i").exec(SQL);
  if (!m) throw new Error(`No CHECK constraint "${constraintName}" found in migrations`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe("enum parity: TypeScript vs Postgres", () => {
  it("PROVIDER_IDS matches integration_provider", () => {
    // Order is not asserted: provider order carries no meaning, and the enum
    // appends new values while the TS array groups them by family.
    expect([...PROVIDER_IDS].sort()).toEqual(effectiveEnum("integration_provider").sort());
  });

  it("DOCUMENT_KINDS matches document_kind", () => {
    expect([...DOCUMENT_KINDS].sort()).toEqual(effectiveEnum("document_kind").sort());
  });

  it("OPPORTUNITY_STAGES matches opportunity_stage", () => {
    expect([...OPPORTUNITY_STAGES].sort()).toEqual(effectiveEnum("opportunity_stage").sort());
  });

  it("OPPORTUNITY_STAGES is in the SAME ORDER as opportunity_stage", () => {
    // Order matters for this one only: enum sort order is declaration order, so
    // `order by stage` in SQL and index-based comparisons in TS must agree on
    // what "further along the pipeline" means.
    expect([...OPPORTUNITY_STAGES]).toEqual(effectiveEnum("opportunity_stage"));
  });
});

describe("enum parity: the parser itself", () => {
  it("reconstructs BEFORE/AFTER placement, not just membership", () => {
    const stages = effectiveEnum("opportunity_stage");
    // 'draft' is added with BEFORE 'lead'; appending instead would put it last.
    expect(stages.indexOf("draft")).toBeLessThan(stages.indexOf("lead"));
    // 'ghosted' is added with AFTER 'rejected'.
    expect(stages.indexOf("ghosted")).toBe(stages.indexOf("rejected") + 1);
  });

  it("fails loudly on an unknown enum rather than silently passing", () => {
    expect(() => effectiveEnum("not_a_real_enum")).toThrow(/No "create type/);
  });
});

describe("check-constraint parity", () => {
  it("inbox_items.status covers every lifecycle state the app can write", () => {
    expect(checkConstraintValues("inbox_items_status_check").sort()).toEqual(
      ["duplicate", "failed", "pending", "promoted", "rejected"].sort(),
    );
  });

  it("TAGGABLE_ENTITY_TYPES matches taggables_entity_type_check", () => {
    // Same hazard as the enums: a tag target added in TS but not to the CHECK
    // fails at INSERT time in production, not at build time. Order is not
    // asserted — a CHECK is set membership, with no ordering semantics.
    expect([...TAGGABLE_ENTITY_TYPES].sort()).toEqual(
      checkConstraintValues("taggables_entity_type_check").sort(),
    );
  });
});
