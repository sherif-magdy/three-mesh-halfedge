/*
 * Author: Axel Antoine
 * mail: ax.antoine@gmail.com
 * website: http://axantoine.com
 * Created on Fri Nov 18 2022
 *
 * Loki, Inria project-team with Université de Lille
 * within the Joint Research Unit UMR 9189
 * CNRS - Centrale de Lille - Université de Lille, CRIStAL
 * https://loki.lille.inria.fr
 *
 * Licence: Licence.md
 */

import { clearArray, removeFromArray } from '../src/utils/array';

describe('clearArray', () => {

  test('empties a non-empty array', () => {
    const arr = [1, 2, 3];
    const result = clearArray(arr);
    expect(arr).toHaveLength(0);
    expect(result).toBe(arr);
  });

  test('returns the same array reference', () => {
    const arr = [1, 2, 3];
    const result = clearArray(arr);
    expect(result).toBe(arr);
  });

  test('has no effect on an already empty array', () => {
    const arr: number[] = [];
    const result = clearArray(arr);
    expect(arr).toHaveLength(0);
    expect(result).toBe(arr);
  });

});

describe('removeFromArray', () => {

  test('removes an existing element and returns true', () => {
    const arr = [1, 2, 3];
    const result = removeFromArray(arr, 2);
    expect(result).toBe(true);
    expect(arr).toEqual([1, 3]);
  });

  test('returns false when element is not present', () => {
    const arr = [1, 2, 3];
    const result = removeFromArray(arr, 4);
    expect(result).toBe(false);
    expect(arr).toEqual([1, 2, 3]);
  });

  test('removes only the first occurrence', () => {
    const arr = [1, 2, 2, 3];
    const result = removeFromArray(arr, 2);
    expect(result).toBe(true);
    expect(arr).toEqual([1, 2, 3]);
  });

  test('returns false on an empty array', () => {
    const arr: number[] = [];
    const result = removeFromArray(arr, 1);
    expect(result).toBe(false);
  });

});
