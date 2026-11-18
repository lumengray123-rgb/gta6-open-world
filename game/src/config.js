// Solmara — Streets of Solmara: tuning, city layout and palette in one place.
// Every system reads its numbers from here so the game stays consistent.

export const GAME_TITLE = 'SOLMARA';
export const GAME_SUBTITLE = 'Streets of Solmara';

// The city is a grid of streets. Roads run along X and along Z at these
// coordinates; blocks sit between them. One unit is one metre.
export const ROAD_COORDS = [-182, -130, -78, -26, 26, 78, 130, 182];
export const ROAD_WIDTH = 12;
export const BLOCK_SIZE = 40;
export const WORLD_HALF = 210; // playable area is [-210, 210] on both axes
export const BEACH_Z = 196; // sand strip starts here; the ocean lies beyond

// Golden-hour sun-soaked palette.
export const PALETTE = {
  sky: 0x87b5d6,
  fog: 0xcfd8e0,
  sun: 0xffe3b3,
  asphalt: 0x3a3f46,
  asphaltLine: 0xd8d3c3,
  sidewalk: 0x9aa0a3,
  sand: 0xe8d29a,
  ocean: 0x2e7fa8,
  grass: 0x6fae5f,
  building: [0xe8dcc8, 0xd9c4a5, 0xc9b8a3, 0xb8c4c9, 0xd8b8a3, 0xa8b8a8, 0xe0cfa8],
  roof: [0x8a5a3b, 0x6b7a8a, 0x9a8a7a, 0x7a6a5a],
  neon: [0xff5a7a, 0x3ae0c8, 0xffc53a, 0x7a6cff],
};

// Player tuning.
export const PLAYER = {
  walkSpeed: 6.0,
  sprintSpeed: 10.5,
  radius: 0.7,
  height: 1.8,
  maxHealth: 100,
  // Health trickles back after a few quiet seconds, so a brawl never ends a run.
  regenDelay: 8,
  regenRate: 4,
};

// Driving tuning (arcade, not simulation).
export const DRIVING = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 42,
  maxReverse: 12,
  drag: 0.55,
  grip: 8.5,
  turnRate: 1.9,
  handbrakeGrip: 2.2,
  enterRange: 4.5,
};

// Wanted levels: how many police cars hunt the player at each star count.
export const WANTED = {
  maxStars: 5,
  decayDelay: 10, // seconds unseen before stars start to fall
  decayEvery: 8, // seconds per star lost while unseen
  copsPerStar: [0, 1, 2, 3, 4, 5],
  copSpeed: [0, 26, 28, 31, 34, 37],
  resprayCost: 150,
};

// Cash rewards per mission, in story order.
export const MISSION_REWARDS = [200, 400, 500, 700, 900, 1500];

// Landmarks the missions and the minimap share (x, z, label).
export const LANDMARKS = {
  veraGarage: { x: -78, z: -78, label: "Vera's Garage" },
  respray: { x: 78, z: 26, label: 'Tint & Trim' },
  hospital: { x: -26, z: 130, label: 'Solmara General' },
  casino: { x: 130, z: -130, label: 'The Gilded Palm' },
  docks: { x: 182, z: 182, label: 'Solmara Docks' },
  pier: { x: -182, z: 182, label: 'Sunset Pier' },
  safehouse: { x: -130, z: 26, label: 'Safehouse' },
  plaza: { x: 26, z: -26, label: 'Plaza del Sol' },
};

// Screenshot scenes (?shot=cover|street|mission|combat). The cover is the
// first screenshot by name, so it stages the chase: car, police, wanted stars,
// mission objective and minimap all in one frame.
export const SHOTS = ['cover', 'street', 'mission', 'combat'];

export const SAVE_KEY = 'solmara-save-v1';
