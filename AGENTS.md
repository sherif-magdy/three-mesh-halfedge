# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Project Overview

A TypeScript halfedge data structure library for three.js `BufferGeometry`. It converts triangle meshes into a halfedge representation, enabling topological queries (boundary extraction, face visibility, edge splitting, face cutting, etc.). Published as `three-mesh-halfedge` on npm. `three` is a peer dependency (>=0.123.0).

## Commands

```bash
npm run build            # Rollup → build/ (UMD + ESM + .d.ts)
npm run build-examples   # Rollup → build-examples/ (HTML demos)
npm run build-doc        # TypeDoc → doc/
npm run dev              # Rollup watch (library)
npm run dev-examples     # Rollup watch (examples)
npm run test             # Vitest single run
npm run test:watch       # Vitest watch mode
npm run lint             # ESLint on src/, examples/, and tests/
```

Run a single test file:
```bash
npx vitest run tests/operations/addEdge.test.ts
```

## Architecture

### Core data model (`src/core/`)

Four classes with bidirectional references forming the halfedge mesh:

- **`HalfedgeDS`** — Top-level container holding flat arrays of `faces`, `vertices`, `halfedges`. All mutating operations delegate to free functions in `src/operations/`.
- **`Vertex`** — Has a `position: Vector3` and a reference to one outgoing `halfedge`. Provides `loopCW()`/`loopCCW()` generators to walk the one-ring neighborhood via `twin.next` / `prev.twin` chains.
- **`Halfedge`** — Directed edge with `vertex` (origin), `twin` (opposite direction), `next`/`prev` (loop links), and optional `face`. Key property: `twin.twin === self`, `next.prev === self`, `prev.next === self`.
- **`Face`** — References one `halfedge` in its boundary loop. Provides `getNormal()`, `isFront()`, `getMidpoint()`, and position/vertex lookups.

### Operations (`src/operations/`)

Each operation is a standalone function `(struct: HalfedgeDS, ...) => void` exported and re-exposed as methods on `HalfedgeDS`:

