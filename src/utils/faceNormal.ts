import { Vector3 } from 'three';
import type { Face } from '../core/Face';

/**
 * Computes a face normal using Newell's method.
 *
 * Newell's method is correct for any planar polygon with n >= 3 vertices,
 * unlike the two-edge cross product which is only valid for triangles (and is
 * wrong for n > 3 even on planar polygons when the chosen edges are not
 * representative). This mirrors Blender's `normal_poly_v3` /
 * `BM_face_normal_update` (bmesh_polygon.cc).
 *
 * For corners v_0 ... v_{n-1} (taken from the face's halfedge loop), it
 * accumulates, then normalizes:
 *
 *   nx = Σ (y_i − y_{i+1}) · (z_i + z_{i+1})
 *   ny = Σ (z_i − z_{i+1}) · (x_i + x_{i+1})
 *   nz = Σ (x_i − x_{i+1}) · (y_i + y_{i+1})
 *
 * The result follows the face's winding (right-hand rule over the loop).
 *
 * The normal is always recomputed from the live topology, so it stays correct
 * after any mutation (edge split, face cut, dissolve, …) — there is no cached
 * value to go stale.
 *
 * @param face   The face whose normal to compute.
 * @param target Vector3 to receive the unit normal.
 */
export function computeFaceNormal(face: Face, target: Vector3): void {
  let nx = 0;
  let ny = 0;
  let nz = 0;

  for (const he of face.halfedge.nextLoop()) {
    const a = he.vertex.position;
    const b = he.next.vertex.position;

    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }

  target.set(nx, ny, nz).normalize();
}
