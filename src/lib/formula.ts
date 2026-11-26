// Spreadsheet formulas (Sheets Studio, and table cells in documents): the same language as Excel and Google Sheets
// for everyday work. A cell whose text starts with "=" is a formula; anything else is a value (numbers are read as
// numbers). References are A1, $A$1, A1:B9, whole columns A:A, and other sheets as Sheet2!A1 or 'My sheet'!A1:B2.
//
// It runs only here, in plain code: a formula can read cells and call the functions below, nothing else (no
// network, no scripts). Errors show as Excel does (#DIV/0!, #VALUE!, #REF!, #NAME?, #N/A, #NUM!, and #CYCLE! for a
// formula that refers to itself).

export type FErr = { error: "#DIV/0!" | "#VALUE!" | "#REF!" | "#NAME?" | "#N/A" | "#NUM!" | "#CYCLE!" | "#ERROR!" };
export type Scalar = number | string | boolean | null | FErr;
type Range = { range: Scalar[][] };
type Val = Scalar | Range;

export const isErr = (v: unknown): v is FErr => !!v && typeof v === "object" && "error" in (v as object);
const isRange = (v: unknown): v is Range => !!v && typeof v === "object" && "range" in (v as object);
const err = (e: FErr["error"]): FErr => ({ error: e });

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export function colName(i: number) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export function colIndex(name: string) {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export const addr = (r: number, c: number) => `${colName(c)}${r + 1}`;
export function parseAddr(a: string): { r: number; c: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(a.trim());
  return m ? { r: Number(m[2]) - 1, c: colIndex(m[1]!) } : null;
}

// ---------------------------------------------------------------------------
// Tokens and parsing
// ---------------------------------------------------------------------------

type Tok = { t: "num"; v: number } | { t: "str"; v: string } | { t: "ref"; v: string } | { t: "name"; v: string } | { t: "op"; v: string } | { t: "(" } | { t: ")" } | { t: "," } | { t: "err"; v: string };

const REF = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))!)?(\$?[A-Za-z]{1,3}\$?\d{1,7}(?::\$?[A-Za-z]{1,3}\$?\d{1,7})?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3})(?![\w(])/;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let s = "";
      i++;
      while (i < src.length) {
        if (src[i] === '"' && src[i + 1] === '"') (s += '"'), (i += 2);
        else if (src[i] === '"') break;
        else s += src[i++];
      }
      i++;
      out.push({ t: "str", v: s });
      continue;
    }
    const rest = src.slice(i);
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest);
    if (num) {
      out.push({ t: "num", v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const e = /^#(DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!)/.exec(rest);
    if (e) {
      out.push({ t: "err", v: e[0] });
      i += e[0].length;
      continue;
    }
    const ref = REF.exec(rest);
    if (ref && !/^[A-Za-z_][\w.]*\(/.test(rest.slice(0, ref[0].length + 1).replace(/!.*/, ""))) {
      out.push({ t: "ref", v: ref[0] });
      i += ref[0].length;
      continue;
    }
    const name = /^[A-Za-z_][\w.]*/.exec(rest);
    if (name) {
      out.push({ t: "name", v: name[0].toUpperCase() });
      i += name[0].length;
      continue;
    }
    const op = /^(<=|>=|<>|[-+*/^&=<>%])/.exec(rest);
    if (op) {
      out.push({ t: "op", v: op[0] });
      i += op[0].length;
      continue;
    }
    if (ch === "(") out.push({ t: "(" });
    else if (ch === ")") out.push({ t: ")" });
    else if (ch === "," || ch === ";") out.push({ t: "," });
    else throw new Error("bad");
    i++;
  }
  return out;
}

type Node =
  | { k: "lit"; v: Scalar }
  | { k: "ref"; v: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "pct"; a: Node }
  | { k: "call"; name: string; args: Node[] };

const PREC: Record<string, number> = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "&": 2, "+": 3, "-": 3, "*": 4, "/": 4, "^": 5 };

function parse(tokens: Tok[]): Node {
  let p = 0;
  const peek = () => tokens[p];
  const expr = (min: number): Node => {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t?.t === "op" && t.v === "%") {
        p++;
        left = { k: "pct", a: left };
        continue;
      }
      if (!t || t.t !== "op" || PREC[t.v] === undefined || PREC[t.v]! < min) break;
      p++;
      // Left to right, as Excel (2^3^2 is 64).
      const right = expr(PREC[t.v]! + 1);
      left = { k: "bin", op: t.v, a: left, b: right };
    }
    return left;
  };
  const unary = (): Node => {
    const t = peek();
    if (t?.t === "op" && (t.v === "-" || t.v === "+")) {
      p++;
      return { k: "un", op: t.v, a: unary() };
    }
    return primary();
  };
  const primary = (): Node => {
    const t = tokens[p++];
    if (!t) throw new Error("end");
    if (t.t === "num") return { k: "lit", v: t.v };
    if (t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "err") return { k: "lit", v: err(t.v as FErr["error"]) };
    if (t.t === "ref") return { k: "ref", v: t.v };
    if (t.t === "(") {
      const n = expr(1);
      if (tokens[p++]?.t !== ")") throw new Error(")");
      return n;
    }
    if (t.t === "name") {
      if (peek()?.t === "(") {
        p++;
        const args: Node[] = [];
        if (peek()?.t === ")") p++;
        else
          for (;;) {
            if (peek()?.t === "," || peek()?.t === ")") args.push({ k: "lit", v: null });
            else args.push(expr(1));
            const n = tokens[p++];
            if (n?.t === ")") break;
            if (n?.t !== ",") throw new Error(",");
          }
        return { k: "call", name: t.v, args };
      }
      if (t.v === "TRUE") return { k: "lit", v: true };
      if (t.v === "FALSE") return { k: "lit", v: false };
      return { k: "lit", v: err("#NAME?") };
    }
    throw new Error("token");
  };
  const n = expr(1);
  if (p < tokens.length) throw new Error("trailing");
  return n;
}

