import { BufferGeometry, Vector3 } from 'three';
import { Face } from './Face';
import { Vertex } from './Vertex';
import { Halfedge } from './Halfedge';
import { AttributeLayer } from './AttributeLayer';
import type { AttributeLayerInput } from './AttributeLayer';
import { addEdge } from '../operations/addEdge';
import { addFace } from '../operations/addFace';
import { addVertex } from '../operations/addVertex';
import { removeVertex } from '../operations/removeVertex';
import { removeEdge } from '../operations/removeEdge';
import { removeFace } from '../operations/removeFace';
import { cutFace } from '../operations/cutFace';
import { splitEdge } from '../operations/splitEdge';
import { setFromGeometry } from '../operations/setFromGeometry';
import { setFromPolygons } from '../operations/setFromPolygons';
import { toGeometry } from '../operations/toGeometry';
import { tessellate } from '../operations/tessellate';
import { updateFaceNormal } from '../operations/updateFaceNormal';
import { joinFaces, joinFacesAcrossEdge } from '../operations/joinFaces';
import { dissolveVertex } from '../operations/dissolveVertex';
import { limitedDissolve } from '../operations/limitedDissolve';
import { clearArray } from '../utils/array';


/**
 * Class representing an Halfedge Data Structure
 */
export class HalfedgeDS {

  readonly faces = new Array<Face>();
  readonly vertices = new Array<Vertex>();
  readonly halfedges = new Array<Halfedge>();

  // Lazily-computed triangle cache for tessellate(). Invalidated by every
  // topology mutator; position edits need a manual invalidateTessellation().
  private _tessellationCache: number[][] | null = null;
  private _tessellationDirty = true;

  // Per-corner attribute layers, keyed by name. Each layer's data is a flat
  // Float32Array indexed by halfedge array position (see AttributeLayer).
  private readonly _layers = new Map<string, AttributeLayer>();

  // halfedge -> array index, rebuilt on ingest/copy. Powers the per-corner read
  // API (halfedgeIndex). Falls back to an O(n) lookup for halfedges added by an
  // edit op since the last ingest (attribute carry-through is a later concern).
  private readonly _halfedgeIndex = new Map<Halfedge, number>();

  /**
   * Sets the halfedge structure from a BufferGeometry.
   * @param geometry BufferGeometry to read
   * @param tolerance Tolerance distance from which positions are considered equal
   */
  setFromGeometry(geometry: BufferGeometry, tolerance = 1e-10) {
    this.invalidateTessellation();
    return setFromGeometry(this, geometry, tolerance);
  }

  /**
   * Rebuilds the halfedge structure in place from an n-gon face table.
   *
   * A cube enters the structure as 6 quad {@link Face}s (not 12 triangles) and
   * keeps that n-gon identity — there is no fan-triangulation. Each polygon
   * becomes exactly one `Face`; shared edges between polygons become twin
   * halfedges (manifold = 2 faces per edge, boundary = 1).
   *
   * Vertex deduplication is identical to {@link setFromGeometry}: coincident
   * corners within `tolerance` collapse to one vertex (this is what turns a
   * cube's 24 corners into 8 vertices).
   *
   * Clears existing topology first (idempotent).
   *
   * @param positions    Flat vertex positions, length = 3 * vertCount.
   * @param faceOffsets  Run-length face table: polygon i's corners are
   *                     `cornerVerts[faceOffsets[i] .. faceOffsets[i+1])`.
   *                     Length = faceCount + 1, `faceOffsets[0] === 0`,
   *                     strictly increasing.
   * @param cornerVerts  Per-corner vertex index into `positions`.
   * @param tolerance    Vertex-merge tolerance (default = 1e-10).
   * @param layers       Optional per-corner attribute layers (uv/normal/tangent,
   *                     arbitrary itemSize), aligned to the run-length corner
   *                     order of `cornerVerts`.
   */
  setFromPolygons(
      positions: Float32Array | number[],
      faceOffsets: number[],
      cornerVerts: number[],
      tolerance = 1e-10,
      layers?: Record<string, AttributeLayerInput>) {
    this.invalidateTessellation();
    return setFromPolygons(this, positions, faceOffsets, cornerVerts, tolerance, layers);
  }

