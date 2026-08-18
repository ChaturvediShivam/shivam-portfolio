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
  op: "eq" | "neq" | "is" | "in" | "gte" | "lte" | "lt" | "not";
  column: string;
  value: unknown;
}

export interface StubOperation {
  table: string;
  type: "select" | "update" | "insert" | "delete";
  /** True when the caller asked for a count only (`{ head: true }`). */
  countOnly?: boolean;
  /** Column list passed to `.select(...)`, when one was given. */
  columns?: string;
  /** Row handed to `.update()` / `.insert()`. */
  values?: Record<string, unknown>;
  filters: StubFilter[];
  /** Row cap requested via `.limit(n)`, when one was given. */
  limit?: number;
  /** Which single-row accessor terminated the chain, if any. */
  single?: "single" | "maybeSingle";
}

export interface SupabaseStubConfig {
  /** Result for a `select` on a table: a row, null, or a list. */
  select?: Record<string, unknown>;
  /** Row count returned for `select(..., { head: true })` on a table. */
  count?: Record<string, number>;
  /** Rows returned by `update(...).select(...)` on a table. */
  update?: Record<string, unknown[]>;
  /** Result data for an `rpc` by function name. */
  rpc?: Record<string, unknown>;
  /**
   * Error returned for every operation on a table, in place of a result.
   *
   * Exists so a caller's failure path can be exercised. Which way a limiter
   * fails when its own meter is unavailable is a security property, not an
   * implementation detail, and it is untestable while every query succeeds.
   */
  error?: Record<string, { message: string; code?: string }>;
  /**
   * Session user returned by `auth.getUser()`. Omit to simulate no session,
   * which is how Server Actions are driven down their unauthenticated path.
   */
  user?: { id: string } | null;
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

export interface StubError {
  message: string;
  code?: string;
}

class Query implements PromiseLike<{ data: unknown; error: StubError | null }> {
  constructor(
    private readonly operation: StubOperation,
    private readonly config: SupabaseStubConfig,
  ) {}

  /** Column list, or — on an update/insert — the RETURNING clause. */
  select(columns?: string, options?: { count?: string; head?: boolean }): this {
    // `{ head: true }` is a COUNT query: PostgREST returns no rows, only a
    // count. The rate limiter uses this shape, and a stub that ignored it would
    // demand a fabricated row list for a query that never returns rows.
    if (options?.head) this.operation.countOnly = true;
    this.operation.columns = columns;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.operation.filters.push({ op: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.operation.filters.push({ op: "neq", column, value });
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

  lt(column: string, value: unknown): this {
    this.operation.filters.push({ op: "lt", column, value });
    return this;
  }

  order(): this {
    return this;
  }

  limit(count?: number): this {
    this.operation.limit = count;
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

  private result(): { data: unknown; error: StubError | null; count?: number } {
    const { table, type } = this.operation;

    // Configured failure wins over every result shape: a table that is erroring
    // errors for reads, writes and counts alike.
    const failure = this.config.error?.[table];
    if (failure) return { data: null, error: failure, count: undefined };

    if (type === "delete") return { data: null, error: null };

    if (type === "select" && this.operation.countOnly) {
      // Defaults to zero so a test that is not about rate limiting does not
      // have to configure one. Set `count: { ai_audit_log: n }` to exercise it.
      return { data: null, error: null, count: this.config.count?.[table] ?? 0 };
    }

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

  then<TResult1 = { data: unknown; error: StubError | null; count?: number }, TResult2 = never>(
    onfulfilled?:
      | ((
          value: { data: unknown; error: StubError | null; count?: number },
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
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
        select: (columns?: string, options?: { count?: string; head?: boolean }) =>
          start(table, "select").select(columns, options),
        update: (values: Record<string, unknown>) => start(table, "update", values),
        insert: (values: Record<string, unknown>) => start(table, "insert", values),
        delete: () => start(table, "delete"),
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: config.rpc?.[name] ?? null, error: null });
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: config.user ?? null }, error: null }),
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
