import { Vector3 } from 'three';
import { BufferGeometry, BoxGeometry } from 'three';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { Vertex } from '../../src/core/Vertex';
import { createSingleTriangle, createDoubleTriangle, createOpenFan, createClosedTetrahedron } from '../helpers/fixtures';
import { countBoundaryLoops, countFaceLoops, validateHalfedgeConsistency } from '../helpers/topologyValidation';

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

    it('resets vertex IDs so next struct starts from 0', () => {
      // Reset counter to a known state first
      Vertex.resetIdCounter();

      // Build a first structure with some vertices
      const struct1 = new HalfedgeDS();
      struct1.addVertex(new Vector3(0, 0, 0));
      struct1.addVertex(new Vector3(1, 0, 0));
      struct1.addVertex(new Vector3(0, 1, 0));

      // IDs should be sequential: 0, 1, 2
      expect(struct1.vertices[0].id).toBe(0);
      expect(struct1.vertices[1].id).toBe(1);
      expect(struct1.vertices[2].id).toBe(2);

      // Clear resets the counter
      struct1.clear();

      // A new structure after clear gets fresh sequential IDs
      const struct2 = new HalfedgeDS();
      const va = struct2.addVertex(new Vector3(10, 10, 10));
      const vb = struct2.addVertex(new Vector3(20, 20, 20));

      expect(va.id).toBe(0);
      expect(vb.id).toBe(1);

      struct2.clear();
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

  describe('clone / copy', () => {
    it('clone() produces an independent copy with identical counts', () => {
      const { struct } = createClosedTetrahedron();
      const clone = struct.clone();

      expect(clone).not.toBe(struct);
      expect(clone.vertices).toHaveLength(struct.vertices.length);
      expect(clone.halfedges).toHaveLength(struct.halfedges.length);
      expect(clone.faces).toHaveLength(struct.faces.length);

      // Distinct object identities — not shared references
      for (let i = 0; i < struct.vertices.length; i++) {
        expect(clone.vertices[i]).not.toBe(struct.vertices[i]);
      }
      for (let i = 0; i < struct.halfedges.length; i++) {
        expect(clone.halfedges[i]).not.toBe(struct.halfedges[i]);
      }
    });

    it('clone() preserves vertex ids', () => {
      const { struct } = createClosedTetrahedron();
      const clone = struct.clone();

      const originalIds = struct.vertices.map(v => v.id).sort();
      const cloneIds = clone.vertices.map(v => v.id).sort();
      expect(cloneIds).toEqual(originalIds);
    });

    it('clone() preserves vertex positions', () => {
      const { struct } = createClosedTetrahedron();
      const clone = struct.clone();

      const key = (p: Vector3) => p.toArray().map(n => n.toFixed(6)).join(',');
      const original = struct.vertices.map(v => key(v.position)).sort();
      const cloned = clone.vertices.map(v => key(v.position)).sort();
      expect(cloned).toEqual(original);
    });

    it('clone() is independent: mutating the clone does not affect the original', () => {
      const { struct, v0 } = createSingleTriangle();
      const clone = struct.clone();

      const originalPos = v0.position.clone();
      clone.vertices[0].position.set(99, 99, 99);

      expect(v0.position.equals(originalPos)).toBe(true);
    });

    it('clone() preserves full topology consistency (twin/next/prev)', () => {
      const { struct } = createClosedTetrahedron();
      const clone = struct.clone();
      validateHalfedgeConsistency(clone);
    });

    it('clone() of a mesh with boundaries preserves loop counts', () => {
      // Open fan has free/boundary halfedges (face === null) and an isolated
      // edge structure — exercises the null-face and null-halfedge paths in copy.
      const { struct } = createOpenFan();
      const clone = struct.clone();

      expect(clone.vertices).toHaveLength(struct.vertices.length);
      expect(clone.halfedges).toHaveLength(struct.halfedges.length);
      expect(clone.faces).toHaveLength(struct.faces.length);
      expect(countFaceLoops(clone)).toBe(countFaceLoops(struct));
      expect(countBoundaryLoops(clone)).toBe(countBoundaryLoops(struct));
      validateHalfedgeConsistency(clone);
    });

    it('copy() replaces the target structure contents and returns this', () => {
      const { struct } = createClosedTetrahedron();
      const target = new HalfedgeDS();
      // Target starts with its own data, which copy() must wipe
      target.addVertex(new Vector3(0, 0, 0));
      expect(target.vertices).toHaveLength(1);

      const returned = target.copy(struct);
      expect(returned).toBe(target);
      expect(target.vertices).toHaveLength(struct.vertices.length);
      expect(target.faces).toHaveLength(struct.faces.length);
      validateHalfedgeConsistency(target);
    });
  });
});
