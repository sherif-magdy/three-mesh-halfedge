/**
 * Per-corner attribute layers (uv/normal/tangent/arbitrary) — ingest, read,
 * emit, clone/copy, and the round-trip PARITY gate.
 *
 * Parity notion: a BufferGeometry -> HalfedgeDS -> BufferGeometry round-trip
 * preserves every authored per-corner (position + attribute) tuple. Because a
 * halfedge DS re-orders/dedups vertices, parity is compared as the SET of
 * unique vertex rows (order- and duplication-independent), not byte-identical
 * buffers.
 */
import { BufferAttribute, BufferGeometry, BoxGeometry } from 'three';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { AttributeLayer } from '../../src/core/AttributeLayer';
import { toGeometry } from '../../src/operations/toGeometry';

// ---------------------------------------------------------------------------
// Key/set helpers
// ---------------------------------------------------------------------------

/** Round to 6 dp so near-identical floats compare equal (parity, not bytes). */
function r(n: number): string {
  // Normalize any value that rounds to zero (kills -0 and tiny ±eps from float
  // ops) so numerically-equal rows compare equal.
  const v = n.toFixed(6);
  return parseFloat(v) === 0 ? '0.000000' : v;
}

/** Unique (position + attrs) row key for row `i` of a geometry. */
function geometryRowKey(geo: BufferGeometry, i: number, attrs: string[]): string {
  const pos = geo.getAttribute('position');
  let key = `${r(pos.getX(i))}|${r(pos.getY(i))}|${r(pos.getZ(i))}`;
  for (const name of attrs) {
    const a = geo.getAttribute(name);
    for (let c = 0; c < a.itemSize; c++) {
      key += `|${r(a.getComponent(i, c))}`;
    }
  }
  return key;
}

/** Set of unique vertex rows of `geo` over the given attribute names. */
function uniqueRows(geo: BufferGeometry, attrs: string[]): Set<string> {
  const pos = geo.getAttribute('position');
  const set = new Set<string>();
  for (let i = 0; i < pos.count; i++) {
    set.add(geometryRowKey(geo, i, attrs));
  }
  return set;
}

/** Distinct normal vectors emitted at a given position (hard-edge detector). */
function distinctNormalsAt(
    geo: BufferGeometry, x: number, y: number, z: number): Set<string> {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const set = new Set<string>();
  for (let i = 0; i < pos.count; i++) {
    if (r(pos.getX(i)) === r(x) &&
        r(pos.getY(i)) === r(y) &&
        r(pos.getZ(i)) === r(z)) {
      set.add(`${r(nor.getX(i))}|${r(nor.getY(i))}|${r(nor.getZ(i))}`);
    }
  }
  return set;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** BoxGeometry (carries uv+normal) with an authored per-row tangent added. */
function cubeWithTangent(): BoxGeometry {
  const box = new BoxGeometry(1, 1, 1);
  const count = box.getAttribute('position').count;
  const tangent = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // Arbitrary but distinct per row — only round-trip fidelity is asserted.
    tangent[i * 4 + 0] = i;
    tangent[i * 4 + 1] = i + 0.5;
    tangent[i * 4 + 2] = -i;
    tangent[i * 4 + 3] = 1;
  }
  box.setAttribute('tangent', new BufferAttribute(tangent, 4));
  return box;
}

/** Pentagon (z=0) with authored uv/normal/tangent per corner. */
function pentagonWithLayers() {
  const positions = new Float32Array([
    1, 0, 0,
    0.309, 0.951, 0,
    -0.809, 0.588, 0,
    -0.809, -0.588, 0,
    0.309, -0.951, 0,
  ]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0.5, 1, 0, 0.5]);
  const normal = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const tangent = new Float32Array([
    1, 0, 0, 1, 0, 1, 0, 1, -1, 0, 0, 1, 0, -1, 0, 1, 1, 1, 0, 1,
  ]);
  return { positions, uv, normal, tangent };
}

/** Builds a non-indexed geometry from positions + a single normal attribute. */
function quadWithHardEdge(): BufferGeometry {
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 1, 1, 0, // tri 1
    0, 0, 0, 1, 1, 0, 0, 1, 0, // tri 2 (shares edge v0–v2)
  ]);
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1,    // tri 1: +z
    0, 0, -1, 0, 0, -1, 0, 0, -1, // tri 2: -z  (hard edge along v0–v2)
  ]);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('normal', new BufferAttribute(normals, 3));
  return geo;
}

// ===========================================================================
// 1. setFromGeometry ingest
// ===========================================================================

