/*
 * Author: Axel Antoine
 * mail: ax.antoine@gmail.com
 * website: http://axantoine.com
 * Created on Mon Nov 14 2022
 *
 * Loki, Inria project-team with Université de Lille
 * within the Joint Research Unit UMR 9189 
 * CNRS - Centrale Lille - Université de Lille, CRIStAL
 * https://loki.lille.inria.fr
 *
 * Licence: Licence.md
 */

import { Vector3 } from "three";
import { addEdge, } from "../operations/addEdge";
import { addVertex } from "../operations/addVertex";
import { removeEdge } from "../operations/removeEdge";
import { HalfedgeDS } from "./HalfedgeDS";
import { Vertex } from "./Vertex";
import { generatorToArray } from "../utils/testutils";
import { addFace } from "../operations/addFace";
import { createOpenFan, createClosedTetrahedron, createDoubleTriangle } from "../utils/fixtures";

const vec_ = new Vector3();
let v1: Vertex, v2: Vertex, v3: Vertex, v4: Vertex;
const struct = new HalfedgeDS();

beforeEach(() => {
  struct.clear();
  v1 = addVertex(struct, vec_.set(1,1,1));
  v2 = addVertex(struct, vec_.set(2,2,2));
  v3 = addVertex(struct, vec_.set(3,3,3));
  v4 = addVertex(struct, vec_.set(4,4,4));
});

test('Vertex is isolated', () => {

  expect(v1.isIsolated()).toBe(true);
  expect(v2.isIsolated()).toBe(true);

  const half = addEdge(struct, v1, v2);

  expect(v1.isIsolated()).toBe(false);
  expect(v2.isIsolated()).toBe(false);

  removeEdge(struct, half);

  expect(v1.isIsolated()).toBe(true);
  expect(v2.isIsolated()).toBe(true);

});

test('Vertex is connected to another vertex', () => {

  expect(v1.isConnectedToVertex(v2)).toBe(false);
  expect(v2.isConnectedToVertex(v1)).toBe(false);

  const half = addEdge(struct, v1, v2);

  expect(v1.isConnectedToVertex(v2)).toBe(true);
  expect(v2.isConnectedToVertex(v1)).toBe(true);

  removeEdge(struct, half);

  expect(v1.isConnectedToVertex(v2)).toBe(false);
  expect(v2.isConnectedToVertex(v1)).toBe(false);

});

test('Vertex loop CW', () => {

  let array = generatorToArray(v1.loopCW());
  expect(array).toHaveLength(0);

  const v1v2 = addEdge(struct, v1, v2);
  const v1v3 = addEdge(struct, v1, v3);
  const v1v4 = addEdge(struct, v1, v4);

  array = generatorToArray(v1.loopCW());
  expect(array).toHaveLength(3);
  expect(array).toContain(v1v2);
  expect(array).toContain(v1v3);
  expect(array).toContain(v1v4);

  removeEdge(struct, v1v2);

  array = generatorToArray(v1.loopCW());
  expect(array).toHaveLength(2);
  expect(array).toContain(v1v3);
  expect(array).toContain(v1v4);

});

test('Vertex loop CCW', () => {

  let array = generatorToArray(v1.loopCCW());
  expect(array).toHaveLength(0);

  const v1v2 = addEdge(struct, v1, v2);
  const v1v3 = addEdge(struct, v1, v3);
  const v1v4 = addEdge(struct, v1, v4);

  array = generatorToArray(v1.loopCCW());
  expect(array).toHaveLength(3);
  expect(array).toContain(v1v2);
  expect(array).toContain(v1v3);
  expect(array).toContain(v1v4);

  removeEdge(struct, v1v2);

  array = generatorToArray(v1.loopCCW());
  expect(array).toHaveLength(2);
  expect(array).toContain(v1v3);
  expect(array).toContain(v1v4);

});

