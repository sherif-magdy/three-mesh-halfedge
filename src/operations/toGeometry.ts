import { BufferAttribute, BufferGeometry } from 'three';
import { HalfedgeDS } from '../core/HalfedgeDS';
import { Vertex } from '../core/Vertex';

/**
 * Converts a HalfedgeDS back to a three.js BufferGeometry.
 *
 * Faces with more than 3 vertices (e.g. created by `cutFace`) are
 * triangulated using a fan from the first vertex.
 *
 * The resulting geometry is **indexed**: shared vertices are written once
 * and referenced by an index buffer.
 *
 * Only faces with a non-null face reference are emitted — free/boundary
 * halfedges and removed faces are skipped.
 *
 * All vertices are included in the position buffer (even isolated ones not
 * referenced by any face) to preserve a stable mapping.
 *
 * @param struct The halfedge data structure to convert
 * @returns A new indexed BufferGeometry
 */
export function toGeometry(struct: HalfedgeDS): BufferGeometry {

  const geometry = new BufferGeometry();

  // Map each Vertex to an index in the position buffer.
  const vertexIndexMap = new Map<Vertex, number>();
  const positions: number[] = [];

  for (const vertex of struct.vertices) {
    const index = positions.length / 3;
    vertexIndexMap.set(vertex, index);
    positions.push(vertex.position.x, vertex.position.y, vertex.position.z);
  }

  // Build the index buffer.
  // For each face, walk its halfedge loop to collect vertices.
  // Triangulate n-gons using a fan from the first vertex.
  const indices: number[] = [];

  for (const face of struct.faces) {
    // Collect all vertices of this face in loop order
    const faceVertices: Vertex[] = [];

    for (const he of face.halfedge.nextLoop()) {
      faceVertices.push(he.vertex);
    }

    const n = faceVertices.length;

    if (n < 3) {
      // Degenerate face — skip it
      continue;
    }

    // Fan triangulation: for a polygon with vertices [v0, v1, ..., v(n-1)],
    // produce triangles (v0, v1, v2), (v0, v2, v3), ..., (v0, v(n-2), v(n-1))
    const v0Index = vertexIndexMap.get(faceVertices[0])!;

    for (let i = 1; i < n - 1; i++) {
      const v1Index = vertexIndexMap.get(faceVertices[i])!;
      const v2Index = vertexIndexMap.get(faceVertices[i + 1])!;
      indices.push(v0Index, v1Index, v2Index);
    }
  }

  const positionAttribute = new BufferAttribute(
    new Float32Array(positions),
    3,
  );
  geometry.setAttribute('position', positionAttribute);

  // Only set the index buffer if there are indices (i.e., faces exist)
  if (indices.length > 0) {
    geometry.setIndex(indices);
  }

  return geometry;
}
