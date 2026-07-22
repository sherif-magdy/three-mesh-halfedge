import { BufferAttribute, Vector3 } from "three";
import { Halfedge } from "../core/Halfedge";
import { HalfedgeDS } from "../core/HalfedgeDS";
import { Vertex } from "../core/Vertex";
import { computeVerticesIndexArray } from "./setFromGeometry";
import { lazy } from "../utils/lazy";

const pos_ = lazy(() => new Vector3());

/**
 * Rebuilds a {@link HalfedgeDS} in place from an n-gon face table.
 *
 * This is the n-gon-native counterpart of {@link setFromGeometry}: every
 * polygon becomes exactly one {@link Face} of length n (n >= 3), with no
 * fan-triangulation. A cube therefore enters the structure as 6 quad faces,
 * not 12 triangles, and that n-gon identity survives ingestion.
 *
 * Behaviour mirrors `setFromGeometry`:
 *  - existing topology is cleared first (idempotent rebuild);
 *  - vertex deduplication uses the same hash-based merge
 *    ({@link computeVerticesIndexArray}), so coincident corners within
 *    `tolerance` collapse to one vertex (a cube's 24 corners → 8 vertices),
 *    deterministically and identically to the triangle path;
 *  - shared edges between two polygons become twin halfedges (manifold); an
 *    edge used by a single polygon is a boundary edge;
 *  - winding is taken as given (CCW viewed from outside).
 *
 * Non-manifold input (an edge shared by >= 3 faces, or two faces with the same
 * winding along a shared edge) cannot be represented by this twin-based
 * halfedge structure; the underlying `addEdge`/`addFace` path throws the same
 * errors as the triangle path.
 *
 * @param struct       Structure to rebuild.
 * @param positions    Flat vertex positions, length = 3 * vertCount.
 * @param faceOffsets  Run-length face table: polygon i's corners are
 *                     `cornerVerts[faceOffsets[i] .. faceOffsets[i+1])`.
 *                     Length = faceCount + 1; `faceOffsets[0] === 0`; strictly
 *                     increasing.
 * @param cornerVerts  Per-corner vertex index into `positions`.
 * @param tolerance    Vertex-merge tolerance (default 1e-10).
 */
export function setFromPolygons(
    struct: HalfedgeDS,
    positions: Float32Array | number[],
    faceOffsets: number[],
    cornerVerts: number[],
    tolerance = 1e-10) {

  // Validate before clearing so a malformed call never wipes an existing DS.
  validatePolygonMesh(positions, faceOffsets, cornerVerts);

  struct.clear();

  // Wrap the flat positions in a BufferAttribute so vertex dedup is identical
  // to the triangle path (same hash-based merge over the same position bytes).
  const posArray = positions instanceof Float32Array
    ? positions
    : new Float32Array(positions);
  const positionAttribute = new BufferAttribute(posArray, 3);
  const dedupIndex = computeVerticesIndexArray(positionAttribute, tolerance);

  // Deduplicated position index -> Vertex
  const vertexMap = new Map<number, Vertex>();
  // "srcId-dstId" -> Halfedge, so a shared edge resolves to the same halfedge
  // pair (its twin registered under the reverse hash). Mirrors setFromGeometry.
  const halfedgeMap = new Map<string, Halfedge>();

  const faceCount = faceOffsets.length - 1;

  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {

    const start = faceOffsets[faceIndex];
    const end = faceOffsets[faceIndex + 1];
    const n = end - start;

    const loopHalfedges = new Array<Halfedge>(n);

    for (let i = 0; i < n; i++) {

      const cornerA = cornerVerts[start + i];
      const cornerB = cornerVerts[start + (i + 1) % n];

      const iA = dedupIndex[cornerA];
      const iB = dedupIndex[cornerB];

      let v1 = vertexMap.get(iA);
      if (!v1) {
        pos_().fromBufferAttribute(positionAttribute, iA);
        v1 = struct.addVertex(pos_());
        vertexMap.set(iA, v1);
      }

      let v2 = vertexMap.get(iB);
      if (!v2) {
        pos_().fromBufferAttribute(positionAttribute, iB);
        v2 = struct.addVertex(pos_());
        vertexMap.set(iB, v2);
      }

      const hash1 = iA + '-' + iB;
      let h1 = halfedgeMap.get(hash1);

      if (!h1) {
        h1 = struct.addEdge(v1, v2);
        const h2 = h1.twin;
        const hash2 = iB + '-' + iA;
        halfedgeMap.set(hash1, h1);
        halfedgeMap.set(hash2, h2);
      }

      loopHalfedges[i] = h1;
    }

    struct.addFace(loopHalfedges);
  }
}

/**
 * Validates an n-gon face table before mutating the structure.
 * Throws on any malformation (contract §5: fail loud, never silently
 * triangulate).
 */
function validatePolygonMesh(
    positions: Float32Array | number[],
    faceOffsets: number[],
    cornerVerts: number[]) {

  if (positions.length % 3 !== 0) {
    throw new Error("positions length must be a multiple of 3.");
  }

  const vertCount = positions.length / 3;

  if (faceOffsets.length < 2) {
    throw new Error("faceOffsets must contain at least one face (length >= 2).");
  }

  if (faceOffsets[0] !== 0) {
    throw new Error("faceOffsets[0] must be 0.");
  }

  for (let i = 0; i < faceOffsets.length - 1; i++) {
    if (faceOffsets[i + 1] <= faceOffsets[i]) {
      throw new Error("faceOffsets must be strictly increasing.");
    }
    const corners = faceOffsets[i + 1] - faceOffsets[i];
    if (corners < 3) {
      throw new Error(
        `Polygon ${i} has ${corners} corners; at least 3 required.`);
    }
  }

  if (faceOffsets[faceOffsets.length - 1] !== cornerVerts.length) {
    throw new Error(
      "faceOffsets last entry must equal cornerVerts.length.");
  }

  for (let k = 0; k < cornerVerts.length; k++) {
    const v = cornerVerts[k];
    if (!Number.isInteger(v) || v < 0 || v >= vertCount) {
      throw new Error(
        `cornerVerts[${k}] = ${v} is out of range [0, ${vertCount}).`);
    }
  }
}
