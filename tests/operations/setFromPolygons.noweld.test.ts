import { Vector3 } from 'three';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { validateHalfedgeConsistency } from '../helpers/topologyValidation';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Apex-bevel pinch: a regular tetrahedron whose apex A is "beveled" into three
 * distinct corner indices (Tb, Tc, Td) that all sit at A's position. This is
 * the minimal closed-manifold pinch — topologically a valid closed mesh (every
 * edge shared by exactly two faces, Euler χ = 2), yet the three coincident
 * apex verts defeat position-based vertex welding.
 *
 *   index  position     role
 *   0      ( 1, 1, 1)   A  — original apex, unreferenced after the bevel
 *   1      ( 1,-1,-1)   B
 *   2      (-1, 1,-1)   C
 *   3      (-1,-1, 1)   D
 *   4      ( 1, 1, 1)   Tb — on edge A-B, coincident with A
 *   5      ( 1, 1, 1)   Tc — on edge A-C, coincident with A
 *   6      ( 1, 1, 1)   Td — on edge A-D, coincident with A
 *
 * Faces (CCW outward):
 *   base   [1, 3, 2]     triangle  B-D-C
 *   side   [4, 1, 2, 5]  quad      Tb-B-C-Tc
 *   side   [5, 2, 3, 6]  quad      Tc-C-D-Td
 *   side   [6, 3, 1, 4]  quad      Td-D-B-Tb
 *   bevel  [4, 5, 6]     degenerate triangle at the pinch point
 */
function apexBevelPinch() {
  const positions = new Float32Array([
    1, 1, 1,  // 0 = A  (unreferenced after bevel)
    1, -1, -1, // 1 = B
    -1, 1, -1, // 2 = C
    -1, -1, 1, // 3 = D
    1, 1, 1,  // 4 = Tb (coincident with A)
    1, 1, 1,  // 5 = Tc (coincident with A)
    1, 1, 1,  // 6 = Td (coincident with A)
  ]);
  const polygons = [
    [1, 3, 2],     // base  B-D-C
    [4, 1, 2, 5],  // side  Tb-B-C-Tc
    [5, 2, 3, 6],  // side  Tc-C-D-Td
    [6, 3, 1, 4],  // side  Td-D-B-Tb
    [4, 5, 6],     // bevel Tb-Tc-Td (pinch face)
  ];
  return { positions, polygons };
}

/** Unit cube (0..1) as 6 CCW-outward quads — re-used for backward-compat. */
function unitCubePolygons() {
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
    0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
  ]);
  const polygons = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5],
  ];
  return { positions, polygons };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PINCH = new Vector3(1, 1, 1);

function countBoundaryHalfedges(struct: HalfedgeDS): number {
  let count = 0;
  for (const he of struct.halfedges) {
    if (he.isBoundary()) {
      count += 1;
    }
  }
  return count;
}

function countVertsAt(struct: HalfedgeDS, p: Vector3): number {
  let count = 0;
  for (const v of struct.vertices) {
    if (v.position.distanceTo(p) < 1e-9) {
      count += 1;
    }
  }
  return count;
}

/** Euler characteristic V - E + F (E = halfedge pairs). */
function eulerChi(struct: HalfedgeDS): number {
  const E = struct.halfedges.length / 2;
  return struct.vertices.length - E + struct.faces.length;
}

// ===========================================================================
// Headline: a pinch builds only with weld:false
// ===========================================================================

