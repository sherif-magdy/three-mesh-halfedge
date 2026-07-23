/**
 * Complex / edge-case coverage for per-corner attribute carry-through.
 *
 * Targets code paths the basic carry-through suite does not exercise:
 *  - tangent (itemSize 4) renormalise-xyz-keep-w,
 *  - the NAME-driven interpolation strategy (a custom size-3 layer must NOT be
 *    renormalised, unlike `normal`),
 *  - chained/sequential splits (growth accumulation + index stability),
 *  - cutFace that CREATES a second face (two-loop inheritance),
 *  - joinFaces on a cyclic patch (centre vertex elimination),
 *  - limitedDissolve over a grid leaving a self-sided centre spike,
 *  - grow -> shrink -> grow (compaction then re-growth keeps layers aligned),
 *  - splitEdge snapping onto an existing endpoint (no-op).
 */
import { BufferGeometry } from 'three';
import { Vector3 } from 'three';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { toGeometry } from '../../src/operations/toGeometry';

// ---------------------------------------------------------------------------
// Helpers (duplicated from the basic carry-through suite — kept local so each
// file is self-contained).
// ---------------------------------------------------------------------------

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

/** Every layer's data length matches halfedges.length * itemSize (alignment). */
function layersAligned(struct: HalfedgeDS): boolean {
  for (const name of struct.getAttributeNames()) {
    const layer = struct.getAttribute(name);
    if (layer && layer.data.length !== struct.halfedges.length * layer.itemSize) {
      return false;
    }
  }
  return true;
}

/** Triangle with authorable per-corner layers. */
function triangle(positions: Float32Array, layers: Record<string, Float32Array>) {
  const L: Record<string, { itemSize: number; data: Float32Array }> = {};
  const itemSizeOf = (name: string) =>
    name === 'uv' ? 2 : name === 'normal' || name === 'color' ? 3 : name === 'tangent' ? 4 : 1;
  for (const [name, data] of Object.entries(layers)) {
    L[name] = { itemSize: itemSizeOf(name), data };
  }
  return HalfedgeDS.fromPolygons(positions, [[0, 1, 2]], 1e-10, L);
}

const TRI_POS = new Float32Array([0, 0, 0, 4, 0, 0, 0, 4, 0]);

// ===========================================================================
// 1. Interpolation strategy — name-driven (tangent / custom / weight)
// ===========================================================================

describe('carry-through complex – interpolation strategy', () => {

  test('tangent (itemSize 4): lerp xyz + renormalise, w preserved', () => {
    const tangent = new Float32Array([
      1, 0, 0, 1, // v0
      0, 1, 0, 1, // v1
      0, 0, 1, 1, // v2
    ]);
    const struct = triangle(TRI_POS, { tangent });
    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];

    struct.splitEdge(v0.getHalfedgeToVertex(v1)!, new Vector3(2, 0, 0)); // t=0.5

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    // xyz = lerp((1,0,0),(0,1,0),.5)=(.5,.5,0) -> renormalise; w=lerp(1,1,.5)=1.
    const inv = 1 / Math.sqrt(2);
    const t = attrAt(geo, 'tangent', 2, 0, 0);
    expect(t[0]).toBeCloseTo(inv, 6);
    expect(t[1]).toBeCloseTo(inv, 6);
    expect(t[2]).toBeCloseTo(0, 6);
    expect(t[3]).toBeCloseTo(1, 6);
  });

  test('custom size-3 "color" is component-wise only — NOT renormalised', () => {
    // Same numeric inputs as the normal test, but the layer is named "color".
    // The split-corner value must be the raw lerp (length < 1), proving the
    // strategy is name-driven (only `normal`/`tangent` renormalise).
    const color = new Float32Array([
      1, 0, 0, // v0
      0, 1, 0, // v1
      0, 0, 1, // v2
    ]);
    const struct = triangle(TRI_POS, { color });
    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];

    struct.splitEdge(v0.getHalfedgeToVertex(v1)!, new Vector3(2, 0, 0)); // t=0.5

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    // Raw lerp (0.5,0.5,0); NOT renormalised (a `normal` layer would be 1/sqrt2).
    expect(attrAt(geo, 'color', 2, 0, 0)).toEqual([0.5, 0.5, 0]);
  });

  test('custom itemSize-1 "weight" lerps to the right scalar', () => {
    const weight = new Float32Array([10, 20, 30]);
    const struct = triangle(TRI_POS, { weight });
    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];

    struct.splitEdge(v0.getHalfedgeToVertex(v1)!, new Vector3(1, 0, 0)); // t=0.25

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    // lerp(10, 20, 0.25) = 12.5
    expect(attrAt(geo, 'weight', 1, 0, 0)).toEqual([12.5]);
  });

  test('uv + normal + tangent + color all carry through one split together', () => {
    const layers = {
      uv: new Float32Array([0, 0, 4, 0, 0, 4]),
      normal: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      tangent: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]),
      color: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    };
    const struct = triangle(TRI_POS, layers);
    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];
    struct.splitEdge(v0.getHalfedgeToVertex(v1)!, new Vector3(2, 0, 0));

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    expect(geo.getAttribute('uv').count).toBe(4);
    // uv lerp, normal+tangent renormalised, color raw lerp — all distinct.
    expect(attrAt(geo, 'uv', 2, 0, 0)).toEqual([2, 0]);
    expect(attrAt(geo, 'color', 2, 0, 0)).toEqual([0.5, 0.5, 0]);
    const inv = 1 / Math.sqrt(2);
    expect(attrAt(geo, 'normal', 2, 0, 0)[0]).toBeCloseTo(inv, 6);
    expect(attrAt(geo, 'tangent', 2, 0, 0)[3]).toBeCloseTo(1, 6);
  });
});