describe('attributes – setFromGeometry ingest', () => {

  test('BoxGeometry normal+uv are ingested as per-corner layers', () => {
    const struct = new HalfedgeDS();
    struct.setFromGeometry(new BoxGeometry(1, 1, 1));

    expect(struct.hasAttribute('normal')).toBe(true);
    expect(struct.hasAttribute('uv')).toBe(true);

    const normal = struct.getAttribute('normal');
    expect(normal).not.toBeNull();
    // Sized to the halfedge count × itemSize.
    expect(normal!.data.length).toBe(struct.halfedges.length * 3);

    // Reading a face corner yields an axis-aligned cube normal (unit length 1).
    const face = struct.faces[0];
    const out = new Array<number>(3);
    let read = 0;
    for (const he of face.halfedge.nextLoop()) {
      expect(struct.getAttributeValues('normal', he, out)).toBe(true);
      const len = Math.hypot(out[0], out[1], out[2]);
      expect(len).toBeCloseTo(1, 6);
      read += 1;
    }
    expect(read).toBe(3);
  });

  test('arbitrary itemSize attribute (weight, itemSize 1) is ingested', () => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    geo.setAttribute('weight', new BufferAttribute(new Float32Array([10, 20, 30]), 1));

    const struct = new HalfedgeDS();
    struct.setFromGeometry(geo);

    expect(struct.hasAttribute('weight')).toBe(true);
    expect(struct.getAttribute('weight')!.itemSize).toBe(1);
  });
});

// ===========================================================================
// 2. PARITY GATE — cube + n-gon + hard-edge
// ===========================================================================

describe('attributes – round-trip parity (gate)', () => {

  test('cube: uv+normal+tangent round-trip (set parity)', () => {
    const original = cubeWithTangent();
    const attrs = ['uv', 'normal', 'tangent'];

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    for (const name of attrs) {
      expect(result.hasAttribute(name)).toBe(true);
    }
    // The set of unique (position + uv + normal + tangent) rows is preserved.
    expect(uniqueRows(result, attrs)).toEqual(uniqueRows(original, attrs));
  });

  test('plain BoxGeometry uv+normal round-trip (set parity)', () => {
    const original = new BoxGeometry(1, 1, 1);
    const attrs = ['normal', 'uv'];

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    expect(uniqueRows(result, attrs)).toEqual(uniqueRows(original, attrs));
  });

  test('hard-edge: same position, different normals survive per-corner', () => {
    const original = quadWithHardEdge();
    const attrs = ['normal'];

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    // Set parity over (position, normal).
    expect(uniqueRows(result, attrs)).toEqual(uniqueRows(original, attrs));

    // The shared corner (0,0,0) must keep BOTH normals — the whole point of
    // per-corner (not per-vertex) attribute storage.
    const normalsAtOrigin = distinctNormalsAt(result, 0, 0, 0);
    expect(normalsAtOrigin.size).toBe(2);
    expect(normalsAtOrigin.has(`${r(0)}|${r(0)}|${r(1)}`)).toBe(true);
    expect(normalsAtOrigin.has(`${r(0)}|${r(0)}|${r(-1)}`)).toBe(true);
  });

  test('n-gon: pentagon uv+normal+tangent round-trips via fromPolygons', () => {
    const { positions, uv, normal, tangent } = pentagonWithLayers();
    const layers = {
      uv: { itemSize: 2, data: uv },
      normal: { itemSize: 3, data: normal },
      tangent: { itemSize: 4, data: tangent },
    };

    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4]], 1e-10, layers);
    expect(struct.faces[0].size).toBe(5);

    const result = toGeometry(struct);

    // Expected rows: build a non-indexed geometry from the same source data.
    const expected = new BufferGeometry();
    expected.setAttribute('position', new BufferAttribute(positions, 3));
    expected.setAttribute('uv', new BufferAttribute(uv, 2));
    expected.setAttribute('normal', new BufferAttribute(normal, 3));
    expected.setAttribute('tangent', new BufferAttribute(tangent, 4));

    const attrs = ['uv', 'normal', 'tangent'];
    expect(uniqueRows(result, attrs)).toEqual(uniqueRows(expected, attrs));
  });

  test('arbitrary itemSize (weight) round-trips', () => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    geo.setAttribute('weight', new BufferAttribute(new Float32Array([10, 20, 30]), 1));

    const struct = new HalfedgeDS();
    struct.setFromGeometry(geo);
    const result = toGeometry(struct);

    expect(result.hasAttribute('weight')).toBe(true);
    expect(uniqueRows(result, ['weight'])).toEqual(uniqueRows(geo, ['weight']));
  });
});

// ===========================================================================
// 3. Per-corner read API (per face loop)
// ===========================================================================

