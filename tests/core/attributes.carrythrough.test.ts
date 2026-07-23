/**
 * Per-corner attribute CARRY-THROUGH across topology edit ops.
 *
 * Attributes (uv/normal/tangent) must survive ingest -> <edit op> -> emit with
 * correct interpolated/inherited values on touched corners and exact authored
 * values on untouched corners. Before the halfedge-array chokepoint, any edit
 * desynchronised the flat layer arrays from the halfedge array, so emit
 * produced NaN/garbage for touched corners.
 *
 * Also asserts the read path stays O(1) after edits (_indexFallbackCount === 0)
 * and that cloning an edited structure round-trips identically.
 */
import { BufferGeometry } from 'three';
import { Vector3 } from 'three';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { toGeometry } from '../../src/operations/toGeometry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 6 dp, collapsing -0/eps to "0.000000" for stable float compares. */
function r(n: number): string {
  const v = n.toFixed(6);
  return parseFloat(v) === 0 ? '0.000000' : v;
}

/**
 * Triangle (z=0) with authored, deliberately non-flat per-corner uv + normal so
 * interpolation/renormalisation can be checked against hand-computed values.
 *   v0=(0,0,0)  uv(0,0)   n(1,0,0)
 *   v1=(4,0,0)  uv(4,0)   n(0,1,0)
 *   v2=(0,4,0)  uv(0,4)   n(0,0,1)
 */
function flatTriangleWithAttrs() {
  const positions = new Float32Array([0, 0, 0, 4, 0, 0, 0, 4, 0]);
  const uv = new Float32Array([0, 0, 4, 0, 0, 4]);
  const normal = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  return { positions, uv, normal };
}

function triangleStruct() {
  const { positions, uv, normal } = flatTriangleWithAttrs();
  const layers = {
    uv: { itemSize: 2, data: uv },
    normal: { itemSize: 3, data: normal },
  };
  return HalfedgeDS.fromPolygons(positions, [[0, 1, 2]], 1e-10, layers);
}

/** First emitted row index at position (x,y,z) within tolerance, else -1. */
function rowAt(geo: BufferGeometry, x: number, y: number, z: number): number {
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getX(i) - x) < 1e-6 &&
        Math.abs(pos.getY(i) - y) < 1e-6 &&
        Math.abs(pos.getZ(i) - z) < 1e-6) {
      return i;
    }
  }
  return -1;
}

/** Reads every component of `name` at the emitted row nearest (x,y,z). */
function attrAt(
    geo: BufferGeometry, name: string, x: number, y: number, z: number): number[] {
  const i = rowAt(geo, x, y, z);
  expect(i).not.toBe(-1);
  const a = geo.getAttribute(name);
  const out: number[] = [];
  for (let c = 0; c < a.itemSize; c++) {
    out.push(a.getComponent(i, c));
  }
  return out;
}

/** True if every component of every layer attribute is finite (no NaN/garbage). */
function allFinite(geo: BufferGeometry): boolean {
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.getAttribute(name);
    for (let i = 0; i < a.count * a.itemSize; i++) {
      if (!Number.isFinite(a.array[i])) {
        return false;
      }
    }
  }
  return true;
}

// ===========================================================================
// 1. splitEdge — two-sided edge interpolation (canonical case)
// ===========================================================================

