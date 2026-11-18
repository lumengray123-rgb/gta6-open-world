// Solmara — Streets of Solmara: the entrypoint for make.fun's gta6-01 bounty.
// The game itself is plain static files under game/ (a three.js open-world crime
// game that plays offline in desktop Chrome from game/index.html). This program
// hands it in: it copies game/ and screenshots/ from beside this file into the
// output directory and writes /output/dossier.json with the kit's vendored
// dossier library, so the judge reads the screenshots and the source outline.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader the output directory is /output and MAKEFUN_OUTPUT_DIR is unset.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The gate's own caps, as the kit's reference/gate.json states them: the dossier
// text is capped at 160 KiB; at most 4 screenshots of at most 256 KiB each;
// game/ holds at most 993 files and directories and 48 MiB in all, and no path
// under it is longer than 1000 bytes.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
