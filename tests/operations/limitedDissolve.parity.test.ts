import { Vector3 } from 'three';
import { Halfedge } from '../../src/core/Halfedge';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { Vertex } from '../../src/core/Vertex';
import { Face } from '../../src/core/Face';
import { joinFacesAcrossEdge } from '../../src/operations/joinFaces';
import { validateHalfedgeConsistency } from '../helpers/topologyValidation';

// ---------------------------------------------------------------------------
// Equivalence harness: the shipped limitedDissolve (batched-removal rewrite)
// against the previous implementation (verbatim below, pre-rewrite), on
// randomized meshes.
//
// The rewrite preserves the greedy dissolve semantics exactly — same cost
// function, same threshold, same merge and spike rules — but the ORDER in
// which equal-cost edges dissolve is implementation-defined (the legacy heap
// ordered duplicates by insertion history; the rewrite re-costs in place with
// additively-maintained normals). Order among ties decides how many
// degenerate self-sided chords the cyclic endgames leave behind, so face
// counts must match exactly while leftover-chord counts may differ.
//
// Asserted: identical face counts, and both results independently valid
// (twin/next/prev consistency, disk Euler characteristic, every non-isolated
// vertex anchored at a live halfedge).
// ---------------------------------------------------------------------------

// === Legacy implementation (pre-rewrite), verbatim ==========================

interface HeapItem {
  cost: number;
  he: Halfedge;
  key: string;
  ver: number;
}

/** Binary min-heap over `cost` (no decrease-key — staleness handles re-costing). */
class MinHeap {
  private a: HeapItem[] = [];

  size(): number {
    return this.a.length;
  }

  push(item: HeapItem): void {
    this.a.push(item);
    this.bubbleUp(this.a.length - 1);
  }

  pop(): HeapItem | undefined {
    const top = this.a[0];
    const last = this.a.pop();
    if (this.a.length > 0 && last !== undefined) {
      this.a[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[i].cost < this.a[p].cost) {
        [this.a[i], this.a[p]] = [this.a[p], this.a[i]];
        i = p;
      } else {
        break;
      }
    }
  }

  private bubbleDown(i: number): void {
    const n = this.a.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let m = i;
      if (l < n && this.a[l].cost < this.a[m].cost) {
        m = l;
      }
      if (r < n && this.a[r].cost < this.a[m].cost) {
        m = r;
      }
      if (m === i) {
        break;
      }
      [this.a[i], this.a[m]] = [this.a[m], this.a[i]];
      i = m;
    }
  }
}

function legacyLimitedDissolve(struct: HalfedgeDS, angleLimit: number): void {
  const threshold = -Math.cos(angleLimit);
  const nA = new Vector3();
  const nB = new Vector3();
  const live = new Set<Halfedge>(struct.halfedges);
  const version = new Map<string, number>();
  const heap = new MinHeap();

  const keyOf = (he: Halfedge): string => {
    const x = he.vertex.id;
    const y = he.twin.vertex.id;
    return x < y ? `${x}-${y}` : `${y}-${x}`;
  };

  const costOf = (he: Halfedge): number => {
    he.face!.getNormal(nA);
    he.twin.face!.getNormal(nB);
    return -nA.dot(nB);
  };

  const pushEdge = (he: Halfedge): void => {
    if (!he.face || !he.twin.face) {
      return;
    }
    const key = keyOf(he);
    const ver = (version.get(key) ?? 0) + 1;
    version.set(key, ver);
    heap.push({cost: costOf(he), he, key, ver});
  };

  // Seed one entry per manifold undirected edge.
  const seeded = new Set<string>();
  for (const he of struct.halfedges) {
    if (!he.face || !he.twin.face) {
      continue;
    }
    const key = keyOf(he);
    if (seeded.has(key)) {
      continue;
    }
    seeded.add(key);
    pushEdge(he);
  }

  while (heap.size() > 0) {
    const item = heap.pop()!;
    if (item.ver !== (version.get(item.key) ?? 0)) {
      continue; // superseded by a fresher cost for this edge
    }
    const he = item.he;
    if (!live.has(he) || !he.face || !he.twin.face) {
      continue; // already dissolved or no longer manifold
    }
    if (item.cost > threshold) {
      break; // heap min is the global min — nothing cheaper remains to dissolve
    }

    if (he.face === he.twin.face) {
      removeSelfSidedSpike(struct, he, live);
      continue;
    }

    const twin = he.twin;
    const survivor: Face = joinFacesAcrossEdge(struct, he);
    live.delete(he);
    live.delete(twin);

    // Re-cost the survivor's manifold boundary edges.
    for (const e of survivor.halfedge.nextLoop()) {
      pushEdge(e);
    }
  }
}

function removeSelfSidedSpike(struct: HalfedgeDS, he: Halfedge, live: Set<Halfedge>): void {
  const twin = he.twin;
  const face = he.face!;
  let tip: Vertex;
  let anchor: Halfedge;

  if (he.next === twin) {
    anchor = he.prev;
    anchor.next = twin.next;
    twin.next.prev = anchor;
    tip = twin.vertex;
  } else if (twin.next === he) {
    anchor = twin.prev;
    anchor.next = he.next;
    he.next.prev = anchor;
    tip = he.vertex;
  } else {
    return; // not a simple spike; leave untouched
  }

  if (face.halfedge === he || face.halfedge === twin) {
    face.halfedge = anchor;
  }

  struct.removeHalfedges([he, twin]);
  live.delete(he);
  live.delete(twin);

  // Repoint the tip to any surviving outgoing halfedge (null if now isolated).
  let next: Halfedge | null = null;
  for (const h of struct.halfedges) {
    if (h.vertex === tip) {
      next = h;
      break;
    }
  }
  tip.halfedge = next;
}