  /**
   * Recomputes a face's normal (Newell's method) into `target`.
   *
   * Explicit recompute entry point — call it after a topology mutation when a
   * fresh face normal is needed. Equivalent to `face.getNormal(target)`.
   *
   * @param face   Face whose normal to recompute.
   * @param target Vector3 to receive the unit normal.
   */
  updateFaceNormal(face: Face, target: Vector3) {
    return updateFaceNormal(face, target);
  }

  /**
   * Converts the halfedge structure back to a BufferGeometry.
   * Faces with more than 3 vertices are fan-triangulated.
   * Only faces (not boundary/free halfedges) are included.
   *
   * @returns A new indexed BufferGeometry
   */
  toGeometry() {
    return toGeometry(this);
  }

  /**
   * Triangulates every Face into a cached, lazily-computed list of triangles.
   *
   * Each n-gon face (n > 3) is ear-clipped so concave faces triangulate
   * correctly, unlike {@link toGeometry}'s fan. The result is cached and reused
   * until invalidated. Triangles are vertex-id triples `[vId0, vId1, vId2]`
   * preserving each face's CCW winding.
   *
   * Every topology mutator (addVertex/addEdge/addFace/clear/removeEdge/
   * removeVertex/removeFace/cutFace/splitEdge/setFromGeometry/setFromPolygons)
   * clears the cache automatically. Vertex **position** writes are not
   * observable (position is a readonly Vector3), yet they can change a concave
   * face's valid ears — call {@link invalidateTessellation} after editing
   * positions directly.
   *
   * @returns Cached triangle list (vertex-id triples).
   */
  tessellate(): number[][] {
    if (this._tessellationDirty || this._tessellationCache === null) {
      this._tessellationCache = tessellate(this);
      this._tessellationDirty = false;
    }
    return this._tessellationCache;
  }

  /**
   * Marks the tessellation cache stale (next {@link tessellate} recomputes).
   * Call after direct `vertex.position` edits; topology ops invalidate for you.
   */
  invalidateTessellation(): void {
    this._tessellationDirty = true;
    this._tessellationCache = null;
  }

  // -------------------------------------------------------------------------
  // Per-corner attribute layers
  // -------------------------------------------------------------------------

  /** Names of all stored attribute layers. */
  getAttributeNames(): string[] {
    return Array.from(this._layers.keys());
  }

  /** `true` if a layer named `name` is stored. */
  hasAttribute(name: string): boolean {
    return this._layers.has(name);
  }

  /**
   * Returns the layer named `name`, or `null` if absent. Missing layers never
   * throw — callers can branch on the result.
   */
  getAttribute(name: string): AttributeLayer | null {
    return this._layers.get(name) ?? null;
  }

  /**
   * Creates (or replaces) a layer named `name` sized to the current halfedge
   * count. Call after the topology is built (e.g. at the end of an ingest).
   * @returns The new layer.
   */
  createAttribute(name: string, itemSize: number): AttributeLayer {
    const layer = new AttributeLayer(name, itemSize, this.halfedges.length);
    this._layers.set(name, layer);
    return layer;
  }

  /** Removes the layer named `name`. `true` if it existed. */
  removeAttribute(name: string): boolean {
    return this._layers.delete(name);
  }

  /** Removes every attribute layer. */
  clearAttributes(): void {
    this._layers.clear();
  }

