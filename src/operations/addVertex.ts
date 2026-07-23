import { Vector3 } from "three";
import { HalfedgeDS } from "../core/HalfedgeDS";
import { Vertex } from "../core/Vertex";

export function addVertex(
    struct: HalfedgeDS,
    position: Vector3,
    checkDuplicates = false,
    tolerance = 1e-10) {

  if (checkDuplicates) {
    for (const vertex of struct.vertices) {
      if (vertex.matchesPosition(position, tolerance)) {
        return vertex;
      }
    }
  }
  
  const v = new Vertex();
  v.position.copy(position);
  struct.vertices.push(v);
  return v;
}