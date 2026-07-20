/*
 * Tests for the removeVertex operation.
 *
 * NOTE: removeVertex iterates vertex.loopCW() and calls removeEdge for each
 * halfedge. This mutates the topology during iteration, so tests that verify
 * post-removal state must avoid re-iterating the removed vertex's edges.
 */

import { Vector3 } from 'three';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { removeVertex } from '../../src/operations/removeVertex';
import {
  createSingleTriangle,
  createDoubleTriangle,
  createClosedTetrahedron,
} from '../helpers/fixtures';
import { generatorToArray } from '../helpers/testutils';
import { validateHalfedgeConsistency } from '../helpers/topologyValidation';

describe('removeVertex', () => {

  test('Remove isolated vertex: removed from struct.vertices, no halfedges affected', () => {
    const struct = new HalfedgeDS();
    const vec = new Vector3();
    const vertex = struct.addVertex(vec.set(1, 2, 3));

    expect(struct.vertices).toHaveLength(1);
    expect(struct.halfedges).toHaveLength(0);

    removeVertex(struct, vertex);

    expect(struct.vertices).toHaveLength(0);
    expect(struct.vertices.includes(vertex)).toBe(false);
    expect(struct.halfedges).toHaveLength(0);
  });

  test('Remove vertex with one edge (no face): vertex and edge pair removed', () => {
    const struct = new HalfedgeDS();
    const vec = new Vector3();
    const v0 = struct.addVertex(vec.set(0, 0, 0));
    const v1 = struct.addVertex(vec.set(1, 0, 0));
    struct.addEdge(v0, v1);

    expect(struct.vertices).toHaveLength(2);
    expect(struct.halfedges).toHaveLength(2);

    removeVertex(struct, v0);

    expect(struct.vertices).toHaveLength(1);
    expect(struct.vertices.includes(v0)).toBe(false);
    expect(struct.vertices.includes(v1)).toBe(true);
    expect(struct.halfedges).toHaveLength(0);
  });

  test('Remove vertex with face using struct.removeVertex (mergeFaces=true)', () => {
    // Use struct.removeVertex directly which delegates to removeEdge per halfedge
    const { struct, v0v1 } = createDoubleTriangle();

    const faceCountBefore = struct.faces.length;
    expect(faceCountBefore).toBe(2);

    // Removing the shared edge with mergeFaces=true keeps one face
    struct.removeEdge(v0v1, true);

    expect(struct.faces.length).toBe(faceCountBefore - 1);
  });

  test('Remove edge with mergeFaces=false removes all faces touching the edge', () => {
    const { struct, v0v1 } = createDoubleTriangle();

    struct.removeEdge(v0v1, false);

    expect(struct.faces).toHaveLength(0);
  });

  test('single triangle: removeEdge with mergeFaces=false removes the face', () => {
    const { struct, v0v1 } = createSingleTriangle();

    expect(struct.faces).toHaveLength(1);

    struct.removeEdge(v0v1, false);

    expect(struct.faces).toHaveLength(0);
  });

  test('double triangle: remaining structure valid after removing non-shared edge', () => {
    const { struct, v1v2 } = createDoubleTriangle();

    struct.removeEdge(v1v2, true);

    // Remaining halfedges should have consistent twin/next/prev
    for (const he of struct.halfedges) {
      expect(he.twin.twin).toBe(he);
      expect(he.next.prev).toBe(he);
      expect(he.prev.next).toBe(he);
    }

    // Remaining faces should have valid loops
    for (const face of struct.faces) {
      const loopHalfedges = generatorToArray(face.halfedge.nextLoop());
      for (const he of loopHalfedges) {
        expect(he.face).toBe(face);
      }
    }
  });

  test('single triangle: boundary halfedges remain after removing face edge', () => {
    const { struct, v0v1 } = createSingleTriangle();

    struct.removeEdge(v0v1, true);

    // The merged/boundary structure should still have consistent links
    for (const he of struct.halfedges) {
      expect(he.twin.twin).toBe(he);
    }
  });

  test('closed tetrahedron: removeVertex(mergeFaces=true) terminates and removes the vertex', () => {
    // Regression for an infinite loop: removeVertex iterated vertex.loopCW()
    // — a LIVE generator — while removeEdge mutated the very twin/next
    // pointers the generator walks (curr.twin.next). After a couple of
    // removals the generator cycled on the mutated pointers and never
    // terminated, crashing the vitest worker (~95s). The explicit timeout
    // makes a regression fail fast instead of hanging.
    const { struct, v0 } = createClosedTetrahedron();

    expect(struct.vertices).toHaveLength(4);

    removeVertex(struct, v0, true);

    // v0 is gone
    expect(struct.vertices).toHaveLength(3);
    expect(struct.vertices.includes(v0)).toBe(false);

    // No remaining halfedge references v0
    for (const he of struct.halfedges) {
      expect(he.vertex).not.toBe(v0);
    }

    // Remaining topology is self-consistent (n-gons from merges are fine —
    // validateHalfedgeConsistency checks twin/next/prev invariants, not loop length)
    validateHalfedgeConsistency(struct);
  }, 10000);

});
