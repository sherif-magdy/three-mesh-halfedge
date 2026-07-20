import { toGeometry } from '../../src/operations/toGeometry';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import {
  createSingleTriangle,
  createDoubleTriangle,
  createOpenFan,
  createClosedTetrahedron,
} from '../helpers/fixtures';
import {
  BufferGeometry,
  BufferAttribute,
  BoxGeometry,
  SphereGeometry,
  TorusGeometry,
  CylinderGeometry,
  PlaneGeometry,
  Vector3,
} from 'three';
import { generatorSize } from '../helpers/testutils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count the number of triangles in a geometry produced by toGeometry */
function triangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) {
    return index.count / 3;
  }
  // toGeometry always produces indexed output; no index means no triangles
  return 0;
}

/** Extract all vertex positions as an array of Vector3 */
function getPositions(geometry: BufferGeometry): Vector3[] {
  const pos = geometry.getAttribute('position');
  const result: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    result.push(new Vector3().fromBufferAttribute(pos, i));
  }
  return result;
}

/** Get triangle indices as a flat number array */
function getIndices(geometry: BufferGeometry): number[] {
  const index = geometry.getIndex();
  if (!index) return [];
  return Array.from(index.array);
}

// ===========================================================================
// 1. Empty / Edge cases
// ===========================================================================

describe('toGeometry – empty structure', () => {

  test('empty HalfedgeDS produces empty geometry', () => {
    const struct = new HalfedgeDS();
    const geo = toGeometry(struct);

    expect(geo.getAttribute('position').count).toBe(0);
    expect(triangleCount(geo)).toBe(0);
  });

  test('structure with only vertices and no faces produces empty geometry', () => {
    const struct = new HalfedgeDS();
    struct.addVertex(new Vector3(0, 0, 0));
    struct.addVertex(new Vector3(1, 0, 0));
    struct.addVertex(new Vector3(0, 1, 0));

    const geo = toGeometry(struct);
    // No faces → no triangles emitted, but vertices are still in the position buffer
    expect(geo.getAttribute('position').count).toBe(3);
    expect(triangleCount(geo)).toBe(0);
  });

  test('structure with edges but no faces produces empty geometry', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(1, 0, 0));
    struct.addEdge(v0, v1);

    const geo = toGeometry(struct);
    expect(geo.getAttribute('position').count).toBe(2);
    expect(triangleCount(geo)).toBe(0);
  });

});

// ===========================================================================
// 2. Basic single triangle
// ===========================================================================

describe('toGeometry – single triangle', () => {

  const { struct } = createSingleTriangle();
  const geo = toGeometry(struct);

  test('has correct position count', () => {
    expect(geo.getAttribute('position').count).toBe(3);
  });

  test('has 1 triangle', () => {
    expect(triangleCount(geo)).toBe(1);
  });

  test('is indexed', () => {
    expect(geo.getIndex()).not.toBeNull();
  });

  test('preserves vertex positions', () => {
    const positions = getPositions(geo);
    expect(positions.length).toBe(3);

    // v0 = (0,0,0)
    expect(positions[0].x).toBeCloseTo(0, 10);
    expect(positions[0].y).toBeCloseTo(0, 10);
    expect(positions[0].z).toBeCloseTo(0, 10);

    // v1 = (1,0,0)
    expect(positions[1].x).toBeCloseTo(1, 10);
    expect(positions[1].y).toBeCloseTo(0, 10);
    expect(positions[1].z).toBeCloseTo(0, 10);

    // v2 = (0,1,0)
    expect(positions[2].x).toBeCloseTo(0, 10);
    expect(positions[2].y).toBeCloseTo(1, 10);
    expect(positions[2].z).toBeCloseTo(0, 10);
  });

  test('indices form a valid triangle', () => {
    const indices = getIndices(geo);
    expect(indices).toEqual([0, 1, 2]);
  });

  test('method on HalfedgeDS works the same', () => {
    const geoFromMethod = struct.toGeometry();
    expect(geoFromMethod.getAttribute('position').count)
      .toBe(geo.getAttribute('position').count);
    expect(triangleCount(geoFromMethod)).toBe(triangleCount(geo));
  });

});

