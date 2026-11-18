// The city of Solmara: a seeded grid of streets, blocks, buildings, palms,
// streetlights, beach and ocean, plus the landmark structures the missions
// use. Also owns the collision boxes and the road helpers other systems need.

import { ROAD_COORDS, ROAD_WIDTH, BLOCK_SIZE, WORLD_HALF, BEACH_Z, PALETTE, LANDMARKS } from './config.js';
import { mulberry32, range, intRange, pick, chance } from './random.js';

// Block centers sit between adjacent road coordinates.
const BLOCK_CENTERS = [];
for (let i = 0; i < ROAD_COORDS.length - 1; i += 1) {
  BLOCK_CENTERS.push((ROAD_COORDS[i] + ROAD_COORDS[i + 1]) / 2);
}

// Which block each landmark building occupies (block-center coords).
const LANDMARK_BLOCKS = {
  veraGarage: { bx: -52, bz: -52, kind: 'garage' },
  respray: { bx: 52, bz: 0, kind: 'respray' },
  hospital: { bx: 0, bz: 104, kind: 'hospital' },
  casino: { bx: 104, bz: -104, kind: 'casino' },
  docks: { bx: 156, bz: 156, kind: 'docks' },
  safehouse: { bx: -104, bz: 0, kind: 'safehouse' },
  plaza: { bx: 0, bz: 0, kind: 'plaza' },
};

