// Everything on top of the 3D view: health, cash, wanted stars, speed, the
// objective line, the 2D minimap, toasts, and the start / pause / briefing /
// busted / wasted screens. The DOM lives in index.html; this class drives it.

import { ROAD_COORDS, WORLD_HALF, LANDMARKS } from './config.js';

const MM_SIZE = 200;
const MM_SCALE = MM_SIZE / (WORLD_HALF * 2 + 24);

function mm(x, z) {
  return [
    MM_SIZE / 2 + x * MM_SCALE,
    MM_SIZE / 2 + z * MM_SCALE,
  ];
}

export class Hud {
  constructor(callbacks) {
    this.cb = callbacks;
    this.el = {};
    for (const id of [
      'hud', 'health-fill', 'health-text', 'cash', 'stars', 'speed', 'speed-box',
      'objective', 'objective-label', 'message', 'crosshair', 'hint',
      'damage-flash', 'minimap', 'start-screen', 'pause-menu', 'briefing',
      'briefing-title', 'briefing-text', 'briefing-reward', 'busted-screen',
      'wasted-screen', 'continue-btn', 'begin-btn', 'resume-btn', 'restart-btn',
      'briefing-btn', 'busted-btn', 'wasted-btn', 'save-note',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.mmCtx = this.el.minimap.getContext('2d');
    this.messageTimer = 0;
    this.minimapTimer = 0;

    this.el['begin-btn'].addEventListener('click', () => this.cb.onBegin(false));
    this.el['continue-btn'].addEventListener('click', () => this.cb.onBegin(true));
    this.el['resume-btn'].addEventListener('click', () => this.cb.onResume());
    this.el['restart-btn'].addEventListener('click', () => this.cb.onRestart());
    this.el['briefing-btn'].addEventListener('click', () => this.cb.onBriefingDone());
    this.el['busted-btn'].addEventListener('click', () => this.cb.onRespawn('busted'));
    this.el['wasted-btn'].addEventListener('click', () => this.cb.onRespawn('wasted'));
  }

  showStart(hasSave) {
    this.el['start-screen'].style.display = 'flex';
    this.el.hud.style.display = 'none';
    this.el['continue-btn'].style.display = hasSave ? 'inline-block' : 'none';
    this.el['save-note'].textContent = hasSave
      ? 'Saved game found — pick up where you left off.'
      : 'No save yet — a new story begins in Solmara.';
  }

  showHud() {
    this.el['start-screen'].style.display = 'none';
    this.el['pause-menu'].style.display = 'none';
    this.el.briefing.style.display = 'none';
    this.el['busted-screen'].style.display = 'none';
    this.el['wasted-screen'].style.display = 'none';
    this.el.hud.style.display = 'block';
  }

  showPause() {
    this.el['pause-menu'].style.display = 'flex';
  }

  hidePause() {
    this.el['pause-menu'].style.display = 'none';
  }

  showBriefing(title, brief, reward) {
    this.el['briefing-title'].textContent = title;
    this.el['briefing-text'].textContent = brief;
    this.el['briefing-reward'].textContent = `Reward: $${reward}`;
    this.el.briefing.style.display = 'flex';
  }

  hideBriefing() {
    this.el.briefing.style.display = 'none';
  }

  showBusted() {
    this.el['busted-screen'].style.display = 'flex';
  }

  showWasted() {
    this.el['wasted-screen'].style.display = 'flex';
  }

  hideEndScreens() {
    this.el['busted-screen'].style.display = 'none';
    this.el['wasted-screen'].style.display = 'none';
  }

  showMessage(text, seconds = 4) {
    this.el.message.textContent = text;
    this.el.message.style.opacity = '1';
    this.messageTimer = seconds;
  }

  flashDamage() {
    const f = this.el['damage-flash'];
    f.style.opacity = '0.55';
    setTimeout(() => { f.style.opacity = '0'; }, 180);
  }

  setHint(text) {
    this.el.hint.textContent = text || '';
    this.el.hint.style.display = text ? 'block' : 'none';
  }

  update(dt, G) {
    const player = G.player;
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.el.message.style.opacity = '0';
    }
    this.el['health-fill'].style.width = `${Math.max(0, player.health)}%`;
    this.el['health-text'].textContent = `${Math.ceil(player.health)} HP`;
    this.el.cash.textContent = `$${player.cash}`;
    const stars = '★'.repeat(G.police.wanted) + '☆'.repeat(5 - G.police.wanted);
    this.el.stars.textContent = stars;
    this.el.stars.style.color = G.police.wanted > 0 ? '#ffdd33' : '#888888';
    if (player.isDriving()) {
      const kmh = Math.round(Math.abs(player.car.speed) * 3.6);
      this.el['speed-box'].style.display = 'block';
      this.el.speed.textContent = `${kmh} km/h`;
    } else {
      this.el['speed-box'].style.display = 'none';
    }
    const obj = G.missions.objective;
    this.el['objective-label'].textContent = G.missions.active
      ? G.missions.active.def.title
      : (G.missions.finished ? 'Free Roam' : 'Next Mission');
    this.el.objective.textContent = obj.text;
    this.el.crosshair.style.display = (!player.isDriving() && G.state === 'playing') ? 'block' : 'none';

    // Context hint: car nearby on foot, respray while wanted.
    if (!player.isDriving() && G.state === 'playing') {
      const near = G.nearestCarToPlayer && G.nearestCarToPlayer();
      this.setHint(near ? 'Press E to get in the car' : '');
    } else if (player.isDriving() && G.police.wanted > 0) {
      const d = Math.hypot(player.pos.x - LANDMARKS.respray.x, player.pos.z - LANDMARKS.respray.z);
      this.setHint(d < 14 ? 'Tint & Trim — wanted level cleared!' : '');
    } else {
      this.setHint('');
    }

    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.12;
      this.drawMinimap(G);
    }
  }