describe('fromPolygons – weld:false pinch', () => {

  const { positions, polygons } = apexBevelPinch();

  test('position-welding throws at every tolerance (the bug)', () => {
    // The three coincident apex verts weld to one → the bevel face's edges
    // collapse to self-loops (V-V) → addEdge rejects v1 === v2.
    expect(() => HalfedgeDS.fromPolygons(positions, polygons, 1e-6)).toThrow();
    expect(() => HalfedgeDS.fromPolygons(positions, polygons, 1e-10)).toThrow();
    expect(() => HalfedgeDS.fromPolygons(positions, polygons, { weld: true })).toThrow();
    // tolerance 0 yields NaN position hashes (log10(1/0) = Inf); still throws.
    expect(() => HalfedgeDS.fromPolygons(positions, polygons, 0)).toThrow();
  });

  test('weld:false builds the pinch as a closed manifold', () => {
    const struct = HalfedgeDS.fromPolygons(positions, polygons, { weld: false });

    // Index 0 (the original apex) is unreferenced → no Vertex, same as today.
    expect(struct.vertices).toHaveLength(6);
    expect(struct.faces).toHaveLength(5);
    // 9 undirected edges → 18 halfedges.
    expect(struct.halfedges).toHaveLength(18);

    // Three distinct verts sit at the pinch point.
    expect(countVertsAt(struct, PINCH)).toBe(3);
    const pinchIds = new Set<number>();
    for (const v of struct.vertices) {
      if (v.position.distanceTo(PINCH) < 1e-9) {
        pinchIds.add(v.id);
      }
    }
    expect(pinchIds.size).toBe(3);

    validateHalfedgeConsistency(struct);
    expect(countBoundaryHalfedges(struct)).toBe(0);
    expect(eulerChi(struct)).toBe(2);
  });

  test('weld:false survives tessellate() and toGeometry()', () => {
    const struct = HalfedgeDS.fromPolygons(positions, polygons, { weld: false });

    expect(() => struct.tessellate()).not.toThrow();
    expect(struct.tessellate().length).toBeGreaterThan(0);

    let geom: ReturnType<HalfedgeDS['toGeometry']> | undefined;
    expect(() => { geom = struct.toGeometry(); }).not.toThrow();
    expect(geom).toBeDefined();
    expect(geom!.getAttribute('position').count).toBeGreaterThan(0);
  });
});

// ===========================================================================
// layers compose with weld:false (the plugin's target call shape)
// ===========================================================================

describe('fromPolygons – weld:false with layers', () => {

  test('per-corner layers ingest over the no-weld structure', () => {
    const { positions, polygons } = apexBevelPinch();
    const cornerCount = polygons.reduce((s, p) => s + p.length, 0); // 18

    const scalar = new Float32Array(cornerCount);
    for (let i = 0; i < cornerCount; i++) {
      scalar[i] = i;
    }

    const struct = HalfedgeDS.fromPolygons(positions, polygons, {
      weld: false,
      layers: { value: { itemSize: 1, data: scalar } },
    });

    expect(struct.hasAttribute('value')).toBe(true);
    const layer = struct.getAttribute('value')!;
    expect(layer.itemSize).toBe(1);
    expect(layer.data.length).toBe(struct.halfedges.length);
  });
});

// ===========================================================================
// Backward compatibility: weld defaults to true
// ===========================================================================

describe('fromPolygons – weld defaults true (backward-compat)', () => {

  test('cube is identical via default, explicit weld:true, and positional tolerance', () => {
    const { positions, polygons } = unitCubePolygons();

    const a = HalfedgeDS.fromPolygons(positions, polygons);
    const b = HalfedgeDS.fromPolygons(positions, polygons, { weld: true });
    const c = HalfedgeDS.fromPolygons(positions, polygons, 1e-10);

    for (const struct of [a, b, c]) {
      expect(struct.vertices).toHaveLength(8);
      expect(struct.faces).toHaveLength(6);
      expect(struct.halfedges).toHaveLength(12 * 2);
      validateHalfedgeConsistency(struct);
    }
  });

  test('coincident corners still weld under the default (no behavior change)', () => {
    // Indices 4,5 duplicate positions 0,1; under default welding the quad still
    // resolves to 4 verts (the dedup map collapses 4→0 and 5→1).
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
      0, 0, 0, 1, 0, 0, // 4 == 0, 5 == 1
    ]);

    const welded = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3]]);
    expect(welded.vertices).toHaveLength(4);

    const explicit = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3]], { weld: true });
    expect(explicit.vertices).toHaveLength(4);
  });

  test('weld:false on a coincident-corner quad keeps them distinct', () => {
    // Same fixture as above, but now the duplicates survive as separate verts.
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
      0, 0, 0, 1, 0, 0,
    ]);

    const struct = HalfedgeDS.fromPolygons(
      positions, [[0, 1, 2, 3]], { weld: false });

    // Four distinct corner indices → four distinct verts (no position dedup).
    expect(struct.vertices).toHaveLength(4);
    expect(struct.faces).toHaveLength(1);
    validateHalfedgeConsistency(struct);
  });

  test('options bag accepts tolerance + layers + weld together', () => {
    const { positions, polygons } = unitCubePolygons();
    const cornerCount = polygons.reduce((s, p) => s + p.length, 0); // 24
    const uv = new Float32Array(cornerCount * 2);

    const struct = HalfedgeDS.fromPolygons(positions, polygons, {
      tolerance: 1e-10,
      weld: true,
      layers: { uv: { itemSize: 2, data: uv } },
    });

    expect(struct.vertices).toHaveLength(8);
    expect(struct.hasAttribute('uv')).toBe(true);
  });
});
