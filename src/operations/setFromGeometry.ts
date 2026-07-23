/*
 * Author: Axel Antoine
 * mail: ax.antoine@gmail.com
 * website: http://axantoine.com
 * Created on Fri Nov 18 2022
 *
 * Loki, Inria project-team with Université de Lille
 * within the Joint Research Unit UMR 9189 
 * CNRS - Centrale Lille - Université de Lille, CRIStAL
 * https://loki.lille.inria.fr
 *
 * Licence: Licence.md
 */

import { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Vector3 } from "three";
import { Halfedge } from "../core/Halfedge";
import { HalfedgeDS } from "../core/HalfedgeDS";
import { Vertex } from "../core/Vertex";
import { lazy } from "../utils/lazy";

const pos_ = lazy(() => new Vector3());

export function setFromGeometry(
    struct: HalfedgeDS,
    geometry: BufferGeometry,
    tolerance= 1e-10) {

  struct.clear();

  // Check position and normal attributes
  if (!geometry.hasAttribute("position")) {
    throw new Error("BufferGeometry does not have a position BufferAttribute.");
  }

  const positions = geometry.getAttribute('position');

  // Get the merged vertices Array
  const indexVertexArray = computeVerticesIndexArray(positions, tolerance);

  // If the geometry is not indexed, we get the indexes of faces vertices from
  // the position buffer attribute directly in group of 3
  let nbOfFaces = positions.count/3;
  let getVertexIndex = function(bufferIndex: number) {
    return indexVertexArray[bufferIndex];
  }
  // Otherwise, if the geometry is indexed, we get the index of faces vertices
  // from the index buffer in group of 3
  const indexBuffer = geometry.getIndex();
  if (indexBuffer) {
    nbOfFaces = indexBuffer.count/3;
    getVertexIndex = function(bufferIndex: number) {
      return indexVertexArray[indexBuffer.array[bufferIndex]];
    }
  }

  // Raw source-row index for a face-corner's attributes. Attributes
  // (uv/normal/tangent) are per source-row, NOT per welded vertex: two source
  // rows at the same position can carry different UVs/normals (a hard-edge
  // split), so the attribute row is the index BEFORE applying the position
  // weld. This is what lets the split survive setFromGeometry's vertex merge.
  let getCornerAttributeIndex = function(bufferIndex: number) {
    return bufferIndex;
  };
  if (indexBuffer) {
    getCornerAttributeIndex = function(bufferIndex: number) {
      return indexBuffer.array[bufferIndex];
    };
  }

  // Save halfedges in a map where with a hash <src-vertex-id>
  // their hash is index1-index2, so that it is easier to find the twin
  const halfedgeMap = new Map<string, Halfedge>();
  const vertexMap = new Map<number, Vertex>();

  // face-loop halfedge -> its raw source-row index (for attribute ingest).
  const cornerSourceIndex = new Map<Halfedge, number>();

  const loopHalfedges = new Array<Halfedge>(3).fill({} as Halfedge);

  for (let faceIndex = 0; faceIndex < nbOfFaces; faceIndex++) {

    for (let i=0; i<3; i++) {

      // Get the source vertex v1
      const i1 = getVertexIndex(faceIndex*3 + i);
      let v1 = vertexMap.get(i1);
      if (!v1) {
        pos_().fromBufferAttribute(positions, i1);
        v1 = struct.addVertex(pos_());
        vertexMap.set(i1, v1);
      }

      // Get the destitation vertex
      const i2 = getVertexIndex(faceIndex*3 + (i+1)%3);
      let v2 = vertexMap.get(i2);
      if (!v2) {
        pos_().fromBufferAttribute(positions, i2);
        v2 = struct.addVertex(pos_());
        vertexMap.set(i2, v2);
      }

      // Get the halfedge from v1 to v2
      const hash1 = i1+'-'+i2;
      let h1 = halfedgeMap.get(hash1);

      if (!h1) {

        h1 = struct.addEdge(v1, v2);
        const h2 = h1.twin;
        const hash2 = i2+'-'+i1;
        halfedgeMap.set(hash1, h1);
        halfedgeMap.set(hash2, h2);
      }
      
      loopHalfedges[i] = h1;

      // h1 is this corner's halfedge (origin = corner vertex). Record its raw
      // source-row so per-corner attributes can be mapped after the build.
      cornerSourceIndex.set(h1, getCornerAttributeIndex(faceIndex * 3 + i));
    }

    struct.addFace(loopHalfedges);
  }

  // Map per-corner attributes from the source geometry into the structure.
  ingestGeometryAttributes(struct, geometry, cornerSourceIndex);

  // halfedge -> array index, powering the per-corner read API.
  struct.rebuildHalfedgeIndex();
}

/**
 * Copies every non-position attribute of `geometry` (uv/normal/tangent and any
 * other) into per-corner layers on `struct`, indexed by halfedge array position.
 *
 * `cornerSourceIndex` maps each face-loop halfedge to its raw source-row index
 * in the geometry's attribute arrays. Reading from the raw row (NOT the welded
 * vertex) is what preserves hard-edge splits: two corners welding to one vertex
 * but coming from different source rows keep their distinct UVs/normals.
 *
 * Layers are sized to the current halfedge count; free/boundary halfedges
 * (no face) are skipped — only face-loop corners carry attribute data.
 */
function ingestGeometryAttributes(
    struct: HalfedgeDS,
    geometry: BufferGeometry,
    cornerSourceIndex: Map<Halfedge, number>) {

  const names = Object.keys(geometry.attributes).filter(n => n !== 'position');
  if (names.length === 0) {
    return;
  }

  for (const name of names) {
    const attr = geometry.getAttribute(name);
    const itemSize = attr.itemSize;
    const layer = struct.createAttribute(name, itemSize);

    const halfedges = struct.halfedges;
    for (let i = 0; i < halfedges.length; i++) {
      const he = halfedges[i];
      // Free/boundary halfedge — not a corner; leaves the slot zeroed.
      if (he.face === null) {
        continue;
      }
      const srcRow = cornerSourceIndex.get(he);
      if (srcRow === undefined) {
        continue;
      }
      const dstBase = i * itemSize;
      for (let c = 0; c < itemSize; c++) {
        layer.data[dstBase + c] = attr.getComponent(srcRow, c);
      }
    }
  }
}



/**
 * Returns an array where each index points to its new index in the buffer
 * attribute
 * 
 * @param positions Vertices positions buffer
 * @param tolerance Distance tolerance of the vertices to merge
 * @returns 
 */
export function computeVerticesIndexArray(
    positions: BufferAttribute | InterleavedBufferAttribute,
    tolerance = 1e-10){

  const decimalShift = Math.log10(1 / tolerance);
  const shiftMultiplier = Math.pow(10, decimalShift);

  const hashMap = new Map<string, number>();
  const indexArray = new Array<number>();

  for (let i=0; i < positions.count; i++) {
    // Compute a hash based on the vertex position rounded to a given precision
    let hash = "";
    for (let j=0; j<3; j++) {
      hash += `${Math.round(positions.array[i*3+j] * shiftMultiplier)}`;
    }

    // If hash already exist, then set the buffer index to the existing vertex,
    // otherwise, create it
    let vertexIndex = hashMap.get(hash);
    if (vertexIndex === undefined) {
      vertexIndex = i;
      hashMap.set(hash, i);
    }
    indexArray.push(vertexIndex);
  }
  return indexArray;
}



