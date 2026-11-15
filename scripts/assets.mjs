#!/usr/bin/env node
// One-command glTF (meshopt) + Audio (mp3 via ffmpeg) pipeline, keeping node & mesh names intact.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, reorder, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const SRC = path.resolve('assets-src');
const OUT = path.resolve('public/assets');
const CACHE = '.assets-cache.json';

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});

mkdirSync(OUT, { recursive: true });
const cachePath = path.join(OUT, CACHE);
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const next = {};
const kb = (n) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

function walk(dir, rel = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(p, r));
    else out.push(r);
  }
  return out;
}

const files = walk(SRC).filter((r) => /\.(glb|ogg|wav)$/i.test(r)).sort();
let before = 0;
let after = 0;
let failed = 0;

for (const rel of files) {
  const ext = path.extname(rel).toLowerCase();
  const src = path.join(SRC, rel);
  const buf = readFileSync(src);
  before += buf.length;
  const key = createHash('sha256').update(buf).update('meshopt-float-mp3-v2').digest('hex');

  const outRel = ext === '.glb' ? rel : rel.replace(/\.[^.]+$/, '.mp3');
  const dest = path.join(OUT, outRel);

  if (cache[rel]?.key === key && existsSync(dest)) {
    next[rel] = cache[rel];
    after += statSync(dest).size;
    continue;
  }

  try {
    mkdirSync(path.dirname(dest), { recursive: true });
    let note = '';
    if (ext === '.glb') {
      const doc = await io.read(src);
      const beforeNodes = doc.getRoot().listNodes().map((n) => n.getName()).filter(Boolean);
      await doc.transform(
        dedup({ keepUniqueNames: true }),
        prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
        weld(),
        reorder({ encoder: MeshoptEncoder })
      );
      doc.createExtension(EXTMeshoptCompression)
        .setRequired(true)
        .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
      await io.write(dest, doc);
      const checkDoc = await io.read(dest);
      const afterNodes = checkDoc.getRoot().listNodes().map((n) => n.getName()).filter(Boolean);
      const lost = beforeNodes.filter((n) => !afterNodes.includes(n));
      if (lost.length) throw new Error(`lost nodes: ${lost.join(', ')}`);
      note = `${checkDoc.getRoot().listMeshes().length} meshes, ${checkDoc.getRoot().listMaterials().length} mats`;
    } else {
      const q = rel.includes('bg_music') ? ['-b:a', '96k'] : ['-q:a', '5'];
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vn', '-map_metadata', '-1', '-c:a', 'libmp3lame', ...q, dest]);
    }
    const sz = statSync(dest).size;
    after += sz;
    next[rel] = { key, outRel };
    console.log(`${rel.padEnd(32)} ${kb(buf.length).padStart(9)} -> ${kb(sz).padStart(8)} ${note ? `(${note})` : ''}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${rel}: ${err.message}`);
  }
}

const keep = new Set([CACHE, ...Object.values(next).map((v) => v.outRel)]);
const sweep = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    const r = path.relative(OUT, p).split(path.sep).join('/');
    if (e.isDirectory()) {
      sweep(p);
      if (!readdirSync(p).length) rmSync(p, { recursive: true });
    } else if (!keep.has(r)) {
      rmSync(p);
    }
  }
};
if (!failed) sweep(OUT);
writeFileSync(cachePath, JSON.stringify(next, null, 2));
console.log(`\nAssets ready: ${Object.keys(next).length} files, ${kb(before)} -> ${kb(after)}${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