describe('carry-through – splitEdge interpolation', () => {

  test('midpoint split: uv lerps, normal lerps + renormalises; untouched corners exact', () => {
    const struct = triangleStruct();
    const v0 = struct.vertices[0]; // (0,0,0)
    const v1 = struct.vertices[1]; // (4,0,0)

    // Face-side halfedge v0 -> v1.
    const he = v0.getHalfedgeToVertex(v1)!;
    expect(he.face).not.toBeNull();

    // Split at the midpoint (2,0,0): t = 0.5 along v0 -> v1.
    struct.splitEdge(he, new Vector3(2, 0, 0));
    expect(struct._indexFallbackCount).toBe(0);

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);

    // New corner at (2,0,0): uv = lerp((0,0),(4,0),0.5) = (2,0).
    expect(attrAt(geo, 'uv', 2, 0, 0)).toEqual([2, 0]);

    // normal = lerp((1,0,0),(0,1,0),0.5) = (0.5,0.5,0) -> renormalise to 1/sqrt2.
    const inv = 1 / Math.sqrt(2);
    const n = attrAt(geo, 'normal', 2, 0, 0);
    expect(n[0]).toBeCloseTo(inv, 6);
    expect(n[1]).toBeCloseTo(inv, 6);
    expect(n[2]).toBeCloseTo(0, 6);

    // Untouched corners keep their authored values exactly.
    expect(attrAt(geo, 'uv', 0, 0, 0)).toEqual([0, 0]);      // v0
    expect(attrAt(geo, 'uv', 4, 0, 0)).toEqual([4, 0]);      // v1
    expect(attrAt(geo, 'uv', 0, 4, 0)).toEqual([0, 4]);      // v2
    expect(attrAt(geo, 'normal', 0, 0, 0)).toEqual([1, 0, 0]);
    expect(attrAt(geo, 'normal', 4, 0, 0)).toEqual([0, 1, 0]);
    expect(attrAt(geo, 'normal', 0, 4, 0)).toEqual([0, 0, 1]);
  });

  test('asymmetric split (t=0.25): uv = lerp at the right parameter', () => {
    const struct = triangleStruct();
    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];
    const he = v0.getHalfedgeToVertex(v1)!;

    // Split at (1,0,0): t = 1/4 along v0(0) -> v1(4). uv = lerp((0,0),(4,0),0.25) = (1,0).
    struct.splitEdge(he, new Vector3(1, 0, 0));

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    expect(attrAt(geo, 'uv', 1, 0, 0)).toEqual([1, 0]);
  });

  test('hard-edge stays split: a corner with two normals is not blended across the twin', () => {
    // Flat diamond (z=0): two triangles share edge v0->v1, authored with opposite
    // normals (+z on face A, -z on face B) — a hard normal seam. Splitting the
    // shared edge must interpolate each side from its OWN face's corners, so the
    // new corner emits TWO distinct normals.
    //   v0=(0,0,0) v1=(4,0,0) v2=(2,2,0) v3=(2,-2,0)
    const positions = new Float32Array([0, 0, 0, 4, 0, 0, 2, 2, 0, 2, -2, 0]);
    const normal = new Float32Array([
      0, 0, 1, 0, 0, 1, 0, 0, 1,  // face A [0,1,2]: +z
      0, 0, -1, 0, 0, -1, 0, 0, -1, // face B [0,3,1]: -z
    ]);
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2], [0, 3, 1]], 1e-10, {
      uv: { itemSize: 2, data: uv },
      normal: { itemSize: 3, data: normal },
    });

    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];
    const he = v0.getHalfedgeToVertex(v1)!; // shared edge, face-A side
    struct.splitEdge(he, new Vector3(2, 0, 0)); // midpoint of v0(0,0,0)->v1(4,0,0)

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);

    // The new split corner sits at (2,0,0) but on two different faces, so it
    // must emit TWO distinct normal rows (+z from face A, -z from face B).
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const normalsAtSplit: Set<string> = new Set();
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i) - 2) < 1e-6 && Math.abs(pos.getY(i)) < 1e-6) {
        normalsAtSplit.add(`${r(nor.getX(i))}|${r(nor.getY(i))}|${r(nor.getZ(i))}`);
      }
    }
    expect(normalsAtSplit.has(`${r(0)}|${r(0)}|${r(1)}`)).toBe(true);  // +z side
    expect(normalsAtSplit.has(`${r(0)}|${r(0)}|${r(-1)}`)).toBe(true); // -z side
    expect(normalsAtSplit.size).toBe(2);
  });
});

// ===========================================================================
// 2. cutFace — corner inheritance
// ===========================================================================

