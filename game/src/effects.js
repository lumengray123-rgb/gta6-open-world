// Particles, explosions and screen shake. One THREE.Points pool serves every
// burst in the game; a single reusable point light fakes muzzle flashes and
// explosion glow. The camera reads `shake` each frame.

const MAX_PARTICLES = 800;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.cursor = 0;
    for (let i = 0; i < MAX_PARTICLES; i += 1) this.positions[i * 3 + 1] = -999;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.5, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.flash = new THREE.PointLight(0xffcc66, 0, 30);
    scene.add(this.flash);
    this.flashLife = 0;
    this.shake = 0;
    this.tmpColor = new THREE.Color();
  }

  burst(pos, colorHex, count, speed, up = 4, life = 0.7) {
    this.tmpColor.setHex(colorHex);
    for (let n = 0; n < count; n += 1) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const i3 = i * 3;
      this.positions[i3] = pos.x + (Math.random() - 0.5) * 0.6;
      this.positions[i3 + 1] = (pos.y || 0.5) + Math.random() * 0.6;
      this.positions[i3 + 2] = pos.z + (Math.random() - 0.5) * 0.6;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.vel[i3] = Math.cos(a) * sp;
      this.vel[i3 + 1] = Math.random() * up;
      this.vel[i3 + 2] = Math.sin(a) * sp;
      this.colors[i3] = this.tmpColor.r;
      this.colors[i3 + 1] = this.tmpColor.g;
      this.colors[i3 + 2] = this.tmpColor.b;
      this.life[i] = life * (0.6 + Math.random() * 0.7);
      this.maxLife[i] = this.life[i];
    }
  }

  explosion(pos) {
    this.burst(pos, 0xff7722, 40, 9, 8, 0.9);
    this.burst(pos, 0xffcc44, 25, 6, 7, 0.6);
    this.burst(pos, 0x555555, 20, 4, 6, 1.6);
    this.flash.position.set(pos.x, 2, pos.z);
    this.flash.color.setHex(0xffaa33);
    this.flash.intensity = 60;
    this.flashLife = 0.25;
    this.shake = Math.min(1, this.shake + 0.7);
  }

  muzzle(pos) {
    this.burst(pos, 0xffdd66, 4, 2, 1, 0.12);
    this.flash.position.set(pos.x, pos.y || 1.4, pos.z);
    this.flash.color.setHex(0xffee99);
    this.flash.intensity = 12;
    this.flashLife = 0.06;
  }

  addShake(amount) {
    this.shake = Math.min(1, this.shake + amount);
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.positions[i3 + 1] = -999;
        continue;
      }
      this.vel[i3 + 1] -= 12 * dt;
      this.positions[i3] += this.vel[i3] * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.positions[i3 + 1] < 0.05) {
        this.positions[i3 + 1] = 0.05;
        this.vel[i3 + 1] *= -0.3;
      }
    }
    if (any) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flash.intensity = 0;
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }
}
