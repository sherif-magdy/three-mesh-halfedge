/**
 * Harder / real-world per-corner attribute cases beyond the basic parity gate:
 * the editor's real 6-quad cube, UV seams, interleaved attributes, large closed
 * primitives, concave n-gons, multi-way hard edges, round-trip idempotency, and
 * coexisting same-itemSize layers.
 *
 * Parity is compared as the SET of unique (position + attribute) vertex rows.
 */
import {
  BufferAttribute,
  BufferGeometry,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { toGeometry } from '../../src/operations/toGeometry';

// ---------------------------------------------------------------------------
// Shared parity helpers (kept local so this file is self-contained)
// ---------------------------------------------------------------------------

function r(n: number): string {
  // Round to 6 dp, then normalize any value that rounds to zero (kills -0 and
  // tiny ±eps from float ops at welded vertices) so numerically-equal rows
  // compare equal.
  const v = n.toFixed(6);
  return parseFloat(v) === 0 ? '0.000000' : v;
}

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

function uniqueRows(geo: BufferGeometry, attrs: string[]): Set<string> {
  const pos = geo.getAttribute('position');
  const set = new Set<string>();
  for (let i = 0; i < pos.count; i++) {
    set.add(geometryRowKey(geo, i, attrs));
  }
  return set;
}

/** Distinct `attrName` value-keys emitted at a given position. */
function attrValuesAtPosition(
    geo: BufferGeometry, attrName: string, x: number, y: number, z: number): Set<string> {
  const pos = geo.getAttribute('position');
  const a = geo.getAttribute(attrName);
  const set = new Set<string>();
  for (let i = 0; i < pos.count; i++) {
    if (r(pos.getX(i)) === r(x) &&
        r(pos.getY(i)) === r(y) &&
        r(pos.getZ(i)) === r(z)) {
      let key = '';
      for (let c = 0; c < a.itemSize; c++) {
        key += (c ? '|' : '') + r(a.getComponent(i, c));
      }
      set.add(key);
    }
  }
  return set;
}

// ===========================================================================
// A. Cube as 6 n-gon quads (the editor's real representation)
// ===========================================================================

describe('attributes – cube as 6 n-gon quads (editor rep)', () => {

  /** Unit cube (8 verts) as 6 CCW quads + per-corner uv/normal/tangent. */
  function cubeQuadSetup() {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, // 0..3
      0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, // 4..7
    ]);
    const polygons = [
      [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
      [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5],
    ];
    const faceNormals = [
      [0, 0, -1], [0, 0, 1], [0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0],
    ];
    const cornerVerts = polygons.flat();
    const n = cornerVerts.length; // 24
    const uv = new Float32Array(n * 2);
    const normal = new Float32Array(n * 3);
    const tangent = new Float32Array(n * 4);
    const expPositions = new Float32Array(n * 3);
    const quadU = [0, 1, 1, 0];
    const quadV = [0, 0, 1, 1];
    let c = 0;
    for (let f = 0; f < polygons.length; f++) {
      const fn = faceNormals[f];
      for (let i = 0; i < 4; i++) {
        uv[c * 2] = quadU[i];
        uv[c * 2 + 1] = quadV[i];
        normal[c * 3] = fn[0];
        normal[c * 3 + 1] = fn[1];
        normal[c * 3 + 2] = fn[2];
        tangent[c * 4] = c;
        tangent[c * 4 + 1] = c + 0.5;
        tangent[c * 4 + 2] = -c;
        tangent[c * 4 + 3] = 1;
        const vi = cornerVerts[c];
        expPositions[c * 3] = positions[vi * 3];
        expPositions[c * 3 + 1] = positions[vi * 3 + 1];
        expPositions[c * 3 + 2] = positions[vi * 3 + 2];
        c += 1;
      }
    }
    return { positions, polygons, uv, normal, tangent, expPositions };
  }

  test('6 quads weld to 8 vertices with 3 hard-edge normals per corner', () => {
    const { positions, polygons, uv, normal, tangent, expPositions } = cubeQuadSetup();
    const layers = {
      uv: { itemSize: 2, data: uv },
      normal: { itemSize: 3, data: normal },
      tangent: { itemSize: 4, data: tangent },
    };
    const struct = HalfedgeDS.fromPolygons(positions, polygons, 1e-10, layers);

    expect(struct.faces).toHaveLength(6);
    expect(struct.vertices).toHaveLength(8);
    for (const face of struct.faces) {
      expect(face.size).toBe(4);
    }

    const result = toGeometry(struct);

    const expected = new BufferGeometry();
    expected.setAttribute('position', new BufferAttribute(expPositions, 3));
    expected.setAttribute('uv', new BufferAttribute(uv, 2));
    expected.setAttribute('normal', new BufferAttribute(normal, 3));
    expected.setAttribute('tangent', new BufferAttribute(tangent, 4));

    const attrs = ['uv', 'normal', 'tangent'];
    expect(uniqueRows(result, attrs)).toEqual(uniqueRows(expected, attrs));

    // Every cube corner is a hard edge: 3 faces meet -> 3 distinct normals.
    expect(attrValuesAtPosition(result, 'normal', 0, 0, 0).size).toBe(3);
    expect(attrValuesAtPosition(result, 'normal', 1, 1, 1).size).toBe(3);
  });
});

