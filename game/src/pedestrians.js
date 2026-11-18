// Pedestrians: blocky low-poly people who stroll the sidewalks, idle at the
// plaza and the beach, and run away from gunfire and explosions. A ped hit
// by a fast car goes down and draws police attention.

import { ROAD_COORDS, WORLD_HALF } from './config.js';
import { mulberry32, range, pick } from './random.js';

const rng = mulberry32((Date.now() % 100000) + 99);
const SHIRTS = [0xd84a4a, 0x4a8ad8, 0x4ad88a, 0xd8c84a, 0x8a4ad8, 0xd88a4a, 0xeeeeee, 0x333a44];
const SKINS = [0xf2c9a0, 0xc98a5a, 0x8a5a34, 0xe8b088, 0x6a4020];
const PANTS = [0x2a3a5a, 0x3a3a3a, 0x5a4a3a, 0x2a5a3a, 0x707880];

export function makePedMesh(shirt, skin, pants) {
  const group = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const torsoMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x2a2018 });

  const legGeo = new THREE.BoxGeometry(0.22, 0.8, 0.24);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.14, 0.4, 0);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.14, 0.4, 0);
  // Pivot legs at the hip by wrapping each in a group at hip height.
  const hipL = new THREE.Group();
  hipL.position.set(-0.14, 0.8, 0);
  legL.position.set(0, -0.4, 0);
  hipL.add(legL);
  const hipR = new THREE.Group();
  hipR.position.set(0.14, 0.8, 0);
  legR.position.set(0, -0.4, 0);
  hipR.add(legR);
  group.add(hipL);
  group.add(hipR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.68, 0.34), torsoMat);
  torso.position.y = 1.14;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skinMat);
  head.position.y = 1.66;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.38), hairMat);
  hair.position.y = 1.86;
  group.add(hair);
  const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.18);
  const armL = new THREE.Mesh(armGeo, torsoMat);
  armL.position.set(-0.42, 1.14, 0);
  const armR = new THREE.Mesh(armGeo, torsoMat);
  armR.position.set(0.42, 1.14, 0);
  group.add(armL);
  group.add(armR);
  group.userData.hipL = hipL;
  group.userData.hipR = hipR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  return group;
}

function sidewalkSpot() {
  // Sidewalks hug the roads: offset 8-10 from a road line, or the plaza/beach.
  if (rng() < 0.12) return { x: range(rng, -14, 14), z: range(rng, -14, 14) };
  if (rng() < 0.12) return { x: range(rng, -200, 200), z: range(rng, 198, 208) };
  const axis = rng() < 0.5 ? 'x' : 'z';
  const road = pick(rng, ROAD_COORDS);
  const off = (rng() < 0.5 ? -1 : 1) * range(rng, 8, 10);
  if (axis === 'z') return { x: road + off, z: range(rng, -195, 195) };
  return { x: range(rng, -195, 195), z: road + off };
}

export function spawnPeds(scene, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const spot = sidewalkSpot();
    const group = makePedMesh(pick(rng, SHIRTS), pick(rng, SKINS), pick(rng, PANTS));
    group.position.set(spot.x, 0, spot.z);
    scene.add(group);
    peds.push({
      group,
      heading: rng() * Math.PI * 2,
      speed: 0,
      state: 'walk',
      target: sidewalkSpot(),
      stateTimer: range(rng, 2, 8),
      walkPhase: rng() * Math.PI * 2,
      down: false,
      downTimer: 0,
    });
  }
  return peds;
}

// Make every ped within range run from (x, z).
export function scarePeds(peds, x, z, radius = 40) {
  for (const p of peds) {
    if (p.down) continue;
    const dx = p.group.position.x - x;
    const dz = p.group.position.z - z;
    const d = Math.hypot(dx, dz);
    if (d < radius) {
      p.state = 'flee';
      p.stateTimer = range(rng, 3, 6);
      p.heading = Math.atan2(dx, dz);
    }
  }
}

export function updatePeds(peds, dt, city, cars, onPedHit) {
  for (const p of peds) {
    const pos = p.group.position;
    if (p.down) {
      p.downTimer -= dt;
      if (p.downTimer <= 0) {
        p.down = false;
        p.state = 'flee';
        p.stateTimer = 4;
        p.group.rotation.x = 0;
        p.group.position.y = 0;
      }
      continue;
    }
    p.stateTimer -= dt;
    if (p.state === 'walk') {
      const dx = p.target.x - pos.x;
      const dz = p.target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5 || p.stateTimer <= 0) {
        if (rng() < 0.25) {
          p.state = 'idle';
          p.stateTimer = range(rng, 2, 6);
          p.speed = 0;
        } else {
          p.target = sidewalkSpot();
          p.stateTimer = range(rng, 8, 20);
        }
      } else {
        const want = Math.atan2(dx, dz);
        p.heading += shortestAngle(want - p.heading) * Math.min(1, dt * 4);
        p.speed = 1.6;
      }
    } else if (p.state === 'flee') {
      p.speed = 5.2;
      if (p.stateTimer <= 0) {
        p.state = 'walk';
        p.target = sidewalkSpot();
        p.stateTimer = range(rng, 8, 20);
      }
    } else {
      p.speed = 0;
      if (p.stateTimer <= 0) {
        p.state = 'walk';
        p.target = sidewalkSpot();
        p.stateTimer = range(rng, 8, 20);
      }
    }
    if (p.speed > 0) {
      pos.x += Math.sin(p.heading) * p.speed * dt;
      pos.z += Math.cos(p.heading) * p.speed * dt;
      city.resolveCircle(pos, 0.6);
      p.walkPhase += dt * p.speed * 3.2;
      const swing = Math.sin(p.walkPhase) * 0.55;
      p.group.userData.hipL.rotation.x = swing;
      p.group.userData.hipR.rotation.x = -swing;
      p.group.userData.armL.rotation.x = -swing * 0.7;
      p.group.userData.armR.rotation.x = swing * 0.7;
    } else {
      p.group.userData.hipL.rotation.x *= 0.8;
      p.group.userData.hipR.rotation.x *= 0.8;
    }
    p.group.rotation.y = p.heading;

    // Hit by a fast car?
    for (const car of cars) {
      if (car.dead || Math.abs(car.speed) < 4) continue;
      const d = Math.hypot(car.group.position.x - pos.x, car.group.position.z - pos.z);
      if (d < 1.7) {
        p.down = true;
        p.downTimer = range(rng, 5, 9);
        p.group.rotation.x = -Math.PI / 2;
        p.group.position.y = 0.3;
        if (onPedHit) onPedHit(p, car);
        break;
      }
    }
    // Keep peds in the world.
    const lim = WORLD_HALF - 1;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
  }
}

function shortestAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
