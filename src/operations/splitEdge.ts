import { Vector3 } from "three";
import { Halfedge } from "../core/Halfedge";
import { HalfedgeDS } from "../core/HalfedgeDS";
import { Vertex } from "../core/Vertex";

export function splitEdge(
    struct: HalfedgeDS,
    halfedge: Halfedge,
    position: Vector3, 
    tolerance = 1e-10) {

  /**
   * From
   *            A -------------- he -------------> B 
   *            A <------------ twin ------------- B 
   * To         
   *            A ---- he ----> v ---- newhe ----> B
   *            A <--- twin --- v <--- newtwin --- B
   */

  const twin = halfedge.twin;
  const A = halfedge.vertex;
  const B = twin.vertex;

  if (A.matchesPosition(position, tolerance)) {
    return A;
  }
  if (B.matchesPosition(position, tolerance)) {
    return B;
  }

  const newVertex = new Vertex();
  newVertex.position.copy(position);

  const newHalfedge = new Halfedge(newVertex);
  const newTwin = new Halfedge(B);
  newHalfedge.twin = newTwin;
  newTwin.twin = newHalfedge;

  A.halfedge = halfedge;
  newVertex.halfedge = newHalfedge;
  B.halfedge = newTwin;

  newHalfedge.face = halfedge.face;
  newTwin.face = twin.face;

  // Capture the neighbors we are about to rewire, before mutating any link.
  //   nextHalfedge: halfedge leaving B in halfedge.face's loop (B -> ...)
  //   prevTwin:     halfedge arriving at B in twin.face's loop (... -> B)
  const nextHalfedge = halfedge.next;
  const prevTwin = twin.prev;

  // --- Wire the halfedge (A -> newVertex) side into halfedge.face's loop ---
  //   ... -> halfedge(A->v) -> newHalfedge(v->B) -> nextHalfedge(B->...) -> ...
  newHalfedge.next = nextHalfedge;
  nextHalfedge.prev = newHalfedge;
  newHalfedge.prev = halfedge;
  halfedge.next = newHalfedge;

  // --- Wire the twin (B -> newVertex) side into twin.face's loop ---
  // The repurposed `twin` becomes the newVertex -> A halfedge (edge A-v's twin
  // on this side). Its origin must move from B to the new vertex, otherwise the
  // twin's face loop would skip the new vertex (two consecutive B origins) and
  // the he.twin.vertex === he.next.vertex invariant would break.
  //   ... -> prevTwin(->B) -> newTwin(B->v) -> twin(v->A) -> (twin.next) -> ...
  twin.vertex = newVertex;
  newTwin.next = twin;
  newTwin.prev = prevTwin;
  prevTwin.next = newTwin;
  twin.prev = newTwin;

  struct.vertices.push(newVertex);
  struct.pushHalfedge(newHalfedge);
  struct.pushHalfedge(newTwin);

  // Per-corner attributes: each new corner at v interpolates along its OWN
  // face's edge, so a hard edge stays split (never blended across the twin).
  if (struct.getAttributeNames().length > 0) {
    const distAB = A.position.distanceTo(B.position);
    const t = distAB > tolerance ? A.position.distanceTo(position) / distAB : 0;

    // halfedge.face side: A corner = halfedge (origin A), B corner = nextHalfedge
    // (origin B). newHalfedge (origin v) takes their t-interpolation.
    struct.interpolateCorner(newHalfedge, halfedge, nextHalfedge, t);

    // twin.face side: the old B corner still lives in twin's slot (its origin
    // moved to v, but the slot data is unchanged). Move that B value to newTwin
    // (the new B corner), then interpolate twin (the new v corner) from A
    // (twin.next, origin A) and that B value.
    struct.copyCornerValues(newTwin, twin);
    struct.interpolateCorner(twin, twin.next, twin, t);
  }

  return newVertex;
}
