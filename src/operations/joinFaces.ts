import { Face } from '../core/Face';
import { Halfedge } from '../core/Halfedge';
import { HalfedgeDS } from '../core/HalfedgeDS';
import { Vertex } from '../core/Vertex';
import { removeEdge } from './removeEdge';
import { removeFromArray } from '../utils/array';

/**
 * Merges the two faces incident to `halfedge` into a single n-gon.
 *
 * Thin validated wrapper over `removeEdge(mergeFaces=true)` (the library's
 * existing 2-face join, Blender `BM_faces_join_pair`). The face on
 * `halfedge`'s side survives; the twin's face is removed. Face normals recompute
 * live (Newell), so no explicit normal update is needed after the merge.
 *
 * @returns The surviving (merged) face.
 * @throws if the edge has no face on either side.
 */
export function joinFacesAcrossEdge(struct: HalfedgeDS, halfedge: Halfedge): Face {
  const twin = halfedge.twin;
  if (!halfedge.face || !twin.face) {
    throw new Error('joinFacesAcrossEdge: edge must have a face on both sides');
  }
  const survivor = halfedge.face;
  removeEdge(struct, halfedge, true);
  reattribute(survivor);
  return survivor;
}

function reattribute(face: Face): void {
  for (const he of face.halfedge.nextLoop()) {
    he.face = face;
  }
}

/**
 * Merges an edge-connected set of faces into one n-gon (Blender `BM_faces_join`).
 *
 * Walks the union perimeter in one pass: a boundary halfedge's successor is found
 * by following `.next` and crossing internal edges via `twin.next` (edges whose
 * other side is also an input face are internal and dropped). This handles cyclic
 * patches — e.g. three triangles around a central vertex merge into the outer
 * triangle, eliminating the shared vertex from the boundary — which an iterative
 * two-face dissolve cannot (the last internal edge would turn self-sided).
 *
 * @returns The surviving (merged) face.
 * @throws on empty/duplicate/non-member input, a non edge-connected region,
 *   a region whose perimeter is not a single simple loop, or a degenerate result.
 */
export function joinFaces(struct: HalfedgeDS, faces: Face[]): Face {
  if (faces.length === 0) {
    throw new Error('joinFaces: need at least one face');
  }
  if (faces.length === 1) {
    return faces[0];
  }

  const inputSet = new Set<Face>(faces);
  if (inputSet.size !== faces.length) {
    throw new Error('joinFaces: duplicate faces in input');
  }
  for (const f of faces) {
    if (!struct.faces.includes(f)) {
      throw new Error('joinFaces: input face does not belong to this structure');
    }
  }

  return mergeFacesIntoOne(struct, faces, inputSet, faces[0]);
}

/**
 * One-shot perimeter merge. Computes every boundary halfedge's successor before
 * mutating (reads the intact `.next`/`.twin`), then applies the new loop, drops
 * internal halfedges and consumed faces, and repoints stale vertex anchors.
 */
function mergeFacesIntoOne(
    struct: HalfedgeDS,
    faces: Face[],
    inputSet: Set<Face>,
    survivor: Face,
): Face {
  const isInternal = (he: Halfedge): boolean =>
    he.twin.face !== null && inputSet.has(he.twin.face);

  // First pass (no mutation): classify halfedges, compute the successor of each
  // boundary halfedge by crossing internal edges.
  const boundary: Halfedge[] = [];
  const internalHalfedges = new Set<Halfedge>();
  const successor = new Map<Halfedge, Halfedge>();
  for (const f of faces) {
    for (const he of f.halfedge.nextLoop()) {
      if (isInternal(he)) {
        internalHalfedges.add(he);
        continue;
      }
      boundary.push(he);
      let nx = he.next;
      let guard = 0;
      while (isInternal(nx)) {
        nx = nx.twin.next;
        if (++guard > 100000) {
          throw new Error('joinFaces: boundary walk did not terminate');
        }
      }
      successor.set(he, nx);
    }
  }

  if (boundary.length === 0) {
    throw new Error('joinFaces: region has no boundary (non-manifold input)');
  }

  // Apply the merged loop and re-own every boundary halfedge to the survivor.
  for (const [he, nx] of successor) {
    he.next = nx;
    nx.prev = he;
    he.face = survivor;
  }
  survivor.halfedge = boundary[0];

  // The perimeter must be a single simple loop (reject annuli / disconnected).
  let loopCount = 0;
  const visited = new Set<Halfedge>();
  for (const start of boundary) {
    if (visited.has(start)) {
      continue;
    }
    loopCount++;
    let cur = start;
    do {
      visited.add(cur);
      cur = cur.next;
    } while (cur !== start);
  }
  if (loopCount !== 1) {
    throw new Error(
      'joinFaces: region does not merge into a single simple loop');
  }
  if (boundary.length < 3) {
    throw new Error('joinFaces: merged face would be degenerate (< 3 corners)');
  }

  // Drop internal halfedges; repoint any vertex whose anchor was removed.
  // Collect stale anchors first (reads the live array), then batch-remove via
  // the chokepoint so the index map and attribute layers compact together.
  const staleVertices = new Set<Vertex>();
  for (const he of internalHalfedges) {
    if (he.vertex.halfedge === he) {
      staleVertices.add(he.vertex);
    }
  }
  struct.removeHalfedges(internalHalfedges);
  for (const v of staleVertices) {
    let anchor: Halfedge | null = null;
    for (const he of struct.halfedges) {
      if (he.vertex === v) {
        anchor = he;
        break;
      }
    }
    v.halfedge = anchor; // null when the vertex is now isolated
  }

  // Remove consumed faces (everything but the survivor).
  for (const f of faces) {
    if (f !== survivor) {
      removeFromArray(struct.faces, f);
    }
  }

  return survivor;
}
