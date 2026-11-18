import { defineConfig } from 'rolldown';
import pkg from './package.json' with { type: 'json' };
import { dts } from 'rolldown-plugin-dts';
import yaml from '@rollup/plugin-yaml';

const packageExternal = new RegExp(
  `^(node:|${[...Object.getOwnPropertyNames(pkg.devDependencies ? pkg.devDependencies : []), ...Object.getOwnPropertyNames(pkg.dependencies ? pkg.dependencies : [])].join('|')})`
);
const external = packageExternal;

const config = {
  input: './src/index.ts'
};

export default defineConfig([
  {
    ...config,
    plugins: [yaml()],
    output: [{ file: 'lib/index.mjs', format: 'es', minify: true }],
    external
  },
  {
    ...config,
    plugins: [yaml()],
    output: [{ file: 'lib/index.cjs', format: 'cjs', minify: true }],
    external
  },
  {
    ...config,
    output: [{ dir: 'lib', format: 'es' }],
    plugins: [dts({ emitDtsOnly: true })],
    external
  }
]);
