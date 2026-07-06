import typescript from '@rollup/plugin-typescript';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs'
import htmlTemplate from 'rollup-plugin-generate-html-template';
import { env } from 'process';

const lib_cfg = {
  input: 'src/index.ts',
  external: ['three'],
  output: [
    {
      // UMD bundle for <script>/CDN consumers. The browser global for three.js
      // is `THREE` (window.THREE), not `three`.
      name: 'MeshHalfEdgeLib',
      format: 'umd',
      file: 'build/index.umd.js',
      sourcemap: true,
      globals: {
        'three': 'THREE'
      }
    },
    {
      // ESM bundle for bundlers (Vite/webpack/rollup) and native Node import.
      format: 'esm',
      file: 'build/index.esm.js',
      sourcemap: true,
    },
    {
      // CJS bundle for Node require(). Under "type":"module" a .js UMD file is
      // parsed as ESM and its factory runs the global branch (where `three` is
      // undefined), so the require entry must be a real .cjs file.
      format: 'cjs',
      file: 'build/index.cjs',
      sourcemap: true,
    }
  ],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      compilerOptions: {
        "sourceMap": true,
        "declaration": true,
        "declarationMap": true,
        "declarationDir": "build/types",
        "rootDir": "src",
      },
      exclude: ["examples/*", "node_modules", "tests"],
      noEmitOnError: !env.ROLLUP_WATCH,
    })
  ]
};

const examples = ['ExtractContours', 'HalfedgeDSVisualisation'];

const examples_cfg = []

for (const example of examples) {
  examples_cfg.push(
    {
      input: `examples/${example}.ts`,
      output: {
        file: `build-examples/${example}.js`,
        sourcemap: true,
      },
      plugins: [
        nodeResolve({
          browser: true,
        }),
        commonjs(),
        typescript({
          compilerOptions: {
            "sourceMap": true,
          },
          tsconfig: './tsconfig.json',
          noEmitOnError: !env.ROLLUP_WATCH,
        }),
        htmlTemplate({
          template: `examples/${example}.html`,
          target: `${example}.html`,
          attrs: ['type="module"']
        }),
      ]
    }
  );
}


let exported;
if (env.examples) {
  exported = examples_cfg;
} else {
  exported = lib_cfg;
}

export default exported;
