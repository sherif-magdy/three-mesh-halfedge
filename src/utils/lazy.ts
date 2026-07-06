/**
 * Returns a memoized accessor that constructs its value lazily on the first call.
 *
 * Module-level scratch objects (e.g. `THREE.Vector3`, `THREE.Matrix4`) are
 * allocated through this helper so that the module body never executes `new`
 * on an imported binding at load time. This keeps the module loadable even when
 * a consumer's bundler resolves `three` only after the module body has run —
 * the failure mode that crashes a UMD bundle consumed inside an ESM graph.
 *
 * The accessor always returns the same instance, preserving the
 * reuse-as-shared-scratch-space semantics of a module-level `const`.
 *
 * @param factory Called once, on first access, to build the cached value.
 * @returns A zero-arg getter that yields the cached instance.
 */
export function lazy<T>(factory: () => T): () => T {
  let cached: T | undefined;
  return () => cached ?? (cached = factory());
}
