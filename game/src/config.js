// Neon Harbor Nights — config.js
// World constants, shared utilities and tuning for the Verde Bay city.
// Everything in the game hangs off the single global NHN namespace.
window.NHN = window.NHN || {};

NHN.CONFIG = {
  // City grid: avenues and streets sit on a pitch; blocks live between them.
  pitch: 46,               // distance between neighbouring road centrelines
  roadHalf: 6,             // half-width of a road (asphalt)
  walkHalf: 8.6,           // half-width including sidewalks
  gridLines: [-138, -92, -46, 0, 46, 92, 138], // avenue x / street z centrelines
  boardwalkZ: 164,         // extra east-west road along the beach
  beachZ: 178,             // sand starts here
  waterZ: 196,             // ocean surface starts here
  cityEdge: 158,           // buildings stay inside +/- this

  // Landmarks (world coordinates).
  marina:     { x: 92,  z: 176 },  // Sana's spot, start of the pier
  pierEnd:    { x: 92,  z: 226 },  // getaway point on the pier
  hospital:   { x: -115, z: -115 },// respawn after FLATLINED (block centre)
  lockup:     { x: -115, z: 69 },  // delivery garage for stolen cars
  policeStn:  { x: 115, z: -115 }, // respawn after BUSTED
  startSpawn: { x: 40,  z: 150 },  // where Milo begins, near the boardwalk

  // Player tuning.
  walkSpeed: 5.2,
  sprintSpeed: 8.6,
  playerRadius: 0.55,
  maxHealth: 100,

  // Pistol.
  pistol: { mag: 12, reserveStart: 48, damage: 34, range: 70, cooldown: 0.22 },

  // Wanted / police tuning.
  wantedDecayDelay: 11,    // seconds unseen before a star can fade
  wantedDecayStep: 9,      // seconds per star while hidden
  bustTime: 3.0,           // seconds boxed-in and slow before a bust

  // Palette — sunset over Verde Bay.
  sky: 0x2c1e4f,
  fog: 0x51386b,
  sun: 0xffb36b,
  hemiSky: 0x8a6bbf,
  hemiGround: 0x3a2b3f,
  asphalt: 0x33323e,
  sidewalk: 0x6f6a72,
  sand: 0xd9b078,
  water: 0x1d5f74,

  carPaints: [0xc23b2e, 0x2e6fc2, 0xe8a13a, 0x3fae6a, 0xd8d8de, 0x7042a8,
              0x22242c, 0xe2609a, 0x39b8c4, 0x8a8f3a, 0xb0b6bd, 0x7a2d20],
  shirtColors: [0xd95f43, 0x4a90d9, 0xf2c14e, 0x7bc47f, 0xd9d9d9, 0x9b59b6,
                0xe67e22, 0x1abc9c, 0xec87bf, 0x95a5a6],
  pantsColors: [0x2c3e50, 0x555f6e, 0x6e4a2f, 0x222222, 0x7f8c8d, 0x34495e],
  skinColors: [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4423]
};

// Vehicle catalogue. Speeds in m/s, acceleration in m/s^2.
NHN.CAR_TYPES = {
  sedan:   { name: 'Marlin Sedan',  topSpeed: 27, accel: 13, grip: 2.6, len: 4.4, wid: 1.9, cabin: 0.62 },
  kestrel: { name: 'Kestrel GT',    topSpeed: 40, accel: 21, grip: 3.2, len: 4.3, wid: 1.9, cabin: 0.45 },
  van:     { name: 'Harbor Van',    topSpeed: 24, accel: 11, grip: 2.2, len: 5.2, wid: 2.1, cabin: 0.95 },
  taxi:    { name: 'SunCab Taxi',   topSpeed: 26, accel: 13, grip: 2.6, len: 4.4, wid: 1.9, cabin: 0.62 },
  pickup:  { name: 'Dune Runner',   topSpeed: 25, accel: 12, grip: 2.4, len: 4.8, wid: 2.0, cabin: 0.7 },
  police:  { name: 'VBPD Interceptor', topSpeed: 36, accel: 19, grip: 3.1, len: 4.5, wid: 1.9, cabin: 0.6 }
};

// Small shared helpers.
NHN.u = {
  clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp: function (a, b, t) { return a + (b - a) * t; },
  dist2: function (ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; },
  dist: function (ax, az, bx, bz) { return Math.sqrt(NHN.u.dist2(ax, az, bx, bz)); },
  // Shortest-path angle interpolation.
  angleLerp: function (a, b, t) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  },
  // Deterministic RNG (mulberry32) so shot scenes compose identically.
  rng: function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  pick: function (rand, arr) { return arr[Math.floor(rand() * arr.length) % arr.length]; }
};
