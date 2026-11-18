// Combat: the player's pistol (raycast from the camera, on foot only) and
// the armed rivals from the Dockside crew, who advance on the player and
// shoot back. Shooting near police — or hitting anyone — raises the heat.

import { makePedMesh } from './pedestrians.js';
import { mulberry32, range } from './random.js';

const rng = mulberry32((Date.now() % 100000) + 777);

export class Combat {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rivals = [];
    this.cooldown = 0;
    this.wantedCooldown = 0;
    this.rayOrigin = new THREE.Vector3();
    this.rayDir = new THREE.Vector3();
  }

  spawnRivals(count, x, z) {
    this.clearRivals();
    for (let i = 0; i < count; i += 1) {
      const group = makePedMesh(0xa02020, [0xf2c9a0, 0xc98a5a, 0x8a5a34][i % 3], 0x1a1a1a);
      const a = rng() * Math.PI * 2;
      const d = range(rng, 6, 20);
      group.position.set(x + Math.cos(a) * d, 0, z + Math.sin(a) * d);
      this.scene.add(group);
      this.rivals.push({
        group, heading: 0, health: 100, dead: false, deadTimer: 0,
        shootTimer: range(rng, 1, 2.5), walkPhase: rng() * 6,
      });
    }
  }

  clearRivals() {
    for (const r of this.rivals) this.scene.remove(r.group);
    this.rivals = [];
  }

  get rivalsAlive() {
    return this.rivals.filter((r) => !r.dead).length;
  }

  // Ray vs sphere; returns distance or Infinity.
  raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius) {
    const ocx = cx - ox;
    const ocy = cy - oy;
    const ocz = cz - oz;
    const tca = ocx * dx + ocy * dy + ocz * dz;
    if (tca < 0) return Infinity;
    const d2 = ocx * ocx + ocy * ocy + ocz * ocz - tca * tca;
    if (d2 > radius * radius) return Infinity;
    return tca - Math.sqrt(radius * radius - d2);
  }

  // Ray vs building AABBs (y range 0..40); returns distance or Infinity.
  rayBuildings(ox, oy, oz, dx, dy, dz) {
    let best = Infinity;
    for (const c of this.city.colliders) {
      // Slab test on X and Z; buildings are tall, so Y rarely matters.
      let tmin = 0;
      let tmax = 200;
      if (Math.abs(dx) < 1e-6) {
        if (ox < c.minX || ox > c.maxX) continue;
      } else {
        let t1 = (c.minX - ox) / dx;
        let t2 = (c.maxX - ox) / dx;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dz) < 1e-6) {
        if (oz < c.minZ || oz > c.maxZ) continue;
      } else {
        let t1 = (c.minZ - oz) / dz;
        let t2 = (c.maxZ - oz) / dz;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      const hitY = oy + dy * tmin;
      if (hitY < 0 || hitY > 40) continue;
      if (tmin < best) best = tmin;
    }
    return best;
  }

  shoot(G) {
    const player = G.player;
    const cam = G.camera;
    cam.getWorldDirection(this.rayDir);
    this.rayOrigin.copy(cam.position);
    // Start the ray just in front of the camera so the player's own head
    // never blocks it.
    this.rayOrigin.addScaledVector(this.rayDir, 1.2);
    const o = this.rayOrigin;
    const d = this.rayDir;

    let bestDist = this.rayBuildings(o.x, o.y, o.z, d.x, d.y, d.z);
    let bestTarget = null;
    let bestKind = 'wall';

    const testActor = (pos, y, radius, kind, ref) => {
      const t = this.raySphere(o.x, o.y, o.z, d.x, d.y, d.z, pos.x, y, pos.z, radius);
      if (t < bestDist) {
        bestDist = t;
        bestTarget = ref;
        bestKind = kind;
      }
    };
    for (const r of this.rivals) {
      if (!r.dead) testActor(r.group.position, 1.2, 0.9, 'rival', r);
    }
    for (const f of G.police.footCops) {
      testActor(f.group.position, 1.2, 0.9, 'cop', f);
    }
    for (const p of G.peds) {
      if (!p.down) testActor(p.group.position, 1.2, 0.8, 'ped', p);
    }
    for (const car of G.cars) {
      if (!car.dead) testActor(car.group.position, 0.8, 2.2, 'car', car);
    }

    const hit = {
      x: o.x + d.x * Math.min(bestDist, 90),
      y: Math.max(0.1, o.y + d.y * Math.min(bestDist, 90)),
      z: o.z + d.z * Math.min(bestDist, 90),
    };
    const muzzle = {
      x: player.group.position.x + Math.sin(player.heading) * 0.6,
      y: 1.4,
      z: player.group.position.z + Math.cos(player.heading) * 0.6,
    };
    G.effects.muzzle(muzzle);
    G.audio.gunshot();
    // Tracer sparkle along the shot.
    G.effects.burst(hit, 0xffe9a8, 3, 1.5, 1, 0.15);

    if (bestKind === 'rival' && bestTarget) {
      bestTarget.health -= 34;
      G.effects.burst(hit, 0xcc2222, 8, 3, 3, 0.5);
      if (bestTarget.health <= 0) {
        bestTarget.dead = true;
        bestTarget.deadTimer = 4;
        bestTarget.group.rotation.x = -Math.PI / 2;
        bestTarget.group.position.y = 0.3;
        G.missions.onRivalDown();
        G.hud.showMessage('Rival down.');
      }
    } else if (bestKind === 'cop' && bestTarget) {
      G.effects.burst(hit, 0xcc2222, 8, 3, 3, 0.5);
      const i = G.police.footCops.indexOf(bestTarget);
      if (i >= 0) {
        this.scene.remove(bestTarget.group);
        G.police.footCops.splice(i, 1);
      }
      this.raiseHeat(G, 1);
    } else if (bestKind === 'ped' && bestTarget) {
      bestTarget.down = true;
      bestTarget.downTimer = 8;
      bestTarget.group.rotation.x = -Math.PI / 2;
      bestTarget.group.position.y = 0.3;
      G.effects.burst(hit, 0xcc2222, 6, 3, 3, 0.5);
      this.raiseHeat(G, 1);
    } else if (bestKind === 'car' && bestTarget) {
      bestTarget.health -= 15;
      G.effects.burst(hit, 0xffcc66, 6, 4, 3, 0.4);
      this.raiseHeat(G, 0); // shooting at cars draws attention only near cops
    } else if (bestKind === 'wall' && bestDist < 90) {
      G.effects.burst(hit, 0xcccccc, 5, 2, 2, 0.4);
    }

    // Noise: nearby peds run, and firing in front of police is a crime.
    const pp = player.group.position;
    for (const ped of G.peds) {
      const dx = ped.group.position.x - pp.x;
      const dz = ped.group.position.z - pp.z;
      if (Math.hypot(dx, dz) < 35 && !ped.down) {
        ped.state = 'flee';
        ped.stateTimer = 4;
        ped.heading = Math.atan2(dx, dz);
      }
    }
    let copNear = false;
    for (const c of G.police.cops) {
      if (Math.hypot(c.group.position.x - pp.x, c.group.position.z - pp.z) < 45) { copNear = true; break; }
    }
    if (copNear) this.raiseHeat(G, 1);
  }

  raiseHeat(G, n) {
    if (n <= 0) return;
    if (this.wantedCooldown > 0) return;
    this.wantedCooldown = 5;
    G.police.addWanted(n);
  }

  update(dt, G) {
    this.cooldown -= dt;
    this.wantedCooldown -= dt;
    // Fire while the mouse button is held, on foot only.
    if (G.state === 'playing' && !G.player.isDriving() && G.input.mouseDown && this.cooldown <= 0) {
      this.cooldown = 0.22;
      this.shoot(G);
    }

    // Rival AI: close in, then shoot.
    const pp = G.player.pos;
    for (let i = this.rivals.length - 1; i >= 0; i -= 1) {
      const r = this.rivals[i];
      if (r.dead) {
        r.deadTimer -= dt;
        if (r.deadTimer <= 0) {
          this.scene.remove(r.group);
          this.rivals.splice(i, 1);
        }
        continue;
      }
      const rp = r.group.position;
      const dx = pp.x - rp.x;
      const dz = pp.z - rp.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let diff = want - r.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      r.heading += diff * Math.min(1, dt * 5);
      if (dist > 12) {
        rp.x += Math.sin(r.heading) * 4.6 * dt;
        rp.z += Math.cos(r.heading) * 4.6 * dt;
        this.city.resolveCircle(rp, 0.6);
        r.walkPhase += dt * 8;
        const swing = Math.sin(r.walkPhase) * 0.55;
        r.group.userData.hipL.rotation.x = swing;
        r.group.userData.hipR.rotation.x = -swing;
      }
      r.group.rotation.y = r.heading;
      r.shootTimer -= dt;
      if (r.shootTimer <= 0 && dist < 38) {
        r.shootTimer = range(rng, 1.4, 2.6);
        const muzzle = { x: rp.x + Math.sin(r.heading) * 0.6, y: 1.4, z: rp.z + Math.cos(r.heading) * 0.6 };
        G.effects.muzzle(muzzle);
        G.audio.gunshot();
        // Rivals are bad shots — but not that bad.
        if (Math.random() < 0.38) {
          const died = G.player.damage(8, G.time);
          G.hud.flashDamage();
          if (died) G.onWasted();
        } else {
          const near = { x: pp.x + range(rng, -2, 2), y: 0.4, z: pp.z + range(rng, -2, 2) };
          G.effects.burst(near, 0xcccccc, 3, 2, 2, 0.3);
        }
      }
    }
  }
}