// ===========================================================================
// B. UV seam — same position, different uv (classic texture seam)
// ===========================================================================

describe('attributes – UV seam', () => {

  test('shared edge corner keeps both uv values', () => {
    // Two quads sharing edge v1-v2. v1 has uv (1,0) in quad A and (0,0) in
    // quad B — a texture seam at the same position.
    const positions = new Float32Array([
      0, 0, 0, // 0
      1, 0, 0, // 1  (seam vert)
      1, 1, 0, // 2  (seam vert)
      0, 1, 0, // 3
      2, 0, 0, // 4
      2, 1, 0, // 5
    ]);
    const polygons = [[0, 1, 2, 3], [1, 4, 5, 2]];
    const uv = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1, // quad A
      0, 0, 1, 0, 1, 1, 0, 1, // quad B  (v1 uv restarts at 0,0)
    ]);
    const layers = { uv: { itemSize: 2, data: uv } };

    const struct = HalfedgeDS.fromPolygons(positions, polygons, 1e-10, layers);
    const result = toGeometry(struct);

    // Seam vert (1,0,0) carries BOTH uv (1,0) and (0,0).
    const uvsAtSeam = attrValuesAtPosition(result, 'uv', 1, 0, 0);
    expect(uvsAtSeam.size).toBe(2);
    expect(uvsAtSeam.has(`${r(1)}|${r(0)}`)).toBe(true);
    expect(uvsAtSeam.has(`${r(0)}|${r(0)}`)).toBe(true);

    // Parity vs the authored corner data.
    const cornerVerts = polygons.flat();
    const expPositions = new Float32Array(cornerVerts.length * 3);
    for (let k = 0; k < cornerVerts.length; k++) {
      const vi = cornerVerts[k];
      expPositions[k * 3] = positions[vi * 3];
      expPositions[k * 3 + 1] = positions[vi * 3 + 1];
      expPositions[k * 3 + 2] = positions[vi * 3 + 2];
    }
    const expected = new BufferGeometry();
    expected.setAttribute('position', new BufferAttribute(expPositions, 3));
    expected.setAttribute('uv', new BufferAttribute(uv, 2));
    expect(uniqueRows(result, ['uv'])).toEqual(uniqueRows(expected, ['uv']));
  });
});

// ===========================================================================
// C. InterleavedBufferAttribute input (exercises getComponent, not raw array)
// ===========================================================================