test('Boundary in halfedges loop', () => {

  let array = generatorToArray(v1.freeHalfedgesInLoop());
  expect(array).toHaveLength(0);

  const v1v2 = addEdge(struct, v1, v2);
  const v1v3 = addEdge(struct, v1, v3);
  const v1v4 = addEdge(struct, v1, v4);

  array = generatorToArray(v1.freeHalfedgesInLoop());
  expect(array).toHaveLength(3);
  expect(array).toContain(v1v2.twin);
  expect(array).toContain(v1v3.twin);
  expect(array).toContain(v1v4.twin);

  // Close 1-2-3 triangles
  const v2v3 = addEdge(struct, v2, v3);
  addFace(struct, [v1v2, v2v3, v1v3.twin]);
  array = generatorToArray(v1.freeHalfedgesInLoop());
  expect(array).toHaveLength(2);
  expect(array).toContain(v1v2.twin);
  expect(array).toContain(v1v4.twin);
  
  // Close 1-3-4 and 1-4-2 triangles
  const v3v4 = addEdge(struct, v3, v4);
  addFace(struct, [v3v4, v1v4.twin, v1v3]);

  const v4v2 = addEdge(struct, v4, v2);
  addFace(struct, [v4v2, v1v2.twin, v1v4]);

  array = generatorToArray(v1.freeHalfedgesInLoop());
  expect(array).toHaveLength(0);
});

test('Boundary out halfedges loop', () => {

  let array = generatorToArray(v1.freeHalfedgesOutLoop());
  expect(array).toHaveLength(0);

  const v1v2 = addEdge(struct, v1, v2);
  const v1v3 = addEdge(struct, v1, v3);
  const v1v4 = addEdge(struct, v1, v4);

  array = generatorToArray(v1.freeHalfedgesOutLoop());
  expect(array).toHaveLength(3);
  expect(array).toContain(v1v2);
  expect(array).toContain(v1v3);
  expect(array).toContain(v1v4);

  // Close 1-2-3 triangles
  const v2v3 = addEdge(struct, v2, v3);
  addFace(struct, [v1v2, v2v3, v1v3.twin]);
  array = generatorToArray(v1.freeHalfedgesOutLoop());
  expect(array).toHaveLength(2);
  expect(array).toContain(v1v3);
  expect(array).toContain(v1v4);
  
  // Close 1-3-4 and 1-4-2 triangles
  const v3v4 = addEdge(struct, v3, v4);
  addFace(struct, [v3v4, v1v4.twin, v1v3]);

  const v4v2 = addEdge(struct, v4, v2);
  addFace(struct, [v4v2, v1v2.twin, v1v4]);

  array = generatorToArray(v1.freeHalfedgesOutLoop());
  expect(array).toHaveLength(0);
});

describe("isFree", () => {
  const struct_ = new HalfedgeDS();

  beforeEach(() => {
    struct_.clear();
  });

  it("returns true for an isolated vertex", () => {
    const v = struct_.addVertex(vec_.set(5, 5, 5));
    expect(v.isFree()).toBe(true);
  });

  it("returns true for a vertex with edges but no faces", () => {
    const va = struct_.addVertex(vec_.set(0, 0, 0));
    const vb = struct_.addVertex(vec_.set(1, 0, 0));
    struct_.addEdge(va, vb);
    // Edge exists but no face has been assigned, so both halfedges are free
    expect(va.isFree()).toBe(true);
    expect(vb.isFree()).toBe(true);
  });

  it("returns true for a vertex with some faces and some free edges", () => {
    // Use open fan: center vertex has 2 faces (f0, f1) but also open edges
    const { c } = createOpenFan();
    expect(c.isFree()).toBe(true);
  });

  it("returns false for a fully enclosed vertex (all edges have faces)", () => {
    const { v0, v1, v2, v3 } = createClosedTetrahedron();
    expect(v0.isFree()).toBe(false);
    expect(v1.isFree()).toBe(false);
    expect(v2.isFree()).toBe(false);
    expect(v3.isFree()).toBe(false);
  });
});

describe("matchesPosition", () => {
  const struct_ = new HalfedgeDS();

  beforeEach(() => {
    struct_.clear();
  });

  it("returns true for exact same position", () => {
    const v = struct_.addVertex(vec_.set(1, 2, 3));
    expect(v.matchesPosition(new Vector3(1, 2, 3))).toBe(true);
  });

  it("returns true for position within tolerance", () => {
    const v = struct_.addVertex(vec_.set(1, 2, 3));
    const tiny = new Vector3(1, 2, 3 + 1e-12);
    expect(v.matchesPosition(tiny)).toBe(true);
  });

  it("returns false for position outside tolerance", () => {
    const v = struct_.addVertex(vec_.set(1, 2, 3));
    const far = new Vector3(1, 2, 4);
    expect(v.matchesPosition(far)).toBe(false);
  });

  it("respects custom tolerance", () => {
    const v = struct_.addVertex(vec_.set(0, 0, 0));
    const offset = new Vector3(0.01, 0, 0);
    // Default tolerance (1e-10): should not match
    expect(v.matchesPosition(offset)).toBe(false);
    // Larger tolerance: should match
    expect(v.matchesPosition(offset, 0.1)).toBe(true);
  });
});

