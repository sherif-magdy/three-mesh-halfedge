/*
 * Reusable topology validation helpers for halfedge structure tests.
 * These functions assert structural invariants and can be called inside any test.
 */

import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { generatorToArray } from './testutils';

/**
 * Validates twin/next/prev consistency for every halfedge in the structure.
 * Throws an informative error on first violation.
 */
export function validateHalfedgeConsistency(struct: HalfedgeDS) {
  for (const he of struct.halfedges) {
    // Twin round-trip: twin.twin === self
    expect(he.twin.twin).toBe(he);

    // Next/prev round-trips
    expect(he.next.prev).toBe(he);
    expect(he.prev.next).toBe(he);

    // Next vertex matches twin's vertex chain
    // (next.vertex is where the *next* halfedge starts, not a strict invariant to test here)

    // Twin goes in the opposite direction
    expect(he.twin.vertex).toBe(he.next.vertex);
    expect(he.twin.next.vertex).toBe(he.vertex);
  }
}

/**
 * Validates that every face has a complete loop of 3 halfedges (triangular mesh),
 * and that all halfedges in a face loop reference the same face.
 */
export function validateFaceLoops(struct: HalfedgeDS) {
  for (const face of struct.faces) {
    const halfedges = generatorToArray(face.halfedge.nextLoop());
    expect(halfedges).toHaveLength(3);

    for (const he of halfedges) {
      expect(he.face).toBe(face);
    }
  }
}

/**
 * Counts boundary halfedges (face=null but twin.face !== null).
 */
export function countBoundaryHalfedges(struct: HalfedgeDS): number {
  let count = 0;
  for (const he of struct.halfedges) {
    if (he.isBoundary()) {
      count++;
    }
  }
  return count;
}

/**
 * Counts boundary loops using struct.loops().
 * A boundary loop is one where the representative halfedge has no face.
 */
export function countBoundaryLoops(struct: HalfedgeDS): number {
  let count = 0;
  for (const he of struct.loops()) {
    if (!he.face) {
      count++;
    }
  }
  return count;
}

/**
 * Counts face loops (loops where representative has a face).
 */
export function countFaceLoops(struct: HalfedgeDS): number {
  let count = 0;
  for (const he of struct.loops()) {
    if (he.face) {
      count++;
    }
  }
  return count;
}

/**
 * Runs the common structural tests used in setFromGeometry and similar tests.
 */
export function runCommonStructuralTests(
    struct: HalfedgeDS,
    expectedFaces: number,
    expectedEdges: number,
    expectedVertices: number,
) {
  expect(struct.faces).toHaveLength(expectedFaces);
  // Each edge produces 2 halfedges
  expect(struct.halfedges).toHaveLength(expectedEdges * 2);
  expect(struct.vertices).toHaveLength(expectedVertices);

  validateHalfedgeConsistency(struct);
  validateFaceLoops(struct);
}