function makeWindowTexture(rng, floors) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f2ede2';
  g.fillRect(0, 0, 128, 256);
  const cols = 4;
  const rows = floors;
  const ww = 128 / cols;
  const wh = 256 / rows;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const lit = rng() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : '#3d4a55';
      g.fillRect(x * ww + 5, y * wh + 6, ww - 10, wh - 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = fg;
  g.font = 'bold 44px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const rng = mulberry32(1337);
  const colliders = [];
  const addCollider = (x, z, w, d, h = 40) => {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
  };

  // --- ground, roads, sidewalks ----------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 80, WORLD_HALF * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x7d8f74 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 20;
  scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const roadLen = WORLD_HALF * 2;
  for (const c of ROAD_COORDS) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, roadLen), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.02, 0);
    scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, ROAD_WIDTH), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.03, c);
    scene.add(h);
  }

  // Sidewalk slabs, one per block, instanced.
  const slabGeo = new THREE.PlaneGeometry(BLOCK_SIZE + 4, BLOCK_SIZE + 4);
  const slabMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const slabs = new THREE.InstancedMesh(slabGeo, slabMat, BLOCK_CENTERS.length ** 2);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    let i = 0;
    for (const bx of BLOCK_CENTERS) {
      for (const bz of BLOCK_CENTERS) {
        m.compose(new THREE.Vector3(bx, 0.015, bz), q, new THREE.Vector3(1, 1, 1));
        slabs.setMatrixAt(i, m);
        i += 1;
      }
    }
  }
  scene.add(slabs);

  // Dashed centre lines, instanced.
  const dashGeo = new THREE.PlaneGeometry(0.5, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: PALETTE.asphaltLine });
  const dashPositions = [];
  for (const c of ROAD_COORDS) {
    for (let t = -WORLD_HALF + 6; t < WORLD_HALF; t += 12) {
      dashPositions.push([c, t, 0]);
      dashPositions.push([t, c, Math.PI / 2]);
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashPositions.length);
  {
    const m = new THREE.Matrix4();
    dashPositions.forEach(([x, z, rot], i) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rot));
      m.compose(new THREE.Vector3(x, 0.045, z), q, new THREE.Vector3(1, 1, 1));
      dashes.setMatrixAt(i, m);
    });
  }
  scene.add(dashes);

  // --- beach and ocean ----------------------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 40, 26),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, BEACH_Z + 12);
  scene.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 260),
    new THREE.MeshLambertMaterial({ color: PALETTE.ocean }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.005, BEACH_Z + 140);
  scene.add(ocean);
  const ocean2 = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 260),
    new THREE.MeshLambertMaterial({ color: 0x3a9ac2, transparent: true, opacity: 0.5 }),
  );
  ocean2.rotation.x = -Math.PI / 2;
  ocean2.position.set(0, 0.02, BEACH_Z + 150);
  scene.add(ocean2);

  // --- buildings ----------------------------------------------------------
  const windowTex = [makeWindowTexture(rng, 3), makeWindowTexture(rng, 6), makeWindowTexture(rng, 10)];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const landmarkAt = new Map();
  for (const [key, lb] of Object.entries(LANDMARK_BLOCKS)) landmarkAt.set(`${lb.bx},${lb.bz}`, { key, ...lb });

  // Facade materials: one per colour × window-density band, so tall towers
  // get dense windows and low blocks get few — no stretched giant windows.
  const facadeMats = PALETTE.building.map(
    (c) => windowTex.map((t) => new THREE.MeshLambertMaterial({ color: c, map: t })),
  );
  const roofMats = PALETTE.roof.map((c) => new THREE.MeshLambertMaterial({ color: c }));

  function addBuilding(x, z, w, h, d, opts = {}) {
    const band = h < 12 ? 0 : h < 22 ? 1 : 2;
    const side = opts.material || pick(rng, facadeMats)[band];
    // One material for the whole box (a 6-material box costs 6 draw calls);
    // the roof gets its own thin slab instead.
    const mesh = new THREE.Mesh(boxGeo, side);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
    const roof = pick(rng, roofMats);
    const slab = new THREE.Mesh(boxGeo, roof);
    slab.scale.set(w + 0.3, 0.35, d + 0.3);
    slab.position.set(x, h + 0.1, z);
    scene.add(slab);
    addCollider(x, z, w, d, h);
    if (!opts.noRoofProp && chance(rng, 0.5)) {
      const ac = new THREE.Mesh(boxGeo, roof);
      const s = range(rng, 1.5, 3);
      ac.scale.set(s, 1, s);
      ac.position.set(x + range(rng, -w / 4, w / 4), h + 0.5, z + range(rng, -d / 4, d / 4));
      scene.add(ac);
    }
    return mesh;
  }

  function addSign(x, y, z, text, bg, fg, w = 16) {
    const tex = makeSignTexture(text, bg, fg);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * 0.1875),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    sign.position.set(x, y, z);
    scene.add(sign);
    return sign;
  }

  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const lm = landmarkAt.get(`${bx},${bz}`);
      if (lm) {
        if (lm.kind === 'plaza') {
          // Fountain plaza: circular basin, water disc, centre column.
          const basin = new THREE.Mesh(
            new THREE.CylinderGeometry(9, 9, 1, 20),
            new THREE.MeshLambertMaterial({ color: 0xb8b0a0 }),
          );
          basin.position.set(bx, 0.5, bz);
          scene.add(basin);
          const water = new THREE.Mesh(
            new THREE.CylinderGeometry(8.2, 8.2, 0.4, 20),
            new THREE.MeshLambertMaterial({ color: PALETTE.ocean }),
          );
          water.position.set(bx, 0.9, bz);
          scene.add(water);
          const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 1.2, 5, 8),
            new THREE.MeshLambertMaterial({ color: 0xd8d0c0 }),
          );
          col.position.set(bx, 3, bz);
          scene.add(col);
          addCollider(bx, bz, 16, 16, 1);
          continue;
        }
        if (lm.kind === 'docks') {
          // Shipping containers and two cranes.
          const contCols = [0xc8553d, 0x3d7ac8, 0x4a9a5a, 0xd8a83a];
          for (let i = 0; i < 10; i += 1) {
            const cx = bx - 14 + (i % 5) * 7;
            const cz = bz - 10 + Math.floor(i / 5) * 8;
            const cont = new THREE.Mesh(
              boxGeo,
              new THREE.MeshLambertMaterial({ color: contCols[i % contCols.length] }),
            );
            cont.scale.set(6, 2.6, 2.6);
            cont.position.set(cx, 1.3, cz);
            scene.add(cont);
            addCollider(cx, cz, 6, 2.6, 2.6);
          }
          for (const off of [-12, 12]) {
            const leg = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xd8a83a }));
            leg.scale.set(1.5, 22, 1.5);
            leg.position.set(bx + off, 11, bz + 14);
            scene.add(leg);
            const arm = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xd8a83a }));
            arm.scale.set(20, 1.2, 1.2);
            arm.position.set(bx + off, 21.5, bz + 8);
            scene.add(arm);
            addCollider(bx + off, bz + 14, 2, 2, 22);
          }
          addSign(bx, 8, bz - 18, 'SOLMARA DOCKS', '#1c2a3a', '#ffd98a', 20);
          continue;
        }
        if (lm.kind === 'casino') {
          addBuilding(bx, bz, 30, 18, 26, { noRoofProp: true });
          const neon = new THREE.Mesh(
            boxGeo,
            new THREE.MeshBasicMaterial({ color: 0xff5a7a }),
          );
          neon.scale.set(24, 1.2, 0.6);
          neon.position.set(bx, 15, bz - 13.4);
          scene.add(neon);
          addSign(bx, 11.5, bz - 13.4, 'THE GILDED PALM', '#2a1a2e', '#ffc53a', 22);
          continue;
        }
        if (lm.kind === 'hospital') {
          addBuilding(bx, bz, 26, 14, 22, {
            material: new THREE.MeshLambertMaterial({ color: 0xf0f0ee, map: windowTex[1] }),
            noRoofProp: true,
          });
          const cross1 = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xe03a3a }));
          cross1.scale.set(5, 1.6, 0.5);
          cross1.position.set(bx, 12, bz - 11.4);
          scene.add(cross1);
          const cross2 = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xe03a3a }));
          cross2.scale.set(1.6, 5, 0.5);
          cross2.position.set(bx, 12, bz - 11.4);
          scene.add(cross2);
          addSign(bx, 8.5, bz - 11.4, 'SOLMARA GENERAL', '#f0f0ee', '#204060', 20);
          continue;
        }
        if (lm.kind === 'garage') {
          addBuilding(bx, bz, 24, 7, 18, { noRoofProp: true });
          addSign(bx, 5.4, bz - 9.4, "VERA'S GARAGE", '#20303a', '#7ae0c8', 18);
          continue;
        }
        if (lm.kind === 'respray') {
          addBuilding(bx, bz, 22, 6, 16, { noRoofProp: true });
          addSign(bx, 4.6, bz - 8.4, 'TINT & TRIM', '#3a2030', '#ff9ac8', 16);
          continue;
        }
        if (lm.kind === 'safehouse') {
          addBuilding(bx, bz, 16, 9, 14, { noRoofProp: true });
          addSign(bx, 6.5, bz - 7.4, 'SAFEHOUSE', '#2a3a20', '#d8e8a8', 12);
          continue;
        }
      }
      // Ordinary block: one or two buildings.
      const distC = Math.hypot(bx, bz);
      const tallBias = Math.max(0, 1 - distC / 260);
      const count = chance(rng, 0.45) ? 2 : 1;
      if (count === 1) {
        const w = range(rng, 18, 30);
        const d = range(rng, 18, 30);
        const h = range(rng, 8, 14) + tallBias * range(rng, 0, 20);
        addBuilding(bx + range(rng, -3, 3), bz + range(rng, -3, 3), w, h, d);
      } else {
        const w1 = range(rng, 12, 17);
        const w2 = range(rng, 12, 17);
        const h1 = range(rng, 7, 12) + tallBias * range(rng, 0, 16);
        const h2 = range(rng, 7, 12) + tallBias * range(rng, 0, 16);
        addBuilding(bx - 9, bz, w1, h1, range(rng, 16, 26));
        addBuilding(bx + 9, bz, w2, h2, range(rng, 16, 26));
      }
    }
  }

  // --- Sunset Pier: planks out into the ocean at x = -182 ----------------
  {
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    for (let z = BEACH_Z + 2; z < BEACH_Z + 52; z += 4) {
      const plank = new THREE.Mesh(boxGeo, pierMat);
      plank.scale.set(8, 0.4, 4);
      plank.position.set(LANDMARKS.pier.x, 0.8, z);
      scene.add(plank);
    }
    for (let z = BEACH_Z + 4; z < BEACH_Z + 52; z += 8) {
      for (const dx of [-3.6, 3.6]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.25, 2.4, 6),
          pierMat,
        );
        post.position.set(LANDMARKS.pier.x + dx, 0, z);
        scene.add(post);
      }
    }
    addSign(LANDMARKS.pier.x, 4, BEACH_Z + 6, 'SUNSET PIER', '#20303a', '#ffd98a', 14);
  }

  // --- streetlights (instanced) ------------------------------------------
  {
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 6.5, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a4048 });
    const headGeo = new THREE.BoxGeometry(1.6, 0.18, 0.4);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    const spots = [];
    for (const c of ROAD_COORDS) {
      for (let t = -WORLD_HALF + 14; t < WORLD_HALF; t += 26) {
        spots.push([c + 7.2, t, 0]);
        spots.push([t, c + 7.2, Math.PI / 2]);
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z, rot], i) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0));
      m.compose(new THREE.Vector3(x, 3.25, z), q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 6.5, z), q, new THREE.Vector3(1, 1, 1));
      heads.setMatrixAt(i, m);
    });
    scene.add(poles);
    scene.add(heads);
  }

  // --- palms (instanced trunks + crowns) ----------------------------------
  {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 5.5, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    const crownGeo = new THREE.ConeGeometry(2.6, 2.2, 7);
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f8a4a });
    const spots = [];
    for (let x = -200; x <= 200; x += 13) {
      if (chance(rng, 0.7)) spots.push([x + range(rng, -3, 3), BEACH_Z + range(rng, 2, 10)]);
    }
    for (let i = 0; i < 40; i += 1) {
      const bx = pick(rng, BLOCK_CENTERS);
      const bz = pick(rng, BLOCK_CENTERS);
      spots.push([bx + range(rng, -19, 19), bz + range(rng, -19, 19)]);
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      const tilt = range(rng, -0.12, 0.12);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, rng() * Math.PI, tilt));
      m.compose(new THREE.Vector3(x, 2.75, z), q, new THREE.Vector3(1, 1, 1));
      trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 6.2, z), q, new THREE.Vector3(1, 1, 1));
      crowns.setMatrixAt(i, m);
    });
    scene.add(trunks);
    scene.add(crowns);
  }

  // --- helpers ------------------------------------------------------------
  function isOnRoad(x, z) {
    const half = ROAD_WIDTH / 2 + 1;
    return ROAD_COORDS.some((c) => Math.abs(x - c) < half || Math.abs(z - c) < half);
  }

  function nearestRoadCoord(v) {
    let best = ROAD_COORDS[0];
    let bd = Infinity;
    for (const c of ROAD_COORDS) {
      const d = Math.abs(v - c);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // Push a circle (pos {x, z}, radius) out of every building collider and
  // keep it inside the playable area. Mutates pos.
  function resolveCircle(pos, radius) {
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          // Centre inside the box: push out along the smallest overlap.
          const pushL = pos.x - c.minX + radius;
          const pushR = c.maxX - pos.x + radius;
          const pushU = pos.z - c.minZ + radius;
          const pushD = c.maxZ - pos.z + radius;
          const min = Math.min(pushL, pushR, pushU, pushD);
          if (min === pushL) pos.x = c.minX - radius;
          else if (min === pushR) pos.x = c.maxX + radius;
          else if (min === pushU) pos.z = c.minZ - radius;
          else pos.z = c.maxZ + radius;
        }
      }
    }
    const lim = WORLD_HALF - radius;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
  }

  return { colliders, isOnRoad, nearestRoadCoord, resolveCircle };
}
