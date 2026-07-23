/**
 * A per-corner (per face-loop halfedge) attribute layer.
 *
 * Stores a named float attribute — `uv` (itemSize 2), `normal` (3), `tangent`
 * (4), or any arbitrary itemSize — as a single flat {@link Float32Array},
 * indexed by the halfedge's position in {@link HalfedgeDS.halfedges}:
 *
 *   value(halfedge, component) = data[halfedgeIndex * itemSize + component]
 *
 * The array index of a given halfedge is resolved through the owning
 * {@link HalfedgeDS.halfedgeIndex} (rebuilt on ingest and copy). Keeping the
 * data in one typed array — rather than a per-corner object/map — makes
 * per-corner reads allocation-free, which matters for the hot per-frame reads
 * of downstream consumers.
 *
 * Why per-corner and not per-{@link Vertex}: `setFromGeometry` welds source
 * vertices by position, yet two source verts at the same position can carry
 * different UVs/normals (a hard-edge split). Storing attributes per-corner
 * (per face-loop halfedge) preserves that split; a per-vertex store would
 * silently lose one side of every hard edge on ingest.
 *
 * Attribute indices are valid for the ingest -> emit -> clone/copy lifecycle.
 * Carrying attributes *through* a topology edit op is a separate concern: the
 * owning structure rebuilds its index map on ingest/copy, but edit ops do not
 * yet maintain attribute slots (the read API degrades to an O(n) lookup for
 * halfedges added since the last ingest).
 */

/** Flat, per-corner input data used by the n-gon ingest path. */
export interface AttributeLayerInput {
  /** Components per corner (2 for uv, 3 for normal, 4 for tangent, ...). */
  readonly itemSize: number;
  /**
   * Flat values, length = `cornerCount * itemSize`, aligned to the run-length
   * corner order of the face table.
   */
  readonly data: number[] | Float32Array;
}

export class AttributeLayer {

  /** Layer name, e.g. `uv`, `normal`, `tangent`, or an arbitrary custom name. */
  readonly name: string;

  /** Components per corner (2 for uv, 3 for normal, 4 for tangent, ...). */
  readonly itemSize: number;

  /**
   * Flat typed data, length = `halfedgeCount * itemSize`, indexed by
   * `halfedgeIndex * itemSize + component`.
   */
  data: Float32Array;

  /**
   * @param name          Layer name.
   * @param itemSize      Components per corner (must be a positive integer).
   * @param halfedgeCount Number of halfedge slots to reserve (the layer is
   *                      sized to the structure's halfedge count at creation).
   */
  constructor(name: string, itemSize: number, halfedgeCount: number) {
    if (!Number.isInteger(itemSize) || itemSize < 1) {
      throw new Error(
        `AttributeLayer itemSize must be a positive integer (got ${itemSize}).`);
    }
    this.name = name;
    this.itemSize = itemSize;
    this.data = new Float32Array(halfedgeCount * itemSize);
  }

  /**
   * First-component offset of `halfedgeIndex` within {@link data}.
   * Returns a negative sentinel for the unknown-index (-1) case so callers can
   * branch without an extra check.
   */
  offsetOf(halfedgeIndex: number): number {
    return halfedgeIndex * this.itemSize;
  }
}
