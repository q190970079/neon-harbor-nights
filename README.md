# neon-harbor-nights

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/q190970079/neon-harbor-nights/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/q190970079/neon-harbor-nights/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon Harbor Nights is an original open-world crime game that runs entirely in the browser: explore the sunset city of Verde Bay on foot or behind the wheel, steal cars, outrun a five-star police response, fight, and work a five-job story campaign for fixer Sana — all rendered in 3D with three.js and scored by a live HUD with a minimap. No downloads and no network at runtime; every asset ships inside `game/`.

## Run it

```sh
node serve.ts
```

then open http://localhost:8080 in a desktop browser to play. To produce the competition bundle instead, run:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

which copies `game/` and `screenshots/` into `out/` and writes `out/dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=k2f0jehz&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
