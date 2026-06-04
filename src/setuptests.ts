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

import { expect } from 'vitest';
import './augments';
import { Halfedge } from "./core/Halfedge";
import { Vertex } from "./core/Vertex";

// Extend vitest expect with custom matchers
declare module 'vitest' {
  interface Assertion {
    toBeHalfedge(expected: Halfedge): void;
    toBeVertex(expected: Vertex): void;
    toBeOneOfHalfedges(expected: Halfedge[]): void;
  }
}

expect.extend({

  toBeHalfedge(received: Halfedge, expected: Halfedge) {
    const pass = received === expected;

    return {
      message: () =>
        `Expected Halfedges ${pass? 'not ': ''}to be equal`+
        '\nReceived: '+ received.id +
        '\nExpected: '+ expected.id,
      pass: pass,
    };
  },

  toBeOneOfHalfedges(received: Halfedge, expected: Halfedge[]) {
    const pass = expected.indexOf(received) !== -1;

    return {
      message: () =>
        `Expected Halfedges ${pass? 'not ': ''}to be in the list`+
        '\nReceived: '+ received.id +
        '\nExpected list: '+ expected.map(e => e.id).join(', '),
      pass: pass,
    };
  },

  toBeVertex(received: Vertex, expected: Vertex) {
    const pass = received === expected;

    return {
      message: () =>
        `Expected Vertices ${pass? 'not ': ''}to be equal`+
        '\nReceived: '+ received.id +
        '\nExpected: '+ expected.id,
      pass: pass,
    };
  },

});