| File | Function | Purpose |
|------|----------|---------|
| `setFromGeometry.ts` | `setFromGeometry` | Populates structure from a `BufferGeometry` (indexed or non-indexed). Merges vertices within tolerance. |
| `addVertex.ts` | `addVertex` | Adds vertex, optionally deduplicating by position. |
| `addEdge.ts` | `addEdge` | Creates a twin-pair of halfedges between two free vertices. Updates prev/next links in both vertex neighborhoods. |
| `addFace.ts` | `addFace` | Assigns a face to a halfedge loop. Uses `makeHalfedgesAdjacent()` to rewire links for manifold meshes. |
| `removeVertex.ts` | `removeVertex` | Removes all edges around a vertex, optionally merging adjacent faces. |
| `removeEdge.ts` | `removeEdge` | Removes a halfedge pair, rewiring prev/next around both endpoints. Optionally merges the two adjacent faces. |
| `removeFace.ts` | `removeFace` | Nulls face references on the loop's halfedges and removes the face from the structure. |
| `cutFace.ts` | `cutFace` | Splits a face by inserting a new edge between two vertices. May create a new face if the cut creates two separate loops. |
| `splitEdge.ts` | `splitEdge` | Inserts a new vertex along an edge, updating both halfedge and twin chains. |
| `setFromPolygons.ts` | `setFromPolygons` / `HalfedgeDS.fromPolygons` | N-gon-native ingestion (Phase 0): rebuilds from a run-length face table — one `Face` per polygon, no fan-triangulation. |
| `toGeometry.ts` | `toGeometry` | Converts back to an indexed `BufferGeometry`, fan-triangulating n-gons. Emits no normals. |
| `updateFaceNormal.ts` | `updateFaceNormal` | Recomputes a face's normal (Newell's method) into a target `Vector3`. |
| `joinFaces.ts` | `joinFaces` / `joinFacesAcrossEdge` | Face-merge primitives. `joinFacesAcrossEdge` merges the two faces incident to a halfedge (thin wrapper over `removeEdge(mergeFaces=true)`). `joinFaces` merges an edge-connected set into one n-gon via a single perimeter walk (handles cyclic patches an iterative 2-face dissolve can't). |
| `dissolveVertex.ts` | `dissolveVertex` | Dissolves an interior vertex: merges its incident faces into one and removes the vertex (Blender `BM_vert_dissolve`). Guards reject isolated, double-edge, double-face (non-manifold), boundary, and single-face-corner vertices. |
| `limitedDissolve.ts` | `limitedDissolve` | Blender "Dissolve Limited" by face-normal angle: greedily dissolves edges whose adjacent faces meet within `angleLimit` radians, via a node-handle min-heap over `-dot(n1,n2)`. Near-linear (Blender `BM_mesh_decimate_dissolve_ex` patterns): additive Newell normal sums, merges as pointer surgery with one batched compaction at the end, boundary re-cost walk skipped when the survivor's normal doesn't rotate. Self-sided spikes left by cyclic coplanar merges are spliced out. Merges that would revisit a vertex in the merged loop are refused unless the repeat lies on the shared boundary run hanging off the dying edge (run edges become self-sided spikes, healed inline) — per-face corner sets (`faceVerts`) power the O(1) corner-membership probe. Delimit: NORMAL only. Stress suite: `tests/operations/limitedDissolve.stress.test.ts` (~100k tris, `LD_STRESS_W` to rescale, `LD_STRESS_STRICT=1` for the 5s gate); legacy-equivalence harness in `limitedDissolve.parity.test.ts`. |
| `tessellate.ts` | `tessellate` | Ear-clips every n-gon face into triangles (concave-safe, unlike `toGeometry`'s fan). Pure + uncached; `HalfedgeDS.tessellate()` adds caching with dirty-flag invalidation. |

### Array utilities (`src/utils/array.ts`)

Exposes `clearArray(arr)` and `removeFromArray(arr, item)` — standalone helpers with **no `Array.prototype` mutation** (the former `augments.ts` prototype patch was removed to avoid global side effects). Re-exported from `src/index.ts`; operations use `removeFromArray()` for element deletion and `clearArray()` in `HalfedgeDS.clear()`. New code must use these — never `arr.remove()`/`arr.clear()`.

### Geometry utilities (`src/utils/geometry.ts`)

`orient3D()`, `frontSide()`, `sameSide()` — computational geometry helpers using 4×4 determinant orientation tests. Used by `Halfedge.isConcave` and `Face.isFront()`.

### Test infrastructure

- **Framework**: Vitest with `globals: true` (no explicit imports needed for `test`/`expect`/`describe`).
- **Location**: All tests live in `tests/` at the project root, mirroring `src/` structure (`tests/core/`, `tests/operations/`, `tests/utils/`).
- **Setup**: `tests/setup.ts` registers custom matchers (`toBeHalfedge`, `toBeVertex`, `toBeOneOfHalfedges`).
- **Fixtures**: `tests/helpers/fixtures.ts` — factory functions (`createSingleTriangle`, `createDoubleTriangle`, `createOpenFan`, `createClosedTetrahedron`) returning structured objects with named vertex/edge/face references.
- **Validation**: `tests/helpers/topologyValidation.ts` — `validateHalfedgeConsistency()` checks twin/next/prev round-trips; `validateFaceLoops()` checks face loop integrity; `runCommonStructuralTests()` combines assertions on counts + invariants.
- **Test helpers**: `tests/helpers/testutils.ts` — `generatorSize()`, `generatorToArray()` for consuming halfedge generators in tests.

### Build

Rollup bundles the library (`rollup.config.js`) into UMD and ESM. TypeScript declarations go to `build/types/`. The `examples` environment variable switches Rollup to demo builds. The `tests/` directory is excluded from the Rollup TypeScript plugin.

## Key Conventions

- **Tolerance**: Geometric comparisons use `1e-10` as default tolerance throughout.
- **Vertex IDs**: Auto-incrementing via module-level `_idCount` in `Vertex.ts`. Reset to 0 by `HalfedgeDS.clear()` (and therefore by `setFromGeometry`, which calls `clear()` first). Can also be reset manually via `Vertex.resetIdCounter()`. Not used as array indices — purely unique identifiers within a structure's lifecycle.
- **Halfedge direction**: `halfedge.vertex` is the **origin** (source), `halfedge.next.vertex` is the **destination**. The twin reverses this: `twin.vertex === next.vertex`.
- **"Free"**: A vertex/halfedge is "free" if it has no incident face (`face === null`). Operations like `addEdge` require vertices to have at least one free halfedge.
- **Manifold constraint**: `addFace` throws if `makeHalfedgesAdjacent` cannot find a valid rewiring (non-manifold configuration).
- **Tessellation cache**: `HalfedgeDS.tessellate()` lazily computes and caches the ear-clipped triangles (`_tessellationCache` / `_tessellationDirty`). Every topology mutator calls `invalidateTessellation()` automatically. Direct `vertex.position` writes are not observable, so call `struct.invalidateTessellation()` manually after editing positions; the next `tessellate()` call recomputes.
- **Comments**: Omit comments by default; the code should read for itself. Add a comment only when the code would otherwise be hard to understand — i.e., it captures non-obvious intent that a reader cannot recover from the surrounding code. Keep comments precise and short.