// ===========================================================================
// 3. Double triangle (shared edge)
// ===========================================================================

describe('toGeometry – double triangle', () => {

  const { struct } = createDoubleTriangle();
  const geo = toGeometry(struct);

  test('has correct position count (4 unique vertices)', () => {
    expect(geo.getAttribute('position').count).toBe(4);
  });

  test('has 2 triangles', () => {
    expect(triangleCount(geo)).toBe(2);
  });

  test('is indexed', () => {
    expect(geo.getIndex()).not.toBeNull();
  });

  test('has 6 indices (2 triangles × 3)', () => {
    const indices = getIndices(geo);
    expect(indices).toHaveLength(6);
  });

  test('preserves all vertex positions', () => {
    const positions = getPositions(geo);
    expect(positions.length).toBe(4);

    // v0 = (0,0,0), v1 = (1,0,0), v2 = (0,1,0), v3 = (0,-1,0)
    expect(positions[0].x).toBeCloseTo(0, 10);
    expect(positions[1].x).toBeCloseTo(1, 10);
    expect(positions[2].y).toBeCloseTo(1, 10);
    expect(positions[3].y).toBeCloseTo(-1, 10);
  });

});

// ===========================================================================
// 4. Closed tetrahedron
// ===========================================================================

describe('toGeometry – closed tetrahedron', () => {

  const { struct } = createClosedTetrahedron();
  const geo = toGeometry(struct);

  test('has 4 vertices', () => {
    expect(geo.getAttribute('position').count).toBe(4);
  });

  test('has 4 triangles (4 faces)', () => {
    expect(triangleCount(geo)).toBe(4);
  });

  test('has 12 indices (4 triangles × 3)', () => {
    const indices = getIndices(geo);
    expect(indices).toHaveLength(12);
  });

});

// ===========================================================================
// 5. Open fan (some boundary edges, not all halfedges have faces)
// ===========================================================================

describe('toGeometry – open fan', () => {

  const { struct } = createOpenFan();
  const geo = toGeometry(struct);

  test('only emits faces (not boundary edges)', () => {
    // Open fan has 2 faces
    expect(triangleCount(geo)).toBe(2);
  });

  test('has 5 vertices', () => {
    expect(geo.getAttribute('position').count).toBe(5);
  });

});

// ===========================================================================
// 6. After splitEdge
// ===========================================================================

describe('toGeometry – after splitEdge', () => {

  test('splitting an edge increases vertex count and preserves triangles', () => {
    const { struct, v0v1 } = createSingleTriangle();
    const midPoint = new Vector3(0.5, 0, 0);
    struct.splitEdge(v0v1, midPoint);

    expect(struct.vertices).toHaveLength(4);
    expect(struct.faces).toHaveLength(1);

    const geo = toGeometry(struct);

    // 4 vertices, still 1 face which is now a quad → 2 triangles
    expect(geo.getAttribute('position').count).toBe(4);
    expect(triangleCount(geo)).toBe(2);

    // Verify the new vertex position is in the geometry
    const positions = getPositions(geo);
    const hasMidpoint = positions.some(
      p => Math.abs(p.x - 0.5) < 1e-6 && Math.abs(p.y) < 1e-6 && Math.abs(p.z) < 1e-6,
    );
    expect(hasMidpoint).toBe(true);
  });

  test('splitting multiple edges on a tetrahedron', () => {
    const { struct, v0v1, v1v2 } = createClosedTetrahedron();

    struct.splitEdge(v0v1, new Vector3(0.5, 0, 0));
    struct.splitEdge(v1v2, new Vector3(0.75, 0, 0.433));

    expect(struct.vertices).toHaveLength(6); // 4 original + 2 new

    const geo = toGeometry(struct);

    // 6 vertices in the position buffer
    expect(geo.getAttribute('position').count).toBe(6);

    // Compute expected triangles from actual face loop sizes
    let expectedTris = 0;
    for (const face of struct.faces) {
      const loopSize = generatorSize(face.halfedge.nextLoop());
      expectedTris += loopSize - 2; // fan triangulation: n-2 triangles per n-gon
    }
    expect(triangleCount(geo)).toBe(expectedTris);
  });

});

// ===========================================================================
// 7. After cutFace (creates n-gon faces)
// ===========================================================================

