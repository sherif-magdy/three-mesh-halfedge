// Author: Axel Antoine
// mail: ax.antoine@gmail.com
// website: https://axantoine.com
// 09/12/2021

// Loki, Inria project-team with Université de Lille
// within the Joint Research Unit UMR 9189 CNRS-Centrale
// Lille-Université de Lille, CRIStAL.
// https://loki.lille.inria.fr

// LICENCE: Licence.md

import { computeVerticesIndexArray } from '../../src/operations/setFromGeometry';
import {
  CylinderGeometry,
  BoxGeometry,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  BufferAttribute, BufferGeometry} from 'three';
import { generatorSize } from '../helpers/testutils';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { Halfedge } from '../../src/core/Halfedge';

const struct = new HalfedgeDS();

function runCommonTests(
    struct: HalfedgeDS,
    nFace: number,
    nEdges: number,
    nVertices: number) {

  describe("Base Tests", () => {

    test('Test sets size', () => {
      expect(struct.faces).toHaveLength(nFace);
      expect(struct.halfedges).toHaveLength(nEdges*2);
      expect(struct.vertices).toHaveLength(nVertices);
    });

    test("Test halfedge prev/next references", () => {
      for (const halfedge of struct.halfedges) {
        expect(halfedge.next.prev).toBe(halfedge);
        expect(halfedge.prev.next).toBe(halfedge);
      }
    });

    test("Test halfedges pairs", () => {
      for (const halfEdge of struct.halfedges) {
        expect(halfEdge.twin.twin).toBe(halfEdge);
      }
    });

    test('Test face loops size', () => {
      for (const face of struct.faces) {
        expect(generatorSize(face.halfedge.nextLoop())).toBe(3);
        expect(generatorSize(face.halfedge.prevLoop())).toBe(3);
      }
    });

    test('Test face reference', () => {
      for (const face of struct.faces) {
        for (const halfedge of face.halfedge.nextLoop()) {
          expect(halfedge.face).toBe(face);
        }
      }
    });
  });
}