describe('carry-through – cutFace inheritance', () => {

  test('cut edge endpoints inherit the original corner values; no NaN', () => {
    // Quad with authored uv per corner.
    const positions = new Float32Array([0, 0, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0]);
    const uv = new Float32Array([0, 0, 4, 0, 4, 4, 0, 4]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3]], 1e-10, {
      uv: { itemSize: 2, data: uv },
    });

    const v0 = struct.vertices[0]; // (0,0,0) uv(0,0)
    const v2 = struct.vertices[2]; // (4,4,0) uv(4,4)
    const face = struct.faces[0];

    struct.cutFace(face, v0, v2);
    expect(struct._indexFallbackCount).toBe(0);

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);

    // Both resulting faces have a corner at v0 and v2; all must carry the
    // original authored uv (inherited by the new cut halfedges).
    expect(attrAt(geo, 'uv', 0, 0, 0)).toEqual([0, 0]);
    expect(attrAt(geo, 'uv', 4, 4, 0)).toEqual([4, 4]);
    // The other two corners are untouched.
    expect(attrAt(geo, 'uv', 4, 0, 0)).toEqual([4, 0]);
    expect(attrAt(geo, 'uv', 0, 4, 0)).toEqual([0, 4]);
  });
});

// ===========================================================================
// 3. Removals — survivors intact, no NaN
// ===========================================================================

describe('carry-through – removals compact layers cleanly', () => {

  test('removeEdge(mergeFaces) keeps surviving corners intact, no NaN', () => {
    // A quad split into two triangles by diagonal v0-v2; merging the shared edge
    // rejoins them.  v0=(0,0,0) v1=(4,0,0) v2=(4,4,0) v3=(0,4,0)
    const positions = new Float32Array([0, 0, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0]);
    const uv = new Float32Array([
      0, 0, 4, 0, 4, 4,        // tri A [0,1,2]: v0,v1,v2
      0, 0, 4, 4, 0, 4,        // tri B [0,2,3]: v0,v2,v3 (twin winding on 0-2)
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2], [0, 2, 3]], 1e-10, {
      uv: { itemSize: 2, data: uv },
    });

    const v0 = struct.vertices[0];
    const v2 = struct.vertices[2];
    const shared = v0.getHalfedgeToVertex(v2)!; // shared interior edge (face-A side)
    expect(shared.face).not.toBeNull();
    expect(shared.twin.face).not.toBeNull();

    struct.removeEdge(shared, true); // merge the two faces
    expect(struct._indexFallbackCount).toBe(0);

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    // Surviving perimeter corners keep authored uv.
    expect(attrAt(geo, 'uv', 0, 0, 0)).toEqual([0, 0]);
    expect(attrAt(geo, 'uv', 4, 0, 0)).toEqual([4, 0]);
    expect(attrAt(geo, 'uv', 4, 4, 0)).toEqual([4, 4]);
    expect(attrAt(geo, 'uv', 0, 4, 0)).toEqual([0, 4]);
  });

  test('dissolveVertex merges incident faces; survivors intact, no NaN', () => {
    // Three triangles fanned around a central vertex v0; dissolving it merges
    // them into the outer triangle.
    //   v0=(0,0,0) v1=(4,0,0) v2=(2,3.464,0) v3=(-2,3.464,0)
    const positions = new Float32Array([0, 0, 0, 4, 0, 0, 2, 3.464, 0, -2, 3.464, 0]);
    const uv = new Float32Array([
      0.5, 0.5, 1, 0, 0.75, 1,       // tri [0,1,2]: v0,v1,v2
      0.5, 0.5, 0.75, 1, 0.25, 1,    // tri [0,2,3]: v0,v2,v3
      0.5, 0.5, 0.25, 1, 1, 0,       // tri [0,3,1]: v0,v3,v1
    ]);
    const struct = HalfedgeDS.fromPolygons(
      positions, [[0, 1, 2], [0, 2, 3], [0, 3, 1]], 1e-10, {
        uv: { itemSize: 2, data: uv },
      });

    const v0 = struct.vertices[0];
    struct.dissolveVertex(v0);
    expect(struct._indexFallbackCount).toBe(0);

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    // Outer triangle corners survive with their authored uv.
    expect(attrAt(geo, 'uv', 4, 0, 0)).toEqual([1, 0]);
    expect(attrAt(geo, 'uv', 2, 3.464, 0)).toEqual([0.75, 1]);
    expect(attrAt(geo, 'uv', -2, 3.464, 0)).toEqual([0.25, 1]);
  });

  test('limitedDissolve (coplanar) merges faces; survivors intact, no NaN', () => {
    // A 2x1 grid of two coplanar quads sharing edge v1-v2; limited dissolve
    // merges the shared edge into one 4x2 quad.
    //   v0=(0,0,0) v1=(2,0,0) v2=(2,2,0) v3=(0,2,0) v4=(4,0,0) v5=(4,2,0)
    const positions = new Float32Array([
      0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0, 4, 0, 0, 4, 2, 0,
    ]);
    const uv = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1,  // quad A [0,1,2,3]
      1, 0, 2, 0, 2, 1, 1, 1,  // quad B [1,4,5,2]
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3], [1, 4, 5, 2]], 1e-10, {
      uv: { itemSize: 2, data: uv },
    });

    struct.limitedDissolve(1e-3); // tiny angle -> coplanar shared edge dissolves
    expect(struct._indexFallbackCount).toBe(0);

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    expect(attrAt(geo, 'uv', 0, 0, 0)).toEqual([0, 0]);
    expect(attrAt(geo, 'uv', 4, 2, 0)).toEqual([2, 1]);
  });
});

