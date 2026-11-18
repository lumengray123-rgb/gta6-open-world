// Save and load through localStorage: cash, health, mission progress and
// the player's position. Saves happen on mission completion and on pause;
// loading drops the player back on foot at their saved spot, heat cleared.

import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return !!window.localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function saveGame(G) {
  try {
    const p = G.player;
    const pos = p.group.position;
    const data = {
      version: 1,
      cash: p.cash,
      health: Math.max(20, Math.round(p.health)),
      mission: G.missions.current,
      finished: G.missions.finished,
      x: Math.round(pos.x * 10) / 10,
      z: Math.round(pos.z * 10) / 10,
      heading: Math.round(p.heading * 100) / 100,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}