// ===========================================================================
// 2. Chained / sequential splits
// ===========================================================================

describe('carry-through complex – chained splits', () => {

  test('three sequential splits stay aligned, indexed, and finite', () => {
    const uv = new Float32Array([0, 0, 4, 0, 0, 4]);
    const struct = triangle(TRI_POS, { uv });
    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];
    const v2 = struct.vertices[2];

    // Split v0->v1 at (2,0,0): new v3, uv (2,0).
    struct.splitEdge(v0.getHalfedgeToVertex(v1)!, new Vector3(2, 0, 0));
    const v3 = struct.vertices[struct.vertices.length - 1];
    expect(layersAligned(struct)).toBe(true);

    // Split v3->v1 at (3,0,0): t=0.5 of (2,0,0)->(4,0,0), uv (3,0).
    struct.splitEdge(v3.getHalfedgeToVertex(v1)!, new Vector3(3, 0, 0));
    expect(layersAligned(struct)).toBe(true);

    // Split v0->v2 at (0,2,0): t=0.5, uv (0,2).
    struct.splitEdge(v0.getHalfedgeToVertex(v2)!, new Vector3(0, 2, 0));
    expect(layersAligned(struct)).toBe(true);

    expect(struct._indexFallbackCount).toBe(0);

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    expect(attrAt(geo, 'uv', 2, 0, 0)).toEqual([2, 0]);
    expect(attrAt(geo, 'uv', 3, 0, 0)).toEqual([3, 0]);
    expect(attrAt(geo, 'uv', 0, 2, 0)).toEqual([0, 2]);
    // Untouched originals.
    expect(attrAt(geo, 'uv', 0, 0, 0)).toEqual([0, 0]);
    expect(attrAt(geo, 'uv', 4, 0, 0)).toEqual([4, 0]);
    expect(attrAt(geo, 'uv', 0, 4, 0)).toEqual([0, 4]);
  });
});

// ===========================================================================
// 3. cutFace that creates a second face
// ===========================================================================

describe('carry-through complex – cutFace new-face creation', () => {

  test('pentagon cut into two faces: both inherit the cut-endpoint values', () => {
    // Convex pentagon. Cutting v0-v2 (skipping v1) splits it into a triangle
    // [v0,v1,v2] and a quad [v0,v2,v3,v4] — two loops -> a new face is created.
    const positions = new Float32Array([
      0, 0, 0,  // v0
      2, 0, 0,  // v1
      3, 2, 0,  // v2
      1, 3, 0,  // v3
      -1, 2, 0, // v4
    ]);
    const uv = new Float32Array([0, 0, 1, 0, 2, 1, 1, 2, 0, 1]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4]], 1e-10, {
      uv: { itemSize: 2, data: uv },
    });
    expect(struct.faces).toHaveLength(1);

    const v0 = struct.vertices[0];
    const v2 = struct.vertices[2];
    struct.cutFace(struct.faces[0], v0, v2);

    // Two faces now.
    expect(struct.faces).toHaveLength(2);
    expect(struct._indexFallbackCount).toBe(0);

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    // Every corner keeps authored uv; v0 and v2 appear in BOTH faces.
    expect(attrAt(geo, 'uv', 0, 0, 0)).toEqual([0, 0]);
    expect(attrAt(geo, 'uv', 2, 0, 0)).toEqual([1, 0]);
    expect(attrAt(geo, 'uv', 3, 2, 0)).toEqual([2, 1]);
    expect(attrAt(geo, 'uv', 1, 3, 0)).toEqual([1, 2]);
    expect(attrAt(geo, 'uv', -1, 2, 0)).toEqual([0, 1]);
  });
});

