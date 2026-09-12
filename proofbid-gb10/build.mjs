import {build} from 'esbuild';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

await build({
  absWorkingDir: here,
  entryPoints: [join(here, '..', 'frontend.jsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: join(here, 'web', 'gb10.js'),
  nodePaths: [join(here, 'node_modules')],
  define: {'process.env.NODE_ENV': '"production"'},
});