describe("Triangle topology", () => {

  const array = new Int8Array([0,0,0, 0,2,0, 2,0,0]);
  const buffer = new BufferAttribute(array, 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', buffer);

  beforeAll(() => {
    struct.setFromGeometry(geometry);
  });

  runCommonTests(struct, 1, 3, 3);

  test("Test number of boundary halfedges", () => {
    let boundaries = 0;
    for (const halfedge of struct.halfedges) {
      if (!halfedge.face) {
        boundaries += 1;
      }
    }
    expect(boundaries).toBe(3);
  });

});

describe("Double triangles topology", () => {

  const array = new Int8Array([0,0,0, 0,2,0, 2,0,0, 2,0,0, 4,0,0, 4,2,0]);
  const buffer = new BufferAttribute(array, 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', buffer);

  beforeAll(() => {
    struct.setFromGeometry(geometry);
  });

  runCommonTests(struct, 2, 6, 5);

  test('Test number of loops', () => {
    let boundaryLoops = 0;
    let faceLoops = 0;
    for (const loop of struct.loops()) {
      if (!loop.face) {
        boundaryLoops += 1;
      } else {
        faceLoops += 1;
      }
    }
    expect(boundaryLoops).toBe(1);
    expect(faceLoops).toBe(2);
  });

  test("Test number of boundary halfedges", () => {
    let boundaries = 0;
    for (const halfedge of struct.halfedges) {
      if (!halfedge.face) {
        boundaries += 1;
      }
    }
    expect(boundaries).toBe(6);
  });

});

describe("Cylinder topology", () => {

  // https://threejs.org/docs/scenes/geometry-browser.html#CylinderGeometry
  const geometry = new CylinderGeometry(2, 2, 1, 6, 1, true);

  beforeAll(() => {
    struct.setFromGeometry(geometry);
  });

  runCommonTests(struct, 12, 24, 12);

  test("Test boundary loops", () => {
    const loops = struct.loops();
    const boundaryLoops = new Array<Halfedge>();
    for (const he of loops) {
      if (!he.face) {
        boundaryLoops.push(he);
      }
    }
    expect(boundaryLoops).toHaveLength(2);
    for (const bloop of boundaryLoops) {
      expect(generatorSize(bloop.nextLoop())).toBe(6);
    }
  });

});

describe("Cube topology", () => {

  const geometry = new BoxGeometry(1, 1, 1);

  beforeAll(() => {
    struct.setFromGeometry(geometry);
  });

  runCommonTests(struct, 12, 18, 8);

});

describe("Degenerated geometries", () => {

  test("No positions attribute", () => {
    const geometry = new BufferGeometry();

    expect(() => {struct.setFromGeometry(geometry);}).toThrow(Error);
  });
});


describe("Check merge of vertices", () => {

  test("Expect position indices to be merged", () => {
    const array = new Int8Array([1,2,3,4,5,6,7,8,9,1,2,3,4,5,6]);
    const buffer = new BufferAttribute(array, 3);
    const idxArray = computeVerticesIndexArray(buffer, 1);
    expect(idxArray).toHaveLength(5);
    expect(idxArray[0]).toBe(0);
    expect(idxArray[1]).toBe(1);
    expect(idxArray[2]).toBe(2);
    expect(idxArray[3]).toBe(0);
    expect(idxArray[4]).toBe(1);
  });

  test("Expect decimals to be trunked when precision changes", () => {
    const array = new Float32Array([1.110,2.220,3.330,1.111,2.222,3.333]);
    const buffer = new BufferAttribute(array, 3);
    let idxArray = computeVerticesIndexArray(buffer, 1E-1);
    expect(idxArray).toHaveLength(2);
    expect(idxArray[0]).toBe(0);
    expect(idxArray[1]).toBe(0);

    idxArray = computeVerticesIndexArray(buffer, 1E-2);
    expect(idxArray).toHaveLength(2);
    expect(idxArray[0]).toBe(0);
    expect(idxArray[1]).toBe(0);

    idxArray = computeVerticesIndexArray(buffer, 1E-3);
    expect(idxArray).toHaveLength(2);
    expect(idxArray[0]).toBe(0);
    expect(idxArray[1]).toBe(1);
  });

});

describe("Indexed geometry", () => {

  test("BoxGeometry with index buffer produces correct structure", () => {
    // BoxGeometry(1,1,1) uses an index buffer internally
    const geometry = new BoxGeometry(1, 1, 1);
    expect(geometry.getIndex()).not.toBeNull();

    struct.setFromGeometry(geometry);

    // A unit cube: 12 triangles, 18 unique edges, 8 vertices
    expect(struct.faces).toHaveLength(12);
    expect(struct.halfedges).toHaveLength(18 * 2);
    expect(struct.vertices).toHaveLength(8);
  });

  test("Indexed box has valid topology", () => {
    const geometry = new BoxGeometry(1, 1, 1);
    struct.setFromGeometry(geometry);

    // Validate halfedge consistency
    for (const halfedge of struct.halfedges) {
      expect(halfedge.twin.twin).toBe(halfedge);
      expect(halfedge.next.prev).toBe(halfedge);
      expect(halfedge.prev.next).toBe(halfedge);
    }
  });

});

describe("Three.js primitives", () => {

  describe("PlaneGeometry(1,1,1,1)", () => {
    const geometry = new PlaneGeometry(1, 1, 1, 1);

    beforeAll(() => {
      struct.setFromGeometry(geometry);
    });

    test("correct counts", () => {
      // PlaneGeometry(1,1,1,1): 2 triangles, 5 edges, 4 vertices
      expect(struct.faces).toHaveLength(2);
      expect(struct.halfedges).toHaveLength(5 * 2);
      expect(struct.vertices).toHaveLength(4);
    });

    test("1 boundary loop", () => {
      let boundaryLoops = 0;
      for (const loop of struct.loops()) {
        if (!loop.face) {
          boundaryLoops++;
        }
      }
      expect(boundaryLoops).toBe(1);
    });

    test("valid topology", () => {
      for (const halfedge of struct.halfedges) {
        expect(halfedge.twin.twin).toBe(halfedge);
        expect(halfedge.next.prev).toBe(halfedge);
        expect(halfedge.prev.next).toBe(halfedge);
      }
    });
  });

  describe("SphereGeometry(1,4,3)", () => {
    const geometry = new SphereGeometry(1, 4, 3);

    beforeAll(() => {
      struct.setFromGeometry(geometry);
    });

    test("closed mesh has no boundary loops", () => {
      let boundaryLoops = 0;
      for (const loop of struct.loops()) {
        if (!loop.face) {
          boundaryLoops++;
        }
      }
      expect(boundaryLoops).toBe(0);
    });

    test("all faces have valid loops", () => {
      for (const face of struct.faces) {
        const loopSize = generatorSize(face.halfedge.nextLoop());
        expect(loopSize).toBe(3);
      }
    });
  });

  describe("TorusGeometry(1,0.4,4,6)", () => {
    const geometry = new TorusGeometry(1, 0.4, 4, 6);

    beforeAll(() => {
      struct.setFromGeometry(geometry);
    });

    test("closed mesh has no boundary loops", () => {
      let boundaryLoops = 0;
      for (const loop of struct.loops()) {
        if (!loop.face) {
          boundaryLoops++;
        }
      }
      expect(boundaryLoops).toBe(0);
    });

    test("all faces have valid loops", () => {
      for (const face of struct.faces) {
        const loopSize = generatorSize(face.halfedge.nextLoop());
        expect(loopSize).toBe(3);
      }
    });
  });

});

describe("Vertex merging tolerance", () => {

  test("vertices within tolerance are merged", () => {
    // Two vertices that are very close together
    const array = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, 0, 0.0001,  // close to (0,0,0)
      1, 0, 0,
      0, 0, 0,
    ]);
    const buffer = new BufferAttribute(array, 3);
    const idxArray = computeVerticesIndexArray(buffer, 1e-2);

    // Within tolerance, the 4th vertex should be merged with the 1st
    expect(idxArray[0]).toBe(0);
    expect(idxArray[3]).toBe(0);
  });

  test("vertices outside tolerance remain separate", () => {
    const array = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      5, 5, 5,  // far from any other vertex
    ]);
    const buffer = new BufferAttribute(array, 3);
    const idxArray = computeVerticesIndexArray(buffer, 1e-2);

    // The 4th vertex should not be merged with any other
    expect(idxArray[3]).toBe(3);
  });

  test("setFromGeometry respects tolerance", () => {
    // Two triangles sharing a "close enough" edge with tolerance
    const array = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,

      0, 0, 0.0001,  // should merge with (0,0,0) under tolerance 0.01
      2, 0, 0,
      1, 0, 0,
    ]);
    const buffer = new BufferAttribute(array, 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', buffer);

    struct.setFromGeometry(geometry, 0.01);

    // With merging, the close vertex positions should collapse
    // so we get fewer vertices than the raw 6 positions
    expect(struct.vertices.length).toBeLessThan(6);
  });

});

