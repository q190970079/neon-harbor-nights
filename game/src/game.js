// Neon Harbor Nights — game.js
// Bootstrap, input, player/driving controllers, camera, combat,
// damage, particles, save/load, menus, the main loop and the
// deterministic ?shot= scenes used for the entry screenshots.
window.NHN = window.NHN || {};

(function () {
  var C = NHN.CONFIG;
  var params = new URLSearchParams(location.search);
  var shotName = params.get('shot');
  var rand = NHN.u.rng(shotName ? 1 : (Date.now() % 90000) + 7);

  // ---------------------------------------------------------------- state
  var state = {
    mode: 'menu',           // menu | foot | drive | pause | overlay
    px: C.startSpawn.x, pz: C.startSpawn.z,
    facing: Math.PI,        // heading the player aims at (foot)
    camYaw: Math.PI,        // camera orbit yaw (foot)
    camOffset: 0,           // camera orbit offset while driving
    health: C.maxHealth, cash: 250,
    ammo: C.pistol.mag, reserve: C.pistol.reserveStart,
    driving: null, campaignDone: false,
    lastHurtT: -99, fireCd: 0, reloadT: 0, shotDangerT: 0,
    addCash: function (n) { state.cash += n; },
    save: function () {
      try {
        localStorage.setItem('nhn_save_v1', JSON.stringify({
          cash: state.cash, health: state.health,
          mission: NHN.missions.index, campaignDone: state.campaignDone,
          px: state.px, pz: state.pz
        }));
      } catch (e) {}
    },
    hurt: function (n) { hurtPlayer(n); }
  };
  NHN.state = state;
  NHN.onPedDown = function () {};
  NHN.onWantedFade = function (lvl) {
    NHN.hud.showSubtitle('Milo', lvl > 0 ? 'Nearly clear… stay out of sight.' : 'Gone. The bay forgets fast.');
  };
  NHN.onBusted = function () { busted(); };

  function loadSave() {
    try {
      var raw = localStorage.getItem('nhn_save_v1');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- three
  var renderer, scene, camera, sunLight, flashLight;
  var player = null;              // NHN.people person record
  var clock = { last: performance.now(), t: 0 };
  var frozen = false, framesRendered = 0;

  function makeSky() {
    var cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
    var g = cv.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1d1440');
    grad.addColorStop(0.45, '#51386b');
    grad.addColorStop(0.72, '#c65d7b');
    grad.addColorStop(0.9, '#ff9d5c');
    grad.addColorStop(1, '#ffb36b');
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    var sky = new THREE.Mesh(new THREE.SphereGeometry(880, 20, 14),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.BackSide, fog: false }));
    scene.add(sky);
    var sunDisc = new THREE.Mesh(new THREE.CircleGeometry(46, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }));
    sunDisc.position.set(-520, 92, -430); sunDisc.lookAt(0, 40, 0);
    scene.add(sunDisc);
    // Lazy dusk clouds.
    var cloudMat = new THREE.MeshBasicMaterial({ color: 0xffb9a0, transparent: true, opacity: 0.35, fog: false });
    for (var i = 0; i < 9; i++) {
      var cl = new THREE.Mesh(new THREE.BoxGeometry(60 + rand() * 90, 3, 16 + rand() * 14), cloudMat);
      cl.position.set((rand() - 0.5) * 900, 120 + rand() * 90, (rand() - 0.5) * 900);
      scene.add(cl);
    }
  }

  function boot() {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    document.getElementById('game').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(C.fog, 130, 460);
    camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);

    // Adaptive quality: SwiftShader/llvmpipe cannot afford shadow maps.
    var gl = renderer.getContext();
    var dbg = gl.getExtension('WEBGL_debug_renderer_info');
    var rname = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    var softwareGL = /swiftshader|llvmpipe|software/i.test(rname);
    renderer.shadowMap.enabled = !softwareGL || !!shotName;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    var hemi = new THREE.HemisphereLight(C.hemiSky, C.hemiGround, 0.85);
    scene.add(hemi);
    sunLight = new THREE.DirectionalLight(C.sun, 1.25);
    sunLight.position.set(-90, 120, -60);
    sunLight.castShadow = renderer.shadowMap.enabled;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -95; sunLight.shadow.camera.right = 95;
    sunLight.shadow.camera.top = 95; sunLight.shadow.camera.bottom = -95;
    sunLight.shadow.camera.far = 420;
    scene.add(sunLight); scene.add(sunLight.target);
    flashLight = new THREE.PointLight(0xffc873, 0, 26);
    scene.add(flashLight);

    makeSky();
    NHN.city.build(scene, rand);
    NHN.vehicles.spawnParked(scene, rand);
    NHN.vehicles.spawnTraffic(scene, 15, rand);
    NHN.people.spawnCrowd(scene, 26, rand);
    NHN.police.init(scene);
    NHN.missions.init(scene);
    initParticles();
    initPickups();

    player = NHN.people.makePerson(0x1abc9c, 0x22303c, 0xe0ac69);
    player.group.position.set(state.px, 0, state.pz);
    scene.add(player.group);

    NHN.hud.init();
    wireInput();
    wireMenus();
    if (shotName) setupShot(shotName);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- input
  var keys = {};
  var mouseDown = false;
  function wireInput() {
    addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'KeyE') onInteract();
      if (e.code === 'KeyR') startReload();
      if (e.code === 'KeyF') tryFire();
      if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
      if (['ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    });
    addEventListener('keyup', function (e) { keys[e.code] = false; });
    addEventListener('mousemove', function (e) {
      if (document.pointerLockElement === renderer.domElement) {
        if (state.mode === 'foot') state.camYaw -= e.movementX * 0.0026;
        else if (state.mode === 'drive') state.camOffset = NHN.u.clamp(state.camOffset - e.movementX * 0.003, -1.4, 1.4);
      }
    });
    addEventListener('mousedown', function (e) {
      if (e.target !== renderer.domElement) return;
      mouseDown = true;
      if ((state.mode === 'foot' || state.mode === 'drive') && !shotName) {
        renderer.domElement.requestPointerLock();
      }
      if (state.mode === 'foot') tryFire();
    });
    addEventListener('mouseup', function () { mouseDown = false; });
    addEventListener('resize', function () {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  }

  // ------------------------------------------------------------- movement
  function pierY(x, z) {
    return (z > C.waterZ - 2 && x > C.marina.x - 5 && x < C.marina.x + 5) ? 0.82 : 0;
  }

  function nearestStealable() {
    var best = null, bd = 3.6;
    var cars = NHN.vehicles.all;
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (c.isPolice || c.dead || c.mode === 'police') continue;
      var d = NHN.u.dist(state.px, state.pz, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function onInteract() {
    if (state.mode === 'drive') { exitCar(); return; }
    if (state.mode !== 'foot') return;
    var sana = NHN.missions.sana;
    if (sana && NHN.u.dist(state.px, state.pz, sana.x, sana.z) < 4.2) {
      var lines = [
        'Jobs pay at the lockup, the dash, and the pier. The bay provides.',
        'Keep the stars low and the engine warm, Milo.',
        'Every driver in Verde Bay owes somebody. You owe me results.'
      ];
      NHN.hud.showSubtitle('Sana', lines[(Math.random() * lines.length) | 0]);
      NHN.audio.sfx.click();
      return;
    }
    var car = nearestStealable();
    if (car) enterCar(car, false);
  }

  function enterCar(car, silent) {
    state.mode = 'drive';
    state.driving = car;
    car.wasTraffic = car.mode === 'traffic';
    car.mode = 'player';
    car.speed = 0;
    player.group.visible = false;
    if (!silent && !car.ownedByPlayer && !car.stolenCounted) {
      car.stolen = true; car.stolenCounted = true;
      NHN.police.addCrime(1);
      NHN.hud.showSubtitle('Milo', 'Borrowed. Permanently, if the bay behaves.');
    }
    NHN.audio.unlock();
    NHN.audio.engine.start();
    NHN.hud.setPrompt(null);
  }

  function exitCar() {
    var car = state.driving;
    if (!car) return;
    car.mode = car.wasTraffic ? 'traffic' : 'parked';
    if (car.mode === 'traffic') { car.dirX = Math.round(Math.sin(car.angle)); car.dirZ = Math.round(Math.cos(car.angle)); if (car.dirX === 0 && car.dirZ === 0) car.dirZ = 1; car.roadLine = car.dirZ !== 0 ? car.x : car.z; }
    state.driving = null;
    state.mode = 'foot';
    var side = car.angle + Math.PI / 2;
    state.px = NHN.u.clamp(car.x + Math.sin(side) * 2.4, -168, 168);
    state.pz = NHN.u.clamp(car.z + Math.cos(side) * 2.4, -168, 190);
    player.group.visible = true;
    NHN.audio.engine.stop();
  }

  function updateFoot(dt) {
    var fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    var str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    if (keys.KeyQ) state.camYaw += 1.9 * dt; // Q swings the camera; mouse does too
    var sprint = keys.ShiftLeft || keys.ShiftRight;
    var speed = sprint ? C.sprintSpeed : C.walkSpeed;
    var fx = Math.sin(state.camYaw), fz = Math.cos(state.camYaw);
    var rx = Math.cos(state.camYaw), rz = -Math.sin(state.camYaw);
    var mx = (fx * fwd + rx * str), mz = (fz * fwd + rz * str);
    var ml = Math.sqrt(mx * mx + mz * mz);
    var moving = ml > 0.01;
    if (moving) {
      mx /= ml; mz /= ml;
      var pos = { x: state.px + mx * speed * dt, z: state.pz + mz * speed * dt };
      NHN.city.collide(pos, C.playerRadius);
      // Cars are solid too.
      var cars = NHN.vehicles.all;
      for (var i = 0; i < cars.length; i++) {
        var c = cars[i];
        var d = NHN.u.dist(pos.x, pos.z, c.x, c.z);
        if (d < 1.9 && d > 0.001) {
          pos.x = c.x + (pos.x - c.x) / d * 1.9;
          pos.z = c.z + (pos.z - c.z) / d * 1.9;
        }
      }
      state.px = NHN.u.clamp(pos.x, -168, 168);
      state.pz = NHN.u.clamp(pos.z, -168, 232);
      state.facing = NHN.u.angleLerp(state.facing, Math.atan2(mx, mz), 0.3);
      NHN.people.animateWalk(player, clock.t, sprint ? 1 : 0.45);
    }
    if (mouseDown) state.facing = state.camYaw; // aiming: face where the camera faces
    player.group.position.set(state.px, pierY(state.px, state.pz), state.pz);
    player.group.rotation.y = state.facing;

    // Interaction prompt.
    var sana = NHN.missions.sana;
    if (sana && NHN.u.dist(state.px, state.pz, sana.x, sana.z) < 4.2) {
      NHN.hud.setPrompt('E — talk to Sana');
    } else {
      var car = nearestStealable();
      NHN.hud.setPrompt(car ? 'E — take the ' + car.spec.name : null);
    }
  }

  function updateDrive(dt) {
    var car = state.driving;
    var throttle = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    var steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
    var hb = !!keys.Space;
    var speedBefore = Math.abs(car.speed);
    NHN.vehicles.driveCar(car, dt, throttle, steer, hb);
    if (NHN.fxCrash) {
      NHN.fxCrash = false;
      NHN.audio.sfx.crash();
      spawnBurst(car.x, 0.8, car.z, 0xffc873, 10, 4);
      if (speedBefore > 14) hurtPlayer(3);
    }
    // Car-on-car contact.
    var cars = NHN.vehicles.all;
    for (var i = 0; i < cars.length; i++) {
      var o = cars[i];
      if (o === car || o.dead) continue;
      var d = NHN.u.dist(car.x, car.z, o.x, o.z);
      if (d < 3.3 && d > 0.001) {
        var push = (3.3 - d) / 2;
        var ux = (o.x - car.x) / d, uz = (o.z - car.z) / d;
        o.x += ux * push; o.z += uz * push;
        o.group.position.set(o.x, 0, o.z);
        if (Math.abs(car.speed) > 7) {
          o.health -= 12;
          NHN.audio.sfx.crash();
          spawnBurst(o.x, 0.8, o.z, 0xffc873, 8, 3.5);
          NHN.police.addCrime(0.35);
          if (o.mode === 'traffic' && o.health < 55) o.mode = 'parked'; // driver gives up
          car.speed *= 0.55;
        }
      }
    }
    state.px = car.x; state.pz = car.z;
    state.facing = car.angle;
    car.group.position.y = pierY(car.x, car.z);
    NHN.audio.engine.setRate(Math.abs(car.speed) / car.spec.topSpeed);
    state.camOffset = NHN.u.lerp(state.camOffset, 0, dt * 0.7);
    NHN.hud.setPrompt('E — exit the ' + car.spec.name);
  }

  function updateCamera(dt) {
    var tx, tz, ty, lx, lz;
    if (state.mode === 'drive' && state.driving) {
      var car = state.driving;
      var a = car.angle + state.camOffset;
      var fx = Math.sin(a), fz = Math.cos(a);
      tx = car.x - fx * 10.5; tz = car.z - fz * 10.5; ty = 4.2;
      lx = car.x + fx * 7; lz = car.z + fz * 7;
      camera.position.x = NHN.u.lerp(camera.position.x, tx, 0.12);
      camera.position.y = NHN.u.lerp(camera.position.y, ty, 0.12);
      camera.position.z = NHN.u.lerp(camera.position.z, tz, 0.12);
      camera.lookAt(lx, 1.4, lz);
    } else {
      var fx2 = Math.sin(state.camYaw), fz2 = Math.cos(state.camYaw);
      tx = state.px - fx2 * 7.6; tz = state.pz - fz2 * 7.6; ty = 3.4;
      camera.position.x = NHN.u.lerp(camera.position.x, tx, 0.2);
      camera.position.y = NHN.u.lerp(camera.position.y, ty, 0.2);
      camera.position.z = NHN.u.lerp(camera.position.z, tz, 0.2);
      camera.lookAt(state.px + fx2 * 5, 1.5, state.pz + fz2 * 5);
    }
    // Keep the shadow frustum centred on the action.
    sunLight.position.set(state.px - 90, 120, state.pz - 60);
    sunLight.target.position.set(state.px, 0, state.pz);
  }

  // --------------------------------------------------------------- combat
  var tracers = [];
  function addTracer(x1, y1, z1, x2, y2, z2, color) {
    var geo = new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)]);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: color || 0xffe08a, transparent: true, opacity: 0.95 }));
    scene.add(line);
    tracers.push({ line: line, life: 0.07 });
  }
  NHN.tracer = addTracer;

  function startReload() {
    if (state.mode !== 'foot' || state.reloadT > 0) return;
    if (state.ammo >= C.pistol.mag || state.reserve <= 0) return;
    state.reloadT = 0.9;
    NHN.audio.sfx.reload();
  }

  function tryFire() {
    if (state.mode !== 'foot' || state.fireCd > 0 || state.reloadT > 0) return;
    if (state.ammo <= 0) { NHN.audio.sfx.dryFire(); state.fireCd = 0.25; startReload(); return; }
    state.ammo--;
    state.fireCd = C.pistol.cooldown;
    state.shotDangerT = 2.5;
    state.facing = state.camYaw;
    NHN.audio.sfx.shot();
    NHN.police.addCrime(0.55);

    var ox = state.px, oz = state.pz, oy = 1.35;
    var dx = Math.sin(state.facing), dz = Math.cos(state.facing);
    var range = C.pistol.range, hitT = range, hitKind = 'wall', hitObj = null;

    // Pedestrians as capsule targets.
    var crowd = NHN.people.crowd;
    for (var i = 0; i < crowd.length; i++) {
      var p = crowd[i];
      if (p.state === 'down') continue;
      var t = (p.x - ox) * dx + (p.z - oz) * dz;
      if (t < 0.5 || t > hitT) continue;
      var pxp = ox + dx * t, pzp = oz + dz * t;
      if (NHN.u.dist(pxp, pzp, p.x, p.z) < 0.75) { hitT = t; hitKind = 'ped'; hitObj = p; }
    }
    // Cars as round targets.
    var cars = NHN.vehicles.all;
    for (var j = 0; j < cars.length; j++) {
      var c = cars[j];
      if (c.dead || c === state.driving) continue;
      var t2 = (c.x - ox) * dx + (c.z - oz) * dz;
      if (t2 < 0.5 || t2 > hitT) continue;
      var qx = ox + dx * t2, qz = oz + dz * t2;
      if (NHN.u.dist(qx, qz, c.x, c.z) < 2.1) { hitT = t2; hitKind = 'car'; hitObj = c; }
    }
    // Walls: step the ray through building colliders.
    var steps = Math.floor(Math.min(hitT, range) / 1.0);
    for (var s = 1; s <= steps; s++) {
      var wx = ox + dx * s, wz = oz + dz * s;
      var probe = { x: wx, z: wz };
      var before = { x: wx, z: wz };
      NHN.city.collide(probe, 0.05);
      if (probe.x !== before.x || probe.z !== before.z) { if (s < hitT) { hitT = s; hitKind = 'wall'; hitObj = null; } break; }
    }

    var hx = ox + dx * hitT, hz = oz + dz * hitT;
    addTracer(ox + dx * 0.5, oy, oz + dz * 0.5, hx, oy, hz, 0xffe08a);
    flashLight.position.set(ox + dx * 1.2, 1.5, oz + dz * 1.2);
    flashLight.intensity = 2.6;

    if (hitKind === 'ped') {
      NHN.people.knockDown(hitObj);
      NHN.police.addCrime(1);
      spawnBurst(hitObj.x, 1.1, hitObj.z, 0xd94f3d, 8, 3);
    } else if (hitKind === 'car') {
      hitObj.health -= C.pistol.damage;
      spawnBurst(hx, 0.9, hz, 0xffc873, 10, 4);
      if (hitObj.isPolice) NHN.police.addCrime(0.8);
      if (hitObj.health <= 0 && !hitObj.dead) {
        hitObj.dead = true;
        hitObj.speed = 0;
        if (hitObj.mode === 'traffic') hitObj.mode = 'parked';
        spawnBurst(hitObj.x, 1.2, hitObj.z, 0x555560, 22, 5);
        NHN.hud.showSubtitle('Milo', 'That one is not driving anywhere again.');
      }
    } else {
      spawnBurst(hx, oy, hz, 0xd8cfb8, 4, 2);
    }
  }

  // ------------------------------------------------------------ particles
  var PMAX = 260, pGeo, pPts, pData = [];
  function initParticles() {
    pGeo = new THREE.BufferGeometry();
    var arr = new Float32Array(PMAX * 3);
    var col = new Float32Array(PMAX * 3);
    pGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (var i = 0; i < PMAX; i++) { arr[i * 3 + 1] = -50; pData.push({ life: 0, vx: 0, vy: 0, vz: 0 }); }
    pPts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.32, vertexColors: true, transparent: true, opacity: 0.95 }));
    pPts.frustumCulled = false;
    scene.add(pPts);
  }
  function spawnBurst(x, y, z, colorHex, n, speed) {
    var col = new THREE.Color(colorHex);
    var pos = pGeo.attributes.position.array, carr = pGeo.attributes.color.array;
    var placed = 0;
    for (var i = 0; i < PMAX && placed < n; i++) {
      var d = pData[i];
      if (d.life > 0) continue;
      d.life = 0.4 + Math.random() * 0.5;
      d.vx = (Math.random() - 0.5) * speed * 2;
      d.vy = Math.random() * speed * 0.9 + 1;
      d.vz = (Math.random() - 0.5) * speed * 2;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      carr[i * 3] = col.r; carr[i * 3 + 1] = col.g; carr[i * 3 + 2] = col.b;
      placed++;
    }
    pGeo.attributes.color.needsUpdate = true;
  }
  function updateParticles(dt) {
    var pos = pGeo.attributes.position.array;
    for (var i = 0; i < PMAX; i++) {
      var d = pData[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      d.vy -= 6.5 * dt;
      pos[i * 3] += d.vx * dt; pos[i * 3 + 1] += d.vy * dt; pos[i * 3 + 2] += d.vz * dt;
      if (pos[i * 3 + 1] < 0.05) { pos[i * 3 + 1] = 0.05; d.vy = 0; }
      if (d.life <= 0) pos[i * 3 + 1] = -50;
    }
    pGeo.attributes.position.needsUpdate = true;
    for (var t = tracers.length - 1; t >= 0; t--) {
      tracers[t].life -= dt;
      tracers[t].line.material.opacity = Math.max(0, tracers[t].life / 0.07) * 0.95;
      if (tracers[t].life <= 0) { scene.remove(tracers[t].line); tracers.splice(t, 1); }
    }
    if (flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 22);
  }

  // -------------------------------------------------------------- pickups
  var pickups = [];
  function initPickups() {
    var spots = [
      { x: C.hospital.x, z: C.hospital.z + 14 },
      { x: 80, z: 170 }, { x: -23, z: -23 }, { x: C.lockup.x, z: C.lockup.z + 14 }
    ];
    var green = new THREE.MeshBasicMaterial({ color: 0x37d67a });
    var white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    spots.forEach(function (s) {
      var g = new THREE.Group();
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.18, 14), green);
      g.add(disc);
      var v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.95), white); g.add(v);
      var h = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, 0.3), white); g.add(h);
      g.position.set(s.x, 0.7, s.z);
      scene.add(g);
      pickups.push({ group: g, x: s.x, z: s.z, timer: 0 });
    });
  }
  function updatePickups(dt) {
    for (var i = 0; i < pickups.length; i++) {
      var p = pickups[i];
      if (p.timer > 0) { p.timer -= dt; p.group.visible = p.timer <= 0; continue; }
      p.group.rotation.y += dt * 2.2;
      p.group.position.y = 0.7 + Math.sin(clock.t * 2.4 + i) * 0.15;
      if (state.health < C.maxHealth && NHN.u.dist(state.px, state.pz, p.x, p.z) < 2.1) {
        state.health = Math.min(C.maxHealth, state.health + 45);
        NHN.audio.sfx.pickup();
        NHN.hud.showBanner('PATCHED UP +45');
        p.timer = 30; p.group.visible = false;
      }
    }
  }

  // --------------------------------------------------------- damage/death
  function hurtPlayer(n) {
    if (state.mode === 'overlay' || state.mode === 'menu' || frozen) return;
    state.health -= n;
    state.lastHurtT = clock.t;
    document.getElementById('vignette').style.opacity = '1';
    setTimeout(function () { document.getElementById('vignette').style.opacity = '0'; }, 190);
    NHN.audio.sfx.hurt();
    if (state.health <= 0) die();
  }
  function showOverlay(title, text) {
    state.mode = 'overlay';
    document.getElementById('overlayTitle').textContent = title;
    document.getElementById('overlayText').textContent = text;
    document.getElementById('overlay').style.display = 'flex';
    NHN.audio.engine.stop();
    if (document.exitPointerLock) document.exitPointerLock();
  }
  function die() {
    var lost = Math.floor(state.cash * 0.12);
    state.cash -= lost;
    NHN.police.clear();
    showOverlay('FLATLINED', 'Verde Bay General patches you up. The bill: $' + lost + '. The bay is still out there.');
    state.respawnAt = { x: C.hospital.x, z: C.hospital.z + 14 };
  }
  function busted() {
    var fine = Math.min(250, state.cash);
    state.cash -= fine;
    NHN.police.clear();
    NHN.audio.sfx.busted();
    showOverlay('BUSTED', 'VBPD books you at Central. Fine: $' + fine + '. Your wheels are gone, your name is not.');
    state.respawnAt = { x: C.policeStn.x, z: C.policeStn.z + 16 };
  }
  function respawn() {
    document.getElementById('overlay').style.display = 'none';
    if (state.driving) { state.driving.mode = 'parked'; state.driving = null; }
    state.health = C.maxHealth;
    state.px = state.respawnAt.x; state.pz = state.respawnAt.z;
    player.group.visible = true;
    player.group.position.set(state.px, 0, state.pz);
    NHN.people.reviveAll();
    state.mode = 'foot';
    state.save();
  }

  // ---------------------------------------------------------------- menus
  var prevMode = 'foot';
  function showMenu() {
    document.getElementById('menu').style.display = 'flex';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('btnContinue').style.display = loadSave() ? 'block' : 'none';
    state.mode = 'menu';
  }
  function startPlay(resume) {
    NHN.audio.unlock();
    NHN.audio.sfx.click();
    document.getElementById('menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    if (resume) {
      var s = loadSave();
      if (s) {
        state.cash = s.cash; state.health = s.health;
        state.campaignDone = !!s.campaignDone;
        state.px = s.px; state.pz = s.pz;
        NHN.missions.setState(s.mission);
        if (state.campaignDone) NHN.hud.showBanner('WELCOME BACK — free roam');
      }
    } else {
      localStorage.removeItem('nhn_save_v1');
      state.cash = 250; state.health = C.maxHealth;
      state.px = C.startSpawn.x; state.pz = C.startSpawn.z;
      NHN.missions.startCampaign();
      NHN.hud.showSubtitle('Sana', 'Milo — marina, south end of the bay. Do not keep me waiting.');
    }
    player.group.position.set(state.px, 0, state.pz);
    state.mode = 'foot';
  }
  function togglePause() {
    if (state.mode === 'foot' || state.mode === 'drive') {
      prevMode = state.mode;
      state.mode = 'pause';
      document.getElementById('pause').style.display = 'flex';
      NHN.audio.engine.stop();
    } else if (state.mode === 'pause') {
      state.mode = prevMode;
      document.getElementById('pause').style.display = 'none';
      if (state.mode === 'drive') NHN.audio.engine.start();
    }
  }
  function wireMenus() {
    document.getElementById('btnNew').addEventListener('click', function () { startPlay(false); });
    document.getElementById('btnContinue').addEventListener('click', function () { startPlay(true); });
    document.getElementById('btnResume').addEventListener('click', togglePause);
    document.getElementById('btnSave').addEventListener('click', function () {
      state.save();
      document.getElementById('pause').style.display = 'none';
      if (state.driving) exitCar();
      showMenu();
    });
    document.getElementById('btnRespawn').addEventListener('click', respawn);
    if (!shotName) showMenu();
  }

  // ------------------------------------------------------------ main loop
  function trafficHitAt(x, z) {
    var cars = NHN.vehicles.all;
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (Math.abs(c.speed) > 5 && NHN.u.dist(x, z, c.x, c.z) < 1.8) {
        if (c === state.driving) NHN.police.addCrime(0.7);
        return c;
      }
    }
    return null;
  }

  function stepWorld(dt, noControl) {
    clock.t += dt;
    if (state.fireCd > 0) state.fireCd -= dt;
    if (state.reloadT > 0) {
      state.reloadT -= dt;
      if (state.reloadT <= 0) {
        var take = Math.min(C.pistol.mag - state.ammo, state.reserve);
        state.ammo += take; state.reserve -= take;
      }
    }
    if (state.shotDangerT > 0) state.shotDangerT -= dt;

    if (!noControl) {
      if (state.mode === 'foot') updateFoot(dt);
      else if (state.mode === 'drive') updateDrive(dt);
    }

    NHN.vehicles.updateTraffic(dt, { playerPos: { x: state.px, z: state.pz } });

    var danger = null;
    if (state.shotDangerT > 0) danger = { x: state.px, z: state.pz, r: 11 };
    else if (state.driving && Math.abs(state.driving.speed) > 9) {
      danger = { x: state.driving.x, z: state.driving.z, r: 10 };
    }
    NHN.people.update(dt, clock.t, { danger: danger, trafficHit: trafficHitAt }, rand);

    var pSpeed = state.driving ? state.driving.speed
      : ((keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD) ? C.walkSpeed : 0);
    NHN.police.update(dt, {
      px: state.px, pz: state.pz, playerSpeed: pSpeed,
      onFoot: state.mode === 'foot',
      pAngle: state.facing,
      hurt: function (n) { hurtPlayer(n); },
      tracer: addTracer
    });

    NHN.missions.update(dt);
    updatePickups(dt);
    updateParticles(dt);
    NHN.city.update(dt, clock.t);

    if (clock.t - state.lastHurtT > 6 && state.health > 0) {
      state.health = Math.min(C.maxHealth, state.health + 3.5 * dt);
    }
    NHN.hud.update(dt);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - clock.last) / 1000 || 0.016);
    clock.last = now;

    if (shotName) {
      if (!frozen) {
        stepWorld(dt, true);
        updateCamera(dt);
        framesRendered++;
        if (framesRendered >= 10) { frozen = true; window.__shotReady = true; }
      }
      renderer.render(scene, camera);
      return;
    }

    if (state.mode === 'menu') {
      var a = now * 0.00004;
      camera.position.set(Math.sin(a) * 150, 46, 60 + Math.cos(a) * 150);
      camera.lookAt(0, 6, 30);
    } else if (state.mode !== 'pause' && state.mode !== 'overlay') {
      stepWorld(dt, false);
      updateCamera(dt);
    }
    renderer.render(scene, camera);
  }

  // ---------------------------------------------------------- shot scenes
  function snapCamera() {
    // Place the camera exactly where the follow logic would settle.
    if (state.mode === 'drive' && state.driving) {
      var car = state.driving;
      var fx = Math.sin(car.angle), fz = Math.cos(car.angle);
      camera.position.set(car.x - fx * 10.5, 4.2, car.z - fz * 10.5);
      camera.lookAt(car.x + fx * 7, 1.4, car.z + fz * 7);
    } else {
      var fx2 = Math.sin(state.camYaw), fz2 = Math.cos(state.camYaw);
      camera.position.set(state.px - fx2 * 7.6, 3.4, state.pz - fz2 * 7.6);
      camera.lookAt(state.px + fx2 * 5, 1.5, state.pz + fz2 * 5);
    }
  }

  function warmUp(steps) {
    for (var i = 0; i < steps; i++) stepWorld(1 / 30, true);
  }

  function placeVisualPolice(x, z, angle) {
    var c = NHN.vehicles.makeCar('police', 0xf2f2f5, { police: true });
    c.mode = 'parked';
    scene.add(c.group);
    NHN.vehicles.placeCar(c, x, z, angle);
    return c;
  }

  function setupShot(name) {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    var i, p;

    if (name === 'start') {
      state.mode = 'foot';
      NHN.missions.startCampaign();
      state.px = 33; state.pz = 149;
      state.camYaw = -2.35; state.facing = -2.35;
      player.group.position.set(state.px, 0, state.pz);
      // Guarantee a lively street: pull some crowd members over.
      for (i = 0; i < 5 && i < NHN.people.crowd.length; i++) {
        p = NHN.people.crowd[i];
        p.x = 28 + i * 5; p.z = 150 + (i % 2) * 4; p.tx = p.x + 8; p.tz = p.z;
        p.group.position.set(p.x, 0, p.z);
      }
      warmUp(20);
    } else if (name === 'drive') {
      var kestrel = NHN.missions.kestrel();
      NHN.vehicles.placeCar(kestrel, -2.9, 18, 0);
      enterCar(kestrel, true);
      kestrel.speed = 15.5;
      state.mode = 'drive';
      NHN.missions.force(1, 1);
      NHN.police.setLevel(2);
      warmUp(25);
      NHN.vehicles.placeCar(kestrel, -2.9, 18, 0);
      kestrel.speed = 15.5; state.px = kestrel.x; state.pz = kestrel.z; state.facing = 0;
      // Beside and just behind the Kestrel: inside the chase camera's
      // wide frustum, reading as an interceptor pulling alongside.
      placeVisualPolice(2.9, 14.6, 0.3);
    } else if (name === 'chase') {
      var van = NHN.missions.van();
      NHN.vehicles.placeCar(van, 55, C.boardwalkZ + 2.9, Math.PI / 2);
      enterCar(van, true);
      van.speed = 16;
      state.mode = 'drive';
      NHN.missions.force(4, 3);
      warmUp(25);
      NHN.vehicles.placeCar(van, 55, C.boardwalkZ + 2.9, Math.PI / 2);
      van.speed = 16; state.px = van.x; state.pz = van.z; state.facing = van.angle;
      // Flanking pursuers, offset into the chase camera's frustum.
      placeVisualPolice(49, C.boardwalkZ, Math.PI / 2 - 0.25);
      placeVisualPolice(50.5, C.boardwalkZ + 5.8, Math.PI / 2 + 0.2);
    } else if (name === 'foot') {
      state.mode = 'foot';
      // South of Sana, looking back at her with the skyline beyond:
      // clear of the marina crate field that fills the apron.
      state.px = 93.5; state.pz = 184;
      state.camYaw = Math.PI - 0.22; state.facing = Math.PI - 0.22;
      player.group.position.set(state.px, 0, state.pz);
      NHN.missions.startCampaign();
      warmUp(20);
      NHN.missions.force(0, 0);
      NHN.missions.update(0.016);
      NHN.hud.setPrompt('E — talk to Sana');
    }
    snapCamera();
    NHN.hud.update(0.016);
  }

  addEventListener('DOMContentLoaded', boot);
})();