describe('toGeometry – after cutFace', () => {

  test('cutting a triangle creates a quad + triangle', () => {
    // Create a triangle with v0(0,0,0) v1(1,0,0) v2(0,1,0)
    const { struct, v1, face, v2v0 } = createSingleTriangle();

    // Add a new vertex on edge v0-v2 midpoint → split edge first
    const midV2V0 = new Vector3(0, 0.5, 0);
    const splitVert = struct.splitEdge(v2v0, midV2V0);

    // Now cut the face between v1 and splitVert
    struct.cutFace(face, v1, splitVert, true);

    // After cutFace, we should have 2 faces
    expect(struct.faces).toHaveLength(2);

    const geo = toGeometry(struct);

    // 4 vertices
    expect(geo.getAttribute('position').count).toBe(4);
    // 2 faces, both triangles → 2 triangles
    expect(triangleCount(geo)).toBe(2);
  });

  test('cutFace producing a quad face (4 vertices)', () => {
    // Build a quad manually by cutting a larger polygon
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(2, 0, 0));
    const v2 = struct.addVertex(new Vector3(2, 2, 0));
    const v3 = struct.addVertex(new Vector3(0, 2, 0));

    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);
    const v2v3 = struct.addEdge(v2, v3);
    const v3v0 = struct.addEdge(v3, v0);
    struct.addFace([v0v1, v1v2, v2v3, v3v0]);

    const geo = toGeometry(struct);

    // Quad → fan triangulated to 2 triangles
    expect(geo.getAttribute('position').count).toBe(4);
    expect(triangleCount(geo)).toBe(2);
  });

});

// ===========================================================================
// 8. After removeFace
// ===========================================================================

describe('toGeometry – after removeFace', () => {

  test('removing a face from double triangle', () => {
    const { struct, face0 } = createDoubleTriangle();

    struct.removeFace(face0);

    expect(struct.faces).toHaveLength(1);

    const geo = toGeometry(struct);

    expect(triangleCount(geo)).toBe(1);
    expect(geo.getAttribute('position').count).toBe(4); // vertices still exist
  });

  test('removing all faces gives empty geometry', () => {
    const { struct, face } = createSingleTriangle();

    struct.removeFace(face);

    const geo = toGeometry(struct);

    expect(triangleCount(geo)).toBe(0);
  });

});

// ===========================================================================
// 9. After removeEdge
// ===========================================================================

describe('toGeometry – after removeEdge', () => {

  test('removing a boundary edge from double triangle', () => {
    const { struct, v1v2 } = createDoubleTriangle();

    // v1v2 is on the boundary of face0 (not shared between face0 and face1)
    struct.removeEdge(v1v2, false);

    // After removing the edge (no merge), face0 is gone, face1 remains
    const geo = toGeometry(struct);

    expect(triangleCount(geo)).toBe(1);
  });

});

// ===========================================================================
// 10. After removeVertex
// ===========================================================================

describe('toGeometry – after removeVertex', () => {

  test('removing an isolated vertex does not affect geometry output', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(1, 0, 0));
    const v2 = struct.addVertex(new Vector3(0, 1, 0));
    const v3 = struct.addVertex(new Vector3(5, 5, 5)); // isolated

    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);
    const v2v0 = struct.addEdge(v2, v0);
    struct.addFace([v0v1, v1v2, v2v0]);

    struct.removeVertex(v3);

    const geo = toGeometry(struct);

    expect(geo.getAttribute('position').count).toBe(3);
    expect(triangleCount(geo)).toBe(1);
  });

});

// ===========================================================================
// 11. Roundtrip: BufferGeometry → HalfedgeDS → BufferGeometry
// ===========================================================================

