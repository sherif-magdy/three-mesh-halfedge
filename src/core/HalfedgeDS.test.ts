import { Vector3 } from 'three';
import { BufferGeometry, BoxGeometry } from 'three';
import { HalfedgeDS } from './HalfedgeDS';
import { createSingleTriangle, createDoubleTriangle, createOpenFan, createClosedTetrahedron } from '../utils/fixtures';
import { countBoundaryLoops, countFaceLoops } from '../utils/topologyValidation';

describe('HalfedgeDS', () => {

  describe('clear', () => {
    it('empties all three arrays', () => {
      const { struct } = createSingleTriangle();
      expect(struct.faces).toHaveLength(1);
      expect(struct.halfedges.length).toBeGreaterThan(0);
      expect(struct.vertices.length).toBeGreaterThan(0);

      struct.clear();

      expect(struct.faces).toHaveLength(0);
      expect(struct.halfedges).toHaveLength(0);
      expect(struct.vertices).toHaveLength(0);
    });

    it('structure is reusable after clear', () => {
      const { struct } = createSingleTriangle();
      struct.clear();

      expect(struct.faces).toHaveLength(0);

      // Rebuild a triangle on the cleared structure
      const v0 = struct.addVertex(new Vector3(0, 0, 0));
      const v1 = struct.addVertex(new Vector3(1, 0, 0));
      const v2 = struct.addVertex(new Vector3(0, 1, 0));

      const e01 = struct.addEdge(v0, v1);
      const e12 = struct.addEdge(v1, v2);
      const e20 = struct.addEdge(v2, v0);

      struct.addFace([e01, e12, e20]);

      expect(struct.faces).toHaveLength(1);
      expect(struct.vertices).toHaveLength(3);
      expect(struct.halfedges).toHaveLength(6);
    });
  });

  describe('loops', () => {
    it('returns correct count for single triangle (2 loops: 1 face + 1 boundary)', () => {
      const { struct } = createSingleTriangle();
      const loops = struct.loops();
      expect(loops).toHaveLength(2);
      expect(countFaceLoops(struct)).toBe(1);
      expect(countBoundaryLoops(struct)).toBe(1);
    });

    it('returns correct count for double triangle (3 loops: 2 face + 1 boundary)', () => {
      const { struct } = createDoubleTriangle();
      const loops = struct.loops();
      expect(loops).toHaveLength(3);
      expect(countFaceLoops(struct)).toBe(2);
      expect(countBoundaryLoops(struct)).toBe(1);
    });

    it('returns correct count for open fan', () => {
      const { struct } = createOpenFan();
      const loops = struct.loops();
      // Open fan: 2 faces + boundary loops around the open region
      expect(countFaceLoops(struct)).toBe(2);
      expect(countBoundaryLoops(struct)).toBeGreaterThan(0);
      expect(loops.length).toBe(countFaceLoops(struct) + countBoundaryLoops(struct));
    });

    it('returns loops for a box geometry (12 faces, boundary loops)', () => {
      const struct = new HalfedgeDS();
      const geo = new BoxGeometry(1, 1, 1);
      struct.setFromGeometry(geo);

      // BoxGeometry has 12 triangular faces (6 quad faces x 2 triangles)
      expect(struct.faces).toHaveLength(12);
      expect(countFaceLoops(struct)).toBe(12);

      // A closed box should have only face loops (no boundary)
      const loops = struct.loops();
      expect(loops).toHaveLength(12);
      expect(countBoundaryLoops(struct)).toBe(0);
    });
  });

  describe('addVertex', () => {
    it('delegates properly and adds a vertex to the structure', () => {
      const struct = new HalfedgeDS();
      const v = struct.addVertex(new Vector3(1, 2, 3));
      expect(struct.vertices).toHaveLength(1);
      expect(v.position.x).toBeCloseTo(1);
      expect(v.position.y).toBeCloseTo(2);
      expect(v.position.z).toBeCloseTo(3);
    });

    it('returns existing vertex when checkDuplicates is true and position matches', () => {
      const struct = new HalfedgeDS();
      const v1 = struct.addVertex(new Vector3(1, 2, 3));
      const v2 = struct.addVertex(new Vector3(1, 2, 3), true);
      expect(v2).toBe(v1);
      expect(struct.vertices).toHaveLength(1);
    });

    it('creates new vertex when checkDuplicates is true but position differs', () => {
      const struct = new HalfedgeDS();
      const v1 = struct.addVertex(new Vector3(1, 2, 3));
      const v2 = struct.addVertex(new Vector3(4, 5, 6), true);
      expect(v2).not.toBe(v1);
      expect(struct.vertices).toHaveLength(2);
    });

    it('returns existing vertex within tolerance', () => {
      const struct = new HalfedgeDS();
      const v1 = struct.addVertex(new Vector3(1, 2, 3));
      const v2 = struct.addVertex(new Vector3(1, 2, 3 + 1e-12), true);
      expect(v2).toBe(v1);
      expect(struct.vertices).toHaveLength(1);
    });
  });

  describe('addEdge', () => {
    it('throws when v1 === v2', () => {
      const struct = new HalfedgeDS();
      const v = struct.addVertex(new Vector3(0, 0, 0));
      expect(() => struct.addEdge(v, v)).toThrow('Vertices v1 and v2 should be different');
    });

    it('throws when vertices are not free (both have all halfedges with faces)', () => {
      // In a closed tetrahedron, every vertex is fully enclosed
      const { struct, v0 } = createClosedTetrahedron();

      // v0 and v1 are already connected, so addEdge would return the existing edge.
      // Add a new vertex to the struct that is isolated (free), but v0 is not free.
      const vNew = struct.addVertex(new Vector3(99, 99, 99));
      // v0 is not free (fully enclosed), so this should throw
      expect(v0.isFree()).toBe(false);
      expect(() => struct.addEdge(v0, vNew)).toThrow('Vertices v1 and v2 are not free');
    });
  });

  describe('addFace', () => {
    it('throws with fewer than 3 halfedges (0)', () => {
      const struct = new HalfedgeDS();
      expect(() => struct.addFace([])).toThrow();
    });

    it('throws with fewer than 3 halfedges (1)', () => {
      const struct = new HalfedgeDS();
      const v0 = struct.addVertex(new Vector3(0, 0, 0));
      const v1 = struct.addVertex(new Vector3(1, 0, 0));
      const e = struct.addEdge(v0, v1);
      expect(() => struct.addFace([e])).toThrow();
    });

    it('throws with fewer than 3 halfedges (2)', () => {
      const struct = new HalfedgeDS();
      const v0 = struct.addVertex(new Vector3(0, 0, 0));
      const v1 = struct.addVertex(new Vector3(1, 0, 0));
      const v2 = struct.addVertex(new Vector3(0, 1, 0));
      const e01 = struct.addEdge(v0, v1);
      const e10 = e01.twin;
      const e12 = struct.addEdge(v1, v2);
      expect(() => struct.addFace([e10, e12])).toThrow();
    });
  });

  describe('cutFace', () => {
    it('throws when v1 === v2', () => {
      const { struct, face, v0 } = createSingleTriangle();
      expect(() => struct.cutFace(face, v0, v0)).toThrow('Vertices v1 and v2 should be different');
    });
  });

  describe('setFromGeometry', () => {
    it('throws when no position attribute', () => {
      const struct = new HalfedgeDS();
      const geo = new BufferGeometry();
      expect(() => struct.setFromGeometry(geo)).toThrow(
        'BufferGeometry does not have a position BufferAttribute.'
      );
    });
  });

  describe('readonly arrays', () => {
    it('faces, vertices, halfedges arrays exist and are populated', () => {
      const { struct } = createSingleTriangle();
      expect(Array.isArray(struct.faces)).toBe(true);
      expect(Array.isArray(struct.vertices)).toBe(true);
      expect(Array.isArray(struct.halfedges)).toBe(true);
      expect(struct.faces).toHaveLength(1);
      expect(struct.vertices).toHaveLength(3);
      // 3 edges x 2 halfedges each = 6
      expect(struct.halfedges).toHaveLength(6);
    });
  });
});
