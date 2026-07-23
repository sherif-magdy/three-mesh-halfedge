import { Triangle, Vector3 } from 'three';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { tessellate } from '../../src/operations/tessellate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function positionById(struct: HalfedgeDS): Map<number, Vector3> {
  const m = new Map<number, Vector3>();
  for (const v of struct.vertices) {
    m.set(v.id, v.position);
  }
  return m;
}

function posOf(map: Map<number, Vector3>, id: number): Vector3 {
  const p = map.get(id);
  if (!p) {
    throw new Error(`no vertex with id ${id}`);
  }
  return p;
}

/** Shoelace area of a 2D polygon given its CCW corner list. */
function polygonArea2D(corners: ReadonlyArray<readonly [number, number]>): number {
  let s = 0;
  for (let i = 0; i < corners.length; i++) {
    const [x1, y1] = corners[i];
    const [x2, y2] = corners[(i + 1) % corners.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** Sum of triangle areas for a list of vertex-id triples. */
function totalArea(struct: HalfedgeDS, tris: number[][]): number {
  const pos = positionById(struct);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  let area = 0;
  for (const [ia, ib, ic] of tris) {
    a.copy(posOf(pos, ia));
    b.copy(posOf(pos, ib));
    c.copy(posOf(pos, ic));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    area += ab.cross(ac).length() / 2;
  }
  return area;
}

/**
 * Every triangle's normal aligns with the (single) face normal. For a planar
 * CCW face this means each emitted triangle is also CCW — a reflex or exterior
 * triangle would flip its normal and fail this. Single-face structs only.
 */
function trisAlignWithFaceNormal(struct: HalfedgeDS, tris: number[][]): boolean {
  const pos = positionById(struct);
  const faceNormal = new Vector3();
  const triNormal = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  struct.faces[0].getNormal(faceNormal);
  for (const [ia, ib, ic] of tris) {
    a.copy(posOf(pos, ia));
    b.copy(posOf(pos, ib));
    c.copy(posOf(pos, ic));
    new Triangle(a, b, c).getNormal(triNormal);
    if (faceNormal.dot(triNormal) <= 0.99) {
      return false;
    }
  }
  return true;
}

// ===========================================================================
// Triangle counts
// ===========================================================================

describe('tessellate – triangle counts', () => {

  test('quad -> 2 triangles', () => {
    const struct = HalfedgeDS.fromPolygons(
      new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      [[0, 1, 2, 3]],
    );
    expect(struct.tessellate()).toHaveLength(2);
  });

  test('pentagon -> 3 triangles', () => {
    const positions = new Float32Array([
      1, 0, 0, 0.309, 0.951, 0, -0.809, 0.588, 0,
      -0.809, -0.588, 0, 0.309, -0.951, 0,
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4]]);
    expect(struct.tessellate()).toHaveLength(3);
  });

  test('hexagon -> 4 triangles', () => {
    const positions = new Float32Array([
      1, 0, 0, 0.5, 0.866, 0, -0.5, 0.866, 0,
      -1, 0, 0, -0.5, -0.866, 0, 0.5, -0.866, 0,
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4, 5]]);
    expect(struct.tessellate()).toHaveLength(4);
  });

  test('cube (6 quads) -> 12 triangles; free function matches method', () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
      0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
    ]);
    const polygons = [
      [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
      [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5],
    ];
    const struct = HalfedgeDS.fromPolygons(positions, polygons);
    expect(tessellate(struct)).toHaveLength(12);
    expect(struct.tessellate()).toHaveLength(12);
  });
});

// ===========================================================================
// Winding + convex fan parity
// ===========================================================================

