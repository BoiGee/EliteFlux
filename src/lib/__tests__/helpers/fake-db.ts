// A minimal, purpose-built in-memory fake of the small subset of the
// Supabase query-builder chain that src/lib/autopilot.server.ts's
// executeAction (and its callees) actually use — NOT a general-purpose
// Supabase mock. This codebase deliberately has no mocking layer for
// DB-calling code (see the comment at the top of exchanges.test.ts); this
// exists only to test ONE specific, real, previously-unverified property —
// executeAction's atomic claim step actually prevents a double-execution
// race, the exact scenario its own code comment names as the reason the
// claim exists. Keep this scoped to what the tests that import it actually
// call; it is not meant to grow into a full Supabase client double.

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
type Op = "select" | "update" | "insert" | "delete" | null;

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: Filter[] = [];
  private op: Op = null;
  private patch: Row | null = null;
  private insertRows: Row[] | null = null;
  private singleMode: "maybeSingle" | "single" | null = null;
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;

  constructor(private table: Row[]) {}

  select(_cols?: string) {
    if (this.op === null) this.op = "select";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  in(col: string, vals: readonly unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  gte(col: string, val: string | number) {
    this.filters.push((r) => (r[col] as string | number) >= val);
    return this;
  }
  lt(col: string, val: string | number) {
    this.filters.push((r) => (r[col] as string | number) < val);
    return this;
  }
  not(col: string, op: "is", val: unknown) {
    if (op === "is") this.filters.push((r) => r[col] !== val);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  private matched(): Row[] {
    return this.table.filter((r) => this.filters.every((f) => f(r)));
  }

  private resolve(): { data: unknown; error: { message: string } | null } {
    let result: Row[] = [];
    const op = this.op ?? "select";
    if (op === "select") {
      result = this.matched();
      if (this.orderCol) {
        const col = this.orderCol;
        result = [...result].sort((a, b) => {
          const cmp = String(a[col]) > String(b[col]) ? 1 : String(a[col]) < String(b[col]) ? -1 : 0;
          return this.orderAsc ? cmp : -cmp;
        });
      }
      if (this.limitN !== null) result = result.slice(0, this.limitN);
    } else if (op === "update") {
      result = this.matched();
      for (const row of result) Object.assign(row, this.patch);
    } else if (op === "insert") {
      result = this.insertRows!.map((r) => ({ id: r.id ?? `fake-${Math.random().toString(36).slice(2)}`, ...r }));
      this.table.push(...result);
    } else if (op === "delete") {
      result = this.matched();
      for (const row of result) {
        const i = this.table.indexOf(row);
        if (i >= 0) this.table.splice(i, 1);
      }
    }

    let data: unknown = result;
    if (this.singleMode) data = result[0] ?? null;
    return { data, error: null };
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onfulfilled);
  }
}

export class FakeDb {
  private tables = new Map<string, Row[]>();

  seed(table: string, rows: Row[]) {
    this.tables.set(table, rows);
    return this;
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  from(table: string): FakeQuery {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return new FakeQuery(this.tables.get(table)!);
  }
}
