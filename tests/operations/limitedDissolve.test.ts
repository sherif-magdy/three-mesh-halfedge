import { RoundedBoxGeometry } from 'three-stdlib';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import {
  validateHalfedgeConsistency,
  validateNoRepeatedFaceVertices,
} from '../helpers/topologyValidation';

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

// ===========================================================================
// Degenerate merges: the two faces of a dissolvable edge share a vertex
// other than the edge's endpoints, so the merged loop would visit that
// vertex twice (a pinched face). Such merges must be refused.
// ===========================================================================

describe('limitedDissolve – degenerate merges', () => {

  test('refuses the merge when the faces share a third vertex (bowtie)', () => {
    // Quads A = [v1,v2,v3,K] and B = [v2,v1,v4,K] share edge v1-v2 AND
    // vertex K. B is lifted ~4deg off A's plane so the shared edge is a
    // dissolve candidate at a 5deg limit.
    const positions = new Float32Array([
      0, 0, 0, // 0 = v1
      1, 0, 0, // 1 = v2
      2, 1, 0, // 2 = v3
      -1, 1, 0, // 3 = K (shared by both quads)
      2.5, -0.5, 0.05, // 4 = v4
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3], [1, 0, 4, 3]]);
    expect(struct.faces).toHaveLength(2);

    struct.limitedDissolve(deg2rad(5));

    expect(struct.faces).toHaveLength(2); // merge refused
    validateNoRepeatedFaceVertices(struct);
    validateHalfedgeConsistency(struct);
  });

  test('still dissolves a clean coplanar edge in a mesh that also has a pinch', () => {
    // Same bowtie plus C = [v3,v2,c1,c2] coplanar with A across edge v2-v3.
    // The clean A+C merge must survive; only the pinched v1-v2 merge is skipped.
    const positions = new Float32Array([
      0, 0, 0, // 0 = v1
      1, 0, 0, // 1 = v2
      2, 1, 0, // 2 = v3
      -1, 1, 0, // 3 = K
      2.5, -0.5, 0.05, // 4 = v4
      1.2, -1.5, 0, // 5 = c1
      3.2, -0.2, 0, // 6 = c2
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [
      [0, 1, 2, 3],
      [1, 0, 4, 3],
      [2, 1, 5, 6],
    ]);
    expect(struct.faces).toHaveLength(3);

    struct.limitedDissolve(deg2rad(5));

    expect(struct.faces).toHaveLength(2); // A+C merged; the pinch merge refused
    const sizes = struct.faces.map((f) => f.size).sort((a, b) => a - b);
    expect(sizes).toEqual([4, 6]);
    validateNoRepeatedFaceVertices(struct);
    validateHalfedgeConsistency(struct);
  });

  test('rounded box: no pinched faces anywhere after dissolving', () => {
    const struct = new HalfedgeDS();
    struct.setFromGeometry(new RoundedBoxGeometry(1, 1, 1, 6, 0.2), 1e-6);
    const before = struct.faces.length;

    struct.limitedDissolve(deg2rad(5));

    expect(struct.faces.length).toBeLessThan(before); // dissolving still happens
    validateNoRepeatedFaceVertices(struct);
    validateHalfedgeConsistency(struct);
  });
});