// ===========================================================================
// 4. joinFaces on a cyclic patch (centre vertex elimination)
// ===========================================================================

describe('carry-through complex – joinFaces cyclic patch', () => {

  test('three faces fanned around a centre merge into the outer triangle', () => {
    // vc at centre, a/b/c around it. joinFaces over all three eliminates vc
    // (the cyclic case an iterative 2-face dissolve cannot handle).
    const positions = new Float32Array([
      1, 1, 0,   // 0 = vc (centre)
      3, 0, 0,   // 1 = a
      2, 3, 0,   // 2 = b
      -1, 1, 0,  // 3 = c
    ]);
    const uv = new Float32Array([
      0.5, 0.5, 1, 0, 1, 1,       // tri1 [0,1,2]: vc, a, b
      0.5, 0.5, 1, 1, 0, 0.5,     // tri2 [0,2,3]: vc, b, c
      0.5, 0.5, 0, 0.5, 1, 0,     // tri3 [0,3,1]: vc, c, a
    ]);
    const struct = HalfedgeDS.fromPolygons(
      positions, [[0, 1, 2], [0, 2, 3], [0, 3, 1]], 1e-10, {
        uv: { itemSize: 2, data: uv },
      });
    expect(struct.faces).toHaveLength(3);

    struct.joinFaces([struct.faces[0], struct.faces[1], struct.faces[2]]);
    expect(struct.faces).toHaveLength(1);
    expect(struct._indexFallbackCount).toBe(0);
    expect(layersAligned(struct)).toBe(true);

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    // Outer corners survive with authored uv; the centre corner is gone.
    expect(attrAt(geo, 'uv', 3, 0, 0)).toEqual([1, 0]);   // a
    expect(attrAt(geo, 'uv', 2, 3, 0)).toEqual([1, 1]);   // b
    expect(attrAt(geo, 'uv', -1, 1, 0)).toEqual([0, 0.5]); // c
    expect(rowAt(geo, 1, 1, 0)).toBe(-1);                 // vc eliminated
  });
});

// ===========================================================================
// 5. limitedDissolve over a grid (self-sided centre spike)
// ===========================================================================

describe('carry-through complex – limitedDissolve grid spike', () => {

  test('2x2 grid dissolves to one face; outer corners intact, no NaN', () => {
    // 3x3 vertex lattice -> 4 coplanar quads around centre vertex 4 (2,2,0).
    //   6(0,4)-7(2,4)-8(4,4)
    //   3(0,2)-4(2,2)-5(4,2)
    //   0(0,0)-1(2,0)-2(4,0)
    const positions = new Float32Array([
      0, 0, 0, 2, 0, 0, 4, 0, 0,
      0, 2, 0, 2, 2, 0, 4, 2, 0,
      0, 4, 0, 2, 4, 0, 4, 4, 0,
    ]);
    // Quads (CCW, manifold shared edges):
    //   Q0 [0,1,4,3], Q1 [1,2,5,4], Q2 [3,4,7,6], Q3 [4,5,8,7]
    const uv = new Float32Array([
      0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5,         // Q0: 0,1,4,3
      0.5, 0, 1, 0, 1, 0.5, 0.5, 0.5,         // Q1: 1,2,5,4
      0, 0.5, 0.5, 0.5, 0.5, 1, 0, 1,         // Q2: 3,4,7,6
      0.5, 0.5, 1, 0.5, 1, 1, 0.5, 1,         // Q3: 4,5,8,7
    ]);
    const struct = HalfedgeDS.fromPolygons(
      positions, [[0, 1, 4, 3], [1, 2, 5, 4], [3, 4, 7, 6], [4, 5, 8, 7]], 1e-10, {
        uv: { itemSize: 2, data: uv },
      });
    expect(struct.faces).toHaveLength(4);

    struct.limitedDissolve(1e-3); // all internal edges coplanar -> dissolve
    expect(struct._indexFallbackCount).toBe(0);
    expect(layersAligned(struct)).toBe(true);

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    // Four outer corners survive with their authored uv.
    expect(attrAt(geo, 'uv', 0, 0, 0)).toEqual([0, 0]);     // v0
    expect(attrAt(geo, 'uv', 4, 0, 0)).toEqual([1, 0]);     // v2
    expect(attrAt(geo, 'uv', 4, 4, 0)).toEqual([1, 1]);     // v8
    expect(attrAt(geo, 'uv', 0, 4, 0)).toEqual([0, 1]);     // v6
  });
});

