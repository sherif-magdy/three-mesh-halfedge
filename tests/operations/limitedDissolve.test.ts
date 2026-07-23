import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { validateHalfedgeConsistency } from '../helpers/topologyValidation';

describe('limitedDissolve', () => {

  test('two coplanar triangles -> one quad', () => {
    const struct = HalfedgeDS.fromPolygons(
      new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      [[0, 1, 2], [0, 2, 3]],
    );
    expect(struct.faces).toHaveLength(2);

    struct.limitedDissolve(deg2rad(1));

    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0].size).toBe(4);
    validateHalfedgeConsistency(struct);
  });

  test('coplanar quad strip (3 quads) -> one rectangle (8 corners)', () => {
    // 1x3 grid of unit squares, all in z=0.
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0,
      0, 1, 0, 1, 1, 0, 2, 1, 0, 3, 1, 0,
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
    ]);
    expect(struct.faces).toHaveLength(3);

    struct.limitedDissolve(deg2rad(1));

    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0].size).toBe(8);
    validateHalfedgeConsistency(struct);
  });

  test('angle boundary: 90deg ridge survives at 10deg, dissolves at 100deg', () => {
    // Two triangles meet at edge 0-1 at a 90deg dihedral (normals (0,0,1) and (0,1,0)).
    const positions = new Float32Array([
      0, 0, 0, // 0 = A
      1, 0, 0, // 1 = B
      0.5, 1, 0, // 2 = P1 (in +y, in z=0)
      0.5, 0, 1, // 3 = P2 (in +z)
    ]);
    const polygons = [[0, 1, 2], [1, 0, 3]];

    const tight = HalfedgeDS.fromPolygons(positions, polygons);
    tight.limitedDissolve(deg2rad(10)); // 90 > 10 -> nothing dissolves
    expect(tight.faces).toHaveLength(2);

    const loose = HalfedgeDS.fromPolygons(positions, polygons);
    loose.limitedDissolve(deg2rad(100)); // 90 <= 100 -> the ridge dissolves
    expect(loose.faces).toHaveLength(1);
    expect(loose.faces[0].size).toBe(4);
  });

  test('leaves a genuinely bent (non-coplanar) mesh intact under a tight limit', () => {
    // Same 90deg ridge as above; a tight limit must keep both faces.
    const struct = HalfedgeDS.fromPolygons(
      new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0, 0.5, 0, 1]),
      [[0, 1, 2], [1, 0, 3]],
    );
    struct.limitedDissolve(deg2rad(45)); // 90 > 45 -> no dissolve
    expect(struct.faces).toHaveLength(2);
  });
});

// ===========================================================================
// Partial dissolve, coplanar grids, closed mesh
// ===========================================================================

describe('limitedDissolve – partial, grids, closed mesh', () => {

  test('partial dissolve: only the coplanar edge dissolves, the bent one stays', () => {
    // T1,T2 coplanar (z=0, share edge 0-2); T3 is bent ~45deg off edge 1-2.
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 2, 0.5, 1,
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2], [0, 2, 3], [2, 1, 4]]);
    expect(struct.faces).toHaveLength(3);

    struct.limitedDissolve(deg2rad(10)); // 45deg bend > 10deg -> edge 1-2 stays

    expect(struct.faces).toHaveLength(2); // T1+T2 merged; T3 separate
  });

  test('2x2 coplanar grid -> one octagon', () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 2, 0, 0,
      0, 1, 0, 1, 1, 0, 2, 1, 0,
      0, 2, 0, 1, 2, 0, 2, 2, 0,
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [
      [0, 1, 4, 3], [1, 2, 5, 4], [3, 4, 7, 6], [4, 5, 8, 7],
    ]);
    struct.limitedDissolve(deg2rad(1));
    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0].size).toBe(8);
  });

  test('cube (6 quads, 90deg between faces) stays intact under a tight limit', () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
      0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [
      [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
      [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5],
    ]);
    struct.limitedDissolve(deg2rad(10));
    expect(struct.faces).toHaveLength(6);
  });
});

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}