describe("getHalfedgeToVertex", () => {
  const struct_ = new HalfedgeDS();

  beforeEach(() => {
    struct_.clear();
  });

  it("returns the halfedge for connected vertices", () => {
    const va = struct_.addVertex(vec_.set(0, 0, 0));
    const vb = struct_.addVertex(vec_.set(1, 0, 0));
    const edge = struct_.addEdge(va, vb);
    const result = va.getHalfedgeToVertex(vb);
    expect(result).toBe(edge);
  });

  it("returns null for not connected vertices", () => {
    const va = struct_.addVertex(vec_.set(0, 0, 0));
    const vb = struct_.addVertex(vec_.set(1, 0, 0));
    expect(va.getHalfedgeToVertex(vb)).toBeNull();
    expect(vb.getHalfedgeToVertex(va)).toBeNull();
  });
});

describe("commonFacesWithVertex", () => {
  it("returns shared faces for vertices sharing an edge", () => {
    const { v0, v1, face0, face1 } = createDoubleTriangle();
    // v0 and v1 share an edge that has two faces on either side
    const common = v0.commonFacesWithVertex(v1);
    expect(common).toHaveLength(2);
    expect(common).toContain(face0);
    expect(common).toContain(face1);
  });

  it("returns empty array for vertices not sharing faces", () => {
    const s = new HalfedgeDS();
    const va = s.addVertex(vec_.set(0, 0, 0));
    const vb = s.addVertex(vec_.set(1, 0, 0));
    const vc = s.addVertex(vec_.set(0, 1, 0));
    const vd = s.addVertex(vec_.set(10, 10, 10));
    const eab = s.addEdge(va, vb);
    const ebc = s.addEdge(vb, vc);
    const eca = s.addEdge(vc, va);
    s.addFace([eab, ebc, eca]);
    // vd is isolated, not sharing any face with va
    expect(va.commonFacesWithVertex(vd)).toHaveLength(0);
  });
});

describe("boundaryHalfedgesOutLoop", () => {
  it("returns only boundary outgoing halfedges for open mesh vertex", () => {
    const { c } = createOpenFan();
    const boundary = generatorToArray(c.boundaryHalfedgesOutLoop());
    // cv3 is the open edge from center to v3 — its outgoing halfedge should be boundary
    expect(boundary.length).toBeGreaterThan(0);
    for (const he of boundary) {
      expect(he.isBoundary()).toBe(true);
    }
  });

  it("returns empty for fully enclosed vertex", () => {
    const { v0, v1, v2, v3 } = createClosedTetrahedron();
    expect(generatorToArray(v0.boundaryHalfedgesOutLoop())).toHaveLength(0);
    expect(generatorToArray(v1.boundaryHalfedgesOutLoop())).toHaveLength(0);
    expect(generatorToArray(v2.boundaryHalfedgesOutLoop())).toHaveLength(0);
    expect(generatorToArray(v3.boundaryHalfedgesOutLoop())).toHaveLength(0);
  });
});

describe("boundaryHalfedgesInLoop", () => {
  it("returns twin of boundary incoming halfedges for open mesh vertex", () => {
    const { c } = createOpenFan();
    const boundary = generatorToArray(c.boundaryHalfedgesInLoop());
    expect(boundary.length).toBeGreaterThan(0);
    for (const he of boundary) {
      // boundaryHalfedgesInLoop yields twin of incoming boundary halfedges
      // each yielded halfedge should be the twin (i.e., pointing toward c)
      expect(he.isBoundary()).toBe(true);
    }
  });

  it("returns empty for fully enclosed vertex", () => {
    const { v0, v1, v2, v3 } = createClosedTetrahedron();
    expect(generatorToArray(v0.boundaryHalfedgesInLoop())).toHaveLength(0);
    expect(generatorToArray(v1.boundaryHalfedgesInLoop())).toHaveLength(0);
    expect(generatorToArray(v2.boundaryHalfedgesInLoop())).toHaveLength(0);
    expect(generatorToArray(v3.boundaryHalfedgesInLoop())).toHaveLength(0);
  });
});