describe("Degenerate inputs", () => {

  test("zero-area triangle (collinear vertices) still builds structure", () => {
    // Three collinear points: area = 0
    const array = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);
    const buffer = new BufferAttribute(array, 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', buffer);

    struct.setFromGeometry(geometry);

    // Should still create a valid structure with 1 face, 3 vertices, 3 edges
    expect(struct.faces).toHaveLength(1);
    expect(struct.vertices).toHaveLength(3);
    expect(struct.halfedges).toHaveLength(3 * 2);
  });

  test("single triangle is minimal valid case", () => {
    const array = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const buffer = new BufferAttribute(array, 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', buffer);

    struct.setFromGeometry(geometry);

    expect(struct.faces).toHaveLength(1);
    expect(struct.vertices).toHaveLength(3);
    expect(struct.halfedges).toHaveLength(3 * 2);

    // Validate topology
    for (const halfedge of struct.halfedges) {
      expect(halfedge.twin.twin).toBe(halfedge);
      expect(halfedge.next.prev).toBe(halfedge);
      expect(halfedge.prev.next).toBe(halfedge);
    }

    // All face halfedges share the same face
    for (const face of struct.faces) {
      for (const halfedge of face.halfedge.nextLoop()) {
        expect(halfedge.face).toBe(face);
      }
    }
  });

});
