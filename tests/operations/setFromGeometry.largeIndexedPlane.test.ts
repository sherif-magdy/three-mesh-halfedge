import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, PlaneGeometry } from 'three';
import { HalfedgeDS } from '../../src';

describe('setFromGeometry – weld hash aliasing', () => {
  it('keeps distinct corners whose rounded digits alias apart', () => {
    // Coordinates lifted from a 130-segment plane where the unseparated
    // hash collided: round((25/130-0.5)*1e6)='-307692', round((67/130-0.5)*1e6)='15385'
    // vs '-30769' and '215385' — both concatenated to '-307692153850'.
    const ax = 25 / 130 - 0.5;
    const ay = 67 / 130 - 0.5;
    const bx = 61 / 130 - 0.5;
    const by = 93 / 130 - 0.5;
    const p0 = [0.5, 0.5, 0];
    const p1 = [-0.5, -0.5, 0];

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        [ax, ay, 0, bx, by, 0, ...p0, bx, by, 0, ax, ay, 0, ...p1],
        3,
      ),
    );
    geometry.setIndex([0, 1, 2, 3, 4, 5]);

    const ds = new HalfedgeDS();
    ds.setFromGeometry(geometry, 1e-6);

    // A and B sit far apart (>=0.2 in both axes) — they must stay two vertices.
    expect(ds.vertices.length).toBe(4);
    expect(ds.faces.length).toBe(2);
  });

  it('ingests a 130-segment indexed plane', () => {
    const ds = new HalfedgeDS();
    ds.setFromGeometry(new PlaneGeometry(1, 1, 130, 130), 1e-6);
    expect(ds.faces.length).toBe(2 * 130 * 130);
    expect(ds.vertices.length).toBe(131 * 131);
  });
});
