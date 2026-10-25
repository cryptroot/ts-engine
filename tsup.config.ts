import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'data/index': 'src/data/index.ts',
    'persistence/index': 'src/persistence/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Keep maps for debugging without embedding the full TypeScript source in the published package.
  esbuildOptions(options) {
    options.sourcesContent = false;
  },
  clean: true,
  outDir: 'dist',
  splitting: true,
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
