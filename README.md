# three-mesh-halfedge

[![npm release](https://img.shields.io/npm/v/@sherifmagdy%2Fthree-mesh-halfedge)](https://www.npmjs.com/package/@sherifmagdy/three-mesh-halfedge)
[![build](https://img.shields.io/github/workflow/status/sherif-magdy/three-mesh-halfedge/build)](https://github.com/sherif-magdy/three-mesh-halfedge/actions)
[![Documentation](https://img.shields.io/badge/view-Documentation-blue?label=Open)](https://LokiResearch.github.io/three-mesh-halfedge/doc/index.html)
[![License](https://img.shields.io/badge/License-MIT-green)](#license)

A typescript implementation of the Halfedge structure for three.js geometries.

> Based on [three-mesh-halfedge](https://github.com/LokiResearch/three-mesh-halfedge) by Axel Antoine, released under the MIT License.

<img src="./images/halfedge.png" width="49%"/><img src="./images/contours.png" width="49%"/>

Supports multiple topologies:
- Multiple edges between the same vertices
- Isolated polygons
- Isolated edges
- Isolated vertices
- Mixed wireframe and polygons
- Polygons with an arbitrary number of vertices and edges
- Polygons meeting only at one vertex

## Examples

- [HalfedgeDS Visualisation](https://LokiResearch.github.io/three-mesh-halfedge/build-examples/HalfedgeDSVisualisation.html)
- [Realtime contours extraction](https://LokiResearch.github.io/three-mesh-halfedge/build-examples/ExtractContours.html)

## Installation
```bash
npm install @sherifmagdy/three-mesh-halfedge
```

## Documentation

[![Documentation](https://img.shields.io/badge/view-Documentation-blue?label=Open)](https://LokiResearch.github.io/three-mesh-halfedge/doc/index.html)

*Documentation is in progress.*

## Code snippets

##### Example 1: Build the Halfedge structure
```ts
import * as THREE from 'three';
import { HalfedgeDS } from '@sherifmagdy/three-mesh-halfedge';

// Build the Halfedge structure from a BoxGeometry
const geometry = new THREE.BoxGeometry();
const struct = new HalfedgeDS();
struct.setFromGeometry(geometry, 1e-10);
```

##### Example 2: Extract the boundary halfedges of a mesh
```ts
const struct = new HalfedgeDS();
struct.setFromGeometry(mesh.geometry);

// Get the boundary edges (keep only one halfedge for each pair)
const boundaries = new Set<Halfedge>();
for (const halfedge of struct.halfedges) {
	if (!boundaries.has(halfedge.twin) && !halfedge.face) {
		boundaries.add(halfedge);
	}
}
console.log("Boundary halfedges", boundaries);
```


##### Example 3: Get the front faces of a mesh
```ts
const struct = new HalfedgeDS();
struct.setFromGeometry(mesh.geometry);

// Get the camera position in mesh's space
const localCameraPos = mesh.worldToLocal(camera.position.clone());

//  Get the front faces
const array = [];
for (const face of struct.faces) {
	// /!\ Attention: position is considered in geometry local system
	if (face.isFront(localCameraPos)) { 
		array.push(face);
	}
}
console.log("Front faces", array);
```
## Mesh operations

Beyond building and querying, the structure supports topology edits. Each edit op is both a method on `HalfedgeDS` and a free function exported from the package (`tessellate`, `joinFaces`, `dissolveVertex`, `limitedDissolve`, …).

##### N-gon-native ingest (no fan triangulation)
```ts
// One Face per polygon — triangles, quads, or arbitrary n-gons — straight from
// a run-length face table, with optional per-corner attribute layers.
const struct = HalfedgeDS.fromPolygons(positions, polygons, 1e-10, {
  uv: { itemSize: 2, data: uvFlat }, // length = cornerCount * itemSize
});
```

##### Triangulate n-gons (concave-safe)
```ts
// Ear-clip every face into triangles — correct for concave polygons, unlike
// toGeometry()'s fan. Cached; recomputed only when the topology changes.
const tris = struct.tessellate(); // [[vId0, vId1, vId2], ...]
```

##### Per-corner attributes (uv / normal / tangent)
```ts
// setFromGeometry auto-ingests every non-position attribute as a per-corner
// (per halfedge) layer, reading the raw source row so hard-edge splits survive
// the weld. Attributes carry through edit ops (split / cut / remove / join /
// dissolve) automatically — no manual wiring.
const uv = struct.getAttribute('uv');          // AttributeLayer | null
const out: number[] = [];
for (const he of face.halfedge.nextLoop()) {
  if (struct.getAttributeValues('uv', he, out)) { /* out[0], out[1], ... */ }
}
// struct.toGeometry() re-emits the layers un-welded (one vertex row per unique
// position + attributes corner tuple).
```

##### Dissolve edges within an angle (limited dissolve)
```ts
// Blender "Dissolve Limited": merge edges whose adjacent faces meet within
// the given dihedral angle (radians). Cheapest edges merge first.
struct.limitedDissolve(THREE.MathUtils.degToRad(5));
```

##### Dissolve a vertex
```ts
// Merge an interior vertex's incident faces into one n-gon and drop the vertex.
struct.dissolveVertex(vertex);
```

##### Join faces
```ts
// Merge the two faces incident to a halfedge:
struct.joinFacesAcrossEdge(halfedge);
// Or merge an edge-connected set into one n-gon in a single perimeter walk
// (handles cyclic patches an iterative 2-face dissolve can't):
struct.joinFaces([faceA, faceB, faceC]);
```

##### Undo snapshots
```ts
// copy()/clone() preserve topology, vertex ids, and attribute layers without
// an n-gon re-triangulation round-trip — use for undo/revert.
const before = struct.clone();
```

## Useful links and references

[Kalle Rutanen Homepage - Halfedge data structures](https://kaba.hilvi.org/homepage/blog/halfedge/halfedge.htm)


