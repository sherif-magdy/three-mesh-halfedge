import { Face } from "../core/Face";
import { Halfedge } from "../core/Halfedge";
import { HalfedgeDS } from "../core/HalfedgeDS";

export function addFace(struct: HalfedgeDS, halfedges: Halfedge[]) {

  const size = halfedges.length;
  if (size < 3) {
    throw new Error("At least 3 halfedges required to build a face.");
  }

  for (let i=0; i<size; i++) {

    const curr = halfedges[i];
    const next = halfedges[(i+1) % size];

    if (curr.face) {
      throw new Error("Halfedge already has a face");
    }

    if (curr.twin.vertex !== next.vertex) {
      throw new Error("Halfedges do not form a chain");
    }
  }
  
  for (let i = 0; i<size; i++) {

    const curr = halfedges[i];
    const next = halfedges[(i+1) % size];

    if (!makeHalfedgesAdjacent(curr, next)) {
      throw new Error('Face cannot be created: mesh would be non manifold.');
    }
  }

  const face = new Face(halfedges[0]);
  for (const halfedge of halfedges) {
    halfedge.face = face;
  }

  struct.faces.push(face);
  return face;
}

function makeHalfedgesAdjacent(
    halfIn: Halfedge,
    halfOut: Halfedge): boolean {

  if (halfIn.next === halfOut) {
    return true;
  }

  // Find a boundary halfedge different from out.twin and in 
  let g: Halfedge | null = null; 
  const loop = halfOut.vertex.freeHalfedgesInLoop(halfOut);
  let he = loop.next();
  while (!g && !he.done) {
    if (he.value !== halfIn) {
      g = he.value;
    }
    he = loop.next();
  }
  
  if (!g) {
    return false;
  }

  const b = halfIn.next;
  const d = halfOut.prev;
  const h = g.next;

  halfIn.next = halfOut;
  halfOut.prev = halfIn;

  g.next = b;
  b.prev = g;

  d.next = h;
  h.prev = d;

  return true;
}