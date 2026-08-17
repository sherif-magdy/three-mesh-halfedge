import { Vector3 } from 'three';
import { Halfedge } from '../core/Halfedge';
import { HalfedgeDS } from '../core/HalfedgeDS';
import { Vertex } from '../core/Vertex';
import { Face } from '../core/Face';

/** Cost assigned to edges that must never dissolve (dead or one-sided). */
const COST_INVALID = Infinity;

/**
 * Binary min-heap over edge costs with stable node handles (Blender's
 * `BLI_Heap` + `eheap_table` pattern from bmesh_decimate_dissolve.cc).
 *
 * One slot per undirected edge, addressed by its dense edge id. `update`
 * re-costs a node in place in O(log n) — no duplicate entries and no
 * staleness bookkeeping, so the heap never grows past the edge count.
 * All state lives in flat typed arrays indexed by edge id / heap slot.
 */
class EdgeHeap {
  /** Heap-slot -> cost. */
  private readonly cost: Float64Array;
  /** Heap-slot -> edge id. */
  private readonly node: Int32Array;
  /** Edge id -> heap slot, -1 when absent. */
  private readonly pos: Int32Array;
  size = 0;

  constructor(edgeCapacity: number) {
    this.cost = new Float64Array(edgeCapacity);
    this.node = new Int32Array(edgeCapacity);
    this.pos = new Int32Array(edgeCapacity).fill(-1);
  }

  topCost(): number {
    return this.cost[0];
  }

  topEdge(): number {
    return this.node[0];
  }

  insert(edgeId: number, cost: number): void {
    const slot = this.size++;
    this.cost[slot] = cost;
    this.node[slot] = edgeId;
    this.pos[edgeId] = slot;
    this.siftUp(slot);
  }

  update(edgeId: number, cost: number): void {
    const slot = this.pos[edgeId];
    const old = this.cost[slot];
    this.cost[slot] = cost;
    if (cost < old) {
      this.siftUp(slot);
    } else if (cost > old) {
      this.siftDown(slot);
    }
  }

  private siftUp(slot: number): void {
    const {cost, node, pos} = this;
    const c = cost[slot];
    const e = node[slot];
    let i = slot;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cost[p] <= c) {
        break;
      }
      cost[i] = cost[p];
      node[i] = node[p];
      pos[node[i]] = i;
      i = p;
    }
    cost[i] = c;
    node[i] = e;
    pos[e] = i;
  }

  private siftDown(slot: number): void {
    const {cost, node, pos} = this;
    const n = this.size;
    const c = cost[slot];
    const e = node[slot];
    let i = slot;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      let mc = c;
      if (l < n && cost[l] < mc) {
        m = l;
        mc = cost[l];
      }
      if (r < n && cost[r] < mc) {
        m = r;
      }
      if (m === i) {
        break;
      }
      cost[i] = cost[m];
      node[i] = node[m];
      pos[node[i]] = i;
      i = m;
    }
    cost[i] = c;
    node[i] = e;
    pos[e] = i;
  }
}

/**
 * Dissolves edges whose adjacent faces meet within `angleLimit` (Blender's
 * limited / "Dissolve Limited" by face angle, `bm_edge_calc_dissolve_error`).
 *
 * Each manifold edge has cost `-dot(n1, n2)` (sign-flipped so coplanar faces
 * are cheapest) and dissolves when `cost <= -cos(angleLimit)` — i.e. when the
 * dihedral angle between the faces is within the limit. A min-heap always
 * dissolves the cheapest edge first; after each merge the survivor's normal is
 * recomputed and its boundary edges are re-cost in place.
 *
 * Complexity design (mirrors `BM_mesh_decimate_dissolve_ex`):
 *  - Face normals are maintained as unnormalized Newell sums. Newell sums are
 *    additive over a merge (the shared directed edge cancels), so a merge
 *    updates the survivor's normal in O(1) instead of re-walking its loop,
 *    and every cost query is an O(1) cached-unit dot product.
 *  - The larger of the two merged loops survives (union-by-size): merging
 *    re-owns the absorbed loop's halfedges, which costs O(min(|a|, |b|)) —
 *    otherwise a big flat dissolve can keep absorbing its growing survivor
 *    into a fresh triangle and re-own it per merge, which is quadratic.
 *  - Merges are pure pointer surgery during the drain: absorbed faces and
 *    dead halfedge pairs accumulate in local lists, and `struct.faces` /
 *    `struct.halfedges` (with the attribute layers and index map) compact
 *    once at the end — Blender batches its wire cleanup the same way instead
 *    of paying a full compaction per merge.
 *  - The survivor's boundary is only re-walked when its normal actually
 *    rotated: a coplanar merge changes no cost, so the walk is skipped and
 *    dissolving a large flat region stays linear instead of quadratic.
 *
 * Delimit: NORMAL only. MATERIAL/SEAM/SHARP/UV delimiters and the geometric
 * `USE_DEGENERATE_CHECK` are deferred — topology stays valid without them.
 *
 * @param struct      Structure to mutate.
 * @param angleLimit  Radians; edges at <= this dihedral angle dissolve.
 */
