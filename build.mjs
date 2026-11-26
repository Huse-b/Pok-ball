import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = '/sdcard/Download/DSH-Go';
const result = await build({
  entryPoints: [path.join(directory, 'app.js')],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  legalComments: 'none',
  target: ['es2020'],
  define: { 'process.env.NODE_ENV': '"production"' },
});
const template = await readFile(path.join(directory, 'index.template.html'), 'utf8');
const model = await readFile(path.join(outputDirectory, 'Pokeball.glb'));
const payload = `window.__POKEBALL_GLB_BASE64__=${JSON.stringify(model.toString('base64'))};\n${result.outputFiles[0].text}`;
const html = template.replace('__APP_SCRIPT__', () => payload.replace(/<\/script/gi, '<\\/script'));
if (html.includes('__APP_SCRIPT__')) throw new Error('Script placeholder was not replaced');
const filename = path.join(outputDirectory, '精灵球-3D互动.html');
await writeFile(filename, html);
console.log(JSON.stringify({ output: filename, bytes: Buffer.byteLength(html), modelBytes: model.length, scriptBytes: result.outputFiles[0].contents.length, externalResources: 0 }, null, 2));
