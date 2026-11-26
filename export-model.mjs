#!/usr/bin/env node
/** Export the texture-free Poké Ball with a three-second opening/closing clip. */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// model.js is browser ESM while the surrounding workspace may be CommonJS.
// Loading its import-free source as ESM keeps the exporter independent of package.json.
const source = await readFile(new URL('./model.js', import.meta.url), 'utf8');
const { createPokeball } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    result = null;
    error = null;
    onload = null;
    onloadend = null;
    onerror = null;

    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      }, (error) => {
        this.error = error;
        this.onerror?.({ target: this });
        this.onloadend?.({ target: this });
      });
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(result).toString('base64')}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      }, (error) => {
        this.error = error;
        this.onerror?.({ target: this });
        this.onloadend?.({ target: this });
      });
    }
  };
}

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function createOpenCloseClip() {
  const times = [];
  const values = [];
  const axis = new THREE.Vector3(1, 0, 0);
  const quaternion = new THREE.Quaternion();
  for (let frame = 0; frame <= 60; frame++) {
    const t = frame / 20;
    const openness = t <= 1.5
      ? smoothstep((t - 0.15) / 1.1)
      : 1 - smoothstep((t - 1.75) / 1.1);
    times.push(t);
    quaternion.setFromAxisAngle(axis, -1.8 * openness);
    values.push(...quaternion.toArray());
  }
  return new THREE.AnimationClip('Pokeball_Open_Close', 3, [
    new THREE.QuaternionKeyframeTrack('Lid_Hinge.quaternion', times, values),
  ]);
}

export function verifyGLB(bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (data.length < 28 || data.readUInt32LE(0) !== 0x46546c67) throw new Error('Invalid GLB magic');
  if (data.readUInt32LE(4) !== 2) throw new Error('Expected GLB version 2');
  if (data.readUInt32LE(8) !== data.length) throw new Error('GLB header byte length mismatch');
  const chunks = [];
  let offset = 12;
  let json;
  while (offset < data.length) {
    if (offset + 8 > data.length) throw new Error('Truncated GLB chunk header');
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    const begin = offset + 8;
    if (length % 4 !== 0 || begin + length > data.length) throw new Error('Invalid GLB chunk length');
    const name = type === 0x4e4f534a ? 'JSON' : type === 0x004e4942 ? 'BIN' : 'UNKNOWN';
    chunks.push({ type: name, bytes: length });
    if (name === 'JSON') json = JSON.parse(data.toString('utf8', begin, begin + length).trim());
    offset = begin + length;
  }
  if (offset !== data.length || chunks.length !== 2 || chunks[0].type !== 'JSON' || chunks[1].type !== 'BIN') {
    throw new Error('Expected exactly one JSON and one BIN chunk');
  }
  if (json.asset.version !== '2.0') throw new Error('Expected glTF asset version 2.0');
  if (json.images?.length || json.textures?.length) throw new Error('Unexpected texture resource');
  if (json.buffers.some((buffer) => buffer.uri)) throw new Error('Unexpected external buffer');
  if (json.cameras?.length || json.extensions?.KHR_lights_punctual) throw new Error('Unexpected scene camera or light');
  const animation = json.animations?.find((clip) => clip.name === 'Pokeball_Open_Close');
  if (!animation || animation.channels.length !== 1) throw new Error('Missing single-track lid animation');
  const channel = animation.channels[0];
  const animatedNode = json.nodes[channel.target.node];
  if (animatedNode.name !== 'Lid_Hinge' || channel.target.path !== 'rotation') {
    throw new Error('Animation must target Lid_Hinge quaternion rotation');
  }
  const sampler = animation.samplers[channel.sampler];
  const input = json.accessors[sampler.input];
  const output = json.accessors[sampler.output];
  if (input.min[0] !== 0 || input.max[0] !== 3 || output.type !== 'VEC4') {
    throw new Error('Unexpected animation duration or quaternion accessor');
  }
  let triangles = 0;
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      const accessor = json.accessors[primitive.indices ?? primitive.attributes.POSITION];
      triangles += accessor.count / 3;
    }
  }
  if (triangles >= 65000) throw new Error(`Triangle budget exceeded: ${triangles}`);
  return {
    bytes: data.length,
    triangles,
    meshes: json.meshes.length,
    materials: json.materials.length,
    animation: { name: animation.name, duration: 3, keyframes: input.count, target: animatedNode.name },
    chunks,
    extensions: json.extensionsUsed || [],
  };
}

export async function exportPokeball(output = '/sdcard/Download/DSH-Go/Pokeball.glb') {
  const ball = createPokeball(THREE);
  try {
    ball.setOpen(0);
    ball.setEnergy(0.35);
    const scene = new THREE.Scene();
    scene.name = 'Pokeball_Asset';
    scene.add(ball.group);
    scene.updateMatrixWorld(true);
    const animation = createOpenCloseClip();
    const binary = await new GLTFExporter().parseAsync(scene, {
      binary: true,
      animations: [animation],
      trs: true,
      onlyVisible: true,
      includeCustomExtensions: false,
    });
    const bytes = Buffer.from(binary);
    const report = verifyGLB(bytes);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes);
    // Verify the actual bytes on disk as well as the exporter result.
    verifyGLB(await readFile(output));
    return { output, ...report };
  } finally {
    ball.dispose();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await exportPokeball(process.argv[2]);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
