import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { retrieve } from "@/lib/ai/retrieval";

/**
 * Retrieval behaviour (Phase 3 · M8).
 *
 * The data layers are mocked because what matters here is not that PostgREST
 * works — it does — but the three decisions retrieval makes on top of it:
 * rows belonging to someone else are dropped, one chatty source cannot starve
 * the others, and a failing source degrades instead of taking the answer down.
 */

vi.mock("@/lib/opportunities", () => ({ listOpportunities: vi.fn() }));
vi.mock("@/lib/companies", () => ({ listCompanies: vi.fn() }));
vi.mock("@/lib/contacts", () => ({ listContacts: vi.fn() }));
vi.mock("@/lib/messages", () => ({ listMessages: vi.fn() }));
vi.mock("@/lib/tasks", () => ({ listTasks: vi.fn() }));

import { listOpportunities } from "@/lib/opportunities";
import { listCompanies } from "@/lib/companies";
import { listContacts } from "@/lib/contacts";
import { listMessages } from "@/lib/messages";
import { listTasks } from "@/lib/tasks";

const OWNER = "owner-1";

function page(rows: unknown[]) {
  return { rows, total: rows.length, page: 1, pageSize: 5 };
}

/** Supabase double for the two sources queried directly (events + notes). */
function stubClient(rows: Record<string, unknown[]> = {}): SupabaseClient {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      Object.assign(builder, {
        select: self,
        is: self,
        eq: self,
        or: self,
        ilike: self,
        order: self,
        limit: () => Promise.resolve({ data: rows[table] ?? [], error: null }),
      });
      return builder;
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.mocked(listOpportunities).mockResolvedValue(page([]) as never);
  vi.mocked(listCompanies).mockResolvedValue(page([]) as never);
  vi.mocked(listContacts).mockResolvedValue(page([]) as never);
  vi.mocked(listMessages).mockResolvedValue(page([]) as never);
  vi.mocked(listTasks).mockResolvedValue(page([]) as never);
});

