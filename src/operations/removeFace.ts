import { Face } from "../core/Face";
import { HalfedgeDS } from "../core/HalfedgeDS";
import { removeFromArray } from "../utils/array";

export function removeFace(
    struct: HalfedgeDS,
    face: Face) {

  if (!removeFromArray(struct.faces, face)) {
    return;
  }

  for (const halfedge of face.halfedge.nextLoop()) {
    halfedge.face = null;
  }  
}
