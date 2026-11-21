// Neon Harbor Nights — police.js
// The VBPD: wanted level, interceptor spawns, pursuit steering,
// covering fire at high heat and the bust meter.
window.NHN = window.NHN || {};

NHN.police = (function () {
  var C = NHN.CONFIG;
  var level = 0;          // whole stars 0..5
  var heat = 0;           // fractional crime accumulator
  var cars = [];
  var unseenT = 0;        // time since any officer had eyes on the player
  var shootT = 0;
  var bust01 = 0;
  var scene = null;

  function desiredCars() {
    if (level <= 0) return 0;
    return Math.min(2 + level, 6); // 1 star: 3 cars ... 5 stars: 6 cars (capped)
  }

  function addCrime(amount) {
    heat += amount;
    var nl = NHN.u.clamp(Math.floor(heat), 0, 5);
    if (nl > level) { level = nl; unseenT = 0; }
    if (level > 0) NHN.audio.siren.start();
  }

  function setLevel(n) {
    level = NHN.u.clamp(n, 0, 5);
    heat = level;
    unseenT = 0;
    if (level <= 0) NHN.audio.siren.stop();
  }

  function clear() { setLevel(0); bust01 = 0; }

  function spawnOne(px, pz) {
    // Respawn on a road, 55–85 m from the player, never in plain view.
    for (var tries = 0; tries < 12; tries++) {
      var vertical = Math.random() < 0.5;
      var line = NHN.u.pick(Math.random, NHN.city.roadsX);
      var x, z;
      if (vertical) { x = line; z = pz + (Math.random() < 0.5 ? -1 : 1) * (55 + Math.random() * 30); }
      else { z = line; x = px + (Math.random() < 0.5 ? -1 : 1) * (55 + Math.random() * 30); }
      x = NHN.u.clamp(x, -155, 155); z = NHN.u.clamp(z, -155, 165);
      if (NHN.u.dist(x, z, px, pz) < 45) continue;
      var car = NHN.vehicles.makeCar('police', 0xf2f2f5, { police: true });
      car.mode = 'police';
      car.cruise = 30;
      scene.add(car.group);
      NHN.vehicles.placeCar(car, x, z, Math.atan2(px - x, pz - z));
      cars.push(car);
      return;
    }
  }

  function despawnFar(px, pz) {
    for (var i = cars.length - 1; i >= 0; i--) {
      var c = cars[i];
      if (c.dead || NHN.u.dist(c.x, c.z, px, pz) > 150 || level === 0) {
        scene.remove(c.group);
        var ix = NHN.vehicles.all.indexOf(c);
        if (ix >= 0) NHN.vehicles.all.splice(ix, 1);
        cars.splice(i, 1);
      }
    }
  }

  function update(dt, ctx) {
    // ctx: {px, pz, playerSpeed, onFoot, hurt(n), tracer(from,to)}
    if (!scene) return;
    if (level > 0 && cars.length < desiredCars()) spawnOne(ctx.px, ctx.pz);
    despawnFar(ctx.px, ctx.pz);

    var anySee = false;
    var nearest = 1e9;
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (c.dead) continue;
      var d = NHN.u.dist(c.x, c.z, ctx.px, ctx.pz);
      if (d < nearest) nearest = d;
      if (d < 55) anySee = true;

      // Flash the light bar.
      if (c.group.userData.lightBar) {
        var bar = c.group.userData.lightBar;
        bar.children[0].material.color.setHex(Math.sin(performance.now() * 0.02) > 0 ? 0xff2222 : 0x550000);
        bar.children[1].material.color.setHex(Math.sin(performance.now() * 0.02) > 0 ? 0x000055 : 0x2266ff);
      }
      if (c.mode !== 'police') continue;
      // Pursuit steering: aim at a point just behind the player.
      var tx = ctx.px - Math.sin(ctx.pAngle || 0) * 2, tz = ctx.pz - Math.cos(ctx.pAngle || 0) * 2;
      var want = Math.atan2(tx - c.x, tz - c.z);
      var diff = want - c.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      var steer = NHN.u.clamp(diff * 2.4, -1, 1);
      var topChase = c.spec.topSpeed * (0.82 + level * 0.045);
      var throttle = c.speed < topChase ? 1 : 0;
      if (Math.abs(diff) > 2.4 && d < 12) throttle = -0.6; // overshot: reverse out
      NHN.vehicles.driveCar(c, dt, throttle, steer, false);
      // Ramming a fleeing player on foot hurts.
      if (ctx.onFoot && d < 2.4 && Math.abs(c.speed) > 4) ctx.hurt(9);
    }

    // Wanted decay while hidden.
    if (anySee) unseenT = 0; else unseenT += dt;
    if (level > 0 && unseenT > C.wantedDecayDelay) {
      if (unseenT > C.wantedDecayDelay + C.wantedDecayStep) {
        unseenT = C.wantedDecayDelay;
        setLevel(level - 1);
        heat = level;
        if (NHN.onWantedFade) NHN.onWantedFade(level);
      }
    }

    // Covering fire at 4+ stars when an officer is close.
    shootT -= dt;
    if (level >= 4 && nearest < 34 && shootT <= 0) {
      shootT = 0.85;
      var shooter = null;
      for (var j = 0; j < cars.length; j++) if (!cars[j].dead && NHN.u.dist(cars[j].x, cars[j].z, ctx.px, ctx.pz) < 34) { shooter = cars[j]; break; }
      if (shooter) {
        if (ctx.tracer) ctx.tracer(shooter.x, 1.4, shooter.z, ctx.px, 1.2, ctx.pz, 0xff5544);
        if (Math.random() < 0.55) ctx.hurt(5);
        NHN.audio.sfx.shot();
      }
    }

    // Bust meter: boxed in, slow, and close to an officer.
    if (level > 0 && nearest < 8 && Math.abs(ctx.playerSpeed) < 2.2) {
      bust01 += dt / C.bustTime;
      if (bust01 >= 1 && NHN.onBusted) { bust01 = 0; NHN.onBusted(); }
    } else {
      bust01 = Math.max(0, bust01 - dt * 0.7);
    }
    if (level > 0 && nearest < 60) NHN.audio.siren.start();
    if (level === 0 || nearest > 70) NHN.audio.siren.stop();
  }

  return {
    init: function (sc) { scene = sc; },
    update: update, addCrime: addCrime, setLevel: setLevel, clear: clear,
    cars: cars,
    get level() { return level; },
    get bust01() { return bust01; },
    get unseen() { return unseenT; }
  };
})();
