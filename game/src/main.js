// Solmara — Streets of Solmara. Bootstrap, game loop and state machine.
// Wires every system together: city, cars, peds, police, missions, combat,
// effects, camera, HUD and saves. Also hosts the ?shot= screenshot scenes.

import { PALETTE, LANDMARKS, WANTED, DRIVING } from './config.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity } from './city.js';
import {
  createVehicle, removeVehicle, spawnTrafficCar, updateTrafficCar,
  collideCars, nearestCar, spawnParkedCars,
} from './vehicles.js';
import { spawnPeds, updatePeds, scarePeds } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { initCamera, updateCamera } from './camera.js';
import { Hud } from './hud.js';
import { hasSave, saveGame, loadGame, clearSave } from './save.js';
import { applyShot, updateShot } from './shots.js';

const G = {
  state: 'menu', // menu | playing | paused | briefing | busted | wasted
  time: 0,
  shotMode: false,
  shotName: null,
  frame: 0,
};
window.__solmara = G;

// --- renderer, scene, lights ---------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('game-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 70, 340);

const hemi = new THREE.HemisphereLight(0xbfd9e8, 0x8a7a5a, 0.72);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PALETTE.sun, 1.05);
sun.position.set(90, 140, 60);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 60, -140);

G.renderer = renderer;
G.scene = scene;
G.camera = camera;
G.input = new Input(renderer.domElement);
G.audio = new AudioEngine();
G.city = buildCity(scene);
G.effects = new Effects(scene);
G.player = new Player(scene, G.city, 10, -10);
G.police = new Police(scene, G.city);
G.missions = new Missions(scene);
G.combat = new Combat(scene, G.city);
G.cars = [];
G.peds = spawnPeds(scene, 36);
G.husks = []; // burnt-out cars awaiting removal
G.resprayCooldown = 0;

G.cars.push(...spawnParkedCars(scene, 14));
for (let i = 0; i < 10; i += 1) {
  G.cars.push(spawnTrafficCar(scene, G.city, 0, 0));
}

G.nearestCarToPlayer = () => nearestCar(
  G.cars, G.player.group.position.x, G.player.group.position.z, DRIVING.enterRange,
);

G.save = () => saveGame(G);

function respawnPlayer(at, loseFraction) {
  const p = G.player;
  if (p.car) {
    p.car.driver = null;
    p.car = null;
    p.group.visible = true;
  }
  p.group.position.set(at.x, 0, at.z);
  p.heading = 0;
  p.health = 100;
  p.cash = Math.max(0, Math.round(p.cash * (1 - loseFraction)));
  G.police.reset();
  G.combat.clearRivals();
  G.missions.active = null;
  G.missions.updateBeacon();
  G.audio.setSiren(false);
  G.audio.setEngine(null);
  G.hud.hideEndScreens();
  G.hud.showHud();
  G.state = 'playing';
  G.save();
}

G.onBusted = () => {
  if (G.state !== 'playing') return;
  G.state = 'busted';
  G.audio.setSiren(false);
  G.audio.setEngine(null);
  G.hud.showBusted();
  G.hud.showMessage('Busted! The Solmara PD takes its cut.');
};

G.onWasted = () => {
  if (G.state !== 'playing') return;
  G.state = 'wasted';
  G.audio.setSiren(false);
  G.audio.setEngine(null);
  G.hud.showWasted();
  G.hud.showMessage('Wasted! You wake up at Solmara General.');
};

G.hud = new Hud({
  onBegin: (useSave) => {
    G.audio.init();
    G.audio.resume();
    let save = null;
    if (useSave) save = loadGame();
    if (save) {
      G.player.cash = save.cash;
      G.player.health = save.health;
      G.player.group.position.set(save.x, 0, save.z);
      G.player.heading = save.heading;
      G.missions.current = Math.min(save.mission, 5);
      G.missions.finished = !!save.finished;
      G.missions.updateBeacon();
      G.hud.showMessage('Welcome back to Solmara.');
    } else {
      clearSave();
      G.hud.showHud();
      G.missions.startMission(G, 0);
      G.state = 'briefing';
      return;
    }
    G.hud.showHud();
    G.state = 'playing';
  },
  onResume: () => {
    G.hud.hidePause();
    G.state = 'playing';
  },
  onRestart: () => {
    clearSave();
    window.location.reload();
  },
  onBriefingDone: () => {
    G.hud.hideBriefing();
    G.state = 'playing';
  },
  onRespawn: (kind) => {
    if (kind === 'busted') respawnPlayer({ x: 10, z: -10 }, 0.15);
    else respawnPlayer({ x: LANDMARKS.hospital.x, z: LANDMARKS.hospital.z - 14 }, 0.10);
  },
});

initCamera(G);

// --- car death, respray, traffic upkeep -----------------------------------
function handleDeadCars(dt) {
  for (const car of G.cars) {
    if (car.health <= 0 && !car.dead) {
      car.dead = true;
      car.speed = 0;
      G.effects.explosion(car.group.position);
      G.audio.crash(1);
      scarePeds(G.peds, car.group.position.x, car.group.position.z, 45);
      // Char the wreck.
      car.group.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) o.material = new THREE.MeshLambertMaterial({ color: 0x1c1c1e });
      });
      G.husks.push({ car, timer: 8 });
      if (G.player.car === car) {
        const died = G.player.damage(25, G.time);
        G.player.exitCar();
        G.hud.flashDamage();
        if (died) G.onWasted();
      }
    }
  }
  for (let i = G.husks.length - 1; i >= 0; i -= 1) {
    G.husks[i].timer -= dt;
    if (G.husks[i].timer <= 0) {
      const { car } = G.husks[i];
      removeVehicle(scene, car);
      const gi = G.cars.indexOf(car);
      if (gi >= 0) G.cars.splice(gi, 1);
      const ci = G.police.cops.indexOf(car);
      if (ci >= 0) G.police.cops.splice(ci, 1);
      G.husks.splice(i, 1);
    }
  }
}