describe('tessellate – winding & area coverage (convex)', () => {

  test('quad: 2 CCW triangles covering the full area', () => {
    const corners: ReadonlyArray<readonly [number, number]> =
      [[0, 0], [1, 0], [1, 1], [0, 1]];
    const struct = HalfedgeDS.fromPolygons(
      new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      [[0, 1, 2, 3]],
    );
    const tris = struct.tessellate();
    expect(tris).toHaveLength(2);
    expect(trisAlignWithFaceNormal(struct, tris)).toBe(true);
    expect(totalArea(struct, tris)).toBeCloseTo(polygonArea2D(corners), 6);
  });

  test('pentagon: 3 CCW triangles covering the full area', () => {
    const corners: ReadonlyArray<readonly [number, number]> = [
      [1, 0], [0.309, 0.951], [-0.809, 0.588], [-0.809, -0.588], [0.309, -0.951]];
    const positions = new Float32Array(corners.flatMap(c => [c[0], c[1], 0]));
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4]]);
    const tris = struct.tessellate();
    expect(tris).toHaveLength(3);
    expect(trisAlignWithFaceNormal(struct, tris)).toBe(true);
    expect(totalArea(struct, tris)).toBeCloseTo(polygonArea2D(corners), 6);
  });
});

// ===========================================================================
// Concave correctness (ear-clip must produce valid, non-reflex triangles)
// ===========================================================================

describe('tessellate – concave n-gons', () => {

  test('concave dart quad -> 2 triangles, winding + area preserved', () => {
    // Vertex 2 pokes inward; CCW in z=0.
    const struct = HalfedgeDS.fromPolygons(
      new Float32Array([0, 0, 0, 2, 0, 0, 1, 0.4, 0, 1, 2, 0]),
      [[0, 1, 2, 3]],
    );
    const tris = struct.tessellate();
    expect(tris).toHaveLength(2);
    expect(trisAlignWithFaceNormal(struct, tris)).toBe(true);
    const corners: ReadonlyArray<readonly [number, number]> =
      [[0, 0], [2, 0], [1, 0.4], [1, 2]];
    expect(totalArea(struct, tris)).toBeCloseTo(polygonArea2D(corners), 6);
  });

  test('concave L-shape (6 corners) -> 4 triangles, winding + area preserved', () => {
    const struct = HalfedgeDS.fromPolygons(
      new Float32Array([0, 0, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0, 1, 2, 0, 0, 2, 0]),
      [[0, 1, 2, 3, 4, 5]],
    );
    const tris = struct.tessellate();
    expect(tris).toHaveLength(4);
    expect(trisAlignWithFaceNormal(struct, tris)).toBe(true);
    // L-shape = 2x1 bar + 1x1 square = 3.
    expect(totalArea(struct, tris)).toBeCloseTo(3, 6);
  });
});

// ===========================================================================
// Cache + dirty-flag invalidation
// ===========================================================================