const astCache = new Map<string, Node | null>();
function compile(src: string): Node | null {
  let n = astCache.get(src);
  if (n !== undefined) return n;
  try {
    n = parse(tokenize(src));
  } catch {
    n = null;
  }
  if (astCache.size > 5000) astCache.clear();
  astCache.set(src, n);
  return n;
}

// ---------------------------------------------------------------------------
// Coercion
// ---------------------------------------------------------------------------

// A cell's typed text as a value: numbers (1,234.5; 12%; -3), TRUE/FALSE, otherwise text.
export function literal(raw: string): Scalar {
  const s = raw.trim();
  if (s === "") return null;
  const pct = /^-?[\d,]*\.?\d+%$/.test(s);
  const n = Number(s.replace(/,/g, "").replace(/%$/, ""));
  if (/^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?(e[+-]?\d+)?%?$/i.test(s) && s !== "-" && s !== "+" && Number.isFinite(n) && /\d/.test(s)) return pct ? n / 100 : n;
  if (/^d{4}-d{2}-d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return toSerial(d);
  }
  if (/^true$/i.test(s)) return true;
  if (/^false$/i.test(s)) return false;
  return raw;
}
function num(v: Scalar): number | FErr {
  if (isErr(v)) return v;
  if (v === null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const l = literal(v);
  return typeof l === "number" ? l : err("#VALUE!");
}
const text = (v: Scalar): string => (v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : typeof v === "number" ? fmtNum(v) : isErr(v) ? v.error : v);
const bool = (v: Scalar): boolean | FErr => (isErr(v) ? v : typeof v === "boolean" ? v : typeof v === "number" ? v !== 0 : v === null ? false : /^true$/i.test(v) ? true : /^false$/i.test(v) ? false : err("#VALUE!"));
function fmtNum(n: number) {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(15)));
}

// Excel's day numbers (1 = 1900-01-01, with Excel's leap-year quirk kept so files agree).
const EPOCH = Date.UTC(1899, 11, 30);
export const toSerial = (d: Date) => (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - EPOCH) / 86400000;
export const fromSerial = (n: number) => new Date(EPOCH + Math.round(n * 86400000));

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type Workbook = { name: string; cells: string[][] }[];

export class Calc {
  private cache = new Map<string, Scalar>();
  private busy = new Set<string>();
  constructor(
    private book: Workbook,
    private now = new Date(),
  ) {}

  private sheetIndex(name: string | undefined, from: number) {
    if (name === undefined) return from;
    const i = this.book.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
    return i;
  }

