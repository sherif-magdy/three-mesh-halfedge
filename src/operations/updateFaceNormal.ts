import { Vector3 } from 'three';
import type { Face } from '../core/Face';
import { computeFaceNormal } from '../utils/faceNormal';

/**
 * Recomputes a face's normal (Newell's method) into `target`.
 *
 * This is the explicit recompute entry point to call after a topology mutation
 * (e.g. an edge split, face cut, or — in later phases — a dissolve/merge)
 * whenever a fresh face normal is needed. Because {@link Face.getNormal} always
 * recomputes from the live loop as well, this is equivalent to calling
 * `face.getNormal(target)`; it exists as a named, intention-revealing operation
 * for callers that mutate the structure and then re-cost affected faces.
 *
 * @param face   The face whose normal to recompute.
 * @param target Vector3 to receive the unit normal.
 */
export function updateFaceNormal(face: Face, target: Vector3): void {
  computeFaceNormal(face, target);
}
