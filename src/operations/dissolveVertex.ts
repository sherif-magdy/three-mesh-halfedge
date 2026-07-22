import { Face } from '../core/Face';
import { HalfedgeDS } from '../core/HalfedgeDS';
import { Vertex } from '../core/Vertex';
import { joinFaces } from './joinFaces';
import { removeFromArray } from '../utils/array';

/**
 * Dissolves a vertex, merging its incident faces into one and removing it.
 *
 * For an interior manifold vertex shared by k faces, the k faces merge along
 * the edges that used to touch the vertex; every such edge is internal to the
 * incident set and is dissolved, leaving the vertex isolated. The result is one
 * face bounded by the neighbour cycle, and the vertex is removed. (Three
 * triangles fanned around a vertex collapse to the outer triangle.)
 *
 * Guards (fail loud, matching JVKE preconditions):
 *  - isolated vertex (no incident edges) -> rejected;
 *  - parallel ("double") edges to the same neighbour -> rejected;
 *  - the same face meeting the vertex twice (non-manifold) -> rejected;
 *  - a boundary vertex (an incident edge with no face) -> rejected;
 *  - a single-face corner (would need a direct edge collapse) -> rejected.
 *
 * @param struct  Structure to mutate.
 * @param vertex  Interior vertex shared by >= 2 faces to dissolve.
 */
export function dissolveVertex(struct: HalfedgeDS, vertex: Vertex): void {
  if (vertex.isIsolated()) {
    throw new Error('dissolveVertex: cannot dissolve an isolated vertex');
  }

  const outgoing = Array.from(vertex.loopCW());

  // double-edge guard: two edges from this vertex to the same neighbour.
  const neighbours = new Set<Vertex>();
  for (const he of outgoing) {
    const dest = he.twin.vertex;
    if (neighbours.has(dest)) {
      throw new Error(
        'dissolveVertex: parallel (double) edges incident to the vertex');
    }
    neighbours.add(dest);
  }

  // Distinct incident faces, plus a count of face-bearing outgoing halfedges.
  const incident: Face[] = [];
  const seen = new Set<Face>();
  let faceHits = 0;
  for (const he of outgoing) {
    if (he.face) {
      faceHits += 1;
      if (!seen.has(he.face)) {
        seen.add(he.face);
        incident.push(he.face);
      }
    }
  }

  // double-face guard: a manifold vertex has one outgoing halfedge per incident
  // face; fewer faces than hits means a face meets the vertex twice.
  if (faceHits !== incident.length) {
    throw new Error('dissolveVertex: vertex is non-manifold (a face meets it twice)');
  }

  // interior guard: every incident edge must have a face on this side.
  for (const he of outgoing) {
    if (!he.face) {
      throw new Error(
        'dissolveVertex: vertex must be interior (surrounded by faces)');
    }
  }

  if (incident.length < 2) {
    throw new Error(
      'dissolveVertex: single-face corner dissolve is unsupported');
  }

  // Merging the incident faces dissolves every edge through the vertex, which
  // isolates it; then drop the now-unused vertex.
  joinFaces(struct, incident);
  removeFromArray(struct.vertices, vertex);
}
