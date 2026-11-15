import * as THREE from 'three';

export const TIERS = [
  { name: 'Rust-Bucket', minParts: 0, speed: 14.5, smashR: 2.0, dmgResist: 1.0, partMult: 1.0, scaleX: 1.0, scaleY: 1.0, scaleZ: 1.0 },
  { name: 'Patched Up', minParts: 10, speed: 16.5, smashR: 2.3, dmgResist: 0.84, partMult: 1.8, scaleX: 1.18, scaleY: 1.12, scaleZ: 1.08 },
  { name: 'Sporty', minParts: 34, speed: 18.6, smashR: 2.65, dmgResist: 0.70, partMult: 3.2, scaleX: 1.36, scaleY: 1.24, scaleZ: 1.18 },
  { name: 'Muscle', minParts: 82, speed: 20.6, smashR: 3.0, dmgResist: 0.55, partMult: 5.5, scaleX: 1.58, scaleY: 1.38, scaleZ: 1.30 },
  { name: 'Bulldozer-Class', minParts: 165, speed: 22.8, smashR: 3.5, dmgResist: 0.42, partMult: 9.0, scaleX: 1.88, scaleY: 1.62, scaleZ: 1.45 },
];

export const MODEL_MANIFEST = {
  truck: { url: 'assets/models/car-kit/truck.glb', scale: 1.55 },
  dozer: { url: 'assets/models/car-kit/tractor-shovel.glb', scale: 1.75 },
  sedan: { url: 'assets/models/car-kit/sedan.glb', scale: 1.50 },
  delivery: { url: 'assets/models/car-kit/delivery.glb', scale: 1.52 },
  box: { url: 'assets/models/car-kit/box.glb', scale: 2.0 },
  cone: { url: 'assets/models/car-kit/cone.glb', scale: 2.2 },
  fence: { url: 'assets/models/suburban/fence.glb', scale: 5.5 },
  fence2: { url: 'assets/models/suburban/fence-1x2.glb', scale: 4.8 },
  planter: { url: 'assets/models/suburban/planter.glb', scale: 5.5 },
  tree: { url: 'assets/models/suburban/tree-small.glb', scale: 9.5 },
  house: { url: 'assets/models/suburban/building-type-a.glb', scale: 10.5 },
  dumpster: { url: 'assets/models/roads/dumpster.glb', scale: 7.5 },
  barrier: { url: 'assets/models/roads/construction-barrier.glb', scale: 11.0 },
  sign: { url: 'assets/models/roads/road-sign-stop.glb', scale: 6.5 },
  lamp: { url: 'assets/models/roads/light-curved.glb', scale: 7.2 },
  dPlate: { url: 'assets/models/car-kit/debris-plate-a.glb', scale: 1.65 },
  dBumper: { url: 'assets/models/car-kit/debris-bumper.glb', scale: 1.65 },
  dTire: { url: 'assets/models/car-kit/debris-tire.glb', scale: 1.55 },
  dDoor: { url: 'assets/models/car-kit/debris-door.glb', scale: 1.65 },
  dBolt: { url: 'assets/models/car-kit/debris-bolt.glb', scale: 2.0 },
  dSpoiler: { url: 'assets/models/car-kit/debris-spoiler-a.glb', scale: 1.65 },
};

const PROP_DEFS = [
  { key: 'box', radius: 1.1, hp: 1, minTier: 0, dmg: 1.0, parts: 2, sfx: 'impact_wood' },
  { key: 'cone', radius: 0.85, hp: 1, minTier: 0, dmg: 0.6, parts: 1, sfx: 'impact_wood' },
  { key: 'fence', radius: 1.35, hp: 1, minTier: 0, dmg: 1.1, parts: 2, sfx: 'impact_wood' },
  { key: 'fence2', radius: 1.7, hp: 1, minTier: 0, dmg: 1.3, parts: 3, sfx: 'impact_wood' },
  { key: 'planter', radius: 1.25, hp: 1, minTier: 0, dmg: 1.2, parts: 2, sfx: 'impact_wood' },
  { key: 'barrier', radius: 1.35, hp: 1, minTier: 1, dmg: 2.0, parts: 4, sfx: 'impact_metal_light' },
  { key: 'sign', radius: 0.9, hp: 1, minTier: 1, dmg: 1.8, parts: 3, sfx: 'impact_metal_light' },
  { key: 'lamp', radius: 1.05, hp: 1, minTier: 1, dmg: 2.0, parts: 4, sfx: 'impact_glass' },
  { key: 'dumpster', radius: 1.55, hp: 2, minTier: 1, dmg: 2.8, parts: 5, sfx: 'impact_metal_heavy' },
  { key: 'sedan', radius: 2.1, hp: 2, minTier: 2, dmg: 4.0, parts: 7, sfx: 'impact_metal_heavy', dropsRepair: true },
  { key: 'delivery', radius: 2.35, hp: 3, minTier: 2, dmg: 4.8, parts: 9, sfx: 'impact_metal_heavy', dropsRepair: true },
];

