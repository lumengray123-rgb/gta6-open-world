// Cars: procedural low-poly meshes, arcade driving physics, and the traffic
// system. Cars face +Z when heading is 0; forward is (sin h, 0, cos h).
// Traffic cars follow road lanes and turn at intersections.

import { ROAD_COORDS, DRIVING, WORLD_HALF } from './config.js';
import { mulberry32, range, intRange, pick } from './random.js';

const CAR_COLORS = [0xc23a3a, 0x3a6ac2, 0xd8d8d8, 0x2a2a2e, 0xd8a83a, 0x3a9a5a, 0x8a5ac2, 0xc27a3a, 0x5ac2c2];
const rng = mulberry32((Date.now() % 100000) + 7);

export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xe8e8e8 : color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1d20 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd4e8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 4.3), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.1), glassMat);
  cabin.position.set(0, 1.15, -0.25);
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 2.0), bodyMat);
  roof.position.set(0, 1.48, -0.25);
  group.add(roof);
  // Headlights and tail lights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3a3a });
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    h.position.set(sx, 0.6, 2.16);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    t.position.set(sx, 0.6, -2.16);
    group.add(t);
  }
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.3, 4.32), darkMat);
    stripe.position.y = 0.55;
    group.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.35;
    bar.add(red);
    bar.add(blue);
    bar.position.y = 1.62;
    group.add(bar);
    group.userData.lightBar = bar;
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.9, 1.4], [0.9, 1.4], [-0.9, -1.4], [0.9, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.36, wz);
    group.add(w);
    wheels.push(w);
  }
  group.userData.wheels = wheels;
  return group;
}

export function createVehicle(scene, x, z, heading, opts = {}) {
  const isPolice = !!opts.police;
  const color = opts.color !== undefined ? opts.color : pick(rng, CAR_COLORS);
  const group = makeCarMesh(color, isPolice);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return {
    group,
    heading,
    speed: 0,
    steer: 0,
    health: 100,
    maxHealth: 100,
    isPolice,
    isTraffic: !!opts.traffic,
    dead: false,
    driver: opts.driver || null, // 'player' | 'traffic' | 'cop' | null
    color,
    // Traffic state.
    axis: opts.axis || 'z',
    road: opts.road !== undefined ? opts.road : ROAD_COORDS[0],
    dir: opts.dir || 1,
    cruise: range(rng, 9, 14),
    stuck: 0,
  };
}

export function removeVehicle(scene, car) {
  scene.remove(car.group);
}

// Arcade driving for the player's car. Returns a crash event when the car
// hits a building hard enough to matter: { strength } or null.
export function driveCar(car, input, dt, city) {
  const forward = input.down('KeyW') || input.down('ArrowUp');
  const back = input.down('KeyS') || input.down('ArrowDown');
  const left = input.down('KeyA') || input.down('ArrowLeft');
  const right = input.down('KeyD') || input.down('ArrowRight');
  const handbrake = input.down('Space');

  if (forward) car.speed += DRIVING.accel * dt;
  if (back) {
    car.speed -= (car.speed > 0.5 ? DRIVING.brake : DRIVING.reverseAccel) * dt;
  }
  car.speed -= car.speed * DRIVING.drag * dt;
  if (handbrake) car.speed -= car.speed * 2.2 * dt;
  car.speed = Math.max(-DRIVING.maxReverse, Math.min(DRIVING.maxSpeed, car.speed));
  if (!forward && !back && Math.abs(car.speed) < 0.2) car.speed = 0;

  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const spd = Math.abs(car.speed);
  const turnAuthority = Math.min(1, spd / 8);
  car.heading += car.steer * DRIVING.turnRate * turnAuthority * dt * (car.speed < 0 ? -1 : 1);

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const prevX = car.group.position.x;
  const prevZ = car.group.position.z;
  car.group.position.x += fx * car.speed * dt;
  car.group.position.z += fz * car.speed * dt;
  const before = { x: car.group.position.x, z: car.group.position.z };
  city.resolveCircle(car.group.position, 1.9);
  const moved = Math.hypot(car.group.position.x - prevX, car.group.position.z - prevZ);
  const wanted = Math.hypot(before.x - prevX, before.z - prevZ);
  let crash = null;
  if (wanted > 0.001 && moved < wanted * 0.4 && spd > 6) {
    crash = { strength: Math.min(1, spd / 30) };
    car.speed *= -0.25;
    car.health -= spd * 0.9;
  }
  car.group.rotation.y = car.heading;
  // Wheels spin; body leans a little into corners.
  const spin = (car.speed * dt) / 0.36;
  for (const w of car.group.userData.wheels) w.rotation.x += spin;
  car.group.rotation.z = -car.steer * Math.min(0.06, spd * 0.002);
  return crash;
}

