/*
 * Tests for the splitEdge operation.
 */

import { Vector3 } from 'three';
import { Face } from '../../src/core/Face';
import { splitEdge } from '../../src/operations/splitEdge';
import { createClosedTetrahedron, createSingleTriangle } from '../helpers/fixtures';
import { generatorToArray } from '../helpers/testutils';
import { validateHalfedgeConsistency } from '../helpers/topologyValidation';

describe('splitEdge', () => {

  describe('Split at midpoint', () => {
    const { struct, v0, v1, v0v1 } = createSingleTriangle();
    const midpoint = new Vector3(0.5, 0, 0);
    const vertexCountBefore = struct.vertices.length;
    const halfedgeCountBefore = struct.halfedges.length;

    const newVertex = splitEdge(struct, v0v1, midpoint);

    test('new vertex is created with correct position', () => {
      expect(newVertex).toBeDefined();
      expect(newVertex).not.toBe(v0);
      expect(newVertex).not.toBe(v1);
      expect(newVertex.position.x).toBeCloseTo(0.5);
      expect(newVertex.position.y).toBeCloseTo(0);
      expect(newVertex.position.z).toBeCloseTo(0);
    });

    test('2 new halfedges added to structure', () => {
      expect(struct.halfedges).toHaveLength(halfedgeCountBefore + 2);
    });

    test('new vertex added to structure', () => {
      expect(struct.vertices).toHaveLength(vertexCountBefore + 1);
      expect(struct.vertices.includes(newVertex)).toBe(true);
    });
  });

  describe('Position matches endpoint A', () => {
    const { struct, v0, v0v1 } = createSingleTriangle();
    const vertexCountBefore = struct.vertices.length;
    const halfedgeCountBefore = struct.halfedges.length;

    const result = splitEdge(struct, v0v1, new Vector3(0, 0, 0));

    test('returns existing vertex A', () => {
      expect(result).toBe(v0);
    });

    test('no new elements created', () => {
      expect(struct.vertices).toHaveLength(vertexCountBefore);
      expect(struct.halfedges).toHaveLength(halfedgeCountBefore);
    });
  });

  describe('Position matches endpoint B', () => {
    const { struct, v1, v0v1 } = createSingleTriangle();
    const vertexCountBefore = struct.vertices.length;
    const halfedgeCountBefore = struct.halfedges.length;

    const result = splitEdge(struct, v0v1, new Vector3(1, 0, 0));

    test('returns existing vertex B', () => {
      expect(result).toBe(v1);
    });

    test('no new elements created', () => {
      expect(struct.vertices).toHaveLength(vertexCountBefore);
      expect(struct.halfedges).toHaveLength(halfedgeCountBefore);
    });
  });

  describe('Face edge split', () => {
    const { struct, v0v1, face } = createSingleTriangle();
    const midpoint = new Vector3(0.5, 0, 0);

    const newVertex = splitEdge(struct, v0v1, midpoint);

    test('face loop grows from 3 to 4 halfedges', () => {
      const faceLoop = generatorToArray(face.halfedge.nextLoop());
      expect(faceLoop).toHaveLength(4);
    });

    test('new halfedges inherit face refs', () => {
      // After split, v0v1.next is the new halfedge from newVertex to v1
      // Both v0v1 and v0v1.next should reference the same face
      expect(v0v1.face).toBe(face);
      expect(v0v1.next.face).toBe(face);

      // The new vertex's halfedge should reference the face too
      const newHe = newVertex.halfedge;
      expect(newHe).not.toBeNull();
      expect(newHe!.face).toBe(face);
    });
  });

  describe('Topology after split', () => {
    const { struct, v0, v1, v2, v0v1 } = createSingleTriangle();
    const midpoint = new Vector3(0.5, 0, 0);

    const newVertex = splitEdge(struct, v0v1, midpoint);

    test('twin refs are correct', () => {
      for (const he of struct.halfedges) {
        expect(he.twin.twin).toBe(he);
      }
    });

    test('vertex halfedge pointers are updated', () => {
      // v0's halfedge should still be valid and point to v0
      expect(v0.halfedge).not.toBeNull();
      expect(v0.halfedge!.vertex).toBe(v0);

      // v1's halfedge should be the new twin (v1 -> newVertex)
      expect(v1.halfedge).not.toBeNull();
      expect(v1.halfedge!.vertex).toBe(v1);

      // newVertex's halfedge should point to it
      expect(newVertex.halfedge).not.toBeNull();
      expect(newVertex.halfedge!.vertex).toBe(newVertex);

      // v2 unchanged
      expect(v2.halfedge).not.toBeNull();
    });

    // After the fix, the entire structure (both sides of every split edge)
    // maintains consistent next/prev round-trips, not just the direct chain.
    test('split chain prev/next is correct', () => {
      // The split creates: v0 -> v0v1 -> newVertex -> newHalfedge -> v1
      expect(v0v1.next.prev).toBe(v0v1);
      expect(v0v1.prev.next).toBe(v0v1);
    });

    test('twin roundtrip for all halfedges', () => {
      for (const he of struct.halfedges) {
        expect(he.twin.twin).toBe(he);
      }
    });
  });

  describe('Closed mesh (tetrahedron) edge split — both adjacent faces', () => {
    // Regression for a bug where splitEdge only spliced the new vertex into
    // ONE adjacent face's loop (halfedge.face). The twin's face kept
    // traversing the original A->B edge, skipping the new vertex, and the
    // twin side was malformed: twin.vertex was never reassigned and the
    // back-pointers (nextHalfedge.prev / prevTwin.next) were never updated.
    // The existing single-triangle tests never caught this because a boundary
    // edge's twin has no face; a closed mesh (tetrahedron) is required so both
    // halfedges carry a face.
    const { struct, v0, v1, v0v1, f0, f1 } = createClosedTetrahedron();
    const midpoint = new Vector3(0.5, 0, 0);

    const newVertex = splitEdge(struct, v0v1, midpoint);

    const faceVertices = (face: Face) =>
      generatorToArray(face.halfedge.nextLoop()).map(he => he.vertex);

    test('new vertex is inserted into BOTH adjacent face loops', () => {
      // f0 uses v0v1 (A->B), f1 uses v0v1.twin (B->A). Both must route
      // through the new vertex after the split.
      expect(faceVertices(f0)).toContain(newVertex);
      expect(faceVertices(f1)).toContain(newVertex);
    });

    test('both adjacent faces grow from 3 to 4 halfedges', () => {
      expect(generatorToArray(f0.halfedge.nextLoop())).toHaveLength(4);
      expect(generatorToArray(f1.halfedge.nextLoop())).toHaveLength(4);
    });

    test('both faces route through the new vertex (A->v->B and B->v->A)', () => {
      // f0 side: v0v1 now points A -> newVertex, then newVertex -> v1
      expect(v0v1.vertex).toBe(v0);
      expect(v0v1.next.vertex).toBe(newVertex);
      expect(v0v1.next.next.vertex).toBe(v1);

      // f1 side: the repurposed twin must originate at the new vertex
      // (newVertex -> v0), and the halfedge arriving at v1 (newTwin) must
      // point to it.
      const twin = v0v1.twin;
      expect(twin.vertex).toBe(newVertex);
      expect(twin.next.vertex).toBe(v0);
      expect(twin.prev.vertex).toBe(v1);
      expect(twin.prev.next).toBe(twin);
    });

    test('full structure passes consistency validation (twin/next/prev)', () => {
      validateHalfedgeConsistency(struct);
    });

    test('nextLoop and prevLoop agree on both adjacent faces', () => {
      for (const face of [f0, f1]) {
        const forward = generatorToArray(face.halfedge.nextLoop());
        const backward = generatorToArray(face.halfedge.prevLoop());
        expect(forward).toHaveLength(4);
        expect(backward).toHaveLength(4);
        // Same set of halfedges traversed in opposite directions
        expect(new Set(backward)).toEqual(new Set(forward));
      }
    });
  });
});
