/**
 * Standalone array utilities — replaces former Array.prototype extensions
 * to avoid global prototype pollution (which caused issues with Redux
 * serializable-check and other libraries that recursively walk objects).
 */

/**
 * Removes all elements from the array in-place and returns it.
 * Equivalent to `arr.splice(0, arr.length)` but explicit and side-effect free
 * on Array.prototype.
 */
export function clearArray<T>(arr: T[]): T[] {
  arr.splice(0, arr.length);
  return arr;
}

/**
 * Removes the first occurrence of `item` from the array in-place.
 * Returns `true` if the item was found and removed, `false` otherwise.
 */
export function removeFromArray<T>(arr: T[], item: T): boolean {
  const idx = arr.indexOf(item);
  if (idx === -1) {
    return false;
  }
  arr.splice(idx, 1);
  return true;
}
