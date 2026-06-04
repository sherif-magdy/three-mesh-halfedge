import './augments';

describe('Array.prototype.clear', () => {

  test('empties a non-empty array', () => {
    const arr = [1, 2, 3];
    const result = arr.clear();
    expect(arr).toHaveLength(0);
    expect(result).toBe(arr);
  });

  test('returns the same array reference', () => {
    const arr = [1, 2, 3];
    const result = arr.clear();
    expect(result).toBe(arr);
  });

  test('has no effect on an already empty array', () => {
    const arr: number[] = [];
    const result = arr.clear();
    expect(arr).toHaveLength(0);
    expect(result).toBe(arr);
  });

});

describe('Array.prototype.remove', () => {

  test('removes an existing element and returns true', () => {
    const arr = [1, 2, 3];
    const result = arr.remove(2);
    expect(result).toBe(true);
    expect(arr).toEqual([1, 3]);
  });

  test('returns false when element is not present', () => {
    const arr = [1, 2, 3];
    const result = arr.remove(4);
    expect(result).toBe(false);
    expect(arr).toEqual([1, 2, 3]);
  });

  test('removes only the first occurrence', () => {
    const arr = [1, 2, 2, 3];
    const result = arr.remove(2);
    expect(result).toBe(true);
    expect(arr).toEqual([1, 2, 3]);
  });

  test('returns false on an empty array', () => {
    const arr: number[] = [];
    const result = arr.remove(1);
    expect(result).toBe(false);
  });

});
