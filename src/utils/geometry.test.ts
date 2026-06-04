import { Vector3 } from 'three';
import { orient3D, frontSide, sameSide } from './geometry';

// Triangle in the xy-plane: a=(0,0,0), b=(1,0,0), c=(0,1,0)
const a = new Vector3(0, 0, 0);
const b = new Vector3(1, 0, 0);
const c = new Vector3(0, 1, 0);

describe('orient3D', () => {

  test('returns -1 for point above the xy-plane', () => {
    const d = new Vector3(0, 0, 1);
    expect(orient3D(a, b, c, d)).toBe(-1);
  });

  test('returns 1 for point below the xy-plane', () => {
    const d = new Vector3(0, 0, -1);
    expect(orient3D(a, b, c, d)).toBe(1);
  });

  test('returns 0 for coplanar point (point on plane)', () => {
    const d = new Vector3(0.5, 0.5, 0);
    expect(orient3D(a, b, c, d)).toBe(0);
  });

  test('returns 0 when all four points are the origin', () => {
    const o = new Vector3(0, 0, 0);
    expect(orient3D(o, o, o, o)).toBe(0);
  });

});

describe('frontSide', () => {

  test('returns positive value when viewpoint is above the triangle', () => {
    // frontSide calls orient3D(d, b, c, a), which swaps d into first position
    const d = new Vector3(0, 0, 1);
    expect(frontSide(a, b, c, d)).toBe(1);
  });

  test('returns negative value when viewpoint is below the triangle', () => {
    const d = new Vector3(0, 0, -1);
    expect(frontSide(a, b, c, d)).toBe(-1);
  });

  test('returns 0 when viewpoint is on the triangle plane', () => {
    const d = new Vector3(0.5, 0.5, 0);
    expect(frontSide(a, b, c, d)).toBe(0);
  });

});

describe('sameSide', () => {

  test('returns true when both points are on the same side (above)', () => {
    const d = new Vector3(0, 0, 1);
    const e = new Vector3(0.5, 0.5, 1);
    expect(sameSide(a, b, c, d, e)).toBe(true);
  });

  test('returns true when both points are on the same side (below)', () => {
    const d = new Vector3(0, 0, -1);
    const e = new Vector3(0.5, 0.5, -1);
    expect(sameSide(a, b, c, d, e)).toBe(true);
  });

  test('returns false when points are on opposite sides', () => {
    const d = new Vector3(0, 0, 1);
    const e = new Vector3(0, 0, -1);
    expect(sameSide(a, b, c, d, e)).toBe(false);
  });

  test('returns true when both points are coplanar', () => {
    const d = new Vector3(0.5, 0.5, 0);
    const e = new Vector3(0.25, 0.25, 0);
    expect(sameSide(a, b, c, d, e)).toBe(true);
  });

  test('returns true when one point is coplanar and the other is above', () => {
    // orient3D returns 0 for coplanar (0 > 0 === false) and -1 for above (-1 > 0 === false)
    // Both evaluate to false, so sameSide considers them on the "same side"
    const d = new Vector3(0.5, 0.5, 0);
    const e = new Vector3(0, 0, 1);
    expect(sameSide(a, b, c, d, e)).toBe(true);
  });

});