  // The shown value of a cell (formulas worked out).
  value(sheet: number, r: number, c: number): Scalar {
    const key = `${sheet}:${r}:${c}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const raw = this.book[sheet]?.cells[r]?.[c] ?? "";
    if (!raw.startsWith("=") || raw.length < 2) {
      const v = raw.startsWith("'") ? raw.slice(1) : literal(raw);
      this.cache.set(key, v);
      return v;
    }
    if (this.busy.has(key)) return err("#CYCLE!");
    this.busy.add(key);
    let v: Scalar;
    try {
      const ast = compile(raw.slice(1));
      if (!ast) v = err("#ERROR!");
      else {
        const out = this.eval(ast, sheet);
        v = isRange(out) ? (out.range[0]?.[0] ?? null) : out;
        if (typeof v === "number" && !Number.isFinite(v)) v = err("#NUM!");
      }
    } catch {
      v = err("#ERROR!");
    }
    this.busy.delete(key);
    this.cache.set(key, v);
    return v;
  }

  private ref(src: string, sheet: number): Val {
    const bang = src.lastIndexOf("!");
    let sh = sheet;
    let a = src;
    if (bang > 0) {
      const raw = src.slice(0, bang);
      sh = this.sheetIndex(raw.startsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw, sheet);
      a = src.slice(bang + 1);
      if (sh < 0) return err("#REF!");
    }
    const cells = this.book[sh]?.cells ?? [];
    const parts = a.split(":");
    if (parts.length === 1) {
      const p = parseAddr(parts[0]!);
      return p ? this.value(sh, p.r, p.c) : err("#REF!");
    }
    let r1: number, c1: number, r2: number, c2: number;
    const whole = /^\$?([A-Za-z]{1,3})$/;
    if (whole.test(parts[0]!) && whole.test(parts[1]!)) {
      c1 = colIndex(parts[0]!.replace("$", ""));
      c2 = colIndex(parts[1]!.replace("$", ""));
      r1 = 0;
      r2 = Math.max(0, cells.length - 1);
    } else {
      const p1 = parseAddr(parts[0]!);
      const p2 = parseAddr(parts[1]!);
      if (!p1 || !p2) return err("#REF!");
      [r1, c1, r2, c2] = [p1.r, p1.c, p2.r, p2.c];
    }
    if (r1 > r2) [r1, r2] = [r2, r1];
    if (c1 > c2) [c1, c2] = [c2, c1];
    if ((r2 - r1 + 1) * (c2 - c1 + 1) > 500_000) return err("#REF!");
    const range: Scalar[][] = [];
    for (let r = r1; r <= r2; r++) {
      const row: Scalar[] = [];
      for (let c = c1; c <= c2; c++) row.push(this.value(sh, r, c));
      range.push(row);
    }
    return { range };
  }

  private eval(n: Node, sheet: number): Val {
    switch (n.k) {
      case "lit":
        return n.v;
      case "ref":
        return this.ref(n.v, sheet);
      case "pct": {
        const a = num(this.scalar(n.a, sheet));
        return isErr(a) ? a : a / 100;
      }
      case "un": {
        const a = num(this.scalar(n.a, sheet));
        return isErr(a) ? a : n.op === "-" ? -a : a;
      }
      case "bin": {
        const a = this.scalar(n.a, sheet);
        const b = this.scalar(n.b, sheet);
        if (isErr(a)) return a;
        if (isErr(b)) return b;
        if (n.op === "&") return text(a) + text(b);
        if (["=", "<>", "<", ">", "<=", ">="].includes(n.op)) {
          const c = compare(a, b);
          return { "=": c === 0, "<>": c !== 0, "<": c < 0, ">": c > 0, "<=": c <= 0, ">=": c >= 0 }[n.op]!;
        }
        const x = num(a);
        const y = num(b);
        if (isErr(x)) return x;
        if (isErr(y)) return y;
        switch (n.op) {
          case "+":
            return x + y;
          case "-":
            return x - y;
          case "*":
            return x * y;
          case "/":
            return y === 0 ? err("#DIV/0!") : x / y;
          case "^":
            return Math.pow(x, y);
        }
        return err("#ERROR!");
      }
      case "call": {
        const f = FUNCS[n.name];
        if (!f) return err("#NAME?");
        return f(n.args, { calc: this, sheet, now: this.now });
      }
    }
  }

  scalar(n: Node, sheet: number): Scalar {
    const v = this.eval(n, sheet);
    return isRange(v) ? (v.range.length === 1 && v.range[0]!.length === 1 ? v.range[0]![0]! : v.range[0]?.[0] ?? null) : v;
  }
  values(n: Node, sheet: number): Val {
    return this.eval(n, sheet);
  }
}

function compare(a: Scalar, b: Scalar) {
  const na = typeof a === "number" || a === null ? (a ?? 0) : null;
  const nb = typeof b === "number" || b === null ? (b ?? 0) : null;
  if (na !== null && nb !== null) return na < nb ? -1 : na > nb ? 1 : 0;
  if (typeof a === "boolean" || typeof b === "boolean") return text(a) === text(b) ? 0 : text(a) < text(b) ? -1 : 1;
  const sa = text(a).toLowerCase();
  const sb = text(b).toLowerCase();
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

type Ctx = { calc: Calc; sheet: number; now: Date };
type Fn = (args: Node[], ctx: Ctx) => Val;

const flat = (v: Val): Scalar[] => (isRange(v) ? v.range.flat() : [v]);
const all = (args: Node[], ctx: Ctx) => args.flatMap((a) => flat(ctx.calc.values(a, ctx.sheet)));
// Numbers in the arguments (as Excel: text and blanks inside ranges are skipped; typed values are read).
function nums(args: Node[], ctx: Ctx): number[] | FErr {
  const out: number[] = [];
  for (const a of args) {
    const v = ctx.calc.values(a, ctx.sheet);
    if (isRange(v)) {
      for (const x of v.range.flat()) {
        if (isErr(x)) return x;
        if (typeof x === "number") out.push(x);
      }
    } else {
      if (v === null && a.k === "lit") continue;
      // A single cell holding text or nothing is skipped, as in a range.
      if (a.k === "ref") {
        if (isErr(v)) return v;
        if (typeof v === "number") out.push(v);
        continue;
      }
      const n = num(v);
      if (isErr(n)) return n;
      out.push(n);
    }
  }
  return out;
}
const agg = (f: (xs: number[]) => number | FErr): Fn => (args, ctx) => {
  const xs = nums(args, ctx);
  return isErr(xs) ? xs : f(xs);
};
const one = (f: (...xs: Scalar[]) => Scalar): Fn => (args, ctx) => {
  const vs = args.map((a) => ctx.calc.scalar(a, ctx.sheet));
  const e = vs.find(isErr);
  return e ?? f(...vs);
};
const n1 = (f: (...xs: number[]) => number | FErr): Fn =>
  one((...vs) => {
    const ns: number[] = [];
    for (const v of vs) {
      const n = num(v);
      if (isErr(n)) return n;
      ns.push(n);
    }
    const out = f(...ns);
    return typeof out === "number" && !Number.isFinite(out) ? err("#NUM!") : out;
  });

// A criterion as Excel writes it: ">5", "<>done", "=x", "app*" (wildcards), or a plain value.
function matcher(crit: Scalar): (v: Scalar) => boolean {
  if (typeof crit === "number" || typeof crit === "boolean") return (v) => compare(v, crit) === 0 && v !== null;
  const s = text(crit);
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s)!;
  const op = m[1] ?? "=";
  const rhs = literal(m[2]!);
  if ((op === "=" || op === "<>") && typeof rhs === "string" && /[*?]/.test(rhs)) {
    const re = new RegExp(`^${rhs.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
    return (v) => (op === "=") === re.test(text(v));
  }
  return (v) => {
    if (rhs === null) return op === "=" ? v === null || v === "" : !(v === null || v === "");
    if (typeof rhs === "number" && typeof v !== "number") return op === "<>";
    const c = compare(v, rhs);
    return { "=": c === 0, "<>": c !== 0, "<": c < 0, ">": c > 0, "<=": c <= 0, ">=": c >= 0 }[op]!;
  };
}
const grid = (v: Val): Scalar[][] => (isRange(v) ? v.range : [[v]]);

function ifs(args: Node[], ctx: Ctx, sumIdx: number | null) {
  // (sum_range,) criteria_range1, criteria1, ...
  const pairs: { cells: Scalar[]; test: (v: Scalar) => boolean }[] = [];
  const start = sumIdx === null ? 0 : 1;
  for (let i = start; i + 1 < args.length; i += 2) pairs.push({ cells: flat(ctx.calc.values(args[i]!, ctx.sheet)), test: matcher(ctx.calc.scalar(args[i + 1]!, ctx.sheet)) });
  const target = sumIdx === null ? null : flat(ctx.calc.values(args[0]!, ctx.sheet));
  const hits: number[] = [];
  const n = pairs[0]?.cells.length ?? 0;
  for (let i = 0; i < n; i++) if (pairs.every((p) => p.test(p.cells[i] ?? null))) hits.push(i);
  return { hits, target };
}

function lookupExact(list: Scalar[], key: Scalar, approx: boolean) {
  if (!approx) {
    const t = matcher(typeof key === "string" ? `=${key}` : key);
    return list.findIndex((v) => (typeof key === "string" ? t(v) : compare(v, key) === 0));
  }
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === null) continue;
    if (compare(list[i]!, key) <= 0) best = i;
    else break;
  }
  return best;
}