const DEBRIS_KEYS = ['dPlate', 'dBumper', 'dTire', 'dDoor', 'dBolt', 'dSpoiler'];
const ARENA_HALF = 25;
const INITIAL_PROP_COUNT = 40;
const DEBRIS_PER_MESH = 20; // 6 * 20 = 120 pooled shards total
const MAX_REPAIRS = 6;

export class WreckWorld {
  constructor(scene, models, callbacks) {
    this.scene = scene;
    this.models = models;
    this.cb = callbacks;
    this.dummy = new THREE.Object3D();

    this.propIMeshes = new Map();
    this.debrisIMeshes = [];
    this.props = [];
    this.tumblingProps = [];
    this.debris = [];
    this.repairs = [];

    this.combo = {
      count: 0,
      multiplier: 1,
      timer: 0,
      maxTimer: 2.8,
      lastTierAnnounced: 1,
    };

    this.player = {
      x: 0,
      z: 8,
      yaw: Math.PI,
      vx: 0,
      vz: 0,
      speed: 0,
      squash: 1,
      hitStop: 0,
      shake: 0,
      tierIdx: 0,
      integrity: 100,
      parts: 0,
      score: 0,
      elapsed: 0,
      nextRepairTimer: 10,
      ended: false,
      coastTimer: 0,
    };

    this.buildEnvironment();
    this.buildPlayerRig();
    this.buildInstancedPools();
    this.resetRun();
  }

