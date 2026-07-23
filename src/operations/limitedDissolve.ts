import { Vector3 } from 'three';
import { Halfedge } from '../core/Halfedge';
import { HalfedgeDS } from '../core/HalfedgeDS';
import { Vertex } from '../core/Vertex';
import { Face } from '../core/Face';
import { joinFacesAcrossEdge } from './joinFaces';
import { removeFromArray } from '../utils/array';

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

/**
 * Dissolves edges whose adjacent faces meet within `angleLimit` (Blender's
 * limited / "Dissolve Limited" by face angle, `bm_edge_calc_dissolve_error`).
 *
 * Each manifold edge has cost `-dot(n1, n2)` (sign-flipped so coplanar faces are
 * cheapest) and dissolves when `cost <= -cos(angleLimit)` — i.e. when the dihedral
 * angle between the faces is within the limit. A min-heap always dissolves the
 * cheapest edge first; after each merge the surviving face's normal is recomputed
 * (live Newell) and its boundary edges are re-cost via lazy heap replacement.
 *
 * Delimit: NORMAL only. MATERIAL/SEAM/SHARP/UV delimiters and the geometric
 * `USE_DEGENERATE_CHECK` are deferred — topology stays valid without them.
 *
 * @param struct      Structure to mutate.
 * @param angleLimit  Radians; edges at <= this dihedral angle dissolve.
 */
export function limitedDissolve(struct: HalfedgeDS, angleLimit: number): void {
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
      // Self-sided edge left by a cyclic coplanar merge (e.g. a grid centre
      // vertex): a 2-face join can't remove it. It is a spike at an interior
      // vertex, so splice it out and isolate the tip — yielding the clean
      // merged perimeter joinFaces would produce.
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

/**
 * Removes a self-sided halfedge pair (both sides in the same face) that a cyclic
 * coplanar merge leaves as a spike at an interior vertex. Splices the spike out
 * of the face loop and isolates its tip, leaving the clean merged perimeter.
 * Non-spike self-sided chords (which would split the face) are left untouched.
 */
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

  removeFromArray(struct.halfedges, he);
  removeFromArray(struct.halfedges, twin);
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