const round = (x: number, d: number, mode: "half" | "up" | "down" = "half") => {
  const k = Math.pow(10, d);
  const v = x * k;
  const r = mode === "up" ? Math.sign(v) * Math.ceil(Math.abs(v) - 1e-9) : mode === "down" ? Math.sign(v) * Math.floor(Math.abs(v) + 1e-9) : Math.sign(v) * Math.round(Math.abs(v) + 1e-9);
  return r / k;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : err("#DIV/0!"));
const variance = (xs: number[], sample: boolean) => {
  if (xs.length < (sample ? 2 : 1)) return err("#DIV/0!");
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - (sample ? 1 : 0));
};

const FUNCS: Record<string, Fn> = {
  SUM: agg((xs) => xs.reduce((a, b) => a + b, 0)),
  AVERAGE: agg(mean),
  MIN: agg((xs) => (xs.length ? Math.min(...xs) : 0)),
  MAX: agg((xs) => (xs.length ? Math.max(...xs) : 0)),
  PRODUCT: agg((xs) => xs.reduce((a, b) => a * b, 1)),
  MEDIAN: agg((xs) => {
    if (!xs.length) return err("#NUM!");
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  }),
  STDEV: agg((xs) => {
    const v = variance(xs, true);
    return isErr(v) ? v : Math.sqrt(v);
  }),
  "STDEV.S": agg((xs) => {
    const v = variance(xs, true);
    return isErr(v) ? v : Math.sqrt(v);
  }),
  "STDEV.P": agg((xs) => {
    const v = variance(xs, false);
    return isErr(v) ? v : Math.sqrt(v);
  }),
  VAR: agg((xs) => variance(xs, true)),
  COUNT: (args, ctx) => all(args, ctx).filter((v) => typeof v === "number").length,
  COUNTA: (args, ctx) => all(args, ctx).filter((v) => v !== null && v !== "").length,
  COUNTBLANK: (args, ctx) => all(args, ctx).filter((v) => v === null || v === "").length,
  LARGE: (args, ctx) => {
    const xs = flat(ctx.calc.values(args[0]!, ctx.sheet)).filter((v): v is number => typeof v === "number").sort((a, b) => b - a);
    const k = num(ctx.calc.scalar(args[1]!, ctx.sheet));
    return isErr(k) ? k : (xs[Math.floor(k) - 1] ?? err("#NUM!"));
  },
  SMALL: (args, ctx) => {
    const xs = flat(ctx.calc.values(args[0]!, ctx.sheet)).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
    const k = num(ctx.calc.scalar(args[1]!, ctx.sheet));
    return isErr(k) ? k : (xs[Math.floor(k) - 1] ?? err("#NUM!"));
  },
  RANK: (args, ctx) => {
    const x = num(ctx.calc.scalar(args[0]!, ctx.sheet));
    if (isErr(x)) return x;
    const xs = flat(ctx.calc.values(args[1]!, ctx.sheet)).filter((v): v is number => typeof v === "number");
    const asc = args[2] ? bool(ctx.calc.scalar(args[2], ctx.sheet)) === true : false;
    if (!xs.includes(x)) return err("#N/A");
    return 1 + xs.filter((v) => (asc ? v < x : v > x)).length;
  },
  SUMPRODUCT: (args, ctx) => {
    const lists = args.map((a) => flat(ctx.calc.values(a, ctx.sheet)));
    const n = lists[0]?.length ?? 0;
    if (lists.some((l) => l.length !== n)) return err("#VALUE!");
    let s = 0;
    for (let i = 0; i < n; i++) s += lists.reduce((p, l) => p * (typeof l[i] === "number" ? (l[i] as number) : 0), 1);
    return s;
  },
  SUMIF: (args, ctx) => {
    const cells = flat(ctx.calc.values(args[0]!, ctx.sheet));
    const test = matcher(ctx.calc.scalar(args[1]!, ctx.sheet));
    const target = args[2] ? flat(ctx.calc.values(args[2], ctx.sheet)) : cells;
    return cells.reduce<number>((s, v, i) => (test(v) && typeof target[i] === "number" ? s + (target[i] as number) : s), 0);
  },
  AVERAGEIF: (args, ctx) => {
    const cells = flat(ctx.calc.values(args[0]!, ctx.sheet));
    const test = matcher(ctx.calc.scalar(args[1]!, ctx.sheet));
    const target = args[2] ? flat(ctx.calc.values(args[2], ctx.sheet)) : cells;
    return mean(cells.flatMap((v, i) => (test(v) && typeof target[i] === "number" ? [target[i] as number] : [])));
  },
  COUNTIF: (args, ctx) => {
    const test = matcher(ctx.calc.scalar(args[1]!, ctx.sheet));
    return flat(ctx.calc.values(args[0]!, ctx.sheet)).filter(test).length;
  },
  SUMIFS: (args, ctx) => {
    const { hits, target } = ifs(args, ctx, 0);
    return hits.reduce((s, i) => s + (typeof target![i] === "number" ? (target![i] as number) : 0), 0);
  },
  COUNTIFS: (args, ctx) => ifs(args, ctx, null).hits.length,
  AVERAGEIFS: (args, ctx) => {
    const { hits, target } = ifs(args, ctx, 0);
    return mean(hits.flatMap((i) => (typeof target![i] === "number" ? [target![i] as number] : [])));
  },
  ROUND: n1((x, d = 0) => round(x, Math.trunc(d))),
  ROUNDUP: n1((x, d = 0) => round(x, Math.trunc(d), "up")),
  ROUNDDOWN: n1((x, d = 0) => round(x, Math.trunc(d), "down")),
  INT: n1((x) => Math.floor(x)),
  TRUNC: n1((x, d = 0) => round(x, Math.trunc(d), "down")),
  ABS: n1((x) => Math.abs(x)),
  SQRT: n1((x) => (x < 0 ? err("#NUM!") : Math.sqrt(x))),
  POWER: n1((x, y) => Math.pow(x, y!)),
  MOD: n1((x, y) => (y === 0 ? err("#DIV/0!") : x - y! * Math.floor(x / y!))),
  CEILING: n1((x, s = 1) => (s === 0 ? 0 : Math.ceil(x / s) * s)),
  FLOOR: n1((x, s = 1) => (s === 0 ? 0 : Math.floor(x / s) * s)),
  PI: () => Math.PI,
  SIGN: n1((x) => Math.sign(x)),
  EXP: n1((x) => Math.exp(x)),
  LN: n1((x) => (x <= 0 ? err("#NUM!") : Math.log(x))),
  LOG10: n1((x) => (x <= 0 ? err("#NUM!") : Math.log10(x))),
  // Loan payment per period (rate per period, number of periods, present value).
  PMT: n1((rate, nper, pv, fv = 0, type = 0) => {
    if (rate === 0) return -(pv! + fv) / nper!;
    const f = Math.pow(1 + rate, nper!);
    return (-(rate * (pv! * f + fv)) / ((1 + rate * type) * (f - 1)));
  }),
  IF: (args, ctx) => {
    const c = bool(ctx.calc.scalar(args[0]!, ctx.sheet));
    if (isErr(c)) return c;
    const pick = c ? args[1] : args[2];
    return pick ? ctx.calc.values(pick, ctx.sheet) : c ? true : false;
  },
  IFS: (args, ctx) => {
    for (let i = 0; i + 1 < args.length; i += 2) {
      const c = bool(ctx.calc.scalar(args[i]!, ctx.sheet));
      if (isErr(c)) return c;
      if (c) return ctx.calc.values(args[i + 1]!, ctx.sheet);
    }
    return err("#N/A");
  },
  IFERROR: (args, ctx) => {
    const v = ctx.calc.scalar(args[0]!, ctx.sheet);
    return isErr(v) ? (args[1] ? ctx.calc.scalar(args[1], ctx.sheet) : "") : v;
  },
  IFNA: (args, ctx) => {
    const v = ctx.calc.scalar(args[0]!, ctx.sheet);
    return isErr(v) && v.error === "#N/A" ? (args[1] ? ctx.calc.scalar(args[1], ctx.sheet) : "") : v;
  },
  AND: (args, ctx) => {
    for (const v of all(args, ctx)) {
      if (v === null) continue;
      const b = bool(v);
      if (isErr(b)) return b;
      if (!b) return false;
    }
    return true;
  },
  OR: (args, ctx) => {
    let any = false;
    for (const v of all(args, ctx)) {
      if (v === null) continue;
      const b = bool(v);
      if (isErr(b)) return b;
      any = any || b;
    }
    return any;
  },
  XOR: (args, ctx) => all(args, ctx).filter((v) => bool(v) === true).length % 2 === 1,
  NOT: one((v) => {
    const b = bool(v);
    return isErr(b) ? b : !b;
  }),
  TRUE: () => true,
  FALSE: () => false,
  ISBLANK: (args, ctx) => {
    const v = ctx.calc.scalar(args[0]!, ctx.sheet);
    return v === null || v === "";
  },
  ISNUMBER: (args, ctx) => typeof ctx.calc.scalar(args[0]!, ctx.sheet) === "number",
  ISTEXT: (args, ctx) => typeof ctx.calc.scalar(args[0]!, ctx.sheet) === "string",
  ISERROR: (args, ctx) => isErr(ctx.calc.scalar(args[0]!, ctx.sheet)),
  NA: () => err("#N/A"),
  CONCAT: (args, ctx) => all(args, ctx).map(text).join(""),
  CONCATENATE: (args, ctx) => all(args, ctx).map(text).join(""),
  TEXTJOIN: (args, ctx) => {
    const sep = text(ctx.calc.scalar(args[0]!, ctx.sheet));
    const skip = bool(ctx.calc.scalar(args[1]!, ctx.sheet)) === true;
    return all(args.slice(2), ctx).map(text).filter((s) => !skip || s !== "").join(sep);
  },
  LEN: one((v) => text(v).length),
  UPPER: one((v) => text(v).toUpperCase()),
  LOWER: one((v) => text(v).toLowerCase()),
  PROPER: one((v) => text(v).toLowerCase().replace(/(^|[\s\-'(/])(\S)/g, (_, a: string, b: string) => a + b.toUpperCase())),
  TRIM: one((v) => text(v).trim().replace(/\s+/g, " ")),
  LEFT: one((v, n = 1) => text(v).slice(0, Math.max(0, Number(num(n)) || 0))),
  RIGHT: one((v, n = 1) => {
    const k = Math.max(0, Number(num(n)) || 0);
    return k ? text(v).slice(-k) : "";
  }),
  MID: one((v, s, n) => text(v).substr(Math.max(0, (Number(num(s)) || 1) - 1), Math.max(0, Number(num(n)) || 0))),
  FIND: one((needle, hay, start = 1) => {
    const i = text(hay).indexOf(text(needle), (Number(num(start)) || 1) - 1);
    return i < 0 ? err("#VALUE!") : i + 1;
  }),
  SEARCH: one((needle, hay, start = 1) => {
    const i = text(hay).toLowerCase().indexOf(text(needle).toLowerCase(), (Number(num(start)) || 1) - 1);
    return i < 0 ? err("#VALUE!") : i + 1;
  }),
  SUBSTITUTE: one((v, a, b) => (text(a) ? text(v).split(text(a)).join(text(b)) : text(v))),
  REPLACE: one((v, s, n, t) => {
    const str = text(v);
    const i = Math.max(0, (Number(num(s)) || 1) - 1);
    return str.slice(0, i) + text(t) + str.slice(i + Math.max(0, Number(num(n)) || 0));
  }),
  REPT: one((v, n) => text(v).repeat(Math.min(1000, Math.max(0, Number(num(n)) || 0)))),
  EXACT: one((a, b) => text(a) === text(b)),
  VALUE: one((v) => {
    const n = num(v);
    return n;
  }),
  TEXT: one((v, f) => formatValue(v, excelFormat(text(f)))),
  TODAY: (_a, ctx) => toSerial(ctx.now) ,
  NOW: (_a, ctx) => toSerial(ctx.now) + (ctx.now.getUTCHours() * 3600 + ctx.now.getUTCMinutes() * 60 + ctx.now.getUTCSeconds()) / 86400,
  DATE: n1((y, m, d) => toSerial(new Date(Date.UTC(y, m! - 1, d)))),
  YEAR: n1((s) => fromSerial(s).getUTCFullYear()),
  MONTH: n1((s) => fromSerial(s).getUTCMonth() + 1),
  DAY: n1((s) => fromSerial(s).getUTCDate()),
  WEEKDAY: n1((s) => fromSerial(s).getUTCDay() + 1),
  DAYS: n1((a, b) => Math.round(a - b!)),
  EDATE: n1((s, m) => {
    const d = fromSerial(s);
    return toSerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m!, d.getUTCDate())));
  }),
  EOMONTH: n1((s, m) => {
    const d = fromSerial(s);
    return toSerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m! + 1, 0)));
  }),
  NETWORKDAYS: n1((a, b) => {
    let n = 0;
    const [x, y] = a <= b! ? [a, b!] : [b!, a];
    for (let s = Math.floor(x); s <= y && n < 100000; s++) {
      const w = fromSerial(s).getUTCDay();
      if (w !== 0 && w !== 6) n++;
    }
    return a <= b! ? n : -n;
  }),
  VLOOKUP: (args, ctx) => {
    const key = ctx.calc.scalar(args[0]!, ctx.sheet);
    const g = grid(ctx.calc.values(args[1]!, ctx.sheet));
    const col = num(ctx.calc.scalar(args[2]!, ctx.sheet));
    if (isErr(col)) return col;
    const approx = args[3] ? bool(ctx.calc.scalar(args[3], ctx.sheet)) !== false : true;
    const i = lookupExact(g.map((r) => r[0] ?? null), key, approx);
    if (i < 0) return err("#N/A");
    return g[i]![col - 1] === undefined ? err("#REF!") : g[i]![col - 1]!;
  },
  HLOOKUP: (args, ctx) => {
    const key = ctx.calc.scalar(args[0]!, ctx.sheet);
    const g = grid(ctx.calc.values(args[1]!, ctx.sheet));
    const row = num(ctx.calc.scalar(args[2]!, ctx.sheet));
    if (isErr(row)) return row;
    const approx = args[3] ? bool(ctx.calc.scalar(args[3], ctx.sheet)) !== false : true;
    const i = lookupExact(g[0] ?? [], key, approx);
    if (i < 0) return err("#N/A");
    return g[row - 1]?.[i] === undefined ? err("#REF!") : g[row - 1]![i]!;
  },
  XLOOKUP: (args, ctx) => {
    const key = ctx.calc.scalar(args[0]!, ctx.sheet);
    const look = flat(ctx.calc.values(args[1]!, ctx.sheet));
    const ret = flat(ctx.calc.values(args[2]!, ctx.sheet));
    const i = lookupExact(look, key, false);
    if (i < 0) return args[3] ? ctx.calc.scalar(args[3], ctx.sheet) : err("#N/A");
    return ret[i] ?? err("#N/A");
  },
  MATCH: (args, ctx) => {
    const key = ctx.calc.scalar(args[0]!, ctx.sheet);
    const list = flat(ctx.calc.values(args[1]!, ctx.sheet));
    const type = args[2] ? Number(num(ctx.calc.scalar(args[2], ctx.sheet))) : 1;
    const i = lookupExact(list, key, type !== 0);
    return i < 0 ? err("#N/A") : i + 1;
  },
  INDEX: (args, ctx) => {
    const g = grid(ctx.calc.values(args[0]!, ctx.sheet));
    const r = num(ctx.calc.scalar(args[1]!, ctx.sheet));
    const c = args[2] ? num(ctx.calc.scalar(args[2], ctx.sheet)) : 1;
    if (isErr(r)) return r;
    if (isErr(c)) return c;
    const row = g.length === 1 && !args[2] ? g[0] : g[r - 1];
    const v = g.length === 1 && !args[2] ? row?.[r - 1] : row?.[c - 1];
    return v === undefined ? err("#REF!") : v;
  },
  CHOOSE: (args, ctx) => {
    const i = num(ctx.calc.scalar(args[0]!, ctx.sheet));
    if (isErr(i)) return i;
    const pick = args[Math.floor(i)];
    return pick && i >= 1 ? ctx.calc.values(pick, ctx.sheet) : err("#VALUE!");
  },
  ROWS: (args, ctx) => grid(ctx.calc.values(args[0]!, ctx.sheet)).length,
  COLUMNS: (args, ctx) => grid(ctx.calc.values(args[0]!, ctx.sheet))[0]?.length ?? 0,
};

