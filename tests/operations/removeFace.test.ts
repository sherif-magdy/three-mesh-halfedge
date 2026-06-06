import { Face } from '../../src/core/Face';
import { removeFace } from '../../src/operations/removeFace';
import { createSingleTriangle, createDoubleTriangle } from '../helpers/fixtures';

describe('removeFace', () => {

  test('removes the only face: face removed from struct, all halfedges get face=null, halfedges remain', () => {
    const { struct, face, v0v1, v1v2, v2v0 } = createSingleTriangle();

    // Precondition: one face, halfedges all reference it
    expect(struct.faces).toHaveLength(1);
    expect(v0v1.face).toBe(face);
    expect(v1v2.face).toBe(face);
    expect(v2v0.face).toBe(face);

    const halfedgeCountBefore = struct.halfedges.length;

    removeFace(struct, face);

    // Face is removed from struct.faces
    expect(struct.faces).toHaveLength(0);
    expect(struct.faces.includes(face)).toBe(false);

    // All face halfedges have face set to null
    expect(v0v1.face).toBeNull();
    expect(v1v2.face).toBeNull();
    expect(v2v0.face).toBeNull();

    // Halfedges themselves are NOT removed from the struct
    expect(struct.halfedges).toHaveLength(halfedgeCountBefore);
    expect(struct.halfedges.includes(v0v1)).toBe(true);
    expect(struct.halfedges.includes(v1v2)).toBe(true);
    expect(struct.halfedges.includes(v2v0)).toBe(true);
  });

  test('removes one of multiple faces: only target face removed, only its halfedges affected', () => {
    const { struct, face0, face1 } = createDoubleTriangle();

    expect(struct.faces).toHaveLength(2);

    // Collect actual halfedges belonging to each face via the loop
    const face0Halfedges = Array.from(face0.halfedge.nextLoop());
    const face1Halfedges = Array.from(face1.halfedge.nextLoop());

    // Precondition: each face's halfedges reference their respective face
    for (const he of face0Halfedges) {
      expect(he.face).toBe(face0);
    }
    for (const he of face1Halfedges) {
      expect(he.face).toBe(face1);
    }

    removeFace(struct, face1);

    // Only face1 is removed; face0 remains
    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0]).toBe(face0);

    // face1 halfedges now have face=null
    for (const he of face1Halfedges) {
      expect(he.face).toBeNull();
    }

    // face0 halfedges are unaffected
    for (const he of face0Halfedges) {
      expect(he.face).toBe(face0);
    }
  });

  test('removing a face not in struct.faces is a no-op', () => {
    const { struct, face, v0v1 } = createSingleTriangle();

    // Create an orphan Face that is not in struct.faces
    const orphanFace = new Face(v0v1);

    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0]).toBe(face);

    // Removing the orphan face does nothing
    removeFace(struct, orphanFace);

    expect(struct.faces).toHaveLength(1);
    expect(struct.faces[0]).toBe(face);

    // The original face's halfedges are unaffected
    expect(v0v1.face).toBe(face);
  });
});
