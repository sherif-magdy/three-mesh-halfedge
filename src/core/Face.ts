import { Vector3, Triangle } from 'three';
import { Vertex } from './Vertex';
import { Halfedge } from './Halfedge';
import { lazy } from '../utils/lazy';
import { computeFaceNormal } from '../utils/faceNormal';

const _viewVector = lazy(() => new Vector3());
const _normal = lazy(() => new Vector3());
const _triangle = lazy(() => new Triangle());
const _vec = lazy(() => new Vector3());

export class Face {

  halfedge: Halfedge;

  constructor(halfEdge: Halfedge) {
    this.halfedge = halfEdge;
  }

  /**
   * Number of corners (vertices) on this face's boundary loop.
   *
   * Derived from the live halfedge loop, so it always reflects the current
   * topology (triangles report 3, quads 4, arbitrary n-gons n). Never cached,
   * so it cannot go stale after a mutation.
   */
  get size(): number {
    const loop = this.halfedge.nextLoop();
    let count = 0;
    while (!loop.next().done) {
      count += 1;
    }
    return count;
  }

  getNormal(target: Vector3) {
    computeFaceNormal(this, target);
  }

  getMidpoint(target: Vector3) {
    _triangle().set(
      this.halfedge.prev.vertex.position,
      this.halfedge.vertex.position,
      this.halfedge.next.vertex.position
    );
    _triangle().getMidpoint(target);
  }

  /** Whether the face is front-facing relative to `position`. */
  isFront(position: Vector3) {
    this.getNormal(_normal());
    return _viewVector()
      .subVectors(position, this.halfedge.vertex.position)
      .normalize()
      .dot(_normal()) >= 0;
  }

  /** The halfedge on this face containing `position`, or null. */
  halfedgeFromPosition(position: Vector3, tolerance = 1e-10): Halfedge | null {

    for (const he of this.halfedge.nextLoop()) {
      if (he.containsPoint(position, tolerance)) {
        return he;
      }
    }
    return null;
  }

  /** The vertex on this face matching `position` within tolerance, or null. */
  vertexFromPosition(position: Vector3, tolerance = 1e-10): Vertex | null {

    for (const he of this.halfedge.nextLoop()) {
      _vec().subVectors(he.vertex.position, position);

      if (_vec().length() < tolerance) {
        return he.vertex;
      }
    }
    return null;
  }

  /** The halfedge on this face starting from `vertex`, or null. */
  halfedgeFromVertex(vertex: Vertex) {

    for (const he of this.halfedge.nextLoop()) {
      if (he.vertex === vertex) {
        return he;
      }
    }
    return null;
  }

  hasVertex(vertex: Vertex) {
    for (const he of this.halfedge.nextLoop()) {
      if (he.vertex === vertex) {
        return true;
      }
    }
    return false;
  }
}