export const FUNCTION_NAMES = Object.keys(FUNCS).sort();

// ---------------------------------------------------------------------------
// Whole sheets, display, and copying formulas
// ---------------------------------------------------------------------------

// Every cell of a sheet worked out (for display and export).
export function computeSheet(book: Workbook, sheet = 0, now = new Date()): Scalar[][] {
  const calc = new Calc(book, now);
  return (book[sheet]?.cells ?? []).map((row, r) => row.map((_, c) => calc.value(sheet, r, c)));
}

// One formula on its own (a document's table cell, or a quick check), with an optional grid to refer to.
export function evaluate(formula: string, cells: string[][] = [], now = new Date()): Scalar {
  // The formula sits in its own cell to the right of the grid, so whole-column references do not include it.
  const width = Math.max(0, ...cells.map((r) => r.length));
  const book: Workbook = [{ name: "Sheet1", cells: [...cells.map((r) => r.slice()), [...Array(width).fill(""), formula.startsWith("=") ? formula : `=${formula}`]] }];
  return new Calc(book, now).value(0, book[0]!.cells.length - 1, width);
}

export type NumFormat = { kind: "general" | "number" | "percent" | "currency" | "date" | "datetime" | "text" | "accounting"; decimals?: number; symbol?: string; thousands?: boolean };