function checkRespray(dt) {
  G.resprayCooldown -= dt;
  const p = G.player;
  if (!p.isDriving() || G.police.wanted === 0 || G.resprayCooldown > 0) return;
  const d = Math.hypot(p.pos.x - LANDMARKS.respray.x, p.pos.z - LANDMARKS.respray.z);
  if (d < 12) {
    if (p.cash >= WANTED.resprayCost) {
      p.cash -= WANTED.resprayCost;
      p.car.health = p.car.maxHealth;
      G.police.clearWanted();
      G.police.reset();
      G.hud.showMessage(`Fresh paint — $${WANTED.resprayCost}. The heat is off and the car is fixed.`);
      G.audio.pickup();
      G.resprayCooldown = 4;
    } else {
      G.hud.showMessage(`Tint & Trim wants $${WANTED.resprayCost} — you have $${p.cash}.`);
      G.resprayCooldown = 4;
    }
  }
}

function upkeepTraffic() {
  const pp = G.player.pos;
  let traffic = 0;
  for (let i = G.cars.length - 1; i >= 0; i -= 1) {
    const c = G.cars[i];
    if (!c.isTraffic) continue;
    traffic += 1;
    const d = Math.hypot(c.group.position.x - pp.x, c.group.position.z - pp.z);
    if (c.dead || d > 220) {
      removeVehicle(scene, c);
      G.cars.splice(i, 1);
      traffic -= 1;
    }
  }
  while (traffic < 10) {
    G.cars.push(spawnTrafficCar(scene, G.city, pp.x, pp.z));
    traffic += 1;
  }
}

// --- screenshot mode --------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot && ['cover', 'street', 'mission', 'combat'].includes(shot)) {
  G.shotMode = true;
  G.shotWallStart = performance.now();
  applyShot(shot, G);
} else {
  G.hud.showStart(hasSave());
}

// --- main loop --------------------------------------------------------------
const clock = new THREE.Clock();
let menuAngle = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  G.frame += 1;

  // One bad frame must never kill the loop: log it and keep rendering.
  try {
    if (G.state === 'menu') {
    // Slow cinematic orbit over the city behind the start screen.
    menuAngle += dt * 0.03;
    camera.position.set(Math.sin(menuAngle) * 150, 62, Math.cos(menuAngle) * 150);
    camera.lookAt(0, 0, 10);
    updatePeds(G.peds, dt, G.city, G.cars, null);
    for (const c of G.cars) if (c.isTraffic) updateTrafficCar(c, dt, G.cars);
    G.effects.update(dt);
  } else if (G.state === 'playing') {
    const autopilot = G.shotMode && (G.shotName === 'cover' || G.shotName === 'mission');
    if (!autopilot) G.player.update(dt, G);
    for (const c of G.cars) if (c.isTraffic && !c.dead) updateTrafficCar(c, dt, G.cars);
    updatePeds(G.peds, dt, G.city, G.cars, (ped, car) => {
      if (car.driver === 'player') {
        G.police.addWanted(1);
        G.hud.showMessage('You hit a pedestrian! The cops are coming.');
      }
    });
    collideCars(G.cars, (a, b, strength) => {
      if (a.driver === 'player' || b.driver === 'player') {
        G.audio.crash(strength);
        G.effects.addShake(strength * 0.4);
      }
    });
    handleDeadCars(dt);
    if (!G.shotMode) G.police.update(dt, G);
    if (G.state === 'playing') {
      if (!G.shotMode) G.missions.update(dt, G);
      G.combat.update(dt, G);
      checkRespray(dt);
      upkeepTraffic();
      if (G.shotMode) updateShot(dt, G);
    }
    updateCamera(dt, G);
    G.effects.update(dt);
    G.hud.update(dt, G);

    // Keys that work while playing.
    if (G.input.pressed('Escape') || G.input.pressed('KeyP')) {
      G.state = 'paused';
      G.hud.showPause();
      G.save();
      G.audio.setEngine(null);
      G.audio.setSiren(false);
      G.input.exitPointerLock();
    }
    if (G.input.pressed('KeyM')) {
      const muted = G.audio.toggleMute();
      G.hud.showMessage(muted ? 'Sound off (M to turn back on)' : 'Sound on', 2);
    }
  } else if (G.state === 'paused') {
    if (G.input.pressed('Escape') || G.input.pressed('KeyP')) {
      G.hud.hidePause();
      G.state = 'playing';
    }
  }
  // briefing / busted / wasted: the world freezes; the overlay handles input.
  } catch (e) {
    console.error('[solmara] frame error:', e);
  }

  G.input.endFrame();
  renderer.render(scene, camera);

  // Screenshot readiness: the scene has settled after ~2 seconds of game
  // time, or 90 seconds of wall time on very slow (software) renderers.
  if (G.shotMode && !window.__solmaraShotReady) {
    if (G.frame > 110 || performance.now() - G.shotWallStart > 90000) {
      window.__solmaraShotReady = true;
    }
  }
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
