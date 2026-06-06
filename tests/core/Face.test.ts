import { Vector3 } from 'three';
import { createSingleTriangle } from '../helpers/fixtures';

describe('Face', () => {

  describe('getNormal', () => {
    test('computes (0,0,1) normal for triangle in the XY plane', () => {
      const { face } = createSingleTriangle();
      const normal = new Vector3();

      face.getNormal(normal);

      // Triangle at (0,0,0)-(1,0,0)-(0,1,0) has normal (0,0,1)
      expect(normal.x).toBeCloseTo(0, 10);
      expect(normal.y).toBeCloseTo(0, 10);
      expect(normal.z).toBeCloseTo(1, 10);
    });
  });

  describe('getMidpoint', () => {
    test('returns the centroid of the triangle', () => {
      const { face } = createSingleTriangle();
      const result = new Vector3();

      face.getMidpoint(result);

      // Triangle at (0,0,0), (1,0,0), (0,1,0) — centroid is (1/3, 1/3, 0)
      expect(result.x).toBeCloseTo(1/3, 10);
      expect(result.y).toBeCloseTo(1/3, 10);
      expect(result.z).toBeCloseTo(0, 10);
    });
  });

  describe('isFront', () => {
    test('returns true when position is on the front side of the face', () => {
      const { face } = createSingleTriangle();

      // Normal is (0,0,1), so a point at z=1 is in front
      const frontPosition = new Vector3(0, 0, 1);
      expect(face.isFront(frontPosition)).toBe(true);
    });

    test('returns false when position is on the back side of the face', () => {
      const { face } = createSingleTriangle();

      // Normal is (0,0,1), so a point at z=-1 is behind
      const backPosition = new Vector3(0, 0, -1);
      expect(face.isFront(backPosition)).toBe(false);
    });

    test('returns true when position is on the plane (dot product is 0)', () => {
      const { face } = createSingleTriangle();

      // A point in the same plane — dot product with normal is exactly 0,
      // and isFront uses >= 0, so it should return true
      const planePosition = new Vector3(0.5, 0.5, 0);
      expect(face.isFront(planePosition)).toBe(true);
    });
  });

  describe('hasVertex', () => {
    test('returns true for each vertex in the face', () => {
      const { face, v0, v1, v2 } = createSingleTriangle();

      expect(face.hasVertex(v0)).toBe(true);
      expect(face.hasVertex(v1)).toBe(true);
      expect(face.hasVertex(v2)).toBe(true);
    });

    test('returns false for a vertex not in the face', () => {
      const { struct, face } = createSingleTriangle();
      const otherVertex = struct.addVertex(new Vector3(5, 5, 5));

      expect(face.hasVertex(otherVertex)).toBe(false);
    });
  });

  describe('halfedgeFromVertex', () => {
    test('returns the correct halfedge starting from v0', () => {
      const { face, v0, v0v1 } = createSingleTriangle();

      const result = face.halfedgeFromVertex(v0);
      expect(result).toBe(v0v1);
    });

    test('returns the correct halfedge starting from v1', () => {
      const { face, v1, v1v2 } = createSingleTriangle();

      const result = face.halfedgeFromVertex(v1);
      expect(result).toBe(v1v2);
    });

    test('returns the correct halfedge starting from v2', () => {
      const { face, v2, v2v0 } = createSingleTriangle();

      const result = face.halfedgeFromVertex(v2);
      expect(result).toBe(v2v0);
    });

    test('returns null for a vertex not in the face', () => {
      const { struct, face } = createSingleTriangle();
      const otherVertex = struct.addVertex(new Vector3(5, 5, 5));

      expect(face.halfedgeFromVertex(otherVertex)).toBeNull();
    });
  });

  describe('vertexFromPosition', () => {
    test('returns v0 when searching for position (0,0,0)', () => {
      const { face, v0 } = createSingleTriangle();

      const result = face.vertexFromPosition(new Vector3(0, 0, 0));
      expect(result).toBe(v0);
    });

    test('returns v1 when searching for position (1,0,0)', () => {
      const { face, v1 } = createSingleTriangle();

      const result = face.vertexFromPosition(new Vector3(1, 0, 0));
      expect(result).toBe(v1);
    });

    test('returns v2 when searching for position (0,1,0)', () => {
      const { face, v2 } = createSingleTriangle();

      const result = face.vertexFromPosition(new Vector3(0, 1, 0));
      expect(result).toBe(v2);
    });

    test('returns null when no vertex matches the position', () => {
      const { face } = createSingleTriangle();

      const result = face.vertexFromPosition(new Vector3(5, 5, 5));
      expect(result).toBeNull();
    });

    test('returns vertex when position is within tolerance', () => {
      const { face, v0 } = createSingleTriangle();

      // Offset by a tiny amount within default tolerance (1e-10)
      const nearV0 = new Vector3(1e-11, 1e-11, 1e-11);
      expect(face.vertexFromPosition(nearV0)).toBe(v0);
    });

    test('returns null when position exceeds tolerance', () => {
      const { face } = createSingleTriangle();

      // Offset by more than default tolerance
      const tooFar = new Vector3(0.01, 0, 0);
      expect(face.vertexFromPosition(tooFar, 1e-10)).toBeNull();
    });
  });

  describe('halfedgeFromPosition', () => {
    test('returns the halfedge containing a point on edge v0-v1', () => {
      const { face, v0v1 } = createSingleTriangle();

      // Point at midpoint of edge from (0,0,0) to (1,0,0)
      const midpoint = new Vector3(0.5, 0, 0);
      const result = face.halfedgeFromPosition(midpoint);
      expect(result).toBe(v0v1);
    });

    test('returns the halfedge containing a point on edge v1-v2', () => {
      const { face, v1v2 } = createSingleTriangle();

      // Midpoint of edge from (1,0,0) to (0,1,0) is (0.5, 0.5, 0)
      const midpoint = new Vector3(0.5, 0.5, 0);
      const result = face.halfedgeFromPosition(midpoint);
      expect(result).toBe(v1v2);
    });

    test('returns the halfedge containing a point on edge v2-v0', () => {
      const { face, v2v0 } = createSingleTriangle();

      // Midpoint of edge from (0,1,0) to (0,0,0) is (0, 0.5, 0)
      const midpoint = new Vector3(0, 0.5, 0);
      const result = face.halfedgeFromPosition(midpoint);
      expect(result).toBe(v2v0);
    });

    test('returns null for a point not on any edge', () => {
      const { face } = createSingleTriangle();

      // Point inside the triangle, not on any edge
      const interior = new Vector3(0.2, 0.2, 0);
      expect(face.halfedgeFromPosition(interior)).toBeNull();
    });

    test('returns null for a point far from the face', () => {
      const { face } = createSingleTriangle();

      expect(face.halfedgeFromPosition(new Vector3(5, 5, 5))).toBeNull();
    });
  });

});