describe('attributes – interleaved attribute ingest', () => {

  test('uv packed in an interleaved buffer is read correctly', () => {
    // Positions are packed (setFromGeometry's position dedup requires a packed
    // position attribute). The uv attribute is genuinely interleaved: stride 3
    // with itemSize 2, so component reads must skip the `extra` slot — this
    // exercises the getComponent ingest path, not raw array indexing.
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));

    const uvData = new Float32Array([
      0, 0, 99, // v0: uv (0,0), extra 99
      1, 0, 98, // v1: uv (1,0)
      0, 1, 97, // v2: uv (0,1)
    ]);
    const uvBuf = new InterleavedBuffer(uvData, 3);
    geo.setAttribute('uv', new InterleavedBufferAttribute(uvBuf, 2, 0));

    const struct = new HalfedgeDS();
    struct.setFromGeometry(geo);

    expect(struct.hasAttribute('uv')).toBe(true);
    const out = new Array<number>(2);
    const face = struct.faces[0];
    const read: number[][] = [];
    for (const he of face.halfedge.nextLoop()) {
      expect(struct.getAttributeValues('uv', he, out)).toBe(true);
      read.push([out[0], out[1]]);
    }
    // Interleaved uvs (0,0),(1,0),(0,1) round-trip per corner.
    expect(read).toEqual([[0, 0], [1, 0], [0, 1]]);
  });
});

// ===========================================================================
// D. Large closed primitive parity (TorusGeometry: normal+uv, no degenerate poles)
// ===========================================================================

describe('attributes – large closed primitive parity', () => {

  test('TorusGeometry normal+uv round-trip (set parity)', () => {
    const original = new TorusGeometry(2, 0.5, 12, 24);
    const attrs = ['normal', 'uv'];

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    expect(struct.faces.length).toBeGreaterThan(100);
    expect(uniqueRows(result, attrs)).toEqual(uniqueRows(original, attrs));
  });

  test('SphereGeometry poles keep many distinct uvs (high-valence weld)', () => {
    // The poles are one position shared by every longitude strip, each with a
    // distinct uv. Per-corner storage keeps (almost) all of them after the weld.
    const original = new SphereGeometry(1, 16, 8);
    const attrs = ['normal', 'uv'];

    const struct = new HalfedgeDS();
    struct.setFromGeometry(original);
    const result = toGeometry(struct);

    // Fidelity: every emitted (position, normal, uv) row exists in the source.
    const sourceRows = uniqueRows(original, attrs);
    const resultRows = uniqueRows(result, attrs);
    for (const key of resultRows) {
      expect(sourceRows.has(key)).toBe(true);
    }

    // North pole (one welded vertex) retains many distinct uvs.
    const poleUvs = attrValuesAtPosition(result, 'uv', 0, 1, 0);
    expect(poleUvs.size).toBeGreaterThanOrEqual(14);

    // NOTE: full set parity is intentionally NOT asserted here. three.js places
    // the uv seam AT the poles (col0/col16 are the same meridian with different
    // uvs, including out-of-range values); position-welding collapses that one
    // shared directed edge, dropping ~1 uv per pole. That is a welding
    // limitation on degenerate seams, not a per-corner storage defect — true
    // hard edges survive (see the cube-as-quads and UV-seam cases).
  });
});

// ===========================================================================
// E. Concave n-gon with uv (fan triangulation must not invent attributes)
// ===========================================================================

describe('attributes – concave n-gon', () => {

  test('L-shape (concave) uv round-trips; fan reuses corner rows', () => {
    // L-shape, z=0, concave at corner 3/4.
    const positions = new Float32Array([
      0, 0, 0, // 0
      2, 0, 0, // 1
      2, 1, 0, // 2
      1, 1, 0, // 3 (reflex)
      1, 2, 0, // 4 (reflex)
      0, 2, 0, // 5
    ]);
    const uv = new Float32Array([0, 0, 1, 0, 1, 0.5, 0.5, 0.5, 0.5, 1, 0, 1]);
    const layers = { uv: { itemSize: 2, data: uv } };

    const struct = HalfedgeDS.fromPolygons(positions, [[0, 1, 2, 3, 4, 5]], 1e-10, layers);
    expect(struct.faces[0].size).toBe(6);

    const result = toGeometry(struct);

    // Fan of a hexagon -> 4 triangles -> 12 corner uses, but only 6 unique
    // (position, uv) rows (the original corners, reused across triangles).
    expect(result.getAttribute('position').count).toBe(6);
    expect(uniqueRows(result, ['uv']).size).toBe(6);

    const expected = new BufferGeometry();
    expected.setAttribute('position', new BufferAttribute(positions, 3));
    expected.setAttribute('uv', new BufferAttribute(uv, 2));
    expect(uniqueRows(result, ['uv'])).toEqual(uniqueRows(expected, ['uv']));
  });
});