  drawMinimap(G) {
    const ctx = this.mmCtx;
    const S = MM_SIZE;
    ctx.fillStyle = '#10181f';
    ctx.fillRect(0, 0, S, S);
    // Ocean + beach at the south edge.
    ctx.fillStyle = '#1d5a78';
    ctx.fillRect(0, mm(0, 196)[1], S, S - mm(0, 196)[1]);
    ctx.fillStyle = '#c9b078';
    ctx.fillRect(0, mm(0, 196)[1] - 3, S, 3);
    // Blocks.
    ctx.fillStyle = '#2c353d';
    for (let i = 0; i < ROAD_COORDS.length - 1; i += 1) {
      for (let j = 0; j < ROAD_COORDS.length - 1; j += 1) {
        const [x1, z1] = mm(ROAD_COORDS[i] + 6, ROAD_COORDS[j] + 6);
        const [x2, z2] = mm(ROAD_COORDS[i + 1] - 6, ROAD_COORDS[j + 1] - 6);
        ctx.fillRect(x1, z1, x2 - x1, z2 - z1);
      }
    }
    // Roads.
    ctx.strokeStyle = '#5a646c';
    ctx.lineWidth = 5;
    for (const c of ROAD_COORDS) {
      const [x] = mm(c, 0);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, S);
      ctx.stroke();
      const [, z] = mm(0, c);
      ctx.beginPath();
      ctx.moveTo(0, z);
      ctx.lineTo(S, z);
      ctx.stroke();
    }
    // Landmarks.
    ctx.fillStyle = '#8a94a0';
    ctx.font = '7px Arial';
    for (const lm of Object.values(LANDMARKS)) {
      const [x, z] = mm(lm.x, lm.z);
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // Objective marker (pulsing gold diamond).
    const obj = G.missions.objective;
    if (obj.x !== null) {
      const [x, z] = mm(obj.x, obj.z);
      const r = 5 + Math.sin(G.time * 4) * 1.5;
      ctx.fillStyle = G.missions.active ? '#ffc53a' : '#3ae0c8';
      ctx.beginPath();
      ctx.moveTo(x, z - r);
      ctx.lineTo(x + r, z);
      ctx.lineTo(x, z + r);
      ctx.lineTo(x - r, z);
      ctx.closePath();
      ctx.fill();
    }
    // Cops (flashing red/blue) and rivals (red).
    const copColor = Math.floor(G.time * 4) % 2 === 0 ? '#ff4444' : '#4488ff';
    ctx.fillStyle = copColor;
    for (const c of G.police.cops) {
      const [x, z] = mm(c.group.position.x, c.group.position.z);
      ctx.beginPath();
      ctx.arc(x, z, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff2222';
    for (const r of G.combat.rivals) {
      if (r.dead) continue;
      const [x, z] = mm(r.group.position.x, r.group.position.z);
      ctx.beginPath();
      ctx.arc(x, z, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow, rotated by heading.
    const pp = G.player.pos;
    const [px, pz] = mm(pp.x, pp.z);
    const heading = G.player.isDriving() ? G.player.car.heading : G.player.heading;
    ctx.save();
    ctx.translate(px, pz);
    // The arrow is drawn pointing up (canvas -Y); rotate so it points along
    // the world heading (sin h, cos h) in canvas (x, y) space.
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Viewport ring.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
}
