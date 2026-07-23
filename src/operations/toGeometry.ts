import { BufferAttribute, BufferGeometry } from 'three';
import { HalfedgeDS } from '../core/HalfedgeDS';
import { Halfedge } from '../core/Halfedge';
import { Vertex } from '../core/Vertex';
import { AttributeLayer } from '../core/AttributeLayer';

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
 * ## Per-corner attributes
 *
 * When the structure carries attribute layers (`uv`/`normal`/`tangent`/...),
 * each is emitted as a `BufferAttribute` alongside `position`. Because
 * attributes are per-corner (a hard-edge corner can differ from its welded
 * vertex's other corners), the output is **un-welded by unique
 * (position + attribute) row**: two corners share an index only when their
 * position AND every attribute value are identical. This round-trips authored
 * UV/normal/tangent data — including hard-edge splits — back to a BufferGeometry
 * with parity for untouched geometry.
 *
 * With no layers, the legacy indexed-by-vertex layout (8 positions for a cube,
 * all vertices included) is used unchanged.
 *
 * @param struct The halfedge data structure to convert
 * @returns A new indexed BufferGeometry
 */
export function toGeometry(struct: HalfedgeDS): BufferGeometry {

  const geometry = new BufferGeometry();

  const layers = struct.getAttributeNames()
    .map((name) => struct.getAttribute(name))
    .filter((layer): layer is AttributeLayer => layer !== null);

  if (layers.length > 0) {
    return emitWithAttributes(struct, geometry, layers);
  }

  // --- Legacy path: no attribute layers ---------------------------------

  // Map each Vertex to an index in the position buffer.
  const vertexToIndex = new Map<Vertex, number>();
  const positions: number[] = [];

  for (const vertex of struct.vertices) {
    const index = positions.length / 3;
    vertexToIndex.set(vertex, index);
    positions.push(vertex.position.x, vertex.position.y, vertex.position.z);
  }

  const indices: number[] = [];

  for (const face of struct.faces) {
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
    const v0Index = vertexToIndex.get(faceVertices[0])!;

    for (let i = 1; i < n - 1; i++) {
      const v1Index = vertexToIndex.get(faceVertices[i])!;
      const v2Index = vertexToIndex.get(faceVertices[i + 1])!;
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

/**
 * Emits an un-welded, attribute-carrying indexed geometry.
 *
 * One vertex row per unique (position + attribute) corner tuple; the index
 * buffer fan-triangulates each face. Round-trips per-corner UV/normal/tangent
 * (hard-edge splits included) for untouched geometry.
 */
function emitWithAttributes(
    struct: HalfedgeDS,
    geometry: BufferGeometry,
    layers: AttributeLayer[]): BufferGeometry {

  const positions: number[] = [];
  const layerBuffers = new Map<string, number[]>();
  for (const layer of layers) {
    layerBuffers.set(layer.name, []);
  }

  // unique row key -> row index (row = positions.length/3 at insertion)
  const rowIndex = new Map<string, number>();
  const indices: number[] = [];

  /**
   * Returns the row index for `he`'s corner, creating it (position + every
   * attribute value) on first sight. Corners coincide only when their position
   * and all attribute values are identical — the granularity hard-edge parity
   * requires.
   */
  const rowForCorner = (he: Halfedge): number => {
    const p = he.vertex.position;
    const heIdx = struct.halfedgeIndex(he);
    let key = `${p.x}|${p.y}|${p.z}`;
    for (const layer of layers) {
      const base = heIdx * layer.itemSize;
      for (let c = 0; c < layer.itemSize; c++) {
        key += '|' + layer.data[base + c];
      }
    }
    const existing = rowIndex.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const row = positions.length / 3;
    positions.push(p.x, p.y, p.z);
    for (const layer of layers) {
      const base = heIdx * layer.itemSize;
      const buf = layerBuffers.get(layer.name)!;
      for (let c = 0; c < layer.itemSize; c++) {
        buf.push(layer.data[base + c]);
      }
    }
    rowIndex.set(key, row);
    return row;
  };

  for (const face of struct.faces) {
    const corners: Halfedge[] = [];
    for (const he of face.halfedge.nextLoop()) {
      corners.push(he);
    }
    const n = corners.length;
    if (n < 3) {
      continue;
    }

    const rows = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      rows[i] = rowForCorner(corners[i]);
    }

    // Fan triangulation: (v0, vi, vi+1) for i in [1, n-1).
    for (let i = 1; i < n - 1; i++) {
      indices.push(rows[0], rows[i], rows[i + 1]);
    }
  }

  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  for (const layer of layers) {
    geometry.setAttribute(
      layer.name,
      new BufferAttribute(new Float32Array(layerBuffers.get(layer.name)!), layer.itemSize));
  }
  if (indices.length > 0) {
    geometry.setIndex(indices);
  }

  return geometry;
}
