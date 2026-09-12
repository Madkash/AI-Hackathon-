import {build} from 'esbuild';
await build({entryPoints:['frontend.jsx'],bundle:true,minify:true,format:'iife',
  outfile:'web/gb10.js',define:{'process.env.NODE_ENV':'"production"'}});