describe('attributes – per-face-loop read API', () => {

  test('fromPolygons layers read back per corner in loop order', () => {
    const { positions, uv } = pentagonWithLayers();
    const layers = { uv: { itemSize: 2, data: uv } };

    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4]], 1e-10, layers);

    const face = struct.faces[0];
    const out = new Array<number>(2);
    const read: number[][] = [];
    for (const he of face.halfedge.nextLoop()) {
      expect(struct.getAttributeValues('uv', he, out)).toBe(true);
      read.push([out[0], out[1]]);
    }
    // 5 corners, in the authored uv order.
    expect(read).toHaveLength(5);
    const expected = [
      [uv[0], uv[1]], [uv[2], uv[3]], [uv[4], uv[5]], [uv[6], uv[7]], [uv[8], uv[9]],
    ];
    expect(read).toEqual(expected);
  });

  test('halfedgeIndex is stable and matches array position', () => {
    const struct = new HalfedgeDS();
    struct.setFromGeometry(new BoxGeometry(1, 1, 1));
    for (let i = 0; i < struct.halfedges.length; i++) {
      expect(struct.halfedgeIndex(struct.halfedges[i])).toBe(i);
    }
  });
});

// ===========================================================================
// 4. clone / copy preservation
// ===========================================================================

describe('attributes – clone/copy preservation', () => {

  test('clone preserves all layers with equal data', () => {
    const struct = new HalfedgeDS();
    struct.setFromGeometry(cubeWithTangent());

    const clone = struct.clone();

    expect(new Set(clone.getAttributeNames())).toEqual(
      new Set(struct.getAttributeNames()));

    for (const name of struct.getAttributeNames()) {
      const src = struct.getAttribute(name)!;
      const dst = clone.getAttribute(name)!;
      expect(dst.itemSize).toBe(src.itemSize);
      expect(Array.from(dst.data)).toEqual(Array.from(src.data));
    }
  });

  test('clone is independent — mutating the clone leaves the source intact', () => {
    const struct = new HalfedgeDS();
    struct.setFromGeometry(new BoxGeometry(1, 1, 1));
    const clone = struct.clone();

    const srcNormal = struct.getAttribute('normal')!;
    const clnNormal = clone.getAttribute('normal')!;

    const before = srcNormal.data[0];
    clnNormal.data[0] = 999;
    expect(srcNormal.data[0]).toBe(before); // source unchanged
    expect(clnNormal.data[0]).toBe(999);
  });

  test('copy() deep-copies layers into an existing structure', () => {
    const struct = new HalfedgeDS();
    struct.setFromGeometry(cubeWithTangent());

    const target = new HalfedgeDS();
    target.copy(struct);

    expect(new Set(target.getAttributeNames())).toEqual(
      new Set(struct.getAttributeNames()));
    const a = struct.getAttribute('tangent')!;
    const b = target.getAttribute('tangent')!;
    expect(Array.from(b.data)).toEqual(Array.from(a.data));
    b.data[0] = -42;
    expect(a.data[0]).not.toBe(-42);
  });
});

// ===========================================================================
// 5. Graceful absence + manual registry ops
// ===========================================================================

describe('attributes – graceful absence', () => {

  test('position-only geometry yields no layers and legacy emit', () => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));

    const struct = new HalfedgeDS();
    struct.setFromGeometry(geo);

    expect(struct.getAttributeNames()).toHaveLength(0);
    expect(struct.getAttribute('uv')).toBeNull();
    expect(struct.hasAttribute('normal')).toBe(false);

    const out = new Array<number>(3);
    expect(struct.getAttributeValues('normal', struct.faces[0].halfedge, out))
      .toBe(false);

    // No layers -> legacy emit (no normal attribute on the output).
    const emitted = struct.toGeometry();
    expect(emitted.hasAttribute('normal')).toBe(false);
  });

  test('createAttribute / removeAttribute / hasAttribute', () => {
    const struct = new HalfedgeDS();
    struct.setFromGeometry(new BoxGeometry(1, 1, 1));

    const layer = struct.createAttribute('color', 3);
    expect(layer).toBeInstanceOf(AttributeLayer);
    expect(struct.hasAttribute('color')).toBe(true);
    expect(layer.data.length).toBe(struct.halfedges.length * 3);

    expect(struct.removeAttribute('color')).toBe(true);
    expect(struct.hasAttribute('color')).toBe(false);
    expect(struct.removeAttribute('color')).toBe(false); // already gone
  });

  test('createAttribute rejects non-positive itemSize', () => {
    const struct = new HalfedgeDS();
    expect(() => struct.createAttribute('bad', 0)).toThrow(/positive integer/);
    expect(() => struct.createAttribute('bad', 2.5)).toThrow(/positive integer/);
  });

  test('fromPolygons rejects a layer whose data length mismatches corner count', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    // triangle has 3 corners; supply 4 uv pairs (8 values) -> mismatch.
    const badLayers = { uv: { itemSize: 2, data: new Float32Array(8) } };
    expect(() => HalfedgeDS.fromPolygons(
      positions, [[0, 1, 2]], 1e-10, badLayers)).toThrow(/expected 3 corners/);
  });

  test('clear() drops all layers', () => {
    const struct = new HalfedgeDS();
    struct.setFromGeometry(new BoxGeometry(1, 1, 1));
    expect(struct.getAttributeNames().length).toBeGreaterThan(0);
    struct.clear();
    expect(struct.getAttributeNames()).toHaveLength(0);
  });
});
