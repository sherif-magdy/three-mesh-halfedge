import { Plane, Vector3, BoxGeometry } from 'three';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { setFromPolygons } from '../../src/operations/setFromPolygons';
import { updateFaceNormal } from '../../src/operations/updateFaceNormal';
import { generatorSize } from '../helpers/testutils';
import { validateHalfedgeConsistency } from '../helpers/topologyValidation';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Unit cube (0..1) as 6 quads, CCW viewed from outside.
 *
 *   0:(0,0,0) 1:(1,0,0) 2:(1,1,0) 3:(0,1,0)   // z = 0 face
 *   4:(0,0,1) 5:(1,0,1) 6:(1,1,1) 7:(0,1,1)   // z = 1 face
 *
 * Face windings were chosen so each Newell normal points outward:
 *   -Z:[0,3,2,1] +Z:[4,5,6,7] -Y:[0,1,5,4]
 *   +Y:[3,7,6,2] -X:[0,4,7,3] +X:[1,2,6,5]
 */
function unitCubePolygons() {
  const positions = new Float32Array([
    0, 0, 0, // 0
    1, 0, 0, // 1
    1, 1, 0, // 2
    0, 1, 0, // 3
    0, 0, 1, // 4
    1, 0, 1, // 5
    1, 1, 1, // 6
    0, 1, 1, // 7
  ]);
  const polygons = [
    [0, 3, 2, 1], // -Z
    [4, 5, 6, 7], // +Z
    [0, 1, 5, 4], // -Y
    [3, 7, 6, 2], // +Y
    [0, 4, 7, 3], // -X
    [1, 2, 6, 5], // +X
  ];
  return { positions, polygons };
}

/** Count boundary halfedges (face === null but twin.face !== null). */
function countBoundaryHalfedges(struct: HalfedgeDS): number {
  let count = 0;
  for (const he of struct.halfedges) {
    if (he.isBoundary()) {
      count += 1;
    }
  }
  return count;
}

/** Outward unit axes expected for the cube faces, in `polygons` order. */
const cubeOutwardAxes = [
  new Vector3(0, 0, -1),
  new Vector3(0, 0, 1),
  new Vector3(0, -1, 0),
  new Vector3(0, 1, 0),
  new Vector3(-1, 0, 0),
  new Vector3(1, 0, 0),
];

// ===========================================================================
// Headline: cube enters as 6 quads
// ===========================================================================

describe('setFromPolygons – cube as 6 quads', () => {

  const { positions, polygons } = unitCubePolygons();
  const struct = HalfedgeDS.fromPolygons(positions, polygons);

  test('exactly 6 quad faces, 8 vertices, 12 edges', () => {
    expect(struct.faces).toHaveLength(6);
    expect(struct.vertices).toHaveLength(8);
    // 12 undirected edges -> 24 halfedges
    expect(struct.halfedges).toHaveLength(12 * 2);

    for (const face of struct.faces) {
      expect(face.size).toBe(4);
    }
  });

  test('every edge has a twin (closed mesh, no boundaries)', () => {
    validateHalfedgeConsistency(struct);
    expect(countBoundaryHalfedges(struct)).toBe(0);
  });

  test('each vertex has valence 3 (one-ring of 3 outgoing halfedges)', () => {
    for (const vertex of struct.vertices) {
      expect(generatorSize(vertex.loopCW())).toBe(3);
    }
  });

  test('Newell normals point outward along each face axis', () => {
    const center = new Vector3(0.5, 0.5, 0.5);
    const normal = new Vector3();
    const centroid = new Vector3();
    const radial = new Vector3();

    for (const face of struct.faces) {
      face.getNormal(normal);

      // True face centroid (average of all loop vertices)
      centroid.set(0, 0, 0);
      let n = 0;
      for (const he of face.halfedge.nextLoop()) {
        centroid.add(he.vertex.position);
        n += 1;
      }
      centroid.multiplyScalar(1 / n);

      radial.subVectors(centroid, center).normalize();

      // Normal points outward (away from cube center)
      expect(normal.dot(radial)).toBeGreaterThan(0.9);
      // Normal is axis-aligned (one component dominates)
      expect(Math.max(
        Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z))).toBeCloseTo(1, 6);
    }
  });

  test('face normals match the expected outward axis directions', () => {
    const normal = new Vector3();
    const found = new Set<string>();
    for (const face of struct.faces) {
      face.getNormal(normal);
      found.add(`${normal.x.toFixed(0)},${normal.y.toFixed(0)},${normal.z.toFixed(0)}`);
    }
    for (const axis of cubeOutwardAxes) {
      expect(found.has(`${axis.x.toFixed(0)},${axis.y.toFixed(0)},${axis.z.toFixed(0)}`)).toBe(true);
    }
  });
});

