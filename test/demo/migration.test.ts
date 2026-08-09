import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the demo_usage migration.
 *
 * Static analysis of the migration SQL, following the same approach as
 * test/career-intelligence/enum-parity.test.ts: Docker is not available here, so
 * there is no local Postgres to apply against, and the hosted project is shared
 * with production — applying a migration to it is a deploy, not a test.
 *
 * What that still buys is real. The properties asserted below are the ones a
 * later edit could quietly drop: the privacy guarantee (no raw address column),
 * the index the limiter depends on, RLS being on, and the absence of an anon
 * policy. Each of those failing silently would be worse than a syntax error,
 * because a syntax error surfaces on the next deploy and these do not.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const FILENAME = "20260809020000_demo_usage.sql";
const SQL = readFileSync(join(MIGRATIONS_DIR, FILENAME), "utf8");
const sql = SQL.toLowerCase();

describe("demo_usage migration", () => {
  it("is timestamp-ordered after every existing migration", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(files[files.length - 1]).toBe(FILENAME);
  });

  it("creates the table idempotently", () => {
    expect(sql).toContain("create table if not exists demo_usage");
  });

  it("stores a salted hash and NEVER a raw address", () => {
    expect(sql).toContain("visitor_hash");
    // The privacy guarantee is structural: there is no column that could hold an
    // address, so storing one would require changing the schema.
    for (const forbidden of ["ip_address", "ip text", "visitor_ip", "remote_addr", "inet"]) {
      expect(sql, `"${forbidden}" would defeat the point of hashing`).not.toContain(forbidden);
    }
  });

  it("indexes exactly the query the limiter runs", () => {
    // count(*) where visitor_hash = $1 and created_at >= $2
    expect(sql).toContain("on demo_usage (visitor_hash, created_at desc)");
    // and the opportunistic sweep of expired rows
    expect(sql).toContain("on demo_usage (created_at)");
  });

  it("enables row level security", () => {
    expect(sql).toContain("alter table demo_usage enable row level security");
  });

  it("grants the anon role nothing", () => {
    // The demo is anonymous, but its visitors must not read other visitors'
    // hashes, pad the ledger to lock others out, or clear it to lift their own
    // limit. The server action's service-role client bypasses RLS instead.
    expect(sql).not.toMatch(/to\s+anon/);
    expect(sql).not.toContain("auth.role() = 'anon'");
    expect(sql).toContain('create policy "authenticated admin full access" on demo_usage');
  });

  it("keeps the updated_at trigger convention", () => {
    expect(sql).toContain("demo_usage_set_updated_at");
    expect(sql).toContain("execute function set_updated_at()");
  });

  it("is additive: it alters no pre-existing table", () => {
    const mutations = SQL.match(/alter table\s+(\w+)/gi) ?? [];
    for (const statement of mutations) {
      expect(statement.toLowerCase()).toContain("demo_usage");
    }
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("drop column");
  });
});
