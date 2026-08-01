import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Chainable Supabase stub (Phase 3 · M7).
 *
 * The M6 fake in `test/ai/gateway.test.ts` covers only `rpc()` and
 * `from().insert()`, which cannot express a filtered read or a conditional
 * update. This one records every operation it is handed — including the filter
 * chain — so a test can assert that a predicate was *issued*, not merely that a
 * call happened. That distinction is the whole point: an update missing its
 * `ai_processed_at is null` guard still "calls update".
 *
 * It is a stub, not an in-memory database: results are configured per table and
 * returned verbatim. Any shape it was not configured for throws, so a test that
 * drifts fails loudly instead of silently passing on `undefined`.
 */

export interface StubFilter {
  op: "eq" | "is" | "in" | "gte" | "lte" | "not";
  column: string;
  value: unknown;
}

export interface StubOperation {
  table: string;
  type: "select" | "update" | "insert";
  /** Column list passed to `.select(...)`, when one was given. */
  columns?: string;
  /** Row handed to `.update()` / `.insert()`. */
  values?: Record<string, unknown>;
  filters: StubFilter[];
  /** Which single-row accessor terminated the chain, if any. */
  single?: "single" | "maybeSingle";
}

export interface SupabaseStubConfig {
  /** Result for a `select` on a table: a row, null, or a list. */
  select?: Record<string, unknown>;
  /** Rows returned by `update(...).select(...)` on a table. */
  update?: Record<string, unknown[]>;
  /** Result data for an `rpc` by function name. */
  rpc?: Record<string, unknown>;
}

export interface SupabaseStub {
  client: SupabaseClient;
  /** Every operation issued, in order. */
  operations: StubOperation[];
  /** Every rpc issued, in order. */
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  /** Operations against one table, for concise assertions. */
  opsFor(table: string): StubOperation[];
  /** True when an operation carried this exact filter. */
  hasFilter(operation: StubOperation, op: StubFilter["op"], column: string, value: unknown): boolean;
}

class Query implements PromiseLike<{ data: unknown; error: null }> {
  constructor(
    private readonly operation: StubOperation,
    private readonly config: SupabaseStubConfig,
  ) {}

  /** Column list, or — on an update/insert — the RETURNING clause. */
  select(columns?: string): this {
    this.operation.columns = columns;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.operation.filters.push({ op: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.operation.filters.push({ op: "is", column, value });
    return this;
  }

  in(column: string, value: unknown): this {
    this.operation.filters.push({ op: "in", column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.operation.filters.push({ op: "gte", column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.operation.filters.push({ op: "lte", column, value });
    return this;
  }

  order(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  single(): this {
    this.operation.single = "single";
    return this;
  }

  maybeSingle(): this {
    this.operation.single = "maybeSingle";
    return this;
  }

  private result(): { data: unknown; error: null } {
    const { table, type } = this.operation;

    if (type === "select") {
      if (!(table in (this.config.select ?? {}))) {
        throw new Error(`supabase stub: no select result configured for table "${table}"`);
      }
      return { data: this.config.select![table] ?? null, error: null };
    }

    if (type === "update") {
      // No RETURNING clause means the caller only cares that it succeeded.
      if (this.operation.columns === undefined) return { data: null, error: null };
      if (!(table in (this.config.update ?? {}))) {
        throw new Error(`supabase stub: no update result configured for table "${table}"`);
      }
      return { data: this.config.update![table], error: null };
    }

    // insert — audit and event writes; success is all the caller checks.
    return { data: null, error: null };
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }
}

export function createSupabaseStub(config: SupabaseStubConfig = {}): SupabaseStub {
  const operations: StubOperation[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

  const start = (table: string, type: StubOperation["type"], values?: Record<string, unknown>) => {
    const operation: StubOperation = { table, type, values, filters: [] };
    operations.push(operation);
    return new Query(operation, config);
  };

  const client = {
    from(table: string) {
      return {
        select: (columns?: string) => start(table, "select").select(columns),
        update: (values: Record<string, unknown>) => start(table, "update", values),
        insert: (values: Record<string, unknown>) => start(table, "insert", values),
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: config.rpc?.[name] ?? null, error: null });
    },
  } as unknown as SupabaseClient;

  return {
    client,
    operations,
    rpcCalls,
    opsFor: (table) => operations.filter((operation) => operation.table === table),
    hasFilter: (operation, op, column, value) =>
      operation.filters.some(
        (filter) => filter.op === op && filter.column === column && filter.value === value,
      ),
  };
}