export function formatValue(v: Scalar, f: NumFormat = { kind: "general" }): string {
  if (v === null) return "";
  if (isErr(v)) return v.error;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "string") return v;
  const d = f.decimals ?? 2;
  const group = (n: number, dec: number) => n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: f.thousands !== false });
  switch (f.kind) {
    case "number":
      return group(v, d);
    case "percent":
      return `${(v * 100).toFixed(d)}%`;
    case "currency":
      return `${f.symbol ?? "ETB"} ${group(v, d)}`;
    case "accounting":
      return v < 0 ? `(${group(-v, d)})` : group(v, d);
    case "date":
      return fromSerial(v).toISOString().slice(0, 10);
    case "datetime":
      return fromSerial(v).toISOString().slice(0, 16).replace("T", " ");
    case "text":
      return fmtNum(v);
    default:
      return Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-9 && v !== 0) ? v.toExponential(4) : fmtNum(Number(v.toPrecision(12)));
  }
}

// A simple Excel number format code ("0.00", "#,##0", "0%", "yyyy-mm-dd") as a NumFormat.
export function excelFormat(code: string): NumFormat {
  const c = code.trim();
  if (/y|d{1,2}|m{3}/i.test(c) && !/0/.test(c)) return { kind: /h/i.test(c) ? "datetime" : "date" };
  const dec = /\.(0+)/.exec(c)?.[1]?.length ?? 0;
  if (c.endsWith("%")) return { kind: "percent", decimals: dec };
  if (/[$€£]|ETB|Br/i.test(c)) return { kind: "currency", decimals: dec, symbol: /ETB|Br/i.test(c) ? "ETB" : (/[$€£]/.exec(c)?.[0] ?? "ETB") };
  if (/0/.test(c)) return { kind: "number", decimals: dec, thousands: c.includes(",") };
  return { kind: "general" };
}
export function numFmtCode(f: NumFormat | undefined) {
  if (!f) return undefined;
  const dec = f.decimals ?? 2;
  const z = dec ? `.${"0".repeat(dec)}` : "";
  switch (f.kind) {
    case "number":
      return `${f.thousands === false ? "0" : "#,##0"}${z}`;
    case "percent":
      return `0${z}%`;
    case "currency":
      return `"${f.symbol ?? "ETB"} "#,##0${z}`;
    case "accounting":
      return `#,##0${z};(#,##0${z})`;
    case "date":
      return "yyyy-mm-dd";
    case "datetime":
      return "yyyy-mm-dd hh:mm";
    case "text":
      return "@";
    default:
      return undefined;
  }
}

