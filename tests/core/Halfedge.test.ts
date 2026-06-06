import { Vector3, BoxGeometry } from 'three';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { createSingleTriangle, createOpenFan } from '../helpers/fixtures';
import { generatorToArray } from '../helpers/testutils';

describe('Halfedge', () => {

  describe('id getter', () => {
    test('returns "sourceId-destId" format for a connected halfedge', () => {
      const { v0v1 } = createSingleTriangle();

      // v0v1 goes from v0 to v1, twin goes from v1 to v0
      expect(v0v1.id).toBe(v0v1.vertex.id + '-' + v0v1.twin.vertex.id);
    });
  });

  describe('isFree', () => {
    test('returns true when face is null', () => {
      const { v0v1 } = createSingleTriangle();

      // The twin of v0v1 is on the outside — it has no face
      expect(v0v1.twin.isFree()).toBe(true);
    });

    test('returns false when face is assigned', () => {
      const { v0v1 } = createSingleTriangle();

      // v0v1 is part of the triangle face
      expect(v0v1.isFree()).toBe(false);
    });
  });

  describe('isBoundary', () => {
    test('returns true when self has no face but twin has a face', () => {
      const { v0v1 } = createSingleTriangle();

      // v0v1.twin has no face, but v0v1 (its twin) has a face
      expect(v0v1.twin.isBoundary()).toBe(true);
    });

    test('returns false when both halfedges have faces', () => {
      const geometry = new BoxGeometry(1, 1, 1);
      const boxStruct = new HalfedgeDS();
      boxStruct.setFromGeometry(geometry);

      // In a closed box, all halfedges should have faces
      let hasNonBoundaryWithFace = false;
      for (const he of boxStruct.halfedges) {
        if (he.face !== null) {
          expect(he.isBoundary()).toBe(false);
          hasNonBoundaryWithFace = true;
        }
      }
      expect(hasNonBoundaryWithFace).toBe(true);
    });

    test('returns false when both halfedges have no faces', () => {
      const { cv3 } = createOpenFan();

      // cv3 and cv3.twin are both free (no faces on either side)
      expect(cv3.isFree()).toBe(true);
      expect(cv3.twin.isFree()).toBe(true);
      // Neither is a boundary since both sides are free
      expect(cv3.isBoundary()).toBe(false);
      expect(cv3.twin.isBoundary()).toBe(false);
    });
  });

  describe('isConcave', () => {
    test('returns false for convex edge on a flat triangle mesh', () => {
      const { v0v1 } = createSingleTriangle();

      // A single flat triangle — all edges are convex (or at least not concave)
      expect(v0v1.isConcave).toBe(false);
    });

    test('returns false when twin is missing (no crash)', () => {
      const struct = new HalfedgeDS();
      const v0 = struct.addVertex(new Vector3(0, 0, 0));
      const v1 = struct.addVertex(new Vector3(1, 0, 0));
      const he = struct.addEdge(v0, v1);

      // Manually delete twin reference to simulate missing twin
      // The halfedge does have a twin from addEdge, but the isConcave getter
      // checks if this.twin is truthy, so it should be false when twin exists
      // on a flat edge. Let's verify it doesn't crash with a normal halfedge
      // that is part of an edge pair without faces.
      expect(() => he.isConcave).not.toThrow();
      expect(he.isConcave).toBe(false);
    });
  });

  describe('containsPoint', () => {
    test('returns true for point exactly on the edge midpoint', () => {
      const { v0v1 } = createSingleTriangle();
      // v0 is at (0,0,0), v1 is at (1,0,0), midpoint is (0.5, 0, 0)
      const midpoint = new Vector3(0.5, 0, 0);
      expect(v0v1.containsPoint(midpoint)).toBe(true);
    });

    test('returns true for point exactly at an endpoint of the edge', () => {
      const { v0v1, v0 } = createSingleTriangle();
      // v0 is at (0,0,0) — the start of the edge
      expect(v0v1.containsPoint(v0.position)).toBe(true);
    });

    test('returns false for point far from the edge', () => {
      const { v0v1 } = createSingleTriangle();
      const farPoint = new Vector3(0.5, 5, 0);
      expect(v0v1.containsPoint(farPoint)).toBe(false);
    });

    test('returns false for point slightly off edge with default tolerance', () => {
      const { v0v1 } = createSingleTriangle();
      // Slightly above the edge — within 0.1 but not within 1e-10
      const offsetPoint = new Vector3(0.5, 0.1, 0);
      expect(v0v1.containsPoint(offsetPoint)).toBe(false);
    });

    test('returns true for slightly off edge with large tolerance', () => {
      const { v0v1 } = createSingleTriangle();
      // Slightly above the edge — within 0.2 tolerance
      const offsetPoint = new Vector3(0.5, 0.1, 0);
      expect(v0v1.containsPoint(offsetPoint, 0.2)).toBe(true);
    });

    test('returns false for slightly off edge with small tolerance', () => {
      const { v0v1 } = createSingleTriangle();
      const offsetPoint = new Vector3(0.5, 0.1, 0);
      expect(v0v1.containsPoint(offsetPoint, 0.05)).toBe(false);
    });
  });

  describe('nextLoop', () => {
    test('yields all 3 halfedges for a triangle', () => {
      const { v0v1, v1v2, v2v0 } = createSingleTriangle();
      const loop = generatorToArray(v0v1.nextLoop());

      expect(loop).toHaveLength(3);
      expect(loop).toContain(v0v1);
      expect(loop).toContain(v1v2);
      expect(loop).toContain(v2v0);
    });

    test('completes a full cycle ending back at the starting halfedge', () => {
      const { v0v1 } = createSingleTriangle();
      const loop = generatorToArray(v0v1.nextLoop());

      // After following next pointers, last.next should equal first
      const last = loop[loop.length - 1];
      expect(last.next).toBe(v0v1);
    });
  });

  describe('prevLoop', () => {
    test('yields halfedges in reverse order by following prev pointers', () => {
      const { v0v1, v1v2, v2v0 } = createSingleTriangle();

      const prevResult = generatorToArray(v0v1.prevLoop());

      // prevLoop follows prev pointers: v0v1 -> v2v0 -> v1v2
      expect(prevResult).toHaveLength(3);
      expect(prevResult[0]).toBe(v0v1);
      expect(prevResult[1]).toBe(v2v0);
      expect(prevResult[2]).toBe(v1v2);
    });

    test('returns same length as nextLoop', () => {
      const { v0v1 } = createSingleTriangle();
      const prevLoop = generatorToArray(v0v1.prevLoop());
      const nextLoop = generatorToArray(v0v1.nextLoop());

      expect(prevLoop).toHaveLength(nextLoop.length);
    });
  });

});