// === Harness =================================================================

/** Deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GridMesh {
  positions: Float32Array;
  faceOffsets: number[];
  cornerVerts: number[];
}

function buildGrid(
    width: number,
    height: number,
    z: (xi: number, yi: number) => number): GridMesh {
  const positions = new Float32Array(width * height * 3);
  let p = 0;
  for (let yi = 0; yi < height; yi++) {
    for (let xi = 0; xi < width; xi++) {
      positions[p++] = xi;
      positions[p++] = yi;
      positions[p++] = z(xi, yi);
    }
  }
  const triCount = 2 * (width - 1) * (height - 1);
  const faceOffsets = new Array<number>(triCount + 1);
  const cornerVerts = new Array<number>(triCount * 3);
  let f = 0;
  let c = 0;
  faceOffsets[0] = 0;
  for (let yi = 0; yi < height - 1; yi++) {
    for (let xi = 0; xi < width - 1; xi++) {
      const a = yi * width + xi;
      const b = a + 1;
      const d = a + width;
      const e = d + 1;
      cornerVerts[c++] = a; cornerVerts[c++] = b; cornerVerts[c++] = e;
      faceOffsets[++f] = c;
      cornerVerts[c++] = a; cornerVerts[c++] = e; cornerVerts[c++] = d;
      faceOffsets[++f] = c;
    }
  }
  return {positions, faceOffsets, cornerVerts};
}

function ingest(mesh: GridMesh): HalfedgeDS {
  const struct = new HalfedgeDS();
  struct.setFromPolygons(mesh.positions, mesh.faceOffsets, mesh.cornerVerts, { weld: false });
  return struct;
}

/**
 * Structural validity: consistency and disk Euler characteristic for both
 * implementations; the anchor-liveness check applies only to the rewrite —
 * the legacy implementation can leave a spike-adjacent vertex anchored at a
 * since-removed halfedge (the rewrite repairs both splice endpoints, which
 * is one of its deliberate fixes).
 */
function assertValidDissolveResult(label: string, struct: HalfedgeDS, checkAnchors: boolean): void {
  validateHalfedgeConsistency(struct);
  let isolated = 0;
  const live = new Set(struct.halfedges);
  for (const v of struct.vertices) {
    if (v.halfedge === null) {
      isolated += 1;
    } else if (checkAnchors) {
      expect(live.has(v.halfedge), `${label}: vertex anchor is live`).toBe(true);
      expect(v.halfedge.vertex, `${label}: anchor originates at its vertex`).toBe(v);
    }
  }
  const edges = struct.halfedges.length / 2;
  expect(struct.vertices.length - edges + struct.faces.length - isolated,
    `${label}: disk Euler characteristic`).toBe(1);
}

function compareMeshes(label: string, mesh: GridMesh, angle: number): void {
  const legacy = ingest(mesh);
  const current = ingest(mesh);

  legacyLimitedDissolve(legacy, angle);
  current.limitedDissolve(angle);

  assertValidDissolveResult(`${label} [legacy]`, legacy, false);
  assertValidDissolveResult(`${label} [current]`, current, true);

  // Face counts are order-invariant: every merge consumes exactly one face
  // and every dissolvable edge eventually drains, regardless of tie order.
  expect(current.faces.length, `${label}: face count`).toBe(legacy.faces.length);
}

describe('limitedDissolve – legacy equivalence', () => {

  test('randomized smooth grids: same face counts, both results valid', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rand = mulberry32(seed);
      const width = 4 + Math.floor(rand() * 9);
      const height = 4 + Math.floor(rand() * 9);
      const a1 = rand() * 2, f1 = 0.1 + rand() * 0.5;
      const a2 = rand() * 2, f2 = 0.1 + rand() * 0.5;
      const p1 = rand() * Math.PI, p2 = rand() * Math.PI;
      const jitter = 0.01 + rand() * 0.1;
      const mesh = buildGrid(width, height, (x, y) =>
        a1 * Math.sin(x * f1 + p1) * Math.cos(y * f2)
        + a2 * Math.cos(x * f2) * Math.sin(y * f1 + p2)
        + jitter * Math.sin(37.7 * x + 11.3 * y));
      const angle = (1 + rand() * 89) * Math.PI / 180;
      compareMeshes(`seed=${seed} ${width}x${height} @${(angle * 180 / Math.PI).toFixed(0)}deg`,
        mesh, angle);
    }
  });

  test('plateau grids: same face counts, both results valid', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rand = mulberry32(1000 + seed);
      const width = 4 + Math.floor(rand() * 8);
      const height = 4 + Math.floor(rand() * 8);
      const step = 0.5 + rand();
      const mesh = buildGrid(width, height, (x, y) =>
        Math.round((0.7 * Math.sin(x * 0.23) * Math.cos(y * 0.31)) / step) * step);
      const angle = (2 + rand() * 40) * Math.PI / 180;
      compareMeshes(`plateau seed=${seed} ${width}x${height}`, mesh, angle);
    }
  });

  test('fully coplanar grids: same face counts, both results valid', () => {
    for (const w of [4, 7, 12]) {
      const mesh = buildGrid(w, w, () => 0);
      compareMeshes(`coplanar ${w}x${w}`, mesh, 30 * Math.PI / 180);
    }
  });
});