// A formula copied dr rows and dc columns away: relative references move, $-fixed parts stay (fill down, paste).
export function shiftFormula(raw: string, dr: number, dc: number): string {
  if (!raw.startsWith("=")) return raw;
  let out = "";
  let i = 1;
  const src = raw;
  out = "=";
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '"') {
      const j = src.indexOf('"', i + 1);
      const end = j < 0 ? src.length : j + 1;
      out += src.slice(i, end);
      i = end;
      continue;
    }
    const m = /^((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![\w(])/.exec(src.slice(i));
    const prev = src[i - 1] ?? "";
    if (m && !/[A-Za-z0-9_.]/.test(prev)) {
      const c = m[2] ? colIndex(m[3]!) : colIndex(m[3]!) + dc;
      const r = m[4] ? Number(m[5]) - 1 : Number(m[5]) - 1 + dr;
      out += (m[1] ?? "") + (c < 0 || r < 0 ? "#REF!" : `${m[2]}${colName(c)}${m[4]}${r + 1}`);
      i += m[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// Word-style table formulas: =SUM(ABOVE), =SUM(LEFT), =AVERAGE(ABOVE)... for a cell at (r, c) of a table.
export function tableFormula(raw: string, r: number, c: number) {
  return raw.replace(/\b(ABOVE|LEFT|BELOW|RIGHT)\b/gi, (w) => {
    const k = w.toUpperCase();
    if (k === "ABOVE") return r > 0 ? `${addr(0, c)}:${addr(r - 1, c)}` : "#REF!";
    if (k === "LEFT") return c > 0 ? `${addr(r, 0)}:${addr(r, c - 1)}` : "#REF!";
    if (k === "BELOW") return `${addr(r + 1, c)}:${addr(r + 200, c)}`;
    return `${addr(r, c + 1)}:${addr(r, c + 50)}`;
  });
}

// A table of text cells (a document's table) worked out: cells starting with "=" become their result.
export function computeTable(rows: string[][], now = new Date()): string[][] {
  const cells = rows.map((row, r) => row.map((v, c) => (v.startsWith("=") ? tableFormula(v, r, c) : v)));
  const vals = computeSheet([{ name: "Table", cells }], 0, now);
  return rows.map((row, r) =>
    row.map((v, c) => {
      if (!v.startsWith("=")) return v;
      const x = vals[r]![c]!;
      return formatValue(typeof x === "number" ? Math.round(x * 100) / 100 : x);
    }),
  );
}

// References after rows or columns are inserted (n > 0) or deleted (n < 0) at index `at`, as Excel adjusts them.
// Only references to this sheet move (unprefixed, or prefixed with this sheet's name); a reference into deleted
// cells becomes #REF!.
export function adjustRefs(raw: string, axis: "row" | "col", at: number, n: number, sheetName?: string): string {
  if (!raw.startsWith("=") || n === 0) return raw;
  let out = "=";
  let i = 1;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === '"') {
      const j = raw.indexOf('"', i + 1);
      const end = j < 0 ? raw.length : j + 1;
      out += raw.slice(i, end);
      i = end;
      continue;
    }
    const m = /^((?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))!)?(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![\w(])/.exec(raw.slice(i));
    const prev = raw[i - 1] ?? "";
    if (m && !/[A-Za-z0-9_.]/.test(prev)) {
      const sheet = m[2]?.replace(/''/g, "'") ?? m[3];
      const mine = !sheet || (sheetName !== undefined && sheet.toLowerCase() === sheetName.toLowerCase());
      let c = colIndex(m[5]!);
      let r = Number(m[7]) - 1;
      let gone = false;
      if (mine) {
        const v = axis === "row" ? r : c;
        let nv = v;
        if (n > 0 && v >= at) nv = v + n;
        if (n < 0) {
          if (v >= at && v < at - n) gone = true;
          else if (v >= at - n) nv = v + n;
        }
        if (axis === "row") r = nv;
        else c = nv;
      }
      out += (m[1] ?? "") + (gone ? "#REF!" : `${m[4]}${colName(c)}${m[6]}${r + 1}`);
      i += m[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