describe("retrieve", () => {
  it("returns nothing for an empty query without touching a data layer", async () => {
    const results = await retrieve(stubClient(), OWNER, "   ");

    expect(results).toEqual([]);
    expect(listOpportunities).not.toHaveBeenCalled();
  });

  it("drops rows belonging to another owner", async () => {
    vi.mocked(listCompanies).mockResolvedValue(
      page([
        { id: "c1", name: "Mine", owner_id: OWNER, updated_at: "2026-07-01T00:00:00Z" },
        { id: "c2", name: "Theirs", owner_id: "someone-else", updated_at: "2026-07-02T00:00:00Z" },
      ]) as never,
    );

    const results = await retrieve(stubClient(), OWNER, "acme", { types: ["company"] });

    expect(results.map((item) => item.title)).toEqual(["Mine"]);
  });

  it("interleaves types so one chatty source cannot fill a narrow budget", async () => {
    vi.mocked(listMessages).mockResolvedValue(
      page(
        Array.from({ length: 5 }, (_, index) => ({
          id: `m${index}`,
          subject: `Message ${index}`,
          direction: "inbound",
          from_name: "Recruiter",
          ai_summary: null,
          snippet: "hello",
          body_text: null,
          owner_id: OWNER,
          received_at: `2026-07-0${index + 1}T00:00:00Z`,
          created_at: null,
        })),
      ) as never,
    );
    vi.mocked(listCompanies).mockResolvedValue(
      page([{ id: "c1", name: "Acme", owner_id: OWNER, updated_at: "2026-06-01T00:00:00Z" }]) as never,
    );

    const results = await retrieve(stubClient(), OWNER, "acme", {
      types: ["message", "company"],
      limit: 3,
    });

    expect(results).toHaveLength(3);
    expect(results.some((item) => item.entityType === "company")).toBe(true);
  });

  it("orders the selection newest first", async () => {
    vi.mocked(listTasks).mockResolvedValue(
      page([
        { id: "t1", title: "Older", status: "todo", priority: "low", due_at: "2026-01-01T00:00:00Z", description: null, owner_id: OWNER, updated_at: null },
        { id: "t2", title: "Newer", status: "todo", priority: "low", due_at: "2026-09-01T00:00:00Z", description: null, owner_id: OWNER, updated_at: null },
      ]) as never,
    );

    const results = await retrieve(stubClient(), OWNER, "follow up", { types: ["task"] });

    expect(results.map((item) => item.title)).toEqual(["Newer", "Older"]);
  });

  it("degrades a failing source to empty rather than losing the whole answer", async () => {
    vi.mocked(listMessages).mockRejectedValue(new Error("relation does not exist"));
    vi.mocked(listCompanies).mockResolvedValue(
      page([{ id: "c1", name: "Acme", owner_id: OWNER, updated_at: "2026-06-01T00:00:00Z" }]) as never,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const results = await retrieve(stubClient(), OWNER, "acme", { types: ["message", "company"] });

    expect(results.map((item) => item.title)).toEqual(["Acme"]);
  });

  it("projects notes and calendar events with a deep link back to the record", async () => {
    const client = stubClient({
      calendar_events: [
        { id: "e1", title: "Onsite", description: null, location: "Berlin", starts_at: "2026-08-10T09:00:00Z", owner_id: OWNER },
      ],
      opportunity_notes: [
        { id: "n1", body: "They want a take-home", opportunity_id: "o9", created_at: "2026-08-02T00:00:00Z", owner_id: OWNER, opportunity: { title: "Staff Engineer" } },
      ],
    });

    const results = await retrieve(client, OWNER, "berlin", { types: ["calendar_event", "note"] });

    expect(results).toHaveLength(2);
    expect(results.find((item) => item.entityType === "note")?.href).toBe("/admin/opportunities/o9");
    expect(results.find((item) => item.entityType === "note")?.title).toBe("Note on Staff Engineer");
    expect(results.find((item) => item.entityType === "calendar_event")?.title).toBe("Onsite");
  });

  it("strips filter-structural punctuation so an ordinary query still matches", async () => {
    const filters: string[] = [];
    const client = {
      from() {
        const builder: Record<string, unknown> = {};
        const self = () => builder;
        Object.assign(builder, {
          select: self,
          is: self,
          eq: self,
          or(expression: string) {
            filters.push(expression);
            return builder;
          },
          ilike: self,
          order: self,
          limit: () => Promise.resolve({ data: [], error: null }),
        });
        return builder;
      },
    } as unknown as SupabaseClient;

    // Parentheses and commas are structural in PostgREST's `or=(...)` grammar;
    // leaving them in produces a filter the server rejects, which would silently
    // drop calendar events from every such answer.
    await retrieve(client, OWNER, 'Acme (Berlin), "onsite"', { types: ["calendar_event"] });

    expect(filters).toHaveLength(1);

    // The commas between the three clauses are the grammar; what must be clean
    // is every interpolated value.
    const values = [...filters[0].matchAll(/ilike\.(%[^,]*%)/g)].map((match) => match[1]);
    expect(values).toHaveLength(3);
    for (const value of values) expect(value).not.toMatch(/[(),"']/);
    expect(values[0]).toBe("%Acme Berlin onsite%");
  });

  it("bounds the snippet so a long body cannot dominate the prompt", async () => {
    vi.mocked(listCompanies).mockResolvedValue(
      page([
        { id: "c1", name: "Acme", description: "x".repeat(2000), owner_id: OWNER, updated_at: "2026-06-01T00:00:00Z" },
      ]) as never,
    );

    const [item] = await retrieve(stubClient(), OWNER, "acme", { types: ["company"] });

    expect(item.snippet.length).toBeLessThanOrEqual(320);
    expect(item.snippet.endsWith("…")).toBe(true);
  });
});