// --- traffic --------------------------------------------------------------
// Lane offset for right-hand traffic: heading +z rides at road - 3, etc.
function laneOffset(axis, dir) {
  if (axis === 'z') return dir > 0 ? -3 : 3;
  return dir > 0 ? 3 : -3;
}

export function spawnTrafficCar(scene, city, nearX, nearZ) {
  const axis = rng() < 0.5 ? 'x' : 'z';
  const road = pick(rng, ROAD_COORDS);
  const dir = rng() < 0.5 ? 1 : -1;
  const off = laneOffset(axis, dir);
  let x;
  let z;
  if (axis === 'z') {
    x = road + off;
    z = nearZ + range(rng, -120, 120);
  } else {
    x = nearX + range(rng, -120, 120);
    z = road + off;
  }
  x = Math.max(-WORLD_HALF + 10, Math.min(WORLD_HALF - 10, x));
  z = Math.max(-WORLD_HALF + 10, Math.min(WORLD_HALF - 10, z));
  const heading = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const car = createVehicle(scene, x, z, heading, { traffic: true, axis, road, dir, driver: 'traffic' });
  car.speed = car.cruise;
  return car;
}

function nearestCrossCoord(v) {
  let best = ROAD_COORDS[0];
  let bd = Infinity;
  for (const c of ROAD_COORDS) {
    const d = Math.abs(v - c);
    if (d < bd) { bd = d; best = c; }
  }
  return { coord: best, dist: bd };
}

// Move one traffic car along its lane; turn at intersections sometimes.
// `others` is every car, for the car-ahead check.
export function updateTrafficCar(car, dt, others) {
  if (car.dead) return;
  const p = car.group.position;
  const along = car.axis === 'z' ? p.z : p.x;
  const cross = nearestCrossCoord(along);

  // Car ahead? Slow down or stop.
  let blocked = false;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  for (const o of others) {
    if (o === car || o.dead) continue;
    const dx = o.group.position.x - p.x;
    const dz = o.group.position.z - p.z;
    const ahead = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (ahead > 0 && ahead < 9 && side < 2.4) { blocked = true; break; }
  }
  const target = blocked ? 0 : car.cruise;
  car.speed += (target - car.speed) * Math.min(1, dt * 2);

  // Maybe turn at an intersection.
  if (cross.dist < 2.5 && rng() < dt * 0.55) {
    const newAxis = car.axis === 'z' ? 'x' : 'z';
    const newDir = rng() < 0.5 ? 1 : -1;
    const off = laneOffset(newAxis, newDir);
    car.axis = newAxis;
    car.dir = newDir;
    car.road = cross.coord;
    car.heading = newAxis === 'z' ? (newDir > 0 ? 0 : Math.PI) : (newDir > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (newAxis === 'z') p.x = cross.coord + off;
    else p.z = cross.coord + off;
  }
  // U-turn at the edge of the world.
  if (along * car.dir > WORLD_HALF - 16) {
    car.dir *= -1;
    car.heading += Math.PI;
    if (car.axis === 'z') p.x = car.road + laneOffset('z', car.dir);
    else p.z = car.road + laneOffset('x', car.dir);
  }

  p.x += Math.sin(car.heading) * car.speed * dt;
  p.z += Math.cos(car.heading) * car.speed * dt;
  car.group.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.36;
  for (const w of car.group.userData.wheels) w.rotation.x += spin;
}

// Circle-vs-circle between cars: push apart, damage both, return crash info.
export function collideCars(cars, onCrash) {
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.group.position.x - a.group.position.x;
      const dz = b.group.position.z - a.group.position.z;
      const d2 = dx * dx + dz * dz;
      const min = 3.4;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.group.position.x -= nx * push;
        a.group.position.z -= nz * push;
        b.group.position.x += nx * push;
        b.group.position.z += nz * push;
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 4) {
          a.health -= impact * 0.8;
          b.health -= impact * 0.8;
          const tmp = a.speed;
          a.speed = b.speed * 0.4;
          b.speed = tmp * 0.4;
          if (onCrash) onCrash(a, b, Math.min(1, impact / 30));
        }
      }
    }
  }
}

export function nearestCar(cars, x, z, rangeMax) {
  let best = null;
  let bd = rangeMax;
  for (const c of cars) {
    if (c.dead) continue;
    const d = Math.hypot(c.group.position.x - x, c.group.position.z - z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// Parked cars the player can steal, scattered near roads.
export function spawnParkedCars(scene, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const road = pick(rng, ROAD_COORDS);
    const dir = rng() < 0.5 ? 1 : -1;
    const off = laneOffset(axis, dir) + (dir > 0 ? 1.6 : -1.6);
    let x;
    let z;
    if (axis === 'z') {
      x = road + off;
      z = range(rng, -190, 190);
    } else {
      x = range(rng, -190, 190);
      z = road + off;
    }
    const heading = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    out.push(createVehicle(scene, x, z, heading, {}));
  }
  return out;
}

export { intRange };