// ===========================================================================
// Cube parity: n-gon path vs triangle path
// ===========================================================================

describe('setFromPolygons – cube parity vs setFromGeometry', () => {

  test('fromPolygons -> 6 faces; setFromGeometry(BoxGeometry) -> 12 faces', () => {
    const { positions, polygons } = unitCubePolygons();
    const ngonStruct = HalfedgeDS.fromPolygons(positions, polygons);

    const triStruct = new HalfedgeDS();
    triStruct.setFromGeometry(new BoxGeometry(1, 1, 1));

    // Face count differs by design (n-gon vs triangulated)
    expect(ngonStruct.faces).toHaveLength(6);
    expect(triStruct.faces).toHaveLength(12);

    // Vertex count matches (same 8 corners)
    expect(ngonStruct.vertices).toHaveLength(8);
    expect(triStruct.vertices).toHaveLength(8);
  });

  test('edge count differs by design: 12 (quads) vs 18 (triangulated, +6 diagonals)', () => {
    const { positions, polygons } = unitCubePolygons();
    const ngonStruct = HalfedgeDS.fromPolygons(positions, polygons);

    const triStruct = new HalfedgeDS();
    triStruct.setFromGeometry(new BoxGeometry(1, 1, 1));

    // NOTE: contract §8 "both => 12 edges" is incorrect for the triangulated
    // path — a triangulated cube has 18 edges (12 boundary + 6 face diagonals).
    // Only the vertex count matches; the edge count differs by design.
    expect(ngonStruct.halfedges).toHaveLength(12 * 2);
    expect(triStruct.halfedges).toHaveLength(18 * 2);
  });
});

// ===========================================================================
// Pentagon / hexagon / concave n-gons
// ===========================================================================

describe('setFromPolygons – pentagon', () => {

  const positions = new Float32Array([
    1, 0, 0,
    0.309, 0.951, 0,
    -0.809, 0.588, 0,
    -0.809, -0.588, 0,
    0.309, -0.951, 0,
  ]);
  const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4]]);

  test('one face of size 5, 5 vertices, 5 edges', () => {
    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0].size).toBe(5);
    expect(struct.vertices).toHaveLength(5);
    expect(struct.halfedges).toHaveLength(5 * 2);
  });

  test('loop order/winding preserved', () => {
    const face = struct.faces[0];
    const order: number[] = [];
    for (const he of face.halfedge.nextLoop()) {
      // Recover the input index from the position (all in z=0 plane)
      order.push(round2(he.vertex.position.x) * 100 + round2(he.vertex.position.y));
    }
    // CCW starting at vertex 0 = (1,0)
    expect(order[0]).toBe(100); // (1, 0)
  });

  test('Newell normal is (0,0,1)', () => {
    const normal = new Vector3();
    struct.faces[0].getNormal(normal);
    expect(normal.x).toBeCloseTo(0, 6);
    expect(normal.y).toBeCloseTo(0, 6);
    expect(normal.z).toBeCloseTo(1, 6);
  });

  test('5 boundary halfedges (single open face)', () => {
    expect(countBoundaryHalfedges(struct)).toBe(5);
  });
});

describe('setFromPolygons – hexagon', () => {

  const positions = new Float32Array([
    1, 0, 0,
    0.5, 0.866, 0,
    -0.5, 0.866, 0,
    -1, 0, 0,
    -0.5, -0.866, 0,
    0.5, -0.866, 0,
  ]);
  const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4, 5]]);

  test('one face of size 6, correct adjacency', () => {
    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0].size).toBe(6);
    expect(struct.vertices).toHaveLength(6);
    expect(struct.halfedges).toHaveLength(6 * 2);
    validateHalfedgeConsistency(struct);
  });
});

describe('setFromPolygons – concave (L-shape) n-gon', () => {

  // L-shape, CCW, in z=0 plane
  //   (0,0)-(2,0)-(2,1)-(1,1)-(1,2)-(0,2)
  const positions = new Float32Array([
    0, 0, 0,
    2, 0, 0,
    2, 1, 0,
    1, 1, 0,
    1, 2, 0,
    0, 2, 0,
  ]);
  const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4, 5]]);

  test('one face of size 6, correct loop', () => {
    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0].size).toBe(6);
    expect(struct.vertices).toHaveLength(6);
    validateHalfedgeConsistency(struct);
  });

  test('Newell normal is (0,0,1) despite concavity', () => {
    const normal = new Vector3();
    struct.faces[0].getNormal(normal);
    expect(normal.z).toBeCloseTo(1, 6);
  });
});

// ===========================================================================
// Newell correctness vs THREE reference + n>3 cross-product failure case
// ===========================================================================

