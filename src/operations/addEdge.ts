import { Halfedge } from "../core/Halfedge";
import { HalfedgeDS } from "../core/HalfedgeDS";
import { Vertex } from "../core/Vertex";

export function addEdge(
    struct: HalfedgeDS,
    v1: Vertex,
    v2: Vertex,
    allowParallels = false) {
  
  if (v1 === v2) {
    throw new Error('Vertices v1 and v2 should be different');
  }

  if (!allowParallels) {
    const currentHalfEdge = v1.getHalfedgeToVertex(v2);
    if (currentHalfEdge) {
      return currentHalfEdge;
    }
  }

  if (!v1.isFree() || !v2.isFree()) {
    throw new Error('Vertices v1 and v2 are not free');
  } 

  // Twin pair defaults to prev/next of each other (a 2-cycle) so isolated
  // vertices still form a valid loop; non-isolated cases rewire below.
  const h1 = new Halfedge(v1);
  const h2 = new Halfedge(v2);
  h1.twin = h2;
  h1.next = h2;
  h1.prev = h2;
  h2.twin = h1;
  h2.next = h1;
  h2.prev = h1;

  /*
   *        ↖       ↙
   *   out2   ↖   ↙   in2
   *            v2           
   *            ⇅        
   *            ⇅   
   *        h1  ⇅  h2     
   *            ⇅  
   *            ⇅  
   *            v1
   *    in1  ↗     ↘  out1
   *       ↗         ↘
   *            
   */


  const in1 = v1.freeHalfedgesInLoop().next().value;
  if (in1) {
    const out1 = in1.next;
    h1.prev = in1;
    in1.next = h1;

    h2.next = out1;
    out1.prev = h2;
  } else {
    v1.halfedge = h1;
  }

  const in2 = v2.freeHalfedgesInLoop().next().value;
  if (in2) {

    const out2 = in2.next;
    h2.prev = in2;
    in2.next = h2;

    h1.next = out2;
    out2.prev = h1;  
  } else {
    v2.halfedge = h2;
  }

  struct.halfedges.push(h1);
  struct.halfedges.push(h2);

  return h1;
}