// ===========================================================================
// 4. Index O(1) invariant + clone-of-edited parity
// ===========================================================================

describe('carry-through – index + clone invariants', () => {

  test('halfedgeIndex never falls back to indexOf across a mixed edit sequence', () => {
    const struct = triangleStruct();
    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];

    struct.splitEdge(v0.getHalfedgeToVertex(v1)!, new Vector3(2, 0, 0));
    // cutFace on the resulting quad between two non-adjacent verts.
    const v2 = struct.vertices[2];
    const mid = struct.vertices[struct.vertices.length - 1];
    struct.cutFace(struct.faces[0], v2, mid);
    struct.removeEdge(struct.halfedges[0], false);

    // Every remaining halfedge resolves via the cached map.
    expect(struct._indexFallbackCount).toBe(0);
    for (const he of struct.halfedges) {
      expect(struct.halfedgeIndex(he)).toBeGreaterThanOrEqual(0);
    }
    expect(struct._indexFallbackCount).toBe(0);

    // And emit stays fallback-free.
    toGeometry(struct);
    expect(struct._indexFallbackCount).toBe(0);
  });

  test('clone of an edited structure emits identical attribute rows', () => {
    const struct = triangleStruct();
    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];
    struct.splitEdge(v0.getHalfedgeToVertex(v1)!, new Vector3(2, 0, 0));

    const original = toGeometry(struct);
    const cloned = struct.clone();
    const fromClone = toGeometry(cloned);

    expect(struct._indexFallbackCount).toBe(0);
    expect(cloned._indexFallbackCount).toBe(0);

    const attrs = ['uv', 'normal'];
    const key = (geo: BufferGeometry, i: number) => {
      const pos = geo.getAttribute('position');
      let k = `${r(pos.getX(i))}|${r(pos.getY(i))}|${r(pos.getZ(i))}`;
      for (const name of attrs) {
        const a = geo.getAttribute(name);
        for (let c = 0; c < a.itemSize; c++) {
          k += `|${r(a.getComponent(i, c))}`;
        }
      }
      return k;
    };
    const rows = (geo: BufferGeometry) => {
      const set = new Set<string>();
      for (let i = 0; i < geo.getAttribute('position').count; i++) {
        set.add(key(geo, i));
      }
      return set;
    };
    expect(rows(fromClone)).toEqual(rows(original));
  });

  test('legacy no-layer path is unaffected: split then emit adds no attribute attrs', () => {
    const positions = new Float32Array([0, 0, 0, 4, 0, 0, 0, 4, 0]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2]]);
    expect(struct.getAttributeNames()).toHaveLength(0);

    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];
    struct.splitEdge(v0.getHalfedgeToVertex(v1)!, new Vector3(2, 0, 0));

    const geo = toGeometry(struct);
    expect(geo.hasAttribute('uv')).toBe(false);
    expect(geo.hasAttribute('normal')).toBe(false);
    expect(geo.getAttribute('position').count).toBe(4); // tri split into quad
  });
});
