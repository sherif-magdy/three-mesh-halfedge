import { Vector3 } from 'three';
import { HalfedgeDS } from '../../src/core/HalfedgeDS';
import { Vertex } from '../../src/core/Vertex';
import { generatorSize } from '../helpers/testutils';
import { validateHalfedgeConsistency } from '../helpers/topologyValidation';

/** Three triangles fanned around a central interior vertex (valence 3). */
function fanAroundCentralVertex(): HalfedgeDS {
  return HalfedgeDS.fromPolygons(
    new Float32Array([
      0.5, 0.4, 0, // 0 = v (central)
      0, 0, 0,     // 1 = a
      1, 0, 0,     // 2 = b
      0.5, 1, 0,   // 3 = c
    ]),
    [[0, 1, 2], [0, 2, 3], [0, 3, 1]],
  );
}

/** A vertex is interior when every incident edge has a face on both sides. */
function isInterior(vt: Vertex): boolean {
  if (vt.isIsolated()) {
    return false;
  }
  for (const he of vt.loopCW()) {
    if (!he.face || !he.twin.face) {
      return false;
    }
  }
  return true;
}

describe('dissolveVertex', () => {

  test('interior valence-3 vertex -> one triangle, vertex removed', () => {
    const struct = fanAroundCentralVertex();
    expect(struct.faces).toHaveLength(3);
    expect(struct.vertices).toHaveLength(4);

    const interior = struct.vertices.filter(isInterior);
    expect(interior).toHaveLength(1);

    struct.dissolveVertex(interior[0]);

    expect(struct.faces).toHaveLength(1);
    expect(struct.vertices).toHaveLength(3);
    expect(struct.faces[0].size).toBe(3);
    validateHalfedgeConsistency(struct);
  });

  test('isolated vertex -> throws', () => {
    const struct = fanAroundCentralVertex();
    const isolated = struct.addVertex(new Vector3(9, 9, 9));
    expect(isolated.isIsolated()).toBe(true);
    expect(() => struct.dissolveVertex(isolated)).toThrow(/isolated/);
  });

  test('parallel (double) edges -> throws', () => {
    const struct = new HalfedgeDS();
    const v = struct.addVertex(new Vector3(0, 0, 0));
    const w = struct.addVertex(new Vector3(1, 0, 0));
    struct.addEdge(v, w);
    struct.addEdge(v, w, true); // second, parallel edge v-w

    expect(generatorSize(v.loopCW())).toBe(2); // both edges go to w
    expect(() => struct.dissolveVertex(v)).toThrow(/parallel|double/i);
  });
});
