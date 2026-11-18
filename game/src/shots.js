// Screenshot scenes (?shot=cover|street|mission|combat). Each one stages the
// real game — real cars, real cops, real missions — then lets an autopilot
// drive or the camera drift while the screenshot is taken. Nothing here is
// a mock: the same update loop runs, so the pictures show the actual game.

import { LANDMARKS } from './config.js';
import { MISSIONS } from './missions.js';
import { createVehicle } from './vehicles.js';

// Steer the player's car toward a target point: full speed on straights,
// slow for corners so the car stays on the road instead of cutting blocks.
function autopilotDrive(G, dt, targetX, targetZ, targetSpeed) {
  const car = G.player.car;
  if (!car) return;
  const p = car.group.position;
  const want = Math.atan2(targetX - p.x, targetZ - p.z);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  const speed = Math.abs(diff) > 0.6 ? Math.min(targetSpeed, 11) : targetSpeed;
  car.speed += (speed - car.speed) * Math.min(1, dt * 1.4);
  p.x += Math.sin(car.heading) * car.speed * dt;
  p.z += Math.cos(car.heading) * car.speed * dt;
  G.city.resolveCircle(p, 1.9);
  car.group.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.36;
  for (const w of car.group.userData.wheels) w.rotation.x += spin;
}

function putPlayerInCar(G, x, z, heading, color) {
  const car = createVehicle(G.scene, x, z, heading, { color });
  G.cars.push(car);
  G.player.enterCar(car);
  car.speed = 12;
  return car;
}

export function applyShot(name, G) {
  G.shotName = name;
  G.shotTime = 0;
  G.hud.showHud();
  G.state = 'playing';

  if (name === 'cover') {
    // Police chase: player speeding up the avenue, three cop cars behind,
    // three stars, mission objective on the HUD and minimap.
    putPlayerInCar(G, 26, 60, Math.PI, 0xc23a3a);
    G.player.cash = 850;
    G.police.addWanted(3);
    // Three cop cars in a chase formation: each holds a slot behind the
    // player instead of ramming, so the frame reads as a pursuit.
    const slots = [
      { dist: 15, lat: -2.5 },
      { dist: 22, lat: 2.5 },
      { dist: 30, lat: -1 },
    ];
    for (const [i, s] of slots.entries()) {
      const cop = createVehicle(G.scene, 26 + s.lat, 60 + s.dist, Math.PI, { police: true, driver: 'cop' });
      cop.speed = 24;
      cop.followSlot = s;
      cop.slotIndex = i;
      G.cars.push(cop);
      G.police.cops.push(cop);
    }
    // Mission 1, second step: drive to Vera's Garage.
    G.missions.active = { def: MISSIONS[0], step: 1, timer: 0, holdTimer: 0, kills: 0 };
    G.missions.current = 0;
    G.missions.updateBeacon();
    // Front 3/4 camera: it sits ahead of the car looking back, so the frame
    // holds the player's car AND the cop cars chasing it.
    G.camYaw = 0;
    G.camPitch = 0.3;
    G.shotWaypoints = [[26, -40], [26, -120]];
  } else if (name === 'street') {
    // On foot in a busy street by the plaza: peds, palms, traffic.
    G.player.group.position.set(8, 0, -10);
    G.player.heading = Math.PI * 0.75;
    G.player.cash = 350;
    G.camYaw = Math.PI * 0.75;
    G.camPitch = 0.22;
    G.missions.updateBeacon();
  } else if (name === 'mission') {
    // Timed delivery run toward the casino, package on board.
    putPlayerInCar(G, 78, -30, Math.PI, 0x3a6ac2);
    G.player.cash = 1200;
    G.missions.active = { def: MISSIONS[1], step: 1, timer: 118, holdTimer: 0, kills: 0 };
    G.missions.current = 1;
    G.missions.updateBeacon();
    G.camYaw = Math.PI;
    G.camPitch = 0.3;
    G.shotWaypoints = [[78, -78], [130, -78], [130, -118]];
  } else if (name === 'combat') {
    // Dockside shootout: rivals advancing, one already down, mission 4 live.
    // Staged on the open eastern road so the camera has a clear line past
    // the containers to the beacon, the rivals and the ocean.
    G.player.group.position.set(182, 0, 148);
    G.player.heading = 0;
    G.player.cash = 1600;
    G.combat.spawnRivals(5, 182, 182);
    // One rival already down, for a lived-in firefight.
    const first = G.combat.rivals[0];
    first.dead = true;
    first.deadTimer = 60;
    first.group.rotation.x = -Math.PI / 2;
    first.group.position.y = 0.3;
    G.missions.active = { def: MISSIONS[3], step: 1, timer: 0, holdTimer: 0, kills: 1 };
    G.missions.current = 3;
    G.missions.updateBeacon();
    G.camYaw = 0;
    G.camPitch = 0.25;
    G.hud.showMessage('The Dockside crew is here — fight back!');
  }
  G.hud.update(0, G);
}