  /**
   * Array index of `halfedge` within {@link halfedges}, for indexing into
   * attribute layer data. Returns -1 if the halfedge is not tracked.
   *
   * The cached index map is rebuilt by ingest/copy ({@link rebuildHalfedgeIndex});
   * for a halfedge added by an edit op since the last rebuild, this falls back
   * to an O(n) scan (attribute carry-through across edits is a later concern).
   */
  halfedgeIndex(halfedge: Halfedge): number {
    const cached = this._halfedgeIndex.get(halfedge);
    if (cached !== undefined) {
      return cached;
    }
    return this.halfedges.indexOf(halfedge);
  }

  /**
   * Rebuilds the halfedge -> index map from the current {@link halfedges}
   * array. Called automatically by the ingest operations and {@link copy}.
   * Re-call after manually rebuilding topology if you then read attributes.
   */
  rebuildHalfedgeIndex(): void {
    this._halfedgeIndex.clear();
    for (let i = 0; i < this.halfedges.length; i++) {
      this._halfedgeIndex.set(this.halfedges[i], i);
    }
  }

  /**
   * Reads the per-corner values of layer `name` at `halfedge` into `out`
   * (`out.length >= itemSize`; reuse it across calls to avoid allocations).
   * Returns `true` if the layer exists and the halfedge is a tracked corner,
   * `false` otherwise (`out` left untouched — missing layers never throw).
   *
   * Typical per-face-loop read:
   * ```ts
   * const uv = struct.getAttribute('uv');          // null if absent
   * const out = new Array<number>(uv?.itemSize ?? 0);
   * for (const he of face.halfedge.nextLoop()) {
   *   if (struct.getAttributeValues('uv', he, out)) {
   *     // use out[0], out[1], ...
   *   }
   * }
   * ```
   */
  getAttributeValues(name: string, halfedge: Halfedge, out: number[]): boolean {
    const layer = this._layers.get(name);
    if (!layer) {
      return false;
    }
    const idx = this.halfedgeIndex(halfedge);
    if (idx < 0) {
      return false;
    }
    const base = idx * layer.itemSize;
    for (let c = 0; c < layer.itemSize; c++) {
      out[c] = layer.data[base + c];
    }
    return true;
  }

  /**
   * One representative halfedge per face loop in the structure.
   * Call `nextLoop()` on each entry to walk that loop.
   */
  loops() {
    const loops = new Array<Halfedge>();

    const handled = new Set<Halfedge>();

    for (const halfedge of this.halfedges) {
      if (!handled.has(halfedge)) {
        
        for (const he of halfedge.nextLoop()) {
          handled.add(he);
        }
        loops.push(halfedge);
      }
    }
    return loops;
  }

  clear() {
    this.invalidateTessellation();
    clearArray(this.faces);
    clearArray(this.vertices);
    clearArray(this.halfedges);
    this.clearAttributes();
    this._halfedgeIndex.clear();
    Vertex.resetIdCounter();
  }

  /**
   * Ergonomic n-gon constructor.
   *
   * `polygons[i] = [v0, v1, …, v(n-1)]` (CCW viewed from outside). Converts the
   * per-polygon index loops into a run-length face table and delegates to
   * {@link HalfedgeDS.setFromPolygons}.
   *
   * @param positions Flat vertex positions, length = 3 * vertCount.
   * @param polygons  Per-polygon corner-vertex-index loops.
   * @param tolerance Vertex-merge tolerance (default = 1e-10).
   * @param layers    Optional per-corner attribute layers, aligned to the
   *                  concatenated polygon corner order (== run-length order).
   * @returns A new HalfedgeDS built from the polygons.
   */
  static fromPolygons(
      positions: Float32Array | number[],
      polygons: number[][],
      tolerance = 1e-10,
      layers?: Record<string, AttributeLayerInput>): HalfedgeDS {
    const faceOffsets = [0];
    const cornerVerts = new Array<number>();
    for (const polygon of polygons) {
      for (const vertexIndex of polygon) {
        cornerVerts.push(vertexIndex);
      }
      faceOffsets.push(cornerVerts.length);
    }
    const struct = new HalfedgeDS();
    struct.setFromPolygons(positions, faceOffsets, cornerVerts, tolerance, layers);
    return struct;
  }

