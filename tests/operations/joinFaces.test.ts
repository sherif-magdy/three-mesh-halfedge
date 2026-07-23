import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { Face } from '../../src/core/Face';
import { Halfedge } from '../../src/core/Halfedge';
import { validateHalfedgeConsistency } from '../helpers/topologyValidation';

/** Halfedge of `a` whose twin lies in `b` (the edge shared by the two faces). */
function sharedHalfedge(a: Face, b: Face): Halfedge {
  for (const he of a.halfedge.nextLoop()) {
    if (he.twin.face === b) {
      return he;
    }
  }
  throw new Error('test: faces do not share an edge');
}

/** Unit square as two coplanar triangles sharing the 0-2 diagonal. */
function squareAsTwoTriangles(): HalfedgeDS {
  return HalfedgeDS.fromPolygons(
    new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    [[0, 1, 2], [0, 2, 3]],
  );
}

// ===========================================================================
// joinFacesAcrossEdge (BM_faces_join_pair)
// ===========================================================================

describe('joinFacesAcrossEdge', () => {

  test('two triangles sharing an edge -> one quad', () => {
    const struct = squareAsTwoTriangles();
    expect(struct.faces).toHaveLength(2);

    const [f0, f1] = struct.faces;
    const he = sharedHalfedge(f0, f1);
    const merged = struct.joinFacesAcrossEdge(he);

    expect(struct.faces).toHaveLength(1);
    expect(merged.size).toBe(4);
    expect(struct.faces[0]).toBe(merged);
    validateHalfedgeConsistency(struct);
  });

  test('throws on a boundary edge (no face on one side)', () => {
    const struct = HalfedgeDS.fromPolygons(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      [[0, 1, 2]],
    );
    const he = struct.faces[0].halfedge; // every edge of a lone triangle is boundary
    expect(() => struct.joinFacesAcrossEdge(he)).toThrow(/both sides/);
  });
});

// ===========================================================================
// joinFaces (BM_faces_join)
// ===========================================================================

describe('joinFaces', () => {

  test('two triangles -> one quad', () => {
    const struct = squareAsTwoTriangles();
    const faces = struct.faces.slice();
    const merged = struct.joinFaces(faces);

    expect(struct.faces).toHaveLength(1);
    expect(merged.size).toBe(4);
    validateHalfedgeConsistency(struct);
  });

  test('three-face junction (triangles around a central vertex) -> one triangle', () => {
    // v=(0.5,0.4) interior to triangle a,b,c; three triangles fan around v.
    const positions = new Float32Array([
      0.5, 0.4, 0, // 0 = v
      0, 0, 0,     // 1 = a
      1, 0, 0,     // 2 = b
      0.5, 1, 0,   // 3 = c
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2], [0, 2, 3], [0, 3, 1]]);
    expect(struct.faces).toHaveLength(3);

    const merged = struct.joinFaces(struct.faces.slice());

    expect(struct.faces).toHaveLength(1);
    expect(merged.size).toBe(3);
    validateHalfedgeConsistency(struct);
  });

  test('rejects a non edge-connected region (disjoint face)', () => {
    // A square (2 triangles) plus a lone triangle that shares no edge.
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, // 0..3 square
      5, 0, 0, 6, 0, 0, 5, 1, 0,          // 4..6 lone triangle
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2], [0, 2, 3], [4, 5, 6]]);
    expect(struct.faces).toHaveLength(3);

    expect(() => struct.joinFaces(struct.faces.slice())).toThrow(/single simple loop/);
  });

  test('rejects empty input', () => {
    const struct = squareAsTwoTriangles();
    expect(() => struct.joinFaces([])).toThrow(/at least one/);
  });

  test('rejects duplicate faces', () => {
    const struct = squareAsTwoTriangles();
    const [f0] = struct.faces;
    expect(() => struct.joinFaces([f0, f0])).toThrow(/duplicate/);
  });
});

// ===========================================================================
// Larger / cyclic patches and mixed face pairs
// ===========================================================================

/** 2x2 grid of coplanar unit quads (9 verts, 4 faces); centre vertex = id 4. */
function build2x2Grid(): HalfedgeDS {
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 2, 0, 0,
    0, 1, 0, 1, 1, 0, 2, 1, 0,
    0, 2, 0, 1, 2, 0, 2, 2, 0,
  ]);
  return HalfedgeDS.fromPolygons(positions, [
    [0, 1, 4, 3], [1, 2, 5, 4], [3, 4, 7, 6], [4, 5, 8, 7],
  ]);
}

/** 1x3 strip of coplanar unit quads (8 verts, 3 faces). */
function build3Strip(): HalfedgeDS {
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0,
    0, 1, 0, 1, 1, 0, 2, 1, 0, 3, 1, 0,
  ]);
  return HalfedgeDS.fromPolygons(positions, [
    [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6],
  ]);
}

describe('joinFaces – larger patches & mixed pairs', () => {

  test('2x2 quad grid -> octagon, centre vertex left isolated', () => {
    const struct = build2x2Grid();
    expect(struct.faces).toHaveLength(4);

    const merged = struct.joinFaces(struct.faces.slice());

    expect(struct.faces).toHaveLength(1);
    expect(merged.size).toBe(8);
    // The centre vertex (1,1) was interior to the patch -> now isolated.
    const isolated = struct.vertices.filter(v => v.isIsolated());
    expect(isolated).toHaveLength(1);
    validateHalfedgeConsistency(struct);
  });

  test('3-quad strip (non-cyclic) -> one rectangle (8 corners)', () => {
    const struct = build3Strip();
    const merged = struct.joinFaces(struct.faces.slice());
    expect(struct.faces).toHaveLength(1);
    expect(merged.size).toBe(8);
    validateHalfedgeConsistency(struct);
  });

  test('two adjacent quads -> hexagon', () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0, 1, 1, 0, 2, 1, 0,
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 4, 3], [1, 2, 5, 4]]);
    const [f0, f1] = struct.faces;
    const merged = struct.joinFacesAcrossEdge(sharedHalfedge(f0, f1));
    expect(struct.faces).toHaveLength(1);
    expect(merged.size).toBe(6);
  });

  test('triangle + quad sharing an edge -> pentagon', () => {
    const positions = new Float32Array([
      0, 0, 0, 2, 0, 0, 1, 1, 0, // tri 0,1,2
      0, -1, 0, 2, -1, 0,        // quad shares edge 0-1 (below)
    ]);
    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2], [1, 0, 3, 4]]);
    const [f0, f1] = struct.faces;
    const merged = struct.joinFacesAcrossEdge(sharedHalfedge(f0, f1));
    expect(struct.faces).toHaveLength(1);
    expect(merged.size).toBe(5);
  });
});

describe('joinFaces – edge cases & integration', () => {

  test('a single face is a no-op (returns it unchanged)', () => {
    const struct = squareAsTwoTriangles();
    const only = struct.faces[0];
    const result = struct.joinFaces([only]);
    expect(result).toBe(only);
    expect(struct.faces).toHaveLength(2); // untouched
  });

  test('a face from another structure is rejected', () => {
    const a = squareAsTwoTriangles();
    const b = squareAsTwoTriangles();
    expect(() => a.joinFaces([a.faces[0], b.faces[0]])).toThrow(/belong/);
  });

  test('merged n-gon tessellates to size-2 triangles', () => {
    const struct = build3Strip();
    struct.joinFaces(struct.faces.slice()); // -> rectangle, 8 corners
    expect(struct.tessellate()).toHaveLength(8 - 2);
  });
});