describe('toGeometry – roundtrip', () => {

  test('single triangle roundtrip', () => {
    const array = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const original = new BufferGeometry();
    original.setAttribute('position', new BufferAttribute(array, 3));

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    expect(triangleCount(result)).toBe(1);
    expect(result.getAttribute('position').count).toBe(3);

    // Verify positions match
    const origPos = original.getAttribute('position');
    const resPos = result.getAttribute('position');
    for (let i = 0; i < 3; i++) {
      expect(resPos.getX(i)).toBeCloseTo(origPos.getX(i), 5);
      expect(resPos.getY(i)).toBeCloseTo(origPos.getY(i), 5);
      expect(resPos.getZ(i)).toBeCloseTo(origPos.getZ(i), 5);
    }
  });

  test('BoxGeometry roundtrip', () => {
    const original = new BoxGeometry(1, 1, 1);

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    // Box has 12 triangles and 8 unique vertices
    expect(triangleCount(result)).toBe(12);
    expect(result.getAttribute('position').count).toBe(8);

    // Verify all original positions are present in the result
    const origPositions = getPositions(original);
    const resultPositions = getPositions(result);

    for (const orig of origPositions) {
      const found = resultPositions.some(
        r => r.distanceTo(orig) < 1e-6,
      );
      expect(found).toBe(true);
    }
  });

  test('SphereGeometry roundtrip preserves face count', () => {
    const original = new SphereGeometry(1, 8, 6);

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    // After halfedge processing, vertices are deduplicated but face count is preserved
    expect(triangleCount(result)).toBe(struct.faces.length);
  });

  test('TorusGeometry roundtrip preserves face count', () => {
    const original = new TorusGeometry(1, 0.4, 4, 6);

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    expect(triangleCount(result)).toBe(struct.faces.length);
  });

  test('PlaneGeometry roundtrip', () => {
    const original = new PlaneGeometry(2, 2, 2, 2);

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    expect(triangleCount(result)).toBe(struct.faces.length);
  });

  test('CylinderGeometry (open) roundtrip', () => {
    const original = new CylinderGeometry(1, 1, 2, 8, 1, true);

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    expect(triangleCount(result)).toBe(struct.faces.length);
  });

  test('indexed geometry roundtrip', () => {
    // Create an indexed geometry
    const positions = new Float32Array([
      0, 0, 0,  // v0
      1, 0, 0,  // v1
      0, 1, 0,  // v2
      1, 1, 0,  // v3
    ]);
    const indices = [0, 1, 2, 1, 3, 2]; // 2 triangles sharing an edge

    const original = new BufferGeometry();
    original.setAttribute('position', new BufferAttribute(positions, 3));
    original.setIndex(indices);

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    expect(triangleCount(result)).toBe(2);
    expect(result.getAttribute('position').count).toBe(4);
  });

});

// ===========================================================================
// 12. Non-indexed geometry input → halfedge → toGeometry
// ===========================================================================

describe('toGeometry – from non-indexed geometry', () => {

  test('non-indexed geometry with shared vertices gets indexed output', () => {
    const array = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,  // triangle 1
      1, 0, 0, 2, 0, 0, 1, 1, 0,  // triangle 2
    ]);
    const original = new BufferGeometry();
    original.setAttribute('position', new BufferAttribute(array, 3));

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    // Should produce indexed geometry (shared vertices deduplicated)
    expect(result.getIndex()).not.toBeNull();
    expect(triangleCount(result)).toBe(2);

    // 5 unique vertices: (0,0,0), (1,0,0), (0,1,0), (2,0,0), (1,1,0)
    expect(result.getAttribute('position').count).toBe(5);
  });

});

// ===========================================================================
// 13. n-gon faces (from multiple cutFace operations)
// ===========================================================================