// Called every frame while a shot scene is staged.
export function updateShot(dt, G) {
  G.shotTime += dt;
  if (G.shotName === 'cover' || G.shotName === 'mission') {
    const wps = G.shotWaypoints;
    if (wps && wps.length > 0) {
      const [tx, tz] = wps[0];
      const p = G.player.car.group.position;
      if (Math.hypot(tx - p.x, tz - p.z) < 8) wps.shift();
      else autopilotDrive(G, dt, tx, tz, 26);
    }
    // Keep the chase tight and in formation: each cop holds its slot behind
    // the player car, matching speed instead of ramming.
    const pp = G.player.pos;
    const ph = G.player.car.heading;
    const fx = Math.sin(ph);
    const fz = Math.cos(ph);
    const rx = Math.cos(ph);
    const rz = -Math.sin(ph);
    for (const cop of G.police.cops) {
      const s = cop.followSlot || { dist: 15, lat: 0 };
      const tx = pp.x - fx * s.dist + rx * s.lat;
      const tz = pp.z - fz * s.dist + rz * s.lat;
      const cp = cop.group.position;
      const want = Math.atan2(tx - cp.x, tz - cp.z);
      let diff = want - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cop.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      const gap = Math.hypot(tx - cp.x, tz - cp.z);
      const targetSpeed = G.player.car.speed + (gap > 4 ? 3 : gap < 1.5 ? -3 : 0);
      cop.speed += (targetSpeed - cop.speed) * Math.min(1, dt * 1.5);
      cp.x += Math.sin(cop.heading) * cop.speed * dt;
      cp.z += Math.cos(cop.heading) * cop.speed * dt;
      G.city.resolveCircle(cp, 1.9);
      cop.group.rotation.y = cop.heading;
      const bar = cop.group.userData.lightBar;
      if (bar) {
        const on = Math.floor(G.time * 6) % 2 === 0;
        bar.children[0].visible = on;
        bar.children[1].visible = !on;
      }
    }
    // Snap the camera: behind the car normally, but ahead of it looking back
    // for the cover, so the pursuing cops stay in the frame.
    const yawTarget = G.shotName === 'cover'
      ? G.player.car.heading + Math.PI
      : G.player.car.heading;
    let dyaw = yawTarget - G.camYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    G.camYaw += dyaw * Math.min(1, dt * 5);
    G.camPitch += (0.3 - G.camPitch) * Math.min(1, dt * 5);
  } else if (G.shotName === 'street' || G.shotName === 'combat') {
    // Slow camera drift for a lively frame.
    G.camYaw += dt * 0.02;
  }
  // Missions must not complete or fail during a staged shot.
  if (G.missions.active && G.missions.active.def.steps[G.missions.active.step].type === 'timedGoto') {
    G.missions.active.timer = Math.max(G.missions.active.timer, 60);
  }
}
