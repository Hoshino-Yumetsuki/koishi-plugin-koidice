import { defineConfig } from 'tsdown';
import yaml from '@rollup/plugin-yaml';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outDir: 'lib',
  clean: false, // Emscripten writes dice.js and dice.wasm here before this build.
  fixedExtension: true,
  outExtensions: ({ format }) => format === 'es' ? { dts: '.d.ts' } : {},
  dts: true,
  minify: true,
  plugins: [yaml()]
});