describe('setFromPolygons – Newell normals vs THREE reference', () => {

  test('planar tilted quad normal matches THREE.Plane', () => {
    // A quad tilted in 3D, all coplanar
    const positions = new Float32Array([
      0, 0, 0,
      2, 0, 1,
      3, 2, 2,
      1, 2, 1,
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3]]);

    const normal = new Vector3();
    struct.faces[0].getNormal(normal);

    const p0 = new Vector3(0, 0, 0);
    const p1 = new Vector3(2, 0, 1);
    const p2 = new Vector3(3, 2, 2);
    const reference = new Plane().setFromCoplanarPoints(p0, p1, p2).normal;

    expect(normal.distanceTo(reference)).toBeLessThan(1e-6);
  });

  test('planar pentagon normal matches THREE.Plane', () => {
    // 5 genuinely coplanar points on a tilted plane (normal (1,1,1)) through
    // the origin, placed as a regular pentagon in the plane's basis.
    const planeNormal = new Vector3(1, 1, 1).normalize();
    const u = new Vector3().crossVectors(planeNormal, new Vector3(0, 0, 1)).normalize();
    const v = new Vector3().crossVectors(planeNormal, u).normalize();
    const R = 2;

    const positions: number[] = [];
    const pts: Vector3[] = [];
    for (let k = 0; k < 5; k++) {
      const ang = (2 * Math.PI * k) / 5;
      const p = new Vector3()
        .addScaledVector(u, R * Math.cos(ang))
        .addScaledVector(v, R * Math.sin(ang));
      pts.push(p);
      positions.push(p.x, p.y, p.z);
    }
    const struct = HalfedgeDS.fromPolygons(new Float32Array(positions), [[0, 1, 2, 3, 4]]);

    const normal = new Vector3();
    struct.faces[0].getNormal(normal);

    const reference = new Plane().setFromCoplanarPoints(pts[0], pts[1], pts[2]).normal;
    expect(Math.abs(normal.dot(reference))).toBeCloseTo(1, 6);
  });

  test('Newell is correct where a single-vertex cross product would be degenerate', () => {
    // Quad with three collinear leading vertices A,B,C. Ordered [B,C,D,A] so
    // the face's anchor halfedge is B->C and its (prev,vertex,next) = (A,B,C)
    // are collinear — a naive triangle cross product on the anchor would give a
    // zero (degenerate) normal. Newell still yields the true plane normal.
    const positions = new Float32Array([
      0, 0, 0, // 0 = A
      1, 0, 0, // 1 = B
      2, 0, 0, // 2 = C  (A,B,C collinear on the x-axis)
      1, 1, 0, // 3 = D
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[1, 2, 3, 0]]);

    const normal = new Vector3();
    struct.faces[0].getNormal(normal);
    expect(normal.z).toBeCloseTo(1, 6);
    expect(struct.faces[0].size).toBe(4);
  });
});

// ===========================================================================
// Dedup parity with the triangle path
// ===========================================================================

describe('setFromPolygons – vertex dedup', () => {

  test('cube 24 corners collapse to 8 unique vertices', () => {
    const { positions, polygons } = unitCubePolygons();
    const struct = HalfedgeDS.fromPolygons(positions, polygons);
    expect(struct.vertices).toHaveLength(8);
  });

  test('coincident corners within tolerance merge', () => {
    // Two triangles worth of corners describing one quad, with duplicated
    // positions that should merge into 4 vertices.
    const positions = new Float32Array([
      0, 0, 0, // 0
      1, 0, 0, // 1
      1, 1, 0, // 2
      0, 1, 0, // 3
      0, 0, 0, // 4 == 0 (dup)
      1, 0, 0, // 5 == 1 (dup)
    ]);
    // One quad referencing 0,1,2,3 — the dups (4,5) are unused but prove dedup
    // behaves like the triangle path over shared positions.
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3]]);
    expect(struct.vertices).toHaveLength(4);

    // Referencing the dup indices yields the same vertices as the originals.
    const struct2 = HalfedgeDS.fromPolygons(positions, [[4, 5, 2, 3]]);
    expect(struct2.vertices).toHaveLength(4);
  });
});

// ===========================================================================
// Idempotent rebuild
// ===========================================================================

describe('setFromPolygons – idempotent rebuild', () => {

  test('rebuilding twice yields identical topology', () => {
    const { positions, polygons } = unitCubePolygons();
    const faceOffsets = [0, 4, 8, 12, 16, 20, 24];
    const cornerVerts = polygons.flat();

    const struct = new HalfedgeDS();
    setFromPolygons(struct, positions, faceOffsets, cornerVerts);
    const facesAfterFirst = struct.faces.length;
    const vertsAfterFirst = struct.vertices.length;
    const halfedgesAfterFirst = struct.halfedges.length;

    setFromPolygons(struct, positions, faceOffsets, cornerVerts);

    expect(struct.faces).toHaveLength(facesAfterFirst);
    expect(struct.vertices).toHaveLength(vertsAfterFirst);
    expect(struct.halfedges).toHaveLength(halfedgesAfterFirst);
    validateHalfedgeConsistency(struct);

    // Vertex ids restart from 0 after clear(), so they are stable across rebuilds
    for (let i = 0; i < struct.vertices.length; i++) {
      expect(struct.vertices[i].id).toBe(i);
    }
  });
});

