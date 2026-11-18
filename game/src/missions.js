// The story: six missions from Vera Solano, fixer of Solmara. Each mission
// is a list of steps (drive somewhere, pick something up, lose the heat,
// clear out rivals, hold a point). Completing one pays out and unlocks the
// next; the next mission starts by driving into the marker at Vera's Garage.

import { MISSION_REWARDS, LANDMARKS } from './config.js';

export const MISSIONS = [
  {
    title: 'First Wheels',
    brief: "Vera Solano: \"New in town? I need a driver with steady hands. Grab any car on the street and bring it to my garage — and try not to scratch it.\"",
    steps: [
      { type: 'anyCar', text: 'Steal a car — walk up to one and press E' },
      { type: 'gotoInCar', x: LANDMARKS.veraGarage.x, z: LANDMARKS.veraGarage.z, radius: 10, label: "Vera's Garage", text: "Drive to Vera's Garage" },
    ],
  },
  {
    title: 'The Pickup',
    brief: "Vera: \"A package is waiting at the docks. Collect it, then get it to the Gilded Palm casino. The buyer does not wait — 150 seconds, Rio.\"",
    steps: [
      { type: 'goto', x: LANDMARKS.docks.x, z: LANDMARKS.docks.z, radius: 12, label: 'Solmara Docks', text: 'Collect the package at the docks' },
      { type: 'timedGoto', x: LANDMARKS.casino.x, z: LANDMARKS.casino.z, radius: 12, label: 'The Gilded Palm', seconds: 150, text: 'Deliver the package to the casino' },
    ],
  },
  {
    title: 'Heat Wave',
    brief: "Vera: \"The crew is hot — the Solmara PD has your description. Lose them. Hide, or swing by Tint & Trim for a fresh coat and a clean plate.\"",
    steps: [
      { type: 'loseWanted', text: 'Lose your wanted level (hide, or visit Tint & Trim)' },
    ],
    onStart(G) {
      G.police.addWanted(3);
    },
  },
  {
    title: 'Rival Turf',
    brief: "Vera: \"The Dockside crew is moving on our turf. Go to the docks and send them a message they understand. Five of them. Bring the pistol.\"",
    steps: [
      { type: 'goto', x: LANDMARKS.docks.x, z: LANDMARKS.docks.z, radius: 16, label: 'Solmara Docks', text: 'Reach the docks' },
      { type: 'eliminate', count: 5, x: LANDMARKS.docks.x, z: LANDMARKS.docks.z, label: 'Solmara Docks', text: 'Deal with the Dockside crew (0/5)' },
    ],
  },
  {
    title: 'Getaway',
    brief: "Vera: \"Ride with me. We hit three drops across town and the cops will be on us the whole way. Keep the car moving and get us home.\"",
    steps: [
      { type: 'goto', x: LANDMARKS.veraGarage.x, z: LANDMARKS.veraGarage.z, radius: 10, label: "Vera's Garage", text: 'Pick up Vera at the garage' },
      { type: 'goto', x: LANDMARKS.plaza.x, z: LANDMARKS.plaza.z, radius: 10, label: 'Plaza del Sol', text: 'Drop 1 — Plaza del Sol' },
      { type: 'goto', x: LANDMARKS.hospital.x, z: LANDMARKS.hospital.z, radius: 10, label: 'Solmara General', text: 'Drop 2 — Solmara General' },
      { type: 'goto', x: LANDMARKS.safehouse.x, z: LANDMARKS.safehouse.z, radius: 10, label: 'Safehouse', text: 'Get Vera to the safehouse' },
    ],
    onStep(G, stepIndex) {
      if (stepIndex === 1) {
        G.police.addWanted(3);
        G.hud.showMessage('Vera is in the car — and so are the cops!');
      }
    },
  },
  {
    title: 'The Solmara Job',
    brief: "Vera: \"The big one. The Gilded Palm vault, tonight. Crack it, then run for the boat at Sunset Pier. The whole city will be looking for you.\"",
    steps: [
      { type: 'goto', x: LANDMARKS.casino.x, z: LANDMARKS.casino.z, radius: 12, label: 'The Gilded Palm', text: 'Reach the casino' },
      { type: 'hold', x: LANDMARKS.casino.x, z: LANDMARKS.casino.z, radius: 12, seconds: 8, label: 'The Gilded Palm', text: 'Crack the vault — stay in the marker' },
      { type: 'goto', x: LANDMARKS.pier.x, z: LANDMARKS.pier.z, radius: 12, label: 'Sunset Pier', text: 'Escape to the boat at Sunset Pier' },
    ],
    onStep(G, stepIndex) {
      if (stepIndex === 2) {
        G.police.addWanted(4);
        G.hud.showMessage('Vault cracked! Every cop in Solmara is coming.');
      }
    },
  },
];

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.current = 0; // index of the next mission to play
    this.active = null; // { def, step, timer, holdTimer, kills }
    this.finished = false;

    // Objective beacon: a golden column of light + a ground ring.
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffc53a, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), beamMat);
    this.beacon.position.y = 30;
    this.beacon.visible = false;
    scene.add(this.beacon);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffc53a, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 24), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.1;
    this.ring.visible = false;
    scene.add(this.ring);

    // Start marker at Vera's Garage (cyan) for the next mission.
    const startMat = new THREE.MeshBasicMaterial({
      color: 0x3ae0c8, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide,
    });
    this.startBeacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), startMat);
    this.startBeacon.position.set(LANDMARKS.veraGarage.x, 30, LANDMARKS.veraGarage.z);
    this.startBeacon.visible = false;
    scene.add(this.startBeacon);
  }

  get def() {
    return MISSIONS[this.current];
  }

  get objective() {
    if (this.active) {
      const step = this.active.def.steps[this.active.step];
      if (step.x !== undefined) {
        return { x: step.x, z: step.z, label: step.label || '', text: this.stepText(step) };
      }
      return { x: null, z: null, label: '', text: this.stepText(step) };
    }
    if (!this.finished && this.current < MISSIONS.length) {
      return {
        x: LANDMARKS.veraGarage.x,
        z: LANDMARKS.veraGarage.z,
        label: "Vera's Garage",
        text: `Next mission: ${MISSIONS[this.current].title} — drive to Vera's Garage`,
      };
    }
    return { x: null, z: null, label: '', text: 'Story complete — Solmara is yours. Free roam!' };
  }

  stepText(step) {
    if (step.type === 'timedGoto' && this.active) {
      return `${step.text} — ${Math.max(0, Math.ceil(this.active.timer))}s left`;
    }
    if (step.type === 'eliminate' && this.active) {
      const left = step.count - this.active.kills;
      return `Deal with the Dockside crew (${step.count - left}/${step.count})`;
    }
    if (step.type === 'hold' && this.active) {
      const pct = Math.min(100, Math.round((this.active.holdTimer / step.seconds) * 100));
      return `${step.text} — ${pct}%`;
    }
    return step.text;
  }

  startMission(G, index) {
    const def = MISSIONS[index];
    this.active = { def, step: 0, timer: 0, holdTimer: 0, kills: 0 };
    this.current = index;
    if (def.onStart) def.onStart(G);
    this.enterStep(G);
    G.hud.showBriefing(def.title, def.brief, MISSION_REWARDS[index]);
    G.audio.pickup();
  }

  enterStep(G) {
    const step = this.active.def.steps[this.active.step];
    this.active.timer = step.seconds || 0;
    this.active.holdTimer = 0;
    if (step.type === 'eliminate') {
      G.combat.spawnRivals(step.count, step.x, step.z);
      this.active.kills = 0;
    }
    const onStep = this.active.def.onStep;
    if (onStep) onStep(G, this.active.step);
    this.updateBeacon();
  }

  updateBeacon() {
    const obj = this.objective;
    if (this.active && obj.x !== null) {
      this.beacon.visible = true;
      this.ring.visible = true;
      this.beacon.position.set(obj.x, 30, obj.z);
      this.ring.position.set(obj.x, 0.1, obj.z);
    } else {
      this.beacon.visible = false;
      this.ring.visible = false;
    }
    this.startBeacon.visible = !this.active && !this.finished && this.current < MISSIONS.length;
  }

  advanceStep(G) {
    this.active.step += 1;
    if (this.active.step >= this.active.def.steps.length) {
      this.completeMission(G);
      return;
    }
    G.audio.pickup();
    this.enterStep(G);
  }

  completeMission(G) {
    const reward = MISSION_REWARDS[this.current];
    G.player.addCash(reward);
    G.audio.missionComplete();
    G.hud.showMessage(`Mission complete — +$${reward}`);
    this.active = null;
    this.current += 1;
    if (this.current >= MISSIONS.length) {
      this.finished = true;
      G.hud.showMessage('STORY COMPLETE — You own Solmara now.');
    } else {
      G.hud.showMessage(`Next mission: ${MISSIONS[this.current].title} — see Vera at her garage`);
    }
    this.updateBeacon();
    G.save();
  }

  failMission(G, reason) {
    G.audio.missionFail();
    G.hud.showMessage(`Mission failed — ${reason} Return to Vera's Garage to retry.`);
    G.combat.clearRivals();
    this.active = null;
    this.updateBeacon();
  }

  update(dt, G) {
    const p = G.player.pos;
    if (!this.active) {
      // Drive into the garage marker to start the next mission.
      if (!this.finished && this.current < MISSIONS.length) {
        const d = Math.hypot(p.x - LANDMARKS.veraGarage.x, p.z - LANDMARKS.veraGarage.z);
        if (d < 10) this.startMission(G, this.current);
      }
      return;
    }
    const step = this.active.def.steps[this.active.step];
    const d = step.x !== undefined
      ? Math.hypot(p.x - step.x, p.z - step.z)
      : Infinity;

    switch (step.type) {
      case 'anyCar':
        if (G.player.isDriving()) this.advanceStep(G);
        break;
      case 'goto':
      case 'gotoInCar':
        if (d < step.radius && (step.type !== 'gotoInCar' || G.player.isDriving())) {
          this.advanceStep(G);
        }
        break;
      case 'timedGoto':
        this.active.timer -= dt;
        if (d < step.radius) this.advanceStep(G);
        else if (this.active.timer <= 0) this.failMission(G, 'Out of time.');
        break;
      case 'loseWanted':
        if (G.police.wanted === 0) this.advanceStep(G);
        break;
      case 'eliminate':
        if (this.active.kills >= step.count) this.advanceStep(G);
        break;
      case 'hold':
        if (d < step.radius) {
          this.active.holdTimer += dt;
          if (this.active.holdTimer >= step.seconds) this.advanceStep(G);
        } else {
          this.active.holdTimer = Math.max(0, this.active.holdTimer - dt * 2);
        }
        break;
      default:
        break;
    }
    // Beacon pulse.
    if (this.beacon.visible) {
      const s = 1 + Math.sin(G.time * 3) * 0.12;
      this.ring.scale.set(s, s, 1);
    }
  }

  // Called by combat when a rival goes down.
  onRivalDown() {
    if (this.active) this.active.kills += 1;
  }
}