export function limitedDissolve(struct: HalfedgeDS, angleLimit: number): void {
  const threshold = -Math.cos(angleLimit);
  const halfedges = struct.halfedges;
  const halfedgeCount = halfedges.length;

  // Dense edge state indexed by edge id == array index of the pair member
  // with the smaller index. Array positions are frozen during the drain (the
  // array is only compacted once, at the end), so the ids stay stable.
  const dead = new Uint8Array(halfedgeCount);
  const rep: (Halfedge | null)[] = new Array(halfedgeCount).fill(null);

  // Absorbed faces / dead halfedge pairs, spliced out in one final batch.
  const deadFaces: Face[] = [];
  const deadHalfedges: Halfedge[] = [];
  // Vertices whose `.halfedge` anchor may dangle after a spike splice; the
  // final pass repoints them at a surviving outgoing halfedge.
  const staleTips: Vertex[] = [];

  // Per-face normals: unnormalized Newell sums plus cached unit vectors. The
  // sum is maintained additively across merges; the unit is refreshed only
  // for the survivor of each merge.
  const nsums = new Map<Face, Vector3>();
  const units = new Map<Face, Vector3>();
  // Boundary-loop length per face, maintained alongside the normals (seeded
  // by the same walk) so the merge's survivor choice stays O(1).
  const loopLens = new Map<Face, number>();
  const before = new Vector3();

  // Lazy Newell initialization, shared by seeding and the first merge of a
  // face (every face bordering a manifold edge is ensured by the seed pass).
  const ensureNormal = (face: Face): void => {
    if (units.has(face)) {
      return;
    }
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let he = face.halfedge;
    const start = he;
    let len = 0;
    do {
      const a = he.vertex.position;
      const b = he.next.vertex.position;
      nx += (a.y - b.y) * (a.z + b.z);
      ny += (a.z - b.z) * (a.x + b.x);
      nz += (a.x - b.x) * (a.y + b.y);
      len += 1;
      he = he.next;
    } while (he !== start);
    nsums.set(face, new Vector3(nx, ny, nz));
    units.set(face, new Vector3(nx, ny, nz).normalize());
    loopLens.set(face, len);
  };

  const heap = new EdgeHeap(halfedgeCount);

  // Seed one entry per manifold undirected edge, visited from its
  // lower-index member so each pair is seen exactly once.
  for (let i = 0; i < halfedgeCount; i++) {
    const he = halfedges[i];
    if (!he.face || !he.twin.face) {
      continue;
    }
    if (struct.halfedgeIndex(he.twin) < i) {
      continue;
    }
    ensureNormal(he.face);
    ensureNormal(he.twin.face);
    rep[i] = he;
    heap.insert(i, -units.get(he.face)!.dot(units.get(he.twin.face)!));
  }

  const isDead = (he: Halfedge): boolean =>
    dead[struct.halfedgeIndex(he)] === 1 || dead[struct.halfedgeIndex(he.twin)] === 1;

  const markDead = (he: Halfedge): void => {
    dead[struct.halfedgeIndex(he)] = 1;
    he.face = null;
    deadHalfedges.push(he);
  };

  /**
   * Merges the two faces incident to `he` — `removeEdge(mergeFaces=true)`
   * semantics as pure pointer surgery. The face with the larger loop
   * survives (union-by-size), which bounds the re-own walk below at
   * O(min(|a|, |b|)); the survivor keeps its loop (minus the dying pair),
   * the absorbed face's other halfedges are re-owned by the survivor, and
   * both deaths are only recorded, never applied to the arrays.
   */
  const mergePair = (heIn: Halfedge): void => {
    const he = loopLens.get(heIn.twin.face!)! > loopLens.get(heIn.face!)! ? heIn.twin : heIn;
    const twin = he.twin;
    const survivor = he.face!;
    const absorbed = twin.face!;

    // Snapshot the survivor's unit normal to detect rotation after the merge.
    before.copy(units.get(survivor)!);

    // Re-own the absorbed loop (except the dying twin): its halfedges join
    // the survivor's loop and must reference the surviving face. The
    // survivor's own halfedges already do.
    let loopHe = absorbed.halfedge;
    const loopStart = loopHe;
    do {
      if (loopHe !== twin) {
        loopHe.face = survivor;
      }
      loopHe = loopHe.next;
    } while (loopHe !== loopStart);

    // Repoint the survivor's entry halfedge before the pair is unlinked.
    survivor.halfedge = he.prev;

    // Splice the pair out of the loop, exactly as removeEdge does.
    const v1 = he.vertex;
    if (twin.next === he) {
      v1.halfedge = null; // v1 is now isolated
    } else {
      v1.halfedge = twin.next;
      he.prev.next = twin.next;
      twin.next.prev = he.prev;
    }
    const v2 = twin.vertex;
    if (he.next === twin) {
      v2.halfedge = null; // v2 is now isolated
    } else {
      v2.halfedge = he.next;
      he.next.prev = twin.prev;
      twin.prev.next = he.next;
    }

    // Newell sums are additive over a merge (the shared directed edge
    // cancels), so the survivor's normal updates in O(1). The merged loop
    // drops the dying pair: la + lb - 2 corners.
    nsums.get(survivor)!.add(nsums.get(absorbed)!);
    nsums.delete(absorbed);
    units.delete(absorbed);
    loopLens.set(survivor, loopLens.get(survivor)! + loopLens.get(absorbed)! - 2);
    loopLens.delete(absorbed);
    const unit = units.get(survivor)!.copy(nsums.get(survivor)!).normalize();

    markDead(he);
    markDead(twin);
    deadFaces.push(absorbed);

    // Re-cost the survivor's manifold boundary edges — only needed when the
    // normal rotated (a coplanar merge leaves every cost unchanged).
    if (before.dot(unit) < 1 - 1e-12) {
      let e = survivor.halfedge;
      const start = e;
      do {
        if (e.twin.face) {
          const eid = Math.min(struct.halfedgeIndex(e), struct.halfedgeIndex(e.twin));
          rep[eid] = e;
          heap.update(eid, -units.get(survivor)!.dot(units.get(e.twin.face)!));
        }
        e = e.next;
      } while (e !== start);
    }
  };

  /**
   * Removes a self-sided halfedge pair (both sides in the same face) that a
   * cyclic coplanar merge leaves as a spike at an interior vertex. Splices
   * the spike out of the face loop and defers the tip's isolation — yielding
   * the clean merged perimeter. Non-spike self-sided chords (which would
   * split the face) are left untouched. Vertex anchors at the splice points
   * are repaired by the final pass.
   */
  const removeSelfSidedSpike = (he: Halfedge): void => {
    const twin = he.twin;
    const face = he.face!;
    let anchor: Halfedge;
    let tip: Vertex;
    let other: Vertex;

    if (he.next === twin) {
      anchor = he.prev;
      anchor.next = twin.next;
      twin.next.prev = anchor;
      tip = twin.vertex;
      other = he.vertex;
    } else if (twin.next === he) {
      anchor = twin.prev;
      anchor.next = he.next;
      he.next.prev = anchor;
      tip = he.vertex;
      other = twin.vertex;
    } else {
      return; // not a simple spike; leave untouched
    }

    if (face.halfedge === he || face.halfedge === twin) {
      face.halfedge = anchor;
    }

    loopLens.set(face, loopLens.get(face)! - 2);

    markDead(he);
    markDead(twin);
    staleTips.push(tip, other);
  };

  while (heap.size > 0 && heap.topCost() <= threshold) {
    const edgeId = heap.topEdge();
    const he = rep[edgeId]!;
    const twin = he.twin;

    if (isDead(he) || !he.face || !twin.face) {
      heap.update(edgeId, COST_INVALID);
      continue;
    }

    if (he.face === twin.face) {
      heap.update(edgeId, COST_INVALID);
      removeSelfSidedSpike(he);
      continue;
    }

    mergePair(he);
  }

  // Apply everything the drain deferred, one batch per container: filter the
  // absorbed faces (order-preserving), compact the halfedge array and every
  // attribute layer through the existing chokepoint, then repair stale
  // vertex anchors in a single pass over the compacted array.
  if (deadFaces.length > 0) {
    const deadFaceSet = new Set(deadFaces);
    const faces = struct.faces;
    let w = 0;
    for (let i = 0; i < faces.length; i++) {
      if (!deadFaceSet.has(faces[i])) {
        faces[w++] = faces[i];
      }
    }
    faces.length = w;
  }

  const deadSet = new Set(deadHalfedges);
  struct.removeHalfedges(deadSet);

  if (staleTips.length > 0) {
    const repair = new Set<Vertex>();
    for (const v of staleTips) {
      if (v.halfedge === null || deadSet.has(v.halfedge)) {
        repair.add(v);
      }
    }
    for (const he of struct.halfedges) {
      if (repair.delete(he.vertex)) {
        he.vertex.halfedge = he;
        if (repair.size === 0) {
          break;
        }
      }
    }
    // No surviving outgoing halfedge anywhere -> the vertex is isolated.
    for (const v of repair) {
      v.halfedge = null;
    }
  }
}
