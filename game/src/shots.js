// Screenshot scenes (?shot=cover|street|mission|combat). Each one stages the
// real game — real cars, real cops, real missions — then lets an autopilot
// drive or the camera drift while the screenshot is taken. Nothing here is
// a mock: the same update loop runs, so the pictures show the actual game.

import { LANDMARKS } from './config.js';
import { MISSIONS } from './missions.js';
import { createVehicle } from './vehicles.js';

// Steer the player's car toward a target point at a target speed.
function autopilotDrive(G, dt, targetX, targetZ, targetSpeed) {
  const car = G.player.car;
  if (!car) return;
  const p = car.group.position;
  const want = Math.atan2(targetX - p.x, targetZ - p.z);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.4);
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
    for (const [dx, dz] of [[-3, 18], [4, 30], [-2, 44]]) {
      const cop = createVehicle(G.scene, 26 + dx, 60 + dz, Math.PI, { police: true, driver: 'cop' });
      cop.speed = 24;
      G.cars.push(cop);
      G.police.cops.push(cop);
    }
    // Mission 1, second step: drive to Vera's Garage.
    G.missions.active = { def: MISSIONS[0], step: 1, timer: 0, holdTimer: 0, kills: 0 };
    G.missions.current = 0;
    G.missions.updateBeacon();
    G.camYaw = Math.PI;
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
    G.hud.showMessage('Welcome to Solmara — explore, drive, take jobs from Vera.');
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
    G.player.group.position.set(168, 0, 160);
    G.player.heading = Math.PI * 0.25;
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
    G.camYaw = Math.PI * 0.25;
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
    // Keep the chase tight: cops stay on the player's tail.
    for (const cop of G.police.cops) {
      const cp = cop.group.position;
      const pp = G.player.pos;
      const want = Math.atan2(pp.x - cp.x, pp.z - cp.z);
      let diff = want - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cop.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      cop.speed += (27 - cop.speed) * Math.min(1, dt);
      cp.x += Math.sin(cop.heading) * cop.speed * dt;
      cp.z += Math.cos(cop.heading) * cop.speed * dt;
      G.city.resolveCircle(cp, 1.9);
      cop.group.rotation.y = cop.heading;
    }
  } else if (G.shotName === 'street' || G.shotName === 'combat') {
    // Slow camera drift for a lively frame.
    G.camYaw += dt * 0.05;
  }
  // Missions must not complete or fail during a staged shot.
  if (G.missions.active && G.missions.active.def.steps[G.missions.active.step].type === 'timedGoto') {
    G.missions.active.timer = Math.max(G.missions.active.timer, 60);
  }
}