describe('tessellate – cache & dirty flag', () => {

  function quadStruct() {
    return HalfedgeDS.fromPolygons(
      new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      [[0, 1, 2, 3]],
    );
  }

  test('repeated calls return the cached array (same reference)', () => {
    const struct = quadStruct();
    const first = struct.tessellate();
    expect(struct.tessellate()).toBe(first);
  });

  test('invalidateTessellation() forces a fresh compute (new reference)', () => {
    const struct = quadStruct();
    const first = struct.tessellate();
    struct.invalidateTessellation();
    const second = struct.tessellate();
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  test('cutFace invalidates the cache', () => {
    const struct = quadStruct();
    const before = struct.tessellate();
    expect(before).toHaveLength(2);

    const face = struct.faces[0];
    const he = face.halfedge;
    // Cut along the v0->v2 diagonal: one quad -> two triangle faces.
    struct.cutFace(face, he.vertex, he.next.next.vertex, true);

    const after = struct.tessellate();
    expect(after).not.toBe(before);
    expect(after).toHaveLength(2);
    expect(struct.faces).toHaveLength(2);
  });

  test('addVertex invalidates even though triangle content is unchanged', () => {
    const struct = quadStruct();
    const before = struct.tessellate();
    struct.addVertex(new Vector3(5, 5, 5)); // isolated vertex, no face
    const after = struct.tessellate();
    expect(after).not.toBe(before);
    expect(after).toEqual(before);
  });
});

// ===========================================================================
// 3D orientation, multi-reflex concavity, multi-face structs
// ===========================================================================

describe('tessellate – 3D & concave & multi-face', () => {

  test('tilted hexagon (off the z=0 plane) -> 4 CCW triangles, area preserved', () => {
    // Regular hexagon of radius 2 in the plane normal to (1,1,1).
    const n = new Vector3(1, 1, 1).normalize();
    const u = new Vector3().crossVectors(n, new Vector3(0, 0, 1)).normalize();
    const v = new Vector3().crossVectors(n, u).normalize();
    const R = 2;
    const positions: number[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (2 * Math.PI * k) / 6;
      const p = new Vector3()
        .addScaledVector(u, R * Math.cos(a))
        .addScaledVector(v, R * Math.sin(a));
      positions.push(p.x, p.y, p.z);
    }
    const struct = HalfedgeDS.fromPolygons(new Float32Array(positions), [[0, 1, 2, 3, 4, 5]]);
    const tris = struct.tessellate();
    expect(tris).toHaveLength(4);
    expect(trisAlignWithFaceNormal(struct, tris)).toBe(true);
    expect(totalArea(struct, tris)).toBeCloseTo(6 * Math.sqrt(3), 6);
  });

  test('concave U-shape (two reflex corners) -> 6 CCW triangles, area preserved', () => {
    const corners: ReadonlyArray<readonly [number, number]> = [
      [0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]];
    const positions = new Float32Array(corners.flatMap(c => [c[0], c[1], 0]));
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4, 5, 6, 7]]);
    const tris = struct.tessellate();
    expect(tris).toHaveLength(6);
    expect(trisAlignWithFaceNormal(struct, tris)).toBe(true);
    expect(totalArea(struct, tris)).toBeCloseTo(polygonArea2D(corners), 6);
  });

  test('mixed face sizes (tri + quad + pentagon) -> 6 triangles total', () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,                      // tri 0,1,2
      3, 0, 0, 4, 0, 0, 4, 1, 0, 3, 1, 0,             // quad 3,4,5,6
      6, 0, 0, 7, 0, 0, 7, 1, 0, 6.5, 1.5, 0, 6, 1, 0, // pentagon 7..11
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [
      [0, 1, 2], [3, 4, 5, 6], [7, 8, 9, 10, 11],
    ]);
    expect(struct.tessellate()).toHaveLength(6);
  });
});

// ===========================================================================
// Cache invalidation by the remaining mutators
// ===========================================================================

describe('tessellate – cache invalidation by remaining mutators', () => {

  test('splitEdge invalidates the cache (quad -> pentagon)', () => {
    const struct = HalfedgeDS.fromPolygons(
      new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      [[0, 1, 2, 3]],
    );
    const before = struct.tessellate();
    expect(before).toHaveLength(2);

    const he = struct.faces[0].halfedge;
    const mid = new Vector3()
      .addVectors(he.vertex.position, he.twin.vertex.position)
      .multiplyScalar(0.5);
    struct.splitEdge(he, mid);
    expect(struct.faces[0].size).toBe(5);

    const after = struct.tessellate();
    expect(after).not.toBe(before);
    expect(after).toHaveLength(3);
  });

  test('removeEdge (merge) invalidates the cache', () => {
    const struct = HalfedgeDS.fromPolygons(
      new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      [[0, 1, 2], [0, 2, 3]],
    );
    const before = struct.tessellate();
    expect(struct.faces).toHaveLength(2);

    const [f0, f1] = struct.faces;
    const shared = [...f0.halfedge.nextLoop()].find(he => he.twin.face === f1);
    expect(shared).toBeDefined();
    if (shared) {
      struct.removeEdge(shared, true);
    }

    expect(struct.faces).toHaveLength(1);
    const after = struct.tessellate();
    expect(after).not.toBe(before);
    expect(after).toHaveLength(2); // merged quad -> 2 tris
  });
});
