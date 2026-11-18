// Third-person camera: orbits with the mouse, follows behind the car while
// driving, and shakes with explosions. Yaw 0 looks toward +Z; the camera
// sits behind the player at (sin yaw, cos yaw) and looks back at them.

export function initCamera(G) {
  G.camYaw = Math.PI; // start looking north, toward the city centre
  G.camPitch = 0.32;
  G.lastMouseAt = -99;
  G.camera.position.set(0, 8, -14);
  G.camera.lookAt(0, 1.5, 0);
}

export function updateCamera(dt, G) {
  const input = G.input;
  const d = input.takeMouseDelta();
  if (d.x !== 0 || d.y !== 0) {
    G.camYaw -= d.x * 0.0028;
    G.camPitch = Math.max(0.05, Math.min(1.0, G.camPitch + d.y * 0.0022));
    G.lastMouseAt = G.time;
  }

  const player = G.player;
  const driving = player.isDriving();
  // While driving, the camera drifts back behind the car when the mouse rests
  // (in screenshot mode the shot staging owns the camera angle instead).
  if (driving && G.time - G.lastMouseAt > 1.5 && !G.shotMode) {
    let diff = player.car.heading - G.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    G.camYaw += diff * Math.min(1, dt * 1.4);
  }

  const target = player.pos;
  const tx = target.x;
  const ty = target.y + (driving ? 1.6 : 1.7);
  const tz = target.z;
  const dist = driving ? 9.5 : 6.8;
  const cp = Math.cos(G.camPitch);
  const sp = Math.sin(G.camPitch);
  const cx = tx - Math.sin(G.camYaw) * cp * dist;
  const cy = ty + sp * dist;
  const cz = tz - Math.cos(G.camYaw) * cp * dist;

  const cam = G.camera;
  const k = Math.min(1, dt * 9);
  cam.position.x += (cx - cam.position.x) * k;
  cam.position.y += (Math.max(0.7, cy) - cam.position.y) * k;
  cam.position.z += (cz - cam.position.z) * k;

  // Look slightly ahead of a moving car.
  let lookX = tx;
  let lookZ = tz;
  if (driving) {
    const lead = Math.min(4, Math.abs(player.car.speed) * 0.12);
    lookX += Math.sin(player.car.heading) * lead;
    lookZ += Math.cos(player.car.heading) * lead;
  }
  cam.lookAt(lookX, ty, lookZ);

  // Explosion shake.
  const s = G.effects.shake;
  if (s > 0.01) {
    cam.position.x += (Math.random() - 0.5) * s * 0.5;
    cam.position.y += (Math.random() - 0.5) * s * 0.4;
    cam.rotation.z += (Math.random() - 0.5) * s * 0.03;
  }
}
