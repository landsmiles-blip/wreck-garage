import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function toFloat32Attribute(attr) {
  if (!attr.normalized && attr.array instanceof Float32Array) return attr;
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    out[i * attr.itemSize] = attr.getX(i);
    if (attr.itemSize >= 2) out[i * attr.itemSize + 1] = attr.getY(i);
    if (attr.itemSize >= 3) out[i * attr.itemSize + 2] = attr.getZ(i);
    if (attr.itemSize >= 4) out[i * attr.itemSize + 3] = attr.getW(i);
  }
  return new THREE.BufferAttribute(out, attr.itemSize, false);
}

// Loads a meshopt-compressed GLB and collapses its single-material meshes into one grounded BufferGeometry + material
export async function loadAllModels(manifest) {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const loaded = {};
  const entries = Object.entries(manifest);
  await Promise.all(
    entries.map(async ([key, cfg]) => {
      const gltf = await loader.loadAsync(cfg.url);
      gltf.scene.updateMatrixWorld(true);

      const geoms = [];
      let chosenMat = null;

      gltf.scene.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry) return;
        const g = obj.geometry.clone();
        for (const attr of Object.keys(g.attributes)) {
          if (attr !== 'position' && attr !== 'normal' && attr !== 'uv') {
            g.deleteAttribute(attr);
          } else {
            g.setAttribute(attr, toFloat32Attribute(g.attributes[attr]));
          }
        }
        g.applyMatrix4(obj.matrixWorld);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (g.index) {
          const nonIdx = g.toNonIndexed();
          g.dispose();
          geoms.push(nonIdx);
        } else {
          geoms.push(g);
        }
        if (!chosenMat) {
          const rawMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
          chosenMat = rawMat ? rawMat.clone() : new THREE.MeshStandardMaterial({ color: 0xffffff });
          chosenMat.roughness = 0.72;
          chosenMat.metalness = 0.12;
        }
      });

      let merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
      if (!merged) {
        merged = geoms[0];
      } else if (geoms.length > 1) {
        geoms.forEach((g) => g.dispose());
      }

      merged.computeBoundingBox();
      const box = merged.boundingBox;
      const cx = (box.min.x + box.max.x) * 0.5;
      const cz = (box.min.z + box.max.z) * 0.5;
      const minY = box.min.y;
      const s = cfg.scale ?? 1.0;

      // Center XZ, place bottom flat on Y=0, apply pack scale
      merged.translate(-cx, -minY, -cz);
      merged.scale(s, s, s);
      merged.computeBoundingBox();
      merged.computeBoundingSphere();

      loaded[key] = {
        geometry: merged,
        material: chosenMat || new THREE.MeshStandardMaterial({ color: 0xcccccc }),
        size: new THREE.Vector3(),
      };
      merged.boundingBox.getSize(loaded[key].size);
    })
  );

  return loaded;
}