describe('toGeometry – n-gon face triangulation', () => {

  test('pentagon (5 vertices) produces 3 triangles', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(1, 0, 0));
    const v2 = struct.addVertex(new Vector3(1.5, 0.7, 0));
    const v3 = struct.addVertex(new Vector3(0.5, 1.2, 0));
    const v4 = struct.addVertex(new Vector3(-0.5, 0.5, 0));

    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);
    const v2v3 = struct.addEdge(v2, v3);
    const v3v4 = struct.addEdge(v3, v4);
    const v4v0 = struct.addEdge(v4, v0);
    struct.addFace([v0v1, v1v2, v2v3, v3v4, v4v0]);

    const geo = toGeometry(struct);

    expect(geo.getAttribute('position').count).toBe(5);
    expect(triangleCount(geo)).toBe(3); // Fan: (0,1,2), (0,2,3), (0,3,4)
  });

  test('hexagon (6 vertices) produces 4 triangles', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(1, 0, 0));
    const v1 = struct.addVertex(new Vector3(0.5, 0.866, 0));
    const v2 = struct.addVertex(new Vector3(-0.5, 0.866, 0));
    const v3 = struct.addVertex(new Vector3(-1, 0, 0));
    const v4 = struct.addVertex(new Vector3(-0.5, -0.866, 0));
    const v5 = struct.addVertex(new Vector3(0.5, -0.866, 0));

    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);
    const v2v3 = struct.addEdge(v2, v3);
    const v3v4 = struct.addEdge(v3, v4);
    const v4v5 = struct.addEdge(v4, v5);
    const v5v0 = struct.addEdge(v5, v0);
    struct.addFace([v0v1, v1v2, v2v3, v3v4, v4v5, v5v0]);

    const geo = toGeometry(struct);

    expect(geo.getAttribute('position').count).toBe(6);
    expect(triangleCount(geo)).toBe(4); // Fan: (0,1,2), (0,2,3), (0,3,4), (0,4,5)
  });

  test('mixed triangle and quad faces', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(1, 0, 0));
    const v2 = struct.addVertex(new Vector3(1, 1, 0));
    const v3 = struct.addVertex(new Vector3(0, 1, 0));
    const v4 = struct.addVertex(new Vector3(2, 0, 0));
    const v5 = struct.addVertex(new Vector3(2, 1, 0));

    // Quad face: v0→v1→v2→v3
    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);
    const v2v3 = struct.addEdge(v2, v3);
    const v3v0 = struct.addEdge(v3, v0);
    struct.addFace([v0v1, v1v2, v2v3, v3v0]);

    // Triangle face: v2→v1→v4→v5 (v2→v1 via v1v2.twin)
    const v4v5 = struct.addEdge(v4, v5);
    const v5v2 = struct.addEdge(v5, v2);
    struct.addFace([v1v2.twin, struct.addEdge(v1, v4), v4v5, v5v2]);

    const geo = toGeometry(struct);

    // Quad (4 verts) → 2 triangles, Quad (4 verts) → 2 triangles = 4 total
    expect(triangleCount(geo)).toBe(4);
    expect(geo.getAttribute('position').count).toBe(6);
  });

});

// ===========================================================================
// 14. Fan triangulation correctness
// ===========================================================================

describe('toGeometry – fan triangulation winding order', () => {

  test('quad indices follow correct fan pattern', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(1, 0, 0));
    const v2 = struct.addVertex(new Vector3(1, 1, 0));
    const v3 = struct.addVertex(new Vector3(0, 1, 0));

    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);
    const v2v3 = struct.addEdge(v2, v3);
    const v3v0 = struct.addEdge(v3, v0);
    struct.addFace([v0v1, v1v2, v2v3, v3v0]);

    const geo = toGeometry(struct);
    const indices = getIndices(geo);

    // Fan from v0: triangles (v0, v1, v2) and (v0, v2, v3)
    expect(indices).toEqual([0, 1, 2, 0, 2, 3]);
  });

});

// ===========================================================================
// 15. Vertex position preservation
// ===========================================================================

describe('toGeometry – vertex position precision', () => {

  test('high-precision coordinates are preserved', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0.123456789, 0.987654321, 0.111222333));
    const v1 = struct.addVertex(new Vector3(1.0, 2.0, 3.0));
    const v2 = struct.addVertex(new Vector3(-0.5, -1.5, 0.0));

    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);
    const v2v0 = struct.addEdge(v2, v0);
    struct.addFace([v0v1, v1v2, v2v0]);

    const geo = toGeometry(struct);
    const positions = getPositions(geo);

    expect(positions[0].x).toBeCloseTo(0.123456789, 6);
    expect(positions[0].y).toBeCloseTo(0.987654321, 6);
    expect(positions[0].z).toBeCloseTo(0.111222333, 6);

    expect(positions[1].x).toBeCloseTo(1.0, 10);
    expect(positions[1].y).toBeCloseTo(2.0, 10);
    expect(positions[1].z).toBeCloseTo(3.0, 10);

    expect(positions[2].x).toBeCloseTo(-0.5, 10);
    expect(positions[2].y).toBeCloseTo(-1.5, 10);
    expect(positions[2].z).toBeCloseTo(0.0, 10);
  });

  test('negative coordinates are preserved', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(-100, -200, -300));
    const v1 = struct.addVertex(new Vector3(-50, 0, 50));
    const v2 = struct.addVertex(new Vector3(0, -100, 100));

    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);
    const v2v0 = struct.addEdge(v2, v0);
    struct.addFace([v0v1, v1v2, v2v0]);

    const geo = toGeometry(struct);
    const positions = getPositions(geo);

    expect(positions[0].x).toBeCloseTo(-100, 5);
    expect(positions[0].y).toBeCloseTo(-200, 5);
    expect(positions[0].z).toBeCloseTo(-300, 5);
  });

});