// ===========================================================================
// 6. Grow -> shrink -> grow (compaction then re-growth)
// ===========================================================================

describe('carry-through complex – grow/shrink/grow compaction', () => {

  test('split, merge, split: layers stay aligned and reads stay O(1)', () => {
    // Quad as two triangles sharing diagonal v0-v2.
    const positions = new Float32Array([0, 0, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0]);
    const uv = new Float32Array([
      0, 0, 4, 0, 4, 4,      // tri A [0,1,2]
      0, 0, 4, 4, 0, 4,      // tri B [0,2,3]
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2], [0, 2, 3]], 1e-10, {
      uv: { itemSize: 2, data: uv },
    });
    const before = struct.halfedges.length;

    // Grow: split outer edge v0->v1 at its midpoint.
    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];
    struct.splitEdge(v0.getHalfedgeToVertex(v1)!, new Vector3(2, 0, 0));
    expect(layersAligned(struct)).toBe(true);
    expect(struct.halfedges.length).toBe(before + 2);

    // Shrink: merge the diagonal v0-v2 (compacts two halfedges out).
    const v2 = struct.vertices[2];
    const diag = v0.getHalfedgeToVertex(v2)!;
    struct.removeEdge(diag, true);
    expect(layersAligned(struct)).toBe(true);
    expect(struct._indexFallbackCount).toBe(0);

    // Grow again: split another outer edge v2(4,4,0)->v3(0,4,0) at its midpoint
    // (2,4,0); uv lerp((4,4),(0,4),0.5) = (2,4).
    const v3 = struct.vertices[3];
    struct.splitEdge(v2.getHalfedgeToVertex(v3)!, new Vector3(2, 4, 0));
    expect(layersAligned(struct)).toBe(true);
    expect(struct._indexFallbackCount).toBe(0);

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    // The two splits produced interpolated uv at their midpoints.
    expect(attrAt(geo, 'uv', 2, 0, 0)).toEqual([2, 0]);     // v0-v1 midpoint
    expect(attrAt(geo, 'uv', 2, 4, 0)).toEqual([2, 4]);     // v2-v3 midpoint
    // Original perimeter corners survive the merge + re-split.
    expect(attrAt(geo, 'uv', 0, 0, 0)).toEqual([0, 0]);
    expect(attrAt(geo, 'uv', 4, 4, 0)).toEqual([4, 4]);
    expect(attrAt(geo, 'uv', 0, 4, 0)).toEqual([0, 4]);
  });
});

// ===========================================================================
// 7. Edge case — splitEdge snapping onto an existing endpoint
// ===========================================================================

describe('carry-through complex – edge cases', () => {

  test('splitEdge at an endpoint position returns that vertex, no mutation', () => {
    const uv = new Float32Array([0, 0, 4, 0, 0, 4]);
    const struct = triangle(TRI_POS, { uv });
    const v0 = struct.vertices[0];
    const v1 = struct.vertices[1];
    const before = struct.halfedges.length;

    const ret = struct.splitEdge(v0.getHalfedgeToVertex(v1)!, v1.position.clone());

    expect(ret).toBe(v1);                 // snapped to the existing endpoint
    expect(struct.halfedges.length).toBe(before); // no new halfedges
    expect(struct.vertices.length).toBe(3);       // no new vertex
    expect(struct._indexFallbackCount).toBe(0);

    const geo = toGeometry(struct);
    expect(allFinite(geo)).toBe(true);
    expect(geo.getAttribute('position').count).toBe(3); // still a triangle
  });
});