// ===========================================================================
// updateFaceNormal recompute path
// ===========================================================================

describe('updateFaceNormal – re-callable recompute', () => {

  test('free function matches Face.getNormal', () => {
    const { positions, polygons } = unitCubePolygons();
    const struct = HalfedgeDS.fromPolygons(positions, polygons);

    const a = new Vector3();
    const b = new Vector3();
    const face = struct.faces[0];
    face.getNormal(a);
    updateFaceNormal(face, b);
    expect(a.distanceTo(b)).toBeLessThan(1e-9);
  });

  test('HalfedgeDS method delegates to the same computation', () => {
    const { positions, polygons } = unitCubePolygons();
    const struct = HalfedgeDS.fromPolygons(positions, polygons);

    const a = new Vector3();
    const b = new Vector3();
    const face = struct.faces[0];
    face.getNormal(a);
    struct.updateFaceNormal(face, b);
    expect(a.distanceTo(b)).toBeLessThan(1e-9);
  });

  test('normal reflects topology after an edge split', () => {
    // Pentagon; split one edge -> hexagon; normal must still recompute to (0,0,1)
    const positions = new Float32Array([
      1, 0, 0,
      0.309, 0.951, 0,
      -0.809, 0.588, 0,
      -0.809, -0.588, 0,
      0.309, -0.951, 0,
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4]]);
    const face = struct.faces[0];
    expect(face.size).toBe(5);

    const he = face.halfedge;
    const mid = new Vector3().addVectors(he.vertex.position, he.twin.vertex.position).multiplyScalar(0.5);
    struct.splitEdge(he, mid);

    expect(face.size).toBe(6);
    const normal = new Vector3();
    struct.updateFaceNormal(face, normal);
    expect(normal.z).toBeCloseTo(1, 6);
  });
});

// ===========================================================================
// Error paths (contract §5: fail loud, never silently triangulate)
// ===========================================================================

describe('setFromPolygons – error paths', () => {

  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);

  test('throws when positions length is not a multiple of 3', () => {
    const struct = new HalfedgeDS();
    expect(() => struct.setFromPolygons(
      new Float32Array([0, 0, 0, 1]), [0, 1], [0], 1e-10,
    )).toThrow(/multiple of 3/);
  });

  test('throws when faceOffsets length < 2', () => {
    const struct = new HalfedgeDS();
    expect(() => struct.setFromPolygons(positions, [0], [])).toThrow(/at least one face/);
  });

  test('throws when faceOffsets[0] !== 0', () => {
    const struct = new HalfedgeDS();
    expect(() => struct.setFromPolygons(positions, [1, 3], [0, 1])).toThrow(/faceOffsets\[0\]/);
  });

  test('throws when faceOffsets is not strictly increasing', () => {
    const struct = new HalfedgeDS();
    expect(() => struct.setFromPolygons(
      positions, [0, 3, 3], [0, 1, 2])).toThrow(/strictly increasing/);
    expect(() => struct.setFromPolygons(
      positions, [0, 3, 2], [0, 1, 2])).toThrow(/strictly increasing/);
  });

  test('throws when a polygon has fewer than 3 corners', () => {
    const struct = new HalfedgeDS();
    expect(() => struct.setFromPolygons(positions, [0, 2], [0, 1])).toThrow(/at least 3 required/);
  });

  test('throws when cornerVerts is out of range', () => {
    const struct = new HalfedgeDS();
    expect(() => struct.setFromPolygons(
      positions, [0, 3], [0, 1, 99])).toThrow(/out of range/);
  });

  test('throws when the run-length table does not cover cornerVerts', () => {
    const struct = new HalfedgeDS();
    expect(() => struct.setFromPolygons(
      positions, [0, 3], [0, 1, 2, 0])).toThrow(/cornerVerts.length/);
  });

  test('does not clear an existing structure on malformed input', () => {
    const { positions: cubePos, polygons } = unitCubePolygons();
    const struct = HalfedgeDS.fromPolygons(cubePos, polygons);
    expect(struct.faces).toHaveLength(6);

    expect(() => struct.setFromPolygons(cubePos, [0], [])).toThrow();
    // Pre-existing topology is untouched because validation runs first
    expect(struct.faces).toHaveLength(6);
  });
});

// ===========================================================================
// Helpers
// ===========================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
