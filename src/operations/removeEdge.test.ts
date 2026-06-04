import { Vector3 } from 'three';
import { HalfedgeDS } from '../core/HalfedgeDS';
import { removeEdge } from './removeEdge';
import { createSingleTriangle, createDoubleTriangle } from '../utils/fixtures';

describe('removeEdge', () => {

  test('removes edge between isolated vertices: both halfedges removed, vertices become isolated', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(1, 0, 0));

    const v0v1 = struct.addEdge(v0, v1);
    const v1v0 = v0v1.twin;

    expect(struct.halfedges).toHaveLength(2);
    expect(v0.isIsolated()).toBe(false);
    expect(v1.isIsolated()).toBe(false);

    removeEdge(struct, v0v1);

    // Both halfedges are removed from the struct
    expect(struct.halfedges).toHaveLength(0);
    expect(struct.halfedges.includes(v0v1)).toBe(false);
    expect(struct.halfedges.includes(v1v0)).toBe(false);

    // Both vertices are now isolated
    expect(v0.isIsolated()).toBe(true);
    expect(v1.isIsolated()).toBe(true);
  });

  test('with mergeFaces=true between two faces: faces merge', () => {
    const { struct, v0, v1, v0v1, face0 } = createDoubleTriangle();

    // Before removal: 2 faces, shared edge v0v1
    expect(struct.faces).toHaveLength(2);

    // Remove the shared edge with mergeFaces=true (default)
    // This should keep face0 and remove face1
    removeEdge(struct, v0v1, true);

    // One face remains (the merged face)
    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0]).toBe(face0);

    // The shared halfedge pair is removed
    expect(struct.halfedges.includes(v0v1)).toBe(false);
    expect(struct.halfedges.includes(v0v1.twin)).toBe(false);

    // Vertices are still present
    expect(struct.vertices).toContain(v0);
    expect(struct.vertices).toContain(v1);
  });

  test('with mergeFaces=false: both faces removed', () => {
    const { struct, v0v1, face0, face1 } = createDoubleTriangle();

    expect(struct.faces).toHaveLength(2);

    removeEdge(struct, v0v1, false);

    // Both faces are removed
    expect(struct.faces).toHaveLength(0);
    expect(struct.faces.includes(face0)).toBe(false);
    expect(struct.faces.includes(face1)).toBe(false);

    // The halfedge pair is removed
    expect(struct.halfedges.includes(v0v1)).toBe(false);
    expect(struct.halfedges.includes(v0v1.twin)).toBe(false);
  });

  test('removes boundary edge (one side has face): face removed', () => {
    const { struct, v0v1, face } = createSingleTriangle();

    // v0v1 has a face, its twin is on the boundary (no face)
    expect(v0v1.face).toBe(face);
    expect(v0v1.twin.face).toBeNull();

    expect(struct.faces).toHaveLength(1);

    removeEdge(struct, v0v1);

    // Face is removed since only one side had a face
    expect(struct.faces).toHaveLength(0);

    // The halfedge pair is removed
    expect(struct.halfedges.includes(v0v1)).toBe(false);
    expect(struct.halfedges.includes(v0v1.twin)).toBe(false);
  });

  test('topology is consistent after removal (prev/next relinked)', () => {
    // Use createDoubleTriangle which builds two faces sharing edge v0-v1.
    // After removing v0v1 with mergeFaces=true, face0 absorbs face1's region
    // and the halfedge loop around face0 grows from 3 to 4 halfedges.
    const { struct, v0v1, face0 } = createDoubleTriangle();

    expect(struct.faces).toHaveLength(2);

    // Record v0v1's prev (will become the face's halfedge ref after merge)
    const v0v1Prev = v0v1.prev;

    removeEdge(struct, v0v1, true);

    // One face remains
    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0]).toBe(face0);

    // face0's halfedge reference is updated to the prev of the removed halfedge
    expect(face0.halfedge).toBe(v0v1Prev);

    // The removed halfedge pair is gone from the struct
    expect(struct.halfedges.includes(v0v1)).toBe(false);
    expect(struct.halfedges.includes(v0v1.twin)).toBe(false);

    // The merged face loop should now contain 4 halfedges (the quad).
    // Note: halfedges from the absorbed face1 region retain face=null since
    // removeEdge only updates the face halfedge pointer, not every halfedge's
    // face reference. The loop itself is still topologically valid.
    const loopHalfedges = Array.from(face0.halfedge.nextLoop());
    expect(loopHalfedges.length).toBe(4);

    // Verify prev/next are consistent throughout the loop
    for (let i = 0; i < loopHalfedges.length; i++) {
      const curr = loopHalfedges[i];
      const next = loopHalfedges[(i + 1) % loopHalfedges.length];
      expect(curr.next).toBe(next);
      expect(next.prev).toBe(curr);
    }
  });
});
