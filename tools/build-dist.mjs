import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const DIST = path.resolve('dist');
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

await esbuild.build({
  entryPoints: [path.resolve('src/main.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  outfile: path.join(DIST, 'game.js'),
  legalComments: 'none',
});

cpSync(path.resolve('public'), DIST, {
  recursive: true,
  filter: (p) => !p.endsWith('.assets-cache.json'),
});

mkdirSync(path.join(DIST, 'vendor'), { recursive: true });
cpSync(path.resolve('vendor/playgama-bridge.js'), path.join(DIST, 'vendor/playgama-bridge.js'));

console.log('Built dist/ cleanly.');
