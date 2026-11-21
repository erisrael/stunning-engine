import { ROADS, junctions, type Road } from "./streets";

// GPS: the shortest way along the town's roads from where I am to a waypoint. The roads' junctions and ends are the
// nodes; each road joins its nodes in order. Start and end are put on their nearest road (projected onto its
// centre line) and joined to that road's neighbouring nodes. A few hundred nodes at most: Dijkstra is instant.

type P = { x: number; z: number };
type Graph = { nodes: P[]; adj: { to: number; d: number }[][]; on: Map<Road, number[]> };

let graph: Graph | null = null;
const key = (p: P) => `${Math.round(p.x)},${Math.round(p.z)}`;
const along = (r: Road, p: P) => (r.axis === "x" ? p.x : p.z);

function build(): Graph {
  const nodes: P[] = [];
  const index = new Map<string, number>();
  const add = (p: P) => {
    const k = key(p);
    if (!index.has(k)) (index.set(k, nodes.length), nodes.push(p));
    return index.get(k)!;
  };
  for (const j of junctions()) add({ x: j.x, z: j.z });
  for (const r of ROADS) for (const t of [r.from, r.to]) add(r.axis === "x" ? { x: t, z: r.c } : { x: r.c, z: t });
  const adj: Graph["adj"] = nodes.map(() => []);
  const on = new Map<Road, number[]>();
  for (const r of ROADS) {
    const ids = nodes
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (r.axis === "x" ? Math.abs(p.z - r.c) < 1.5 && p.x >= r.from - 1.5 && p.x <= r.to + 1.5 : Math.abs(p.x - r.c) < 1.5 && p.z >= r.from - 1.5 && p.z <= r.to + 1.5))
      .sort((a, b) => along(r, a.p) - along(r, b.p))
      .map(({ i }) => i);
    on.set(r, ids);
    for (let k = 1; k < ids.length; k++) {
      const a = ids[k - 1]!, b = ids[k]!;
      const d = Math.hypot(nodes[a]!.x - nodes[b]!.x, nodes[a]!.z - nodes[b]!.z);
      adj[a]!.push({ to: b, d });
      adj[b]!.push({ to: a, d });
    }
  }
  return { nodes, adj, on };
}

// The nearest point on any road's centre line.
function snap(p: P) {
  let best: { road: Road; q: P; d: number } | null = null;
  for (const r of ROADS) {
    const t = Math.max(r.from, Math.min(r.to, along(r, p)));
    const q = r.axis === "x" ? { x: t, z: r.c } : { x: r.c, z: t };
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (!best || d < best.d) best = { road: r, q, d };
  }
  return best!;
}

export function route(from: P, to: P): P[] {
  graph ??= build();
  const G = graph;
  const a = snap(from), b = snap(to);
  // Same road: straight along it.
  if (a.road === b.road) return [from, a.q, b.q, to];
  const n = G.nodes.length;
  const S = n, T = n + 1;
  const pts = [...G.nodes, a.q, b.q];
  const links = (s: { road: Road; q: P }, id: number) => {
    const ids = G.on.get(s.road) ?? [];
    const t = along(s.road, s.q);
    let lo = -1, hi = -1;
    for (const i of ids) {
      const v = along(s.road, G.nodes[i]!);
      if (v <= t) lo = i;
      if (v >= t && hi < 0) hi = i;
    }
    return [lo, hi].filter((i) => i >= 0).map((i) => ({ from: id, to: i, d: Math.hypot(G.nodes[i]!.x - s.q.x, G.nodes[i]!.z - s.q.z) }));
  };
  const extra = new Map<number, { to: number; d: number }[]>();
  const link = (l: { from: number; to: number; d: number }) => {
    (extra.get(l.from) ?? extra.set(l.from, []).get(l.from)!).push({ to: l.to, d: l.d });
    (extra.get(l.to) ?? extra.set(l.to, []).get(l.to)!).push({ to: l.from, d: l.d });
  };
  links(a, S).forEach(link);
  links(b, T).forEach(link);
  const dist = new Array(n + 2).fill(Infinity);
  const prev = new Array(n + 2).fill(-1);
  const done = new Array(n + 2).fill(false);
  dist[S] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n + 2; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === T) break;
    done[u] = true;
    for (const e of [...(G.adj[u] ?? []), ...(extra.get(u) ?? [])]) if (dist[u] + e.d < dist[e.to]) (dist[e.to] = dist[u] + e.d), (prev[e.to] = u);
  }
  if (dist[T] === Infinity) return [from, to];
  const path: P[] = [];
  for (let u = T; u >= 0; u = prev[u]) path.unshift(pts[u]!);
  return [from, ...path, to];
}

export const routeLength = (r: P[]) => r.reduce((s, p, i) => (i ? s + Math.hypot(p.x - r[i - 1]!.x, p.z - r[i - 1]!.z) : 0), 0);