// ===========================================================================
// 16. Complex scenario: multiple operations then convert
// ===========================================================================

describe('toGeometry – complex operation chains', () => {

  test('setFromGeometry → cutFace → toGeometry', () => {
    // Create a quad from two triangles
    const array = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,  // triangle 1
      0, 0, 0, 0, 1, 0, 1, 1, 0,  // triangle 2
    ]);
    const original = new BufferGeometry();
    original.setAttribute('position', new BufferAttribute(array, 3));

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);

    // 2 faces
    expect(struct.faces).toHaveLength(2);

    const geo = toGeometry(struct);
    expect(triangleCount(geo)).toBe(2);
  });

  test('setFromGeometry → splitEdge → cutFace → toGeometry', () => {
    const array = new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    const original = new BufferGeometry();
    original.setAttribute('position', new BufferAttribute(array, 3));

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);

    // Find a halfedge to split
    const face = struct.faces[0];
    const he = face.halfedge;
    const midPoint = new Vector3(1, 0, 0);

    struct.splitEdge(he, midPoint);

    // Now we have a quad face (4 vertices in the loop)
    expect(struct.faces).toHaveLength(1);
    const loopSize = generatorSize(face.halfedge.nextLoop());
    expect(loopSize).toBe(4);

    const geo = toGeometry(struct);

    // Quad → 2 triangles
    expect(triangleCount(geo)).toBe(2);
    expect(geo.getAttribute('position').count).toBe(4);
  });

  test('BoxGeometry → removeFace → toGeometry', () => {
    const original = new BoxGeometry(1, 1, 1);
    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);

    expect(struct.faces).toHaveLength(12);

    // Remove one face
    struct.removeFace(struct.faces[0]);
    expect(struct.faces).toHaveLength(11);

    const geo = toGeometry(struct);
    expect(triangleCount(geo)).toBe(11);
    expect(geo.getAttribute('position').count).toBe(8); // vertices still there
  });

  test('BoxGeometry → splitEdge → toGeometry increases triangles', () => {
    const original = new BoxGeometry(1, 1, 1);
    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);

    // Original: 12 triangles
    expect(struct.faces).toHaveLength(12);

    // Split one edge
    const face = struct.faces[0];
    const he = face.halfedge;
    const midpoint = new Vector3().lerpVectors(
      he.vertex.position,
      he.twin.vertex.position,
      0.5,
    );
    struct.splitEdge(he, midpoint);

    // In a closed mesh every edge is shared by two faces. Splitting inserts
    // the new vertex into BOTH adjacent face loops, so each triangle becomes
    // a quad (→ 2 triangles each): 2 + 2 = 4 triangles, plus the 10 untouched
    // faces = 14 total. (Prior to the splitEdge fix, only one face's loop was
    // updated, yielding the incorrect 13.)
    expect(triangleCount(toGeometry(struct))).toBe(14);
  });

});

// ===========================================================================
// 17. Stress: larger meshes
// ===========================================================================

describe('toGeometry – larger meshes', () => {

  test('SphereGeometry(2, 32, 16) roundtrip', () => {
    const original = new SphereGeometry(2, 32, 16);

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    expect(triangleCount(result)).toBe(struct.faces.length);
  });

  test('TorusGeometry(3, 1, 16, 32) roundtrip', () => {
    const original = new TorusGeometry(3, 1, 16, 32);

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    expect(triangleCount(result)).toBe(struct.faces.length);
  });

});
