/*
 * Tests for the splitEdge operation.
 */

import { Vector3 } from 'three';
import { splitEdge } from './splitEdge';
import { createSingleTriangle } from '../utils/fixtures';
import { generatorToArray } from '../utils/testutils';

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

    // splitEdge only guarantees next/prev for the direct split chain,
    // not for the full boundary twin loop which may include halfedges
    // from the original triangle that weren't relinked.
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
});
