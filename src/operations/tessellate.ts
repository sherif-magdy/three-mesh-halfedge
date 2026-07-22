import { Vector3 } from 'three';
import type { HalfedgeDS } from '../core/HalfedgeDS';
import type { Face } from '../core/Face';
import { lazy } from '../utils/lazy';

const _normal = lazy(() => new Vector3());

/**
 * Triangulates every Face of the structure into a flat list of triangles.
 *
 * Each n-gon face (n > 3) is ear-clipped (Blender `corner_tris_calc` /
 * `BLI_polyfill_calc`), so concave polygons get a correct, non-reflex set of
 * triangles — unlike {@link toGeometry}'s fan, which is only valid for convex
 * faces. Triangles are returned as vertex-id triples and preserve each face's
 * CCW winding. Degenerate faces (size < 3) are skipped.
 *
 * Pure and uncached; caching + mutation invalidation live on
 * {@link HalfedgeDS.tessellate}.
 *
 * @param struct Structure whose faces to triangulate.
 * @returns Array of `[vId0, vId1, vId2]` triples (vertex.id basis).
 */
export function tessellate(struct: HalfedgeDS): number[][] {
  const triangles: number[][] = [];
  const normal = _normal();
  for (const face of struct.faces) {
    triangulateFace(face, normal, triangles);
  }
  return triangles;
}

function triangulateFace(face: Face, normal: Vector3, out: number[][]): void {
  // Collect corner vertex ids + positions in loop order.
  const ids: number[] = [];
  const px: number[] = [];
  const py: number[] = [];
  const pz: number[] = [];
  for (const he of face.halfedge.nextLoop()) {
    const p = he.vertex.position;
    ids.push(he.vertex.id);
    px.push(p.x);
    py.push(p.y);
    pz.push(p.z);
  }
  const n = ids.length;
  if (n < 3) {
    return;
  }
  if (n === 3) {
    out.push([ids[0], ids[1], ids[2]]);
    return;
  }

  face.getNormal(normal);

  // Project to 2D by dropping the dominant normal axis — the most face-on
  // reduction, no explicit basis. area/cross signs stay mutually consistent in
  // any projection, so winding tests below are projection-independent.
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  let uxArr: number[];
  let uyArr: number[];
  if (ax >= ay && ax >= az) {
    uxArr = py;
    uyArr = pz;
  } else if (ay >= az) {
    uxArr = px;
    uyArr = pz;
  } else {
    uxArr = px;
    uyArr = py;
  }

  // Indices into the fixed id/coord arrays; spliced as ears are clipped.
  const remaining: number[] = [];
  for (let i = 0; i < n; i++) {
    remaining.push(i);
  }

  const areaSign = signedAreaSign(uxArr, uyArr, remaining);

  let guard = 0;
  while (remaining.length > 3) {
    const m = remaining.length;
    let ear = -1;
    for (let k = 0; k < m; k++) {
      const km1 = (k - 1 + m) % m;
      const kp1 = (k + 1) % m;
      const a = remaining[km1];
      const b = remaining[k];
      const c = remaining[kp1];

      // Convex (non-reflex) corner: cross sign matches the polygon winding.
      const cross =
        (uxArr[b] - uxArr[a]) * (uyArr[c] - uyArr[a]) -
        (uyArr[b] - uyArr[a]) * (uxArr[c] - uxArr[a]);
      if (Math.sign(cross) !== areaSign || Math.abs(cross) < 1e-12) {
        continue;
      }

      // Ear must enclose no other remaining vertex.
      let occluded = false;
      for (let j = 0; j < m; j++) {
        if (j === km1 || j === k || j === kp1) {
          continue;
        }
        const p = remaining[j];
        if (pointInTriangle(
          uxArr[a], uyArr[a], uxArr[b], uyArr[b], uxArr[c], uyArr[c],
          uxArr[p], uyArr[p])) {
          occluded = true;
          break;
        }
      }
      if (!occluded) {
        ear = k;
        break;
      }
    }

    if (ear === -1) {
      // Near-degenerate / self-touching input: fan the rest so we still return
      // n-2 triangles instead of looping forever.
      fanRemaining(ids, remaining, out);
      return;
    }

    const m2 = remaining.length;
    const a = remaining[(ear - 1 + m2) % m2];
    const b = remaining[ear];
    const c = remaining[(ear + 1) % m2];
    out.push([ids[a], ids[b], ids[c]]);
    remaining.splice(ear, 1);

    if (++guard > 100000) {
      fanRemaining(ids, remaining, out);
      return;
    }
  }

  out.push([ids[remaining[0]], ids[remaining[1]], ids[remaining[2]]]);
}

/** Fans whatever remains into triangles from the first remaining vertex. */
function fanRemaining(ids: number[], remaining: number[], out: number[][]): void {
  const a = remaining[0];
  for (let k = 1; k < remaining.length - 1; k++) {
    out.push([ids[a], ids[remaining[k]], ids[remaining[k + 1]]]);
  }
}

/** Sign (+1/-1) of the 2D polygon's signed area; +1 when degenerate. */
function signedAreaSign(uxArr: number[], uyArr: number[], idx: number[]): number {
  let area = 0;
  for (let i = 0; i < idx.length; i++) {
    const a = idx[i];
    const b = idx[(i + 1) % idx.length];
    area += uxArr[a] * uyArr[b] - uxArr[b] * uyArr[a];
  }
  return area > 0 ? 1 : area < 0 ? -1 : 1;
}

/** 2D point-in-triangle (boundary counts as inside — conservative for ears). */
function pointInTriangle(
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, px: number, py: number,
): boolean {
  const d1 = edgeSign(px, py, ax, ay, bx, by);
  const d2 = edgeSign(px, py, bx, by, cx, cy);
  const d3 = edgeSign(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Sign of P relative to the directed edge A->B. */
function edgeSign(
    px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}