  /**
   * Replaces this structure's contents with a deep copy of `other`.
   *
   * Unlike the `toGeometry()` -> `setFromGeometry()` round-trip, `copy`
   * preserves the exact topology (no n-gon re-triangulation) and the original
   * vertex ids. The result is fully independent: mutating it does not affect
   * the source, and vice versa.
   *
   * Note: `this` and `other` must be distinct structures.
   *
   * @param other Structure to copy from
   * @returns this
   */
  copy(other: HalfedgeDS): this {
    this.clear();

    const vertexMap = new Map<Vertex, Vertex>();
    const halfedgeMap = new Map<Halfedge, Halfedge>();
    const faceMap = new Map<Face, Face>();

    // Vertices — preserve id and position
    for (const v of other.vertices) {
      const nv = new Vertex();
      nv.position.copy(v.position);
      nv.id = v.id;
      vertexMap.set(v, nv);
      this.vertices.push(nv);
    }

    // Halfedges — set origin vertex now; twin/next/prev/face wired below
    for (const he of other.halfedges) {
      const nhe = new Halfedge(vertexMap.get(he.vertex)!);
      halfedgeMap.set(he, nhe);
      this.halfedges.push(nhe);
    }

    // Faces — anchor halfedge comes from the halfedge map
    for (const f of other.faces) {
      const nf = new Face(halfedgeMap.get(f.halfedge)!);
      faceMap.set(f, nf);
      this.faces.push(nf);
    }

    // Wire halfedge links + face ownership
    for (const he of other.halfedges) {
      const nhe = halfedgeMap.get(he)!;
      nhe.twin = halfedgeMap.get(he.twin)!;
      nhe.next = halfedgeMap.get(he.next)!;
      nhe.prev = halfedgeMap.get(he.prev)!;
      nhe.face = he.face ? faceMap.get(he.face)! : null;
    }

    // Wire vertex.halfedge (may be null for isolated vertices)
    for (const v of other.vertices) {
      const nv = vertexMap.get(v)!;
      nv.halfedge = v.halfedge ? halfedgeMap.get(v.halfedge)! : null;
    }

    // Deep-copy attribute layers. Layer data is indexed by halfedge array
    // position, and copy() pushes halfedges in the same order as `other`, so a
    // Float32Array slice preserves the correspondence (an undo snapshot keeps
    // its attributes and is fully independent of the source).
    for (const name of other.getAttributeNames()) {
      const src = other.getAttribute(name);
      if (src) {
        const layer = this.createAttribute(name, src.itemSize);
        layer.data = src.data.slice();
      }
    }
    this.rebuildHalfedgeIndex();

    return this;
  }

  /**
   * Returns a deep, independent copy of this structure.
   * See {@link HalfedgeDS.copy} for semantics.
   *
   * @returns A new HalfedgeDS with identical topology and vertex ids
   */
  clone(): HalfedgeDS {
    const clone = new HalfedgeDS();
    clone.copy(this);
    return clone;
  }

  /**
   * Adds a new vertex to the structure at the given position and returns it.
   * If checkDuplicates is true, returns any existing vertex that matches the 
   * given position.
   * 
   * @param position New vertex position
   * @param checkDuplicates Enable/disable existing vertex matching, default false
   * @param tolerance Tolerance used for vertices position comparison
   */
  addVertex(
      position: Vector3,
      checkDuplicates = false,
      tolerance = 1e-10) {
    this.invalidateTessellation();
    return addVertex(this, position, checkDuplicates, tolerance);
  }

  /**
   * Adds an edge (i.e. a pair of halfedges) between the given vertices.
   * Requires vertices to be free, i.e., there is at least one free halfedge 
   * (i.e. without face) in their neighborhood.
   * 
   * @param v1 First vertex to link
   * @param v2 Second vertex to link
   * @param allowParallels Allows multiple pair of halfedges between vertices, default false
   * @returns Existing or new halfedge
   */
  addEdge(v1: Vertex, v2: Vertex, allowParallels = false) {
    this.invalidateTessellation();
    return addEdge(this, v1, v2, allowParallels)
  }

