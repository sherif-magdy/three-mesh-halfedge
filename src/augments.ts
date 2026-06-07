// This file previously polluted Array.prototype with clear() and remove().
// Those methods have been replaced by standalone utilities in src/utils/array.ts
// (clearArray, removeFromArray) to avoid global prototype pollution that caused
// issues with Redux serializable-check and other libraries.
//
// The file is kept as a harmless no-op for backward compatibility with any
// external code that may import it.

export {}
