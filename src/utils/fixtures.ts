/*
 * Shared test fixtures for building common halfedge topologies.
 * Each factory returns the HalfedgeDS plus named references to key elements.
 */

import { Vector3 } from 'three';
import { HalfedgeDS } from '../core/HalfedgeDS';

const _v = new Vector3();

/**
 * Creates a single triangle mesh:
 *       v2
 *       | \
 *       |   \
 *      v0 --- v1
 *
 * Vertices at (0,0,0), (1,0,0), (0,1,0) with one face.
 */
export function createSingleTriangle() {
  const struct = new HalfedgeDS();
  const v0 = struct.addVertex(_v.set(0, 0, 0));
  const v1 = struct.addVertex(_v.set(1, 0, 0));
  const v2 = struct.addVertex(_v.set(0, 1, 0));

  const v0v1 = struct.addEdge(v0, v1);
  const v1v2 = struct.addEdge(v1, v2);
  const v2v0 = struct.addEdge(v2, v0);

  const face = struct.addFace([v0v1, v1v2, v2v0])!;

  return { struct, v0, v1, v2, v0v1, v1v2, v2v0, face };
}

/**
 * Creates two adjacent triangles sharing edge v0-v1:
 *       v2
 *       | \
 *       |   \
 *       |  f0 \
 *      v0 ---- v1
 *       |  f1 /
 *       |   /
 *       | /
 *       v3
 *
 * First triangle in xy-plane, second below the shared edge.
 */
export function createDoubleTriangle() {
  const struct = new HalfedgeDS();
  const v0 = struct.addVertex(_v.set(0, 0, 0));
  const v1 = struct.addVertex(_v.set(1, 0, 0));
  const v2 = struct.addVertex(_v.set(0, 1, 0));
  const v3 = struct.addVertex(_v.set(0, -1, 0));

  const v0v1 = struct.addEdge(v0, v1);
  const v1v2 = struct.addEdge(v1, v2);
  const v2v0 = struct.addEdge(v2, v0);
  const face0 = struct.addFace([v0v1, v1v2, v2v0])!;

  // For the second triangle, we reuse the v0v1 edge (twin side)
  // Chain: v1->v0 (v0v1.twin), v0->v3 (v3v0.twin), v3->v1 (v1v3.twin)
  const v1v3 = struct.addEdge(v1, v3);
  const v3v0 = struct.addEdge(v3, v0);
  const face1 = struct.addFace([v0v1.twin, v3v0.twin, v1v3.twin])!;

  return { struct, v0, v1, v2, v3, v0v1, v1v2, v2v0, v1v3, v3v0, face0, face1 };
}

/**
 * Creates a triangle fan with a center vertex and boundary vertices.
 * Only f0 and f1 have faces, f2 is open (for boundary testing):
 *
 *        v3
 *       /| \
 *      / |  \
 *     / f2   \
 *    /  |  f1  \
 *   v2--c--v1
 *      f0
 * (c = center)
 *
 * c at (0,0,0), v0 at (1,0,0), v1 at (0,1,0), v2 at (-1,0,0), v3 at (0,-1,0)
 */
export function createOpenFan() {
  const struct = new HalfedgeDS();
  const c = struct.addVertex(_v.set(0, 0, 0));
  const v0 = struct.addVertex(_v.set(1, 0, 0));
  const v1 = struct.addVertex(_v.set(0, 1, 0));
  const v2 = struct.addVertex(_v.set(-1, 0, 0));
  const v3 = struct.addVertex(_v.set(0, -1, 0));

  // Edge c-v0
  const cv0 = struct.addEdge(c, v0);
  // Edge c-v1
  const cv1 = struct.addEdge(c, v1);
  // Close triangle c-v0-v1 (f0)
  const v0v1 = struct.addEdge(v0, v1);
  const f0 = struct.addFace([cv0, v0v1, cv1.twin])!;

  // Edge c-v2
  const cv2 = struct.addEdge(c, v2);
  // Close triangle c-v1-v2 (f1)
  const v1v2 = struct.addEdge(v1, v2);
  const f1 = struct.addFace([cv1, v1v2, cv2.twin])!;

  // Edge c-v3 (no face — open)
  const cv3 = struct.addEdge(c, v3);
  // Edge v3-v2 (no face — open)
  const v3v2 = struct.addEdge(v3, v2);

  return {
    struct, c, v0, v1, v2, v3,
    cv0, cv1, cv2, cv3, v0v1, v1v2, v3v2,
    f0, f1,
    faces: [f0, f1],
  };
}

/**
 * Creates a closed tetrahedron with 4 triangular faces, no boundaries.
 *
 *    v3 (top)
 *   /|\ \
 *  / | \ \
 * v0-+--v1
 *  \ | /
 *   v2
 *
 * v0=(0,0,0), v1=(1,0,0), v2=(0.5,0,0.866), v3=(0.5,0.816,0.289)
 */
export function createClosedTetrahedron() {
  const struct = new HalfedgeDS();
  const v0 = struct.addVertex(_v.set(0, 0, 0));
  const v1 = struct.addVertex(_v.set(1, 0, 0));
  const v2 = struct.addVertex(_v.set(0.5, 0, 0.866));
  const v3 = struct.addVertex(_v.set(0.5, 0.816, 0.289));

  // Build all edges
  const v0v1 = struct.addEdge(v0, v1);
  const v1v2 = struct.addEdge(v1, v2);
  const v2v0 = struct.addEdge(v2, v0);
  const v0v3 = struct.addEdge(v0, v3);
  const v1v3 = struct.addEdge(v1, v3);
  const v2v3 = struct.addEdge(v2, v3);

  // Build 4 faces
  // Base: v0 -> v1 -> v2
  const f0 = struct.addFace([v0v1, v1v2, v2v0])!;
  // Front: v1 -> v0 -> v3 (uses twin of v0v1)
  const f1 = struct.addFace([v0v1.twin, v0v3, v1v3.twin])!;
  // Right: v2 -> v1 -> v3 (uses twin of v1v2)
  const f2 = struct.addFace([v1v2.twin, v1v3, v2v3.twin])!;
  // Back: v0 -> v2 -> v3 (uses twin of v2v0)
  const f3 = struct.addFace([v2v0.twin, v2v3, v0v3.twin])!;

  return {
    struct, v0, v1, v2, v3,
    v0v1, v1v2, v2v0, v0v3, v1v3, v2v3,
    f0, f1, f2, f3,
    faces: [f0, f1, f2, f3],
  };
}