  buildEnvironment() {
    // Grass outer surround
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(170, 170),
      new THREE.MeshStandardMaterial({ color: 0x67b868, roughness: 0.95 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.05;
    this.scene.add(grass);

    // Asphalt wreck yard floor
    const yard = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
      new THREE.MeshStandardMaterial({ color: 0x454d59, roughness: 0.9 })
    );
    yard.rotation.x = -Math.PI / 2;
    yard.receiveShadow = true;
    this.scene.add(yard);

    // Painted yard dashed cross-lane markings (1 instanced draw call)
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe6ecf5, roughness: 0.85 });
    const stripeGeom = new THREE.PlaneGeometry(0.45, 2.8);
    stripeGeom.rotateX(-Math.PI / 2);
    const stripes = new THREE.InstancedMesh(stripeGeom, stripeMat, 16);
    let si = 0;
    for (let k = -3; k <= 4; k++) {
      this.dummy.position.set(0, 0.015, k * 6 - 3);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      stripes.setMatrixAt(si++, this.dummy.matrix);
    }
    for (let k = -3; k <= 4; k++) {
      this.dummy.position.set(k * 6 - 3, 0.015, 0);
      this.dummy.rotation.set(0, Math.PI * 0.5, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      stripes.setMatrixAt(si++, this.dummy.matrix);
    }
    stripes.instanceMatrix.needsUpdate = true;
    this.scene.add(stripes);

    // Bright curb border ring (1 instanced draw call for all 4 walls)
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xf4c542, roughness: 0.7 });
    const wallLen = ARENA_HALF * 2 + 1.4;
    const sides = [
      [0, -ARENA_HALF - 0.6, wallLen, 1.2],
      [0, ARENA_HALF + 0.6, wallLen, 1.2],
      [-ARENA_HALF - 0.6, 0, 1.2, wallLen],
      [ARENA_HALF + 0.6, 0, 1.2, wallLen],
    ];
    for (const [x, z, w, d] of sides) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), curbMat);
      curb.position.set(x, 0.35, z);
      this.scene.add(curb);
    }

    // Suburban perimeter houses closely framing the yard (1 instanced draw call)
    const hModel = this.models.house;
    const houseCoords = [
      [-34, -22, Math.PI * 0.5], [-34, 0, Math.PI * 0.5], [-34, 22, Math.PI * 0.5],
      [34, -22, -Math.PI * 0.5], [34, 0, -Math.PI * 0.5], [34, 22, -Math.PI * 0.5],
      [-20, -35, 0], [0, -35, 0], [20, -35, 0],
      [-20, 35, Math.PI], [0, 35, Math.PI], [20, 35, Math.PI],
    ];
    const houses = new THREE.InstancedMesh(hModel.geometry, hModel.material, houseCoords.length);
    houseCoords.forEach(([x, z, r], i) => {
      this.dummy.position.set(x, 0, z);
      this.dummy.rotation.set(0, r, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      houses.setMatrixAt(i, this.dummy.matrix);
    });
    houses.instanceMatrix.needsUpdate = true;
    this.scene.add(houses);

    // Suburban perimeter trees (1 instanced draw call)
    const tModel = this.models.tree;
    const treeCount = 24;
    const trees = new THREE.InstancedMesh(tModel.geometry, tModel.material, treeCount);
    for (let i = 0; i < treeCount; i++) {
      const ang = (i / treeCount) * Math.PI * 2;
      const rad = 28.5 + (i % 3) * 2.2;
      this.dummy.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      this.dummy.rotation.set(0, ang, 0);
      const sc = 0.9 + (i % 4) * 0.14;
      this.dummy.scale.set(sc, sc, sc);
      this.dummy.updateMatrix();
      trees.setMatrixAt(i, this.dummy.matrix);
    }
    trees.instanceMatrix.needsUpdate = true;
    this.scene.add(trees);
  }

  buildPlayerRig() {
    this.playerRoot = new THREE.Group();
    this.playerVisual = new THREE.Group();
    this.playerRoot.add(this.playerVisual);

    this.truckMesh = new THREE.Mesh(this.models.truck.geometry, this.models.truck.material);
    this.truckMesh.castShadow = true;
    this.playerVisual.add(this.truckMesh);

    this.dozerMesh = new THREE.Mesh(this.models.dozer.geometry, this.models.dozer.material);
    this.dozerMesh.castShadow = true;
    this.dozerMesh.visible = false;
    this.playerVisual.add(this.dozerMesh);

    // Tier 2 armor front plate
    this.attPlate = new THREE.Mesh(this.models.dPlate.geometry, this.models.dPlate.material);
    this.attPlate.position.set(0, 0.45, 2.05);
    this.attPlate.rotation.set(Math.PI * 0.45, 0, 0);
    this.attPlate.scale.set(1.4, 1.4, 1.4);
    this.playerVisual.add(this.attPlate);

    // Tier 3 roof spoiler & side bumpers
    this.attSpoiler = new THREE.Mesh(this.models.dSpoiler.geometry, this.models.dSpoiler.material);
    this.attSpoiler.position.set(0, 1.7, -1.35);
    this.attSpoiler.scale.set(1.3, 1.3, 1.3);
    this.playerVisual.add(this.attSpoiler);

    this.attSideL = new THREE.Mesh(this.models.dBumper.geometry, this.models.dBumper.material);
    this.attSideL.position.set(0.95, 0.55, 0.1);
    this.attSideL.rotation.set(0, Math.PI * 0.5, 0);
    this.playerVisual.add(this.attSideL);

    this.attSideR = this.attSideL.clone();
    this.attSideR.position.x = -0.95;
    this.attSideR.rotation.y = -Math.PI * 0.5;
    this.playerVisual.add(this.attSideR);

    // Tier 4 heavy front ram barrier
    this.attRam = new THREE.Mesh(this.models.barrier.geometry, this.models.barrier.material);
    this.attRam.position.set(0, 0.12, 2.35);
    this.attRam.scale.set(1.15, 0.9, 1.0);
    this.playerVisual.add(this.attRam);

    this.scene.add(this.playerRoot);
    this.syncPlayerTierVisuals(0);
  }

  syncPlayerTierVisuals(tierIdx) {
    this.truckMesh.visible = tierIdx < 4;
    this.dozerMesh.visible = tierIdx === 4;
    this.attPlate.visible = tierIdx >= 1 && tierIdx < 4;
    this.attSpoiler.visible = tierIdx >= 2 && tierIdx < 4;
    this.attSideL.visible = tierIdx >= 1 && tierIdx < 4;
    this.attSideR.visible = tierIdx >= 1 && tierIdx < 4;
    this.attRam.visible = tierIdx === 3;
    const t = TIERS[tierIdx];
    this.playerRoot.scale.set(t.scaleX, t.scaleY, t.scaleZ);
  }

  buildInstancedPools() {
    for (const def of PROP_DEFS) {
      const m = this.models[def.key];
      const im = new THREE.InstancedMesh(m.geometry, m.material, INITIAL_PROP_COUNT);
      im.count = 0;
      im.castShadow = true;
      im.frustumCulled = false;
      this.scene.add(im);
      this.propIMeshes.set(def.key, im);
    }

    for (const key of DEBRIS_KEYS) {
      const m = this.models[key];
      const im = new THREE.InstancedMesh(m.geometry, m.material, DEBRIS_PER_MESH);
      im.count = 0;
      im.frustumCulled = false;
      this.scene.add(im);
      this.debrisIMeshes.push({ key, im });
    }

    // Repair pickups: glowing bright emerald cross capsule (1 draw call)
    const rGeom = new THREE.OctahedronGeometry(0.95, 0);
    const rMat = new THREE.MeshStandardMaterial({
      color: 0x35e88b,
      emissive: 0x168049,
      emissiveIntensity: 0.75,
      roughness: 0.25,
    });
    this.repairIMesh = new THREE.InstancedMesh(rGeom, rMat, MAX_REPAIRS);
    this.repairIMesh.count = 0;
    this.repairIMesh.frustumCulled = false;
    this.scene.add(this.repairIMesh);
  }

  resetRun() {
    const p = this.player;
    p.x = 0;
    p.z = 8;
    p.yaw = Math.PI; // Facing -Z into yard clusters
    p.vx = 0;
    p.vz = 0;
    p.speed = 0;
    p.squash = 1;
    p.hitStop = 0;
    p.shake = 0;
    p.tierIdx = 0;
    p.integrity = 100;
    p.parts = 0;
    p.score = 0;
    p.elapsed = 0;
    p.nextRepairTimer = 10;
    p.ended = false;
    p.coastTimer = 0;

    this.props = [];
    this.tumblingProps = [];
    this.debris = [];
    this.repairs = [];
    this.combo.count = 0;
    this.combo.multiplier = 1;
    this.combo.timer = 0;
    this.combo.lastTierAnnounced = 1;
    this.cb.onComboUpdate?.({
      count: 0,
      multiplier: 1,
      ratio: 0,
      active: false,
      isRampage: false,
    });
    this.syncPlayerTierVisuals(0);
    this.spawnProps(INITIAL_PROP_COUNT, true);
    this.spawnRepairPickup(0, -14);
    this.syncInstances();
  }

  pickPropDef(allowHeavy) {
    // Suburban weighting matching simulation: light fences/crates/cones first, cars scattered cleanly
    const r = Math.random();
    if (r < 0.16) return PROP_DEFS[0]; // box
    if (r < 0.30) return PROP_DEFS[1]; // cone
    if (r < 0.44) return PROP_DEFS[2]; // fence
    if (r < 0.56) return PROP_DEFS[3]; // fence2
    if (r < 0.66) return PROP_DEFS[4]; // planter
    if (r < 0.74) return PROP_DEFS[5]; // barrier
    if (r < 0.81) return PROP_DEFS[6]; // sign
    if (r < 0.87) return PROP_DEFS[7]; // lamp
    if (r < 0.93 || !allowHeavy) return PROP_DEFS[8]; // dumpster
    return r < 0.965 ? PROP_DEFS[9] : PROP_DEFS[10]; // sedan / delivery
  }

  spawnProps(count, initialSpread = false) {
    for (let i = 0; i < count; i++) {
      const def = this.pickPropDef(true);
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 14; tries++) {
        x = (Math.random() * 2 - 1) * (ARENA_HALF - 4);
        z = (Math.random() * 2 - 1) * (ARENA_HALF - 4);
        const minDist = initialSpread ? 7.5 : 14;
        if (Math.hypot(x - this.player.x, z - this.player.z) > minDist) break;
      }
      this.props.push({
        def,
        x,
        z,
        yaw: Math.random() * Math.PI * 2,
        hp: def.hp,
        scale: initialSpread ? 1 : 0.05,
        popVel: 0,
        hitFlash: 0,
      });
    }
  }

  spawnRepairPickup(x, z) {
    if (this.repairs.length >= MAX_REPAIRS) return;
    if (x == null || z == null) {
      for (let t = 0; t < 12; t++) {
        x = (Math.random() * 2 - 1) * (ARENA_HALF - 6);
        z = (Math.random() * 2 - 1) * (ARENA_HALF - 6);
        if (Math.hypot(x - this.player.x, z - this.player.z) > 12) break;
      }
    }
    this.repairs.push({ x, z, phase: Math.random() * 6.28 });
  }

  spawnTumblingProp(pr, p) {
    if (this.tumblingProps.length >= 24) {
      this.tumblingProps.shift();
    }
    const hitSpeed = Math.max(7.5, p.speed * 1.15);
    const hitAng = p.yaw + (Math.random() - 0.5) * 0.6;
    this.tumblingProps.push({
      def: pr.def,
      x: pr.x,
      y: 0.25,
      z: pr.z,
      vx: Math.sin(hitAng) * hitSpeed + (Math.random() - 0.5) * 2.5,
      vy: 4.8 + Math.random() * 4.2,
      vz: Math.cos(hitAng) * hitSpeed + (Math.random() - 0.5) * 2.5,
      rx: 0,
      ry: pr.yaw,
      rz: 0,
      vrx: (Math.random() - 0.5) * 14,
      vry: (Math.random() - 0.5) * 12,
      vrz: (Math.random() - 0.5) * 14,
      age: 0,
      life: 1.8,
    });
  }

  updateTumblingProps(dt) {
    for (let i = this.tumblingProps.length - 1; i >= 0; i--) {
      const tp = this.tumblingProps[i];
      tp.age += dt;
      if (tp.age >= tp.life) {
        this.tumblingProps.splice(i, 1);
        continue;
      }
      tp.vy -= 24 * dt;
      tp.x += tp.vx * dt;
      tp.y += tp.vy * dt;
      tp.z += tp.vz * dt;
      tp.rx += tp.vrx * dt;
      tp.ry += tp.vry * dt;
      tp.rz += tp.vrz * dt;

      if (tp.y < 0.15) {
        tp.y = 0.15;
        tp.vy = Math.abs(tp.vy) * 0.40;
        tp.vx *= 0.82;
        tp.vz *= 0.82;
        tp.vrx *= 0.85;
        tp.vry *= 0.85;
        tp.vrz *= 0.85;
      }
    }
  }

  spawnDebrisBurst(x, z, partsCount, magnetizeCount) {
    const total = Math.min(10, Math.max(3, partsCount));
    for (let i = 0; i < total; i++) {
      if (this.debris.length >= DEBRIS_PER_MESH * DEBRIS_KEYS.length) {
        this.debris.shift();
      }
      const meshIdx = (Math.random() * DEBRIS_KEYS.length) | 0;
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 9;
      this.debris.push({
        meshIdx,
        x,
        y: 0.7,
        z,
        vx: Math.cos(ang) * spd,
        vy: 5.5 + Math.random() * 5,
        vz: Math.sin(ang) * spd,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        rz: Math.random() * 6,
        magnet: i < magnetizeCount,
        age: 0,
        life: i < magnetizeCount ? 0.55 : 1.35,
      });
    }
  }

  update(dt, inputVec) {
    const p = this.player;

    if (p.ended) {
      // Smooth coast to stop animation on Run Complete
      p.vx *= Math.pow(0.06, dt);
      p.vz *= Math.pow(0.06, dt);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.coastTimer += dt;
      this.updateTumblingProps(dt);
      this.updateDebris(dt);
      this.syncInstances();
      return;
    }

    if (p.hitStop > 0) {
      p.hitStop -= dt;
      return;
    }

    p.elapsed += dt;
    const tier = TIERS[p.tierIdx];

    // Gentle structural wear + mild heat escalation after 160s (matches build/sim/final.js)
    const heat = p.elapsed > 160 ? 1 + (p.elapsed - 160) / 210 : 1;
    p.integrity = Math.max(0, p.integrity - (1.45 - 0.07 * p.tierIdx) * heat * dt);

    // Combo timer decay & callback
    if (this.combo.timer > 0) {
      this.combo.timer = Math.max(0, this.combo.timer - dt);
      if (this.combo.timer === 0) {
        this.combo.count = 0;
        this.combo.multiplier = 1;
        this.combo.lastTierAnnounced = 1;
      }
    }
    this.cb.onComboUpdate?.({
      count: this.combo.count,
      multiplier: this.combo.multiplier,
      ratio: this.combo.maxTimer > 0 ? this.combo.timer / this.combo.maxTimer : 0,
      active: this.combo.count >= 2 && this.combo.timer > 0,
      isRampage: this.combo.multiplier >= 5,
    });

    // Steering & momentum
    const targetMag = inputVec.magnitude;
    if (targetMag > 0.05) {
      const desiredYaw = Math.atan2(inputVec.x, inputVec.z);
      let diff = desiredYaw - p.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.yaw += diff * Math.min(1, dt * 8.5);
      const targetSpd = tier.speed * (0.45 + 0.55 * targetMag);
      p.speed += (targetSpd - p.speed) * Math.min(1, dt * 6.5);
    } else {
      p.speed *= Math.pow(0.04, dt);
    }

    p.vx = Math.sin(p.yaw) * p.speed;
    p.vz = Math.cos(p.yaw) * p.speed;
    p.x += p.vx * dt;
    p.z += p.vz * dt;

    // Gentle curb rebound so you never pin yourself against perimeter walls
    const lim = ARENA_HALF - 2.0;
    if (p.x < -lim) { p.x = -lim; p.vx = Math.abs(p.vx) * 0.5; p.yaw = Math.atan2(p.vx + 2, p.vz); }
    if (p.x > lim) { p.x = lim; p.vx = -Math.abs(p.vx) * 0.5; p.yaw = Math.atan2(p.vx - 2, p.vz); }
    if (p.z < -lim) { p.z = -lim; p.vz = Math.abs(p.vz) * 0.5; p.yaw = Math.atan2(p.vx, p.vz + 2); }
    if (p.z > lim) { p.z = lim; p.vz = -Math.abs(p.vz) * 0.5; p.yaw = Math.atan2(p.vx, p.vz - 2); }

    // Squash & shake decay
    p.squash += (1 - p.squash) * Math.min(1, dt * 14);
    p.shake = Math.max(0, p.shake - dt * 3.4);

    // Check prop impacts
    for (let i = this.props.length - 1; i >= 0; i--) {
      const pr = this.props[i];
      if (pr.scale < 1) pr.scale = Math.min(1, pr.scale + dt * 4.5);
      if (pr.hitFlash > 0) pr.hitFlash = Math.max(0, pr.hitFlash - dt);

      const dx = pr.x - p.x;
      const dz = pr.z - p.z;
      const dist = Math.hypot(dx, dz);
      const hitDist = tier.smashR + pr.def.radius * 0.72;

      if (dist < hitDist && p.speed > 2.2) {
        const overmatched = p.tierIdx >= pr.def.minTier;
        const hitPower = overmatched ? 2 : 1;
        pr.hp -= hitPower;

        const dmg = pr.def.dmg * (overmatched ? 0.30 : 1.0) * tier.dmgResist;
        p.integrity = Math.max(0, p.integrity - dmg);

        if (pr.hp <= 0) {
          // Smashed cleanly! Update combo & exponential scoring
          this.combo.count++;
          this.combo.timer = this.combo.maxTimer;
          let mult = 1;
          if (this.combo.count >= 15) mult = 10;
          else if (this.combo.count >= 10) mult = 5;
          else if (this.combo.count >= 6) mult = 3;
          else if (this.combo.count >= 3) mult = 2;
          this.combo.multiplier = mult;

          if (mult > this.combo.lastTierAnnounced) {
            this.combo.lastTierAnnounced = mult;
            this.cb.onComboFanfare?.(mult);
          }

          const partsAdded = pr.def.parts;
          const scoreAdded = Math.round(partsAdded * 10 * tier.partMult * mult);
          p.parts += partsAdded;
          p.score += scoreAdded;
          p.squash = 1.18;
          p.shake = Math.min(1, p.shake + (overmatched ? 0.28 : 0.48));
          if (!overmatched) p.hitStop = 0.025;

          this.spawnTumblingProp(pr, p);
          this.spawnDebrisBurst(pr.x, pr.z, partsAdded + 2, Math.min(4, partsAdded));

          const comboPitch = Math.min(1.45, 1.0 + (this.combo.count - 1) * 0.035);
          this.cb.onSfx?.(pr.def.sfx, overmatched ? 0.70 : 0.90, comboPitch);

          if (mult >= 2) {
            this.cb.onToast?.(`+${scoreAdded} (${mult}x)`, mult >= 5 ? 'gold' : 'green');
          } else {
            this.cb.onToast?.(`+${scoreAdded}`, 'default');
          }

          if (pr.def.dropsRepair && Math.random() < 0.45) {
            this.spawnRepairPickup(pr.x, pr.z);
          }

          this.props.splice(i, 1);
          this.checkTierAdvance();
        } else {
          // Multi-hit heavy vehicle: nudge truck back slightly & spark debris chunk
          const nx = dist > 0.01 ? dx / dist : 0;
          const nz = dist > 0.01 ? dz / dist : 1;
          p.x -= nx * 0.9;
          p.z -= nz * 0.9;
          p.speed *= 0.45;
          pr.hitFlash = 0.25;
          p.shake = Math.min(1, p.shake + 0.4);
          this.spawnDebrisBurst(pr.x, pr.z, 3, 1);
          this.cb.onSfx?.('impact_metal_heavy', 0.85);
        }
      }
    }

    // Smart wave replenishment so active smashers never stall in an empty yard
    if (this.props.length < 18) {
      this.spawnProps(22, false);
      this.cb.onToast?.('FRESH DELIVERIES!', 'gold');
    }

    // Periodic repair pickup spawn
    p.nextRepairTimer -= dt;
    if (p.nextRepairTimer <= 0) {
      p.nextRepairTimer = 11 + Math.random() * 3;
      this.spawnRepairPickup(null, null);
    }

    // Repair pickup collection
    for (let i = this.repairs.length - 1; i >= 0; i--) {
      const rp = this.repairs[i];
      rp.phase += dt * 3.5;
      if (Math.hypot(rp.x - p.x, rp.z - p.z) < tier.smashR + 1.25) {
        p.integrity = Math.min(100, p.integrity + 22);
        this.repairs.splice(i, 1);
        this.cb.onSfx?.('repair_pickup', 0.9);
        this.cb.onToast?.('+22% INTEGRITY', 'green');
      }
    }

    this.updateTumblingProps(dt);
    this.updateDebris(dt);

    if (p.integrity <= 0) {
      p.integrity = 0;
      p.ended = true;
      this.cb.onRunEnded?.({
        score: p.score,
        parts: p.parts,
        tierName: TIERS[p.tierIdx].name,
      });
    }

    this.syncInstances();
  }

  checkTierAdvance() {
    const p = this.player;
    while (p.tierIdx + 1 < TIERS.length && p.parts >= TIERS[p.tierIdx + 1].minParts) {
      p.tierIdx++;
      p.integrity = Math.min(100, p.integrity + 18);
      p.squash = 1.24;
      p.shake = 0.7;
      this.syncPlayerTierVisuals(p.tierIdx);
      this.cb.onSfx?.('tier_up', 0.95);
      this.cb.onTierUp?.(TIERS[p.tierIdx].name);
      this.cb.onToast?.(`RIG UPGRADED: ${TIERS[p.tierIdx].name.toUpperCase()}!`, 'gold');
    }
  }

  updateDebris(dt) {
    const p = this.player;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.age += dt;
      if (d.age >= d.life) {
        this.debris.splice(i, 1);
        continue;
      }
      if (d.magnet && d.age > 0.14) {
        const t = Math.min(1, (d.age - 0.14) / (d.life - 0.14));
        const pull = 12 + 34 * t;
        const dx = p.x - d.x;
        const dy = 1.15 - d.y;
        const dz = p.z - d.z;
        const len = Math.max(0.05, Math.hypot(dx, dy, dz));
        d.x += (dx / len) * pull * dt;
        d.y += (dy / len) * pull * dt + Math.sin(t * Math.PI) * 2.5 * dt;
        d.z += (dz / len) * pull * dt;
        if (len < 0.95) {
          this.debris.splice(i, 1);
          continue;
        }
      } else {
        d.vy -= 18 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        if (d.y < 0.2) {
          d.y = 0.2;
          d.vy = Math.abs(d.vy) * 0.42;
          d.vx *= 0.75;
          d.vz *= 0.75;
        }
      }
      d.rx += 5 * dt;
      d.ry += 4 * dt;
    }
  }

  syncInstances() {
    const p = this.player;
    this.playerRoot.position.set(p.x, 0, p.z);
    this.playerRoot.rotation.set(0, p.yaw, 0);
    const invSq = 1 / Math.sqrt(p.squash);
    this.playerVisual.scale.set(p.squash, invSq, p.squash);

    // Group active props by key into their matching InstancedMesh
    const counters = new Map();
    for (const def of PROP_DEFS) counters.set(def.key, 0);

    // 1. Standing props
    for (const pr of this.props) {
      const im = this.propIMeshes.get(pr.def.key);
      const idx = counters.get(pr.def.key);
      if (idx >= INITIAL_PROP_COUNT) continue;
      this.dummy.position.set(pr.x, 0, pr.z);
      const wobble = pr.hitFlash > 0 ? Math.sin(pr.hitFlash * 45) * 0.18 : 0;
      this.dummy.rotation.set(wobble, pr.yaw, wobble * 0.6);
      this.dummy.scale.set(pr.scale, pr.scale, pr.scale);
      this.dummy.updateMatrix();
      im.setMatrixAt(idx, this.dummy.matrix);
      counters.set(pr.def.key, idx + 1);
    }

    // 2. Tumbling props (knocked back and bouncing across yard)
    for (const tp of this.tumblingProps) {
      const im = this.propIMeshes.get(tp.def.key);
      const idx = counters.get(tp.def.key);
      if (idx >= INITIAL_PROP_COUNT) continue;
      const rem = tp.life - tp.age;
      const sc = rem < 0.4 ? Math.max(0.01, rem / 0.4) : 1.0;
      this.dummy.position.set(tp.x, tp.y, tp.z);
      this.dummy.rotation.set(tp.rx, tp.ry, tp.rz);
      this.dummy.scale.set(sc, sc, sc);
      this.dummy.updateMatrix();
      im.setMatrixAt(idx, this.dummy.matrix);
      counters.set(tp.def.key, idx + 1);
    }

    for (const [key, im] of this.propIMeshes.entries()) {
      im.count = counters.get(key) || 0;
      im.instanceMatrix.needsUpdate = true;
    }

    // Group active debris into 6 InstancedMeshes
    const dCounters = new Array(this.debrisIMeshes.length).fill(0);
    for (const d of this.debris) {
      const slot = this.debrisIMeshes[d.meshIdx];
      const c = dCounters[d.meshIdx];
      if (c >= DEBRIS_PER_MESH) continue;
      const sc = d.magnet ? 0.85 : Math.max(0.15, 1 - d.age / d.life);
      this.dummy.position.set(d.x, d.y, d.z);
      this.dummy.rotation.set(d.rx, d.ry, d.rz);
      this.dummy.scale.set(sc, sc, sc);
      this.dummy.updateMatrix();
      slot.im.setMatrixAt(c, this.dummy.matrix);
      dCounters[d.meshIdx] = c + 1;
    }
    for (let k = 0; k < this.debrisIMeshes.length; k++) {
      this.debrisIMeshes[k].im.count = dCounters[k];
      this.debrisIMeshes[k].im.instanceMatrix.needsUpdate = true;
    }

    // Sync repair pickups
    for (let i = 0; i < this.repairs.length; i++) {
      const r = this.repairs[i];
      this.dummy.position.set(r.x, 1.05 + Math.sin(r.phase) * 0.24, r.z);
      this.dummy.rotation.set(0.3, r.phase, 0.3);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.repairIMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.repairIMesh.count = this.repairs.length;
    this.repairIMesh.instanceMatrix.needsUpdate = true;
  }
}
