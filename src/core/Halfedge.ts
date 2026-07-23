import { Line3, Vector3 } from 'three';
import { Face } from './Face';
import { Vertex } from './Vertex';
import { frontSide } from '../utils/geometry';
import { lazy } from '../utils/lazy';

const _u = lazy(() => new Vector3());
const _v = lazy(() => new Vector3());
const _line = lazy(() => new Line3());

export class Halfedge {

  vertex: Vertex;

  // Set during the structure build phase
  face: Face | null = null;
  declare twin: Halfedge;
  declare prev: Halfedge;
  declare next: Halfedge;

  constructor(vertex: Vertex) {
    this.vertex = vertex;
  }

  get id() {
    return this.vertex.id + '-'+ this.twin.vertex.id;
  }

  containsPoint(point: Vector3, tolerance = 1e-10): boolean {
    _u().subVectors(this.vertex.position, point)
    _v().subVectors(this.next.vertex.position, point)
    _line().set(this.vertex.position, this.next.vertex.position);
    _line().closestPointToPoint(point, true, _u());
    return _u().distanceTo(point) < tolerance;
  }

  /** Whether the halfedge is free (no connected face). */
  isFree() {
    return this.face === null;
  }

  /** Whether the halfedge is a boundary (no connected face but its twin has one). */
  isBoundary() {
    return this.face === null && this.twin.face !== null;
  }

  /**
   * Whether the halfedge is concave (convex otherwise).
   * Returns false if the halfedge has no twin.
   */
  get isConcave() {
    if (this.twin) {
      return frontSide(
        this.vertex.position,
        this.next.vertex.position,
        this.prev.vertex.position,
        this.twin.prev.vertex.position) > 0;
    }
    return false;
  }

  *nextLoop() {
    const start: Halfedge = this;
    let curr: Halfedge = start;
    do {
      yield curr;
      curr = curr.next;
    } while(curr !== start);
    return null;
  }

  *prevLoop() {
    const start: Halfedge = this;
    let curr: Halfedge = start;
    do {
      yield curr;
      curr = curr.prev;
    } while(curr !== start);
    return null;
  }

}
