import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { validateHalfedgeConsistency } from '../helpers/topologyValidation';

// ---------------------------------------------------------------------------
// Stress suite for limitedDissolve (~100k triangles).
//
// Mesh: a triangulated W x H grid, 2*(W-1)*(H-1) triangles. The default
// W = 224 gives 99,458 triangles. Ingest uses the no-weld polygon path — the
// grid's corner indices are already shared, so position hashing is skipped.
//
// Grid size is overridable for scaled baseline runs: LD_STRESS_W=72 npx vitest …
// The timing bound is 5s under LD_STRESS_STRICT=1 (local perf gate), and a
// generous CI bound otherwise to stay flake-free on loaded runners.
// ---------------------------------------------------------------------------

const GRID_W = Number(process.env.LD_STRESS_W ?? 224);
const GRID_H = GRID_W;
const TRI_COUNT = 2 * (GRID_W - 1) * (GRID_H - 1);

const STRICT = process.env.LD_STRESS_STRICT === '1';
const TIME_BOUND_MS = STRICT ? 5_000 : 90_000;

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Builds the grid DS. `z` picks the height of vertex (xi, yi), which selects
 * how much of the mesh is coplanar (dissolvable) versus curved.
 */
function buildGridDS(z: (xi: number, yi: number) => number): HalfedgeDS {
  const width = GRID_W;
  const height = GRID_H;

  const positions = new Float32Array(width * height * 3);
  let p = 0;
  for (let yi = 0; yi < height; yi++) {
    for (let xi = 0; xi < width; xi++) {
      positions[p++] = xi;
      positions[p++] = yi;
      positions[p++] = z(xi, yi);
    }
  }

  const triCount = 2 * (width - 1) * (height - 1);
  const faceOffsets = new Array<number>(triCount + 1);
  const cornerVerts = new Array<number>(triCount * 3);
  let f = 0;
  let c = 0;
  faceOffsets[0] = 0;
  for (let yi = 0; yi < height - 1; yi++) {
    for (let xi = 0; xi < width - 1; xi++) {
      const a = yi * width + xi;      // bottom-left
      const b = a + 1;                // bottom-right
      const d = a + width;            // top-left
      const e = d + 1;                // top-right
      // CCW viewed from +z; the shared diagonal (a,e) appears in both
      // triangles with opposite directions so it pairs into twins.
      cornerVerts[c++] = a; cornerVerts[c++] = b; cornerVerts[c++] = e;
      faceOffsets[++f] = c;
      cornerVerts[c++] = a; cornerVerts[c++] = e; cornerVerts[c++] = d;
      faceOffsets[++f] = c;
    }
  }

  const struct = new HalfedgeDS();
  struct.setFromPolygons(positions, faceOffsets, cornerVerts, { weld: false });
  return struct;
}

/**
 * Mirrors `PlaneGeometry(1, 1, GRID_W, GRID_W)`: GRID_W segments per side
 * (GRID_W+1 vertices), fractional positions `xi/GRID_W - 0.5` in [-0.5, 0.5].
 * The even segment count is load-bearing for the regression below: with the
 * merge order it induces, rounding drift in the additively-maintained Newell
 * sums grows past the rotation gate and the drain re-walks the growing
 * survivor boundary per merge (odd segment counts dodge that order).
 */
function buildFractionalPlaneDS(): HalfedgeDS {
  const segments = GRID_W;
  const verts = segments + 1;

  const positions = new Float32Array(verts * verts * 3);
  let p = 0;
  for (let yi = 0; yi < verts; yi++) {
    for (let xi = 0; xi < verts; xi++) {
      positions[p++] = xi / segments - 0.5;
      positions[p++] = yi / segments - 0.5;
      positions[p++] = 0;
    }
  }

  const triCount = 2 * segments * segments;
  const faceOffsets = new Array<number>(triCount + 1);
  const cornerVerts = new Array<number>(triCount * 3);
  let f = 0;
  let c = 0;
  faceOffsets[0] = 0;
  for (let yi = 0; yi < segments; yi++) {
    for (let xi = 0; xi < segments; xi++) {
      const a = yi * verts + xi;
      const b = a + 1;
      const d = a + verts;
      const e = d + 1;
      cornerVerts[c++] = a; cornerVerts[c++] = b; cornerVerts[c++] = e;
      faceOffsets[++f] = c;
      cornerVerts[c++] = a; cornerVerts[c++] = e; cornerVerts[c++] = d;
      faceOffsets[++f] = c;
    }
  }

  const struct = new HalfedgeDS();
  struct.setFromPolygons(positions, faceOffsets, cornerVerts, { weld: false });
  return struct;
}

/** Euler characteristic of the disk, corrected for isolated vertices. */
function eulerDisk(struct: HalfedgeDS): number {
  let isolated = 0;
  for (const v of struct.vertices) {
    if (v.isIsolated()) {
      isolated += 1;
    }
  }
  const edges = struct.halfedges.length / 2;
  return struct.vertices.length - edges + struct.faces.length - isolated;
}

function dissolveTimed(struct: HalfedgeDS, angleLimit: number): number {
  const t0 = performance.now();
  struct.limitedDissolve(angleLimit);
  return performance.now() - t0;
}

