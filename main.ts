// Neon Harbor Nights — entrypoint (Node 22, standard library only).
//
// What this does, in order:
//   1. Works out where the finished bundle has to go: $MAKEFUN_OUTPUT_DIR,
//      falling back to /output when the variable is not set.
//   2. Copies the playable game (game/) and the screenshot set
//      (screenshots/) from this repository into that directory.
//   3. Asks the vendored make.fun library to summarise the copied game
//      into dossier.json, using the competition's size caps.
//   4. Prints a short receipt so a human can see what was handed in.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game is useless without its page shell, so fail loudly if the
// repository layout is not what we expect before copying anything.
const gameDir = join(repoDir, 'game');
if (!existsSync(join(gameDir, 'index.html'))) {
  console.error('[neon-harbor] ERROR: game/index.html is missing — nothing to hand in.');
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

// --- Copy the game -------------------------------------------------------
const gameOut = join(outputDir, 'game');
cpSync(gameDir, gameOut, { recursive: true });
console.log('[neon-harbor] copied game/ -> ' + gameOut);

// --- Copy the screenshots (the folder is optional in the library's eyes,
//     but this entry always ships four) -----------------------------------
const shotsDir = join(repoDir, 'screenshots');
const shotsOut = join(outputDir, 'screenshots');
mkdirSync(shotsOut, { recursive: true });
let shotCount = 0;
if (existsSync(shotsDir)) {
  cpSync(shotsDir, shotsOut, { recursive: true });
  shotCount = readdirSync(shotsOut).length;
  console.log('[neon-harbor] copied screenshots/ (' + shotCount + ' files) -> ' + shotsOut);
} else {
  console.log('[neon-harbor] WARNING: no screenshots/ folder found, continuing without it');
}

// --- Build the dossier ----------------------------------------------------
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
const dossierPath = join(outputDir, 'dossier.json');
writeFileSync(dossierPath, dossier);

// --- Receipt ---------------------------------------------------------------
function countFiles(dir: string): number {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) n += countFiles(p);
    else n += 1;
  }
  return n;
}

console.log('[neon-harbor] dossier written: ' + dossierPath +
  ' (' + statSync(dossierPath).size + ' bytes)');
console.log('[neon-harbor] bundle summary: ' + countFiles(gameOut) + ' game files, ' +
  shotCount + ' screenshots, game + dossier ready in ' + outputDir);
