import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  minify: false,
  dts: false,
})