describe('limitedDissolve – stress (~100k triangles)', () => {

  test(
    'coplanar grid fully dissolves into one n-gon',
    () => {
      const struct = buildGridDS(() => 0);
      expect(struct.faces).toHaveLength(TRI_COUNT);

      const ms = dissolveTimed(struct, deg2rad(30));
      console.log(`[stress] coplanar ${TRI_COUNT} tris -> 1 face: ${ms.toFixed(0)} ms`);

      // Maximal merge: a single face. Its loop is at least the grid perimeter;
      // how many degenerate self-sided chords survive on top of it depends on
      // heap tie order among the (all-equal) coplanar costs, so only the
      // perimeter is a hard bound.
      expect(struct.faces).toHaveLength(1);
      expect(struct.faces[0].size).toBeGreaterThanOrEqual(2 * (GRID_W - 1) + 2 * (GRID_H - 1));

      validateHalfedgeConsistency(struct);
      expect(eulerDisk(struct)).toBe(1);

      expect(ms).toBeLessThan(TIME_BOUND_MS);
    },
    300_000,
  );

  test(
    'fractional-coordinate coplanar plane dissolves as fast as the integer grid',
    () => {
      const struct = buildFractionalPlaneDS();
      const triCount = 2 * GRID_W * GRID_W;
      expect(struct.faces).toHaveLength(triCount);

      const ms = dissolveTimed(struct, deg2rad(5));
      console.log(`[stress] coplanar-fractional ${triCount} tris -> 1 face: ${ms.toFixed(0)} ms`);

      expect(struct.faces).toHaveLength(1);
      expect(struct.faces[0].size).toBeGreaterThanOrEqual(2 * GRID_W + 2 * GRID_H);

      validateHalfedgeConsistency(struct);
      expect(eulerDisk(struct)).toBe(1);

      expect(ms).toBeLessThan(TIME_BOUND_MS);
    },
    300_000,
  );

  test(
    'smooth-noise grid partially dissolves',
    () => {
      const struct = buildGridDS((x, y) => 1.5 * Math.sin(x * 0.31) * Math.cos(y * 0.23));
      expect(struct.faces).toHaveLength(TRI_COUNT);

      const ms = dissolveTimed(struct, deg2rad(5));
      console.log(`[stress] noise ${TRI_COUNT} tris -> ${struct.faces.length} faces: ${ms.toFixed(0)} ms`);

      // Some regions are flat enough to merge, curvature stops the rest.
      expect(struct.faces.length).toBeGreaterThan(1);
      expect(struct.faces.length).toBeLessThan(TRI_COUNT);

      validateHalfedgeConsistency(struct);
      expect(eulerDisk(struct)).toBe(1);

      expect(ms).toBeLessThan(TIME_BOUND_MS);
    },
    300_000,
  );

  test(
    'rough hash-noise grid mostly stays intact (seed + early-drain baseline)',
    () => {
      const struct = buildGridDS(
        (x, y) => (((x * 73856093) ^ (y * 19349663)) % 997) / 997 * 2);
      expect(struct.faces).toHaveLength(TRI_COUNT);

      const ms = dissolveTimed(struct, deg2rad(10));
      console.log(`[stress] rough ${TRI_COUNT} tris -> ${struct.faces.length} faces: ${ms.toFixed(0)} ms`);

      // A few accidental near-coplanar pairs may merge; the bulk must survive.
      expect(struct.faces.length).toBeGreaterThan(TRI_COUNT * 0.5);

      validateHalfedgeConsistency(struct);
      expect(eulerDisk(struct)).toBe(1);

      expect(ms).toBeLessThan(TIME_BOUND_MS);
    },
    300_000,
  );

  test(
    'per-corner uv layers survive the dissolve and final compaction',
    () => {
      // Small coplanar grid with a uv layer: after the full dissolve, every
      // surviving corner must still read the uv of its grid position — the
      // batched removal compacts the layer rows in lockstep with the
      // halfedge array.
      const width = 8;
      const triCount = 2 * (width - 1) * (width - 1);
      const positions = new Float32Array(width * width * 3);
      let p = 0;
      for (let yi = 0; yi < width; yi++) {
        for (let xi = 0; xi < width; xi++) {
          positions[p++] = xi; positions[p++] = yi; positions[p++] = 0;
        }
      }
      const faceOffsets = new Array<number>(triCount + 1);
      const cornerVerts = new Array<number>(triCount * 3);
      let f = 0; let c = 0;
      faceOffsets[0] = 0;
      for (let yi = 0; yi < width - 1; yi++) {
        for (let xi = 0; xi < width - 1; xi++) {
          const a = yi * width + xi; const b = a + 1;
          const d = a + width; const e = d + 1;
          cornerVerts[c++] = a; cornerVerts[c++] = b; cornerVerts[c++] = e;
          faceOffsets[++f] = c;
          cornerVerts[c++] = a; cornerVerts[c++] = e; cornerVerts[c++] = d;
          faceOffsets[++f] = c;
        }
      }
      const uvData = new Float32Array(cornerVerts.length * 2);
      for (let i = 0; i < cornerVerts.length; i++) {
        const v = cornerVerts[i];
        uvData[2 * i] = 0.1 * (v % width);
        uvData[2 * i + 1] = 0.1 * Math.floor(v / width);
      }

      const struct = new HalfedgeDS();
      struct.setFromPolygons(positions, faceOffsets, cornerVerts,
        { weld: false, layers: { uv: { itemSize: 2, data: uvData } } });

      struct.limitedDissolve(deg2rad(30));

      expect(struct.faces).toHaveLength(1);
      const out = new Array<number>(2);
      let corners = 0;
      let he = struct.faces[0].halfedge;
      const start = he;
      do {
        expect(struct.getAttributeValues('uv', he, out)).toBe(true);
        expect(out[0]).toBeCloseTo(0.1 * (he.vertex.position.x), 5);
        expect(out[1]).toBeCloseTo(0.1 * (he.vertex.position.y), 5);
        corners += 1;
        he = he.next;
      } while (he !== start);
      expect(corners).toBeGreaterThanOrEqual(2 * (width - 1) + 2 * (width - 1));
      expect(struct.getAttribute('uv')!.data.length).toBe(struct.halfedges.length * 2);
    },
    60_000,
  );
});