  /** Assigns a face to an existing halfedge loop. */
  addFace(halfedges: Halfedge[]) {
    this.invalidateTessellation();
    return addFace(this, halfedges);
  }

  /** Removes `vertex`. If `mergeFaces` (default), merges its incident faces instead of removing them. */
  removeVertex(vertex: Vertex, mergeFaces = true) {
    this.invalidateTessellation();
    return removeVertex(this, vertex, mergeFaces);
  }

  /** Removes the `halfedge` pair. If `mergeFaces` (default), merges the two incident faces instead of removing them. */
  removeEdge(halfedge: Halfedge, mergeFaces = true) {
    this.invalidateTessellation();
    return removeEdge(this, halfedge, mergeFaces);
  }

  removeFace(face: Face) {
    this.invalidateTessellation();
    return removeFace(this, face);
  }

  /**
   * Cuts the `face` between the vertices `v1` and `v2`.
   * v1 and v2 must either be vertices of the face or isolated vertices.
   *
   * To test if a new face is created:
   * ```ts
   *    const halfedge = struct.cutFace(face, v1, v2, true);
   *    if (halfedge.face !== halfedge.twin.face) {
   *      // Halfedges are on different faces / loops
   *      const existingFace = halfedge.face;
   *      const newFace = halfedge.twin.face;
   *    }
   * ```
   *
   * @param face Face to cut
   * @param v1 1st vertex
   * @param v2 2nd vertex
   * @param createNewFace whether to create a new face when cutting
   * @returns the cutting halfedge
   */
  cutFace(face: Face, v1: Vertex, v2: Vertex, createNewFace = true) {
    this.invalidateTessellation();
    return cutFace(this, face, v1, v2, createNewFace);
  }

  /** Splits `halfedge` at `position`, returning the newly created vertex. */
  splitEdge(halfedge: Halfedge, position: Vector3, tolerance = 1e-10) {
    this.invalidateTessellation();
    return splitEdge(this, halfedge, position, tolerance);
  }

  /**
   * Merges the two faces incident to `halfedge` into a single n-gon
   * (`BM_faces_join_pair`). The face on `halfedge`'s side survives.
   *
   * @returns The surviving (merged) face.
   * @throws if the edge has no face on either side.
   */
  joinFacesAcrossEdge(halfedge: Halfedge): Face {
    this.invalidateTessellation();
    return joinFacesAcrossEdge(this, halfedge);
  }

  /**
   * Merges an edge-connected set of faces into one n-gon (`BM_faces_join`).
   *
   * @returns The surviving (merged) face.
   * @throws on empty/duplicate/non-member input, or a non edge-connected region.
   */
  joinFaces(faces: Face[]): Face {
    this.invalidateTessellation();
    return joinFaces(this, faces);
  }

  /**
   * Dissolves a vertex: merges its incident faces and removes it
   * (`BM_vert_dissolve`). Guards reject isolated, double-edge, and double-face
   * (non-manifold) vertices; degenerate faces left behind are pruned.
   */
  dissolveVertex(vertex: Vertex): void {
    this.invalidateTessellation();
    return dissolveVertex(this, vertex);
  }

  /**
   * Dissolves edges whose adjacent faces meet within `angleLimit` radians
   * (`bm_edge_calc_dissolve_error`): the cheapest coplanar-ish edges merge
   * first via {@link joinFacesAcrossEdge}, recomputing the survivor's normal and
   * re-costing its neighbours. Delimit: NORMAL only.
   */
  limitedDissolve(angleLimit: number): void {
    this.invalidateTessellation();
    limitedDissolve(this, angleLimit);
  }

}







