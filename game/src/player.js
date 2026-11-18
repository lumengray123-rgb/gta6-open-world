// The player character, Rio: on-foot movement relative to the camera, car
// entry and exit, health with slow regeneration, and cash. Driving physics
// live in vehicles.js; this class decides when the player is behind a wheel.

import { PLAYER, DRIVING } from './config.js';
import { makePedMesh } from './pedestrians.js';
import { nearestCar, driveCar } from './vehicles.js';

export class Player {
  constructor(scene, city, x, z) {
    this.city = city;
    this.group = makePedMesh(0x1f8a8a, 0xc98a5a, 0x2a3a5a);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.heading = 0;
    this.health = PLAYER.maxHealth;
    this.cash = 0;
    this.car = null;
    this.walkPhase = 0;
    this.lastDamageAt = -99;
    this.moving = false;
  }

  get pos() {
    return this.car ? this.car.group.position : this.group.position;
  }

  isDriving() {
    return !!this.car;
  }

  damage(amount, now) {
    this.health = Math.max(0, this.health - amount);
    this.lastDamageAt = now;
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  addCash(amount) {
    this.cash += amount;
    return this.cash;
  }

  enterCar(car) {
    this.car = car;
    car.driver = 'player';
    car.isTraffic = false;
    this.group.visible = false;
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    car.driver = null;
    // Step out on the left side of the car.
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.group.position.set(
      car.group.position.x + side.x * 2.2,
      0,
      car.group.position.z + side.z * 2.2,
    );
    this.city.resolveCircle(this.group.position, PLAYER.radius);
    this.group.visible = true;
    this.car = null;
  }

  update(dt, G) {
    const input = G.input;
    // Health trickles back after a few quiet seconds.
    if (G.time - this.lastDamageAt > PLAYER.regenDelay && this.health > 0) {
      this.health = Math.min(PLAYER.maxHealth, this.health + PLAYER.regenRate * dt);
    }

    if (this.car) {
      const crash = driveCar(this.car, input, dt, this.city);
      if (crash) {
        G.audio.crash(crash.strength);
        G.effects.burst(this.car.group.position, 0xffcc66, 6, 3);
      }
      if (input.pressed('KeyE') || input.pressed('KeyF')) {
        this.exitCar();
        G.audio.blip(440, 0.08);
      }
      G.audio.setEngine(Math.abs(this.car.speed) / DRIVING.maxSpeed);
      this.moving = Math.abs(this.car.speed) > 0.5;
      return;
    }

    G.audio.setEngine(null);
    // On foot: WASD relative to the camera yaw.
    const f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0)
      - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const s = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0)
      - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    this.moving = f !== 0 || s !== 0;
    if (this.moving) {
      const yaw = G.camYaw;
      // Camera forward is (sin yaw, 0, cos yaw); right is (cos yaw, 0, -sin yaw).
      let mx = Math.sin(yaw) * f + Math.cos(yaw) * s;
      let mz = Math.cos(yaw) * f - Math.sin(yaw) * s;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
      this.group.position.x += mx * speed * dt;
      this.group.position.z += mz * speed * dt;
      this.city.resolveCircle(this.group.position, PLAYER.radius);
      const want = Math.atan2(mx, mz);
      let diff = want - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 12);
      this.walkPhase += dt * speed * 1.6;
      const swing = Math.sin(this.walkPhase) * 0.6;
      this.group.userData.hipL.rotation.x = swing;
      this.group.userData.hipR.rotation.x = -swing;
      this.group.userData.armL.rotation.x = -swing * 0.7;
      this.group.userData.armR.rotation.x = swing * 0.7;
    } else {
      this.group.userData.hipL.rotation.x *= 0.8;
      this.group.userData.hipR.rotation.x *= 0.8;
      this.group.userData.armL.rotation.x *= 0.8;
      this.group.userData.armR.rotation.x *= 0.8;
    }
    this.group.rotation.y = this.heading;

    // E near a car steals it.
    if (input.pressed('KeyE')) {
      const car = nearestCar(G.cars, this.group.position.x, this.group.position.z, DRIVING.enterRange);
      if (car) {
        this.enterCar(car);
        G.audio.blip(520, 0.09);
        G.audio.pickup();
      }
    }
  }
}
