import { Vector3 } from 'three';
import { HalfedgeDS } from '../core/HalfedgeDS';
import { addFace } from './addFace';
import { createSingleTriangle } from '../utils/fixtures';

describe('addFace', () => {

  test('creates face from 3 halfedges and assigns face ref to all', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(1, 0, 0));
    const v2 = struct.addVertex(new Vector3(0, 1, 0));

    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);
    const v2v0 = struct.addEdge(v2, v0);

    expect(struct.faces).toHaveLength(0);

    const face = addFace(struct, [v0v1, v1v2, v2v0]);

    // Face is returned and added to struct
    expect(face).not.toBeNull();
    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0]).toBe(face);

    // Face reference is set on every halfedge in the loop
    expect(v0v1.face).toBe(face);
    expect(v1v2.face).toBe(face);
    expect(v2v0.face).toBe(face);

    // Face halfedge reference points back to the first halfedge
    expect(face.halfedge).toBe(v0v1);
  });

  test('throws with empty array', () => {
    const struct = new HalfedgeDS();
    expect(() => addFace(struct, [])).toThrow('At least 3 halfedges required');
  });

  test('throws with 1 halfedge', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(1, 0, 0));
    const v0v1 = struct.addEdge(v0, v1);

    expect(() => addFace(struct, [v0v1])).toThrow('At least 3 halfedges required');
  });

  test('throws with 2 halfedges (minimum is 3)', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(1, 0, 0));
    const v2 = struct.addVertex(new Vector3(0, 1, 0));

    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);

    expect(() => addFace(struct, [v0v1, v1v2])).toThrow('At least 3 halfedges required');
  });

  test('throws when halfedge already has a face', () => {
    const { struct, v0v1, v1v2, v2v0 } = createSingleTriangle();

    // All halfedges already belong to the single face
    expect(v0v1.face).not.toBeNull();

    expect(() => addFace(struct, [v0v1, v1v2, v2v0])).toThrow(
      'Halfedge already has a face'
    );
  });

  test('face count is correct after adding a face', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(1, 0, 0));
    const v2 = struct.addVertex(new Vector3(0, 1, 0));

    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);
    const v2v0 = struct.addEdge(v2, v0);

    addFace(struct, [v0v1, v1v2, v2v0]);

    expect(struct.faces).toHaveLength(1);
  });

  test('halfedge face refs are correct after adding a face', () => {
    const struct = new HalfedgeDS();
    const v0 = struct.addVertex(new Vector3(0, 0, 0));
    const v1 = struct.addVertex(new Vector3(1, 0, 0));
    const v2 = struct.addVertex(new Vector3(0, 1, 0));

    const v0v1 = struct.addEdge(v0, v1);
    const v1v2 = struct.addEdge(v1, v2);
    const v2v0 = struct.addEdge(v2, v0);

    const face = addFace(struct, [v0v1, v1v2, v2v0]);

    // All three halfedges point to the same face
    expect(v0v1.face).toBe(face);
    expect(v1v2.face).toBe(face);
    expect(v2v0.face).toBe(face);

    // Twin halfedges are unaffected (no face)
    expect(v0v1.twin.face).toBeNull();
    expect(v1v2.twin.face).toBeNull();
    expect(v2v0.twin.face).toBeNull();
  });
});
