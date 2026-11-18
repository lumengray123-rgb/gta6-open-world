// The wanted system: stars rise when the player commits crimes, cop cars
// spawn and pursue, foot cops chase a player on foot, and stars decay once
// the player stays out of sight. Busted and wasted are decided here too.

import { WANTED, ROAD_COORDS, WORLD_HALF } from './config.js';
import { createVehicle, removeVehicle } from './vehicles.js';
import { makePedMesh } from './pedestrians.js';
import { mulberry32, range, pick } from './random.js';

const rng = mulberry32((Date.now() % 100000) + 4242);

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.wanted = 0;
    this.cops = []; // vehicles with driver 'cop'
    this.footCops = [];
    this.unseenTimer = 0;
    this.decayTimer = 0;
    this.bustedTimer = 0;
    this.spawnTimer = 0;
  }

  addWanted(n) {
    const before = this.wanted;
    this.wanted = Math.max(0, Math.min(WANTED.maxStars, this.wanted + n));
    if (this.wanted !== before) {
      this.unseenTimer = 0;
      this.decayTimer = 0;
    }
    return this.wanted;
  }

  clearWanted() {
    this.wanted = 0;
    this.unseenTimer = 0;
    this.decayTimer = 0;
  }

  reset() {
    for (const c of this.cops) removeVehicle(this.scene, c);
    for (const f of this.footCops) this.scene.remove(f.group);
    this.cops = [];
    this.footCops = [];
    this.clearWanted();
    this.bustedTimer = 0;
  }

  spawnCopCar(G) {
    const p = G.player.pos;
    // Spawn on a road 40-60 units from the player, preferably ahead of them.
    const axis = rng() < 0.5 ? 'x' : 'z';
    const road = pick(rng, ROAD_COORDS);
    const dir = rng() < 0.5 ? 1 : -1;
    let x;
    let z;
    if (axis === 'z') {
      x = road;
      z = p.z + dir * range(rng, 40, 60);
    } else {
      x = p.x + dir * range(rng, 40, 60);
      z = road;
    }
    x = Math.max(-WORLD_HALF + 10, Math.min(WORLD_HALF - 10, x));
    z = Math.max(-WORLD_HALF + 10, Math.min(WORLD_HALF - 10, z));
    const car = createVehicle(this.scene, x, z, Math.atan2(p.x - x, p.z - z), {
      police: true, driver: 'cop',
    });
    car.cruise = WANTED.copSpeed[this.wanted] || 26;
    this.cops.push(car);
    G.cars.push(car);
    return car;
  }

  spawnFootCop(G) {
    const p = G.player.pos;
    const a = rng() * Math.PI * 2;
    const d = range(rng, 18, 30);
    const group = makePedMesh(0x2a3a6a, pick(rng, [0xf2c9a0, 0xc98a5a, 0x8a5a34]), 0x222222);
    const x = Math.max(-WORLD_HALF + 5, Math.min(WORLD_HALF - 5, p.x + Math.cos(a) * d));
    const z = Math.max(-WORLD_HALF + 5, Math.min(WORLD_HALF - 5, p.z + Math.sin(a) * d));
    group.position.set(x, 0, z);
    this.scene.add(group);
    const cop = { group, heading: 0, speed: 0, walkPhase: rng() * 6 };
    this.footCops.push(cop);
    return cop;
  }

  update(dt, G) {
    const player = G.player;
    const p = player.pos;
    const driving = player.isDriving();

    // --- wanted decay: stars fall only while no cop can see the player ---
    let seen = false;
    for (const c of this.cops) {
      if (Math.hypot(c.group.position.x - p.x, c.group.position.z - p.z) < 55) { seen = true; break; }
    }
    if (!seen) {
      for (const f of this.footCops) {
        if (Math.hypot(f.group.position.x - p.x, f.group.position.z - p.z) < 30) { seen = true; break; }
      }
    }
    if (this.wanted > 0 && !seen) {
      this.unseenTimer += dt;
      if (this.unseenTimer > WANTED.decayDelay) {
        this.decayTimer += dt;
        if (this.decayTimer >= WANTED.decayEvery) {
          this.decayTimer = 0;
          this.wanted -= 1;
          G.hud.showMessage(this.wanted === 0 ? 'You lost them. Heat is off.' : 'Heat dying down…');
        }
      }
    } else {
      this.unseenTimer = 0;
      this.decayTimer = 0;
    }

    // --- keep the right number of cop cars on the road ---------------------
    const want = WANTED.copsPerStar[this.wanted] || 0;
    this.spawnTimer -= dt;
    // Prune dead or far-away cops.
    for (let i = this.cops.length - 1; i >= 0; i -= 1) {
      const c = this.cops[i];
      const d = Math.hypot(c.group.position.x - p.x, c.group.position.z - p.z);
      if (c.dead || d > 170) {
        if (!c.dead) removeVehicle(this.scene, c);
        const gi = G.cars.indexOf(c);
        if (gi >= 0) G.cars.splice(gi, 1);
        this.cops.splice(i, 1);
      }
    }
    if (this.wanted > 0 && this.cops.length < want && this.spawnTimer <= 0) {
      this.spawnCopCar(G);
      this.spawnTimer = 1.2;
    }
    if (this.wanted === 0 && this.cops.length > 0) {
      // Heat off: cops give up and drive away (despawn).
      for (const c of this.cops) removeVehicle(this.scene, c);
      this.cops = [];
      G.cars = G.cars.filter((c) => c.driver !== 'cop');
    }

    // --- cop car pursuit ----------------------------------------------------
    const playerSpeed = driving ? player.car.speed : 0;
    for (const c of this.cops) {
      if (c.dead) continue;
      const cp = c.group.position;
      // Lead the target a little when the player is moving fast.
      const lead = driving ? Math.min(12, playerSpeed * 0.35) : 0;
      const tx = p.x + Math.sin(player.car ? player.car.heading : player.heading) * lead;
      const tz = p.z + Math.cos(player.car ? player.car.heading : player.heading) * lead;
      const wantHeading = Math.atan2(tx - cp.x, tz - cp.z);
      let diff = wantHeading - c.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      c.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      const targetSpeed = WANTED.copSpeed[this.wanted] || 26;
      c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 1.2);
      const prevX = cp.x;
      const prevZ = cp.z;
      cp.x += Math.sin(c.heading) * c.speed * dt;
      cp.z += Math.cos(c.heading) * c.speed * dt;
      this.city.resolveCircle(cp, 1.9);
      const moved = Math.hypot(cp.x - prevX, cp.z - prevZ);
      if (moved < c.speed * dt * 0.25 && c.speed > 5) {
        // Stuck on a building: back off and jitter the heading.
        c.speed = -6;
        c.heading += (rng() < 0.5 ? -1 : 1) * 0.7;
      }
      c.group.rotation.y = c.heading;
      const spin = (c.speed * dt) / 0.36;
      for (const w of c.group.userData.wheels) w.rotation.x += spin;
      // Flash the light bar.
      const bar = c.group.userData.lightBar;
      if (bar) {
        const on = Math.floor(G.time * 6) % 2 === 0;
        bar.children[0].visible = on;
        bar.children[1].visible = !on;
      }
    }

    // --- foot cops ----------------------------------------------------------
    if (this.wanted > 0 && !driving) {
      const wantFoot = Math.min(3, this.wanted);
      if (this.footCops.length < wantFoot && this.spawnTimer <= 0) {
        this.spawnFootCop(G);
        this.spawnTimer = 2;
      }
    }
    if (this.wanted === 0 || driving) {
      for (const f of this.footCops) this.scene.remove(f.group);
      this.footCops = [];
      this.bustedTimer = 0;
    }
    let touching = false;
    for (let i = this.footCops.length - 1; i >= 0; i -= 1) {
      const f = this.footCops[i];
      const fp = f.group.position;
      const d = Math.hypot(fp.x - p.x, fp.z - p.z);
      if (d > 120) {
        this.scene.remove(f.group);
        this.footCops.splice(i, 1);
        continue;
      }
      const wantHeading = Math.atan2(p.x - fp.x, p.z - fp.z);
      let diff = wantHeading - f.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      f.heading += diff * Math.min(1, dt * 6);
      const speed = d > 2 ? 7.6 : 0;
      fp.x += Math.sin(f.heading) * speed * dt;
      fp.z += Math.cos(f.heading) * speed * dt;
      this.city.resolveCircle(fp, 0.6);
      f.group.rotation.y = f.heading;
      f.walkPhase += dt * speed * 1.8;
      const swing = Math.sin(f.walkPhase) * 0.6;
      f.group.userData.hipL.rotation.x = swing;
      f.group.userData.hipR.rotation.x = -swing;
      if (d < 2.1) touching = true;
    }
    if (touching && !player.moving) {
      this.bustedTimer += dt;
      if (this.bustedTimer > 1.2) {
        G.onBusted();
        return;
      }
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }

    G.audio.setSiren(this.wanted > 0);
  }
}
