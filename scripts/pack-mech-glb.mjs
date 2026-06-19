#!/usr/bin/env node
// Pack a glTF folder/file into a textureless .glb for in-game mech loading.
//
// Usage:
//   node scripts/pack-mech-glb.mjs <input.gltf|.glb> <output.glb>

import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/pack-mech-glb.mjs <input> <output.glb>');
  process.exit(1);
}

const io = new NodeIO();
const doc = await io.read(input);

for (const mat of doc.getRoot().listMaterials()) {
  mat.setBaseColorTexture(null);
  mat.setMetallicRoughnessTexture(null);
  mat.setNormalTexture(null);
  mat.setOcclusionTexture(null);
  mat.setEmissiveTexture(null);
}

await doc.transform(prune());
await io.write(output, doc);
console.log(`Wrote textureless ${output}`);