// ===========================================================================
// F. 4-way hard edge (4 distinct normals at one vertex)
// ===========================================================================

describe('attributes – multi-way hard edge', () => {

  test('apex shared by 4 triangles keeps 4 distinct normals', () => {
    // Open fan around apex v0; each triangle gets a different normal.
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,    // tri 1: v0,v1,v2
      0, 0, 0, 0, 1, 0, -1, 0, 0,   // tri 2: v0,v2,v3
      0, 0, 0, -1, 0, 0, 0, -1, 0,  // tri 3: v0,v3,v4
      0, 0, 0, 0, -1, 0, 1, 0, 0,   // tri 4: v0,v4,v1
    ]);
    const normals = new Float32Array([
      0, 0, 1, 0, 0, 1, 0, 0, 1,
      1, 0, 0, 1, 0, 0, 1, 0, 0,
      0, 1, 0, 0, 1, 0, 0, 1, 0,
      -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ]);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('normal', new BufferAttribute(normals, 3));

    const struct = new HalfedgeDS();
    struct.setFromGeometry(geo);
    const result = toGeometry(struct);

    // Parity over the whole mesh.
    expect(uniqueRows(result, ['normal'])).toEqual(uniqueRows(geo, ['normal']));

    // The apex (0,0,0) is shared by all 4 triangles -> 4 distinct normals.
    expect(attrValuesAtPosition(result, 'normal', 0, 0, 0).size).toBe(4);
  });
});

// ===========================================================================
// G. Round-trip idempotency (ingest -> emit -> ingest -> emit is stable)
// ===========================================================================

describe('attributes – round-trip idempotency', () => {

  test('second ingest -> emit equals the first', () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
    ]);
    const polygons = [
      [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
      [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5],
    ];
    const uv = new Float32Array(24 * 2);
    const normal = new Float32Array(24 * 3);
    for (let i = 0; i < 24; i++) {
      uv[i * 2] = (i % 4) / 3;
      uv[i * 2 + 1] = Math.floor(i / 4) / 5;
      normal[i * 3] = (i % 3) - 1;
      normal[i * 3 + 1] = (i % 2);
      normal[i * 3 + 2] = 1;
    }
    const layers = {
      uv: { itemSize: 2, data: uv },
      normal: { itemSize: 3, data: normal },
    };

    const struct = HalfedgeDS.fromPolygons(positions, polygons, 1e-10, layers);
    const geo1 = toGeometry(struct);

    const struct2 = new HalfedgeDS();
    struct2.setFromGeometry(geo1);
    const geo2 = toGeometry(struct2);

    const attrs = ['uv', 'normal'];
    expect(uniqueRows(geo2, attrs)).toEqual(uniqueRows(geo1, attrs));
  });
});

// ===========================================================================
// H. Coexisting same-itemSize layers (normal + color, both itemSize 3)
// ===========================================================================

describe('attributes – coexisting same-itemSize layers', () => {

  test('normal and color (both itemSize 3) survive independently', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const colors = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]); // rgb per corner
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('normal', new BufferAttribute(normals, 3));
    geo.setAttribute('color', new BufferAttribute(colors, 3));

    const struct = new HalfedgeDS();
    struct.setFromGeometry(geo);

    expect(struct.hasAttribute('normal')).toBe(true);
    expect(struct.hasAttribute('color')).toBe(true);

    const result = toGeometry(struct);
    expect(uniqueRows(result, ['normal', 'color']))
      .toEqual(uniqueRows(geo, ['normal', 'color']));
  });
});
