// Neon Harbor Nights — vehicles.js
// Car mesh factory, the shared arcade driving model, parked cars and
// the traffic manager that keeps Verde Bay's roads alive.
window.NHN = window.NHN || {};

NHN.vehicles = (function () {
  var C = NHN.CONFIG;
  var all = [];        // every car in the world
  var traffic = [];    // AI-driven cars
  var parked = [];     // stealable parked cars
  var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  var wheelMat = new THREE.MeshLambertMaterial({ color: 0x14151a });
  var glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  var lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  var tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

  function makeCar(typeId, color, opts) {
    opts = opts || {};
    var spec = NHN.CAR_TYPES[typeId];
    var group = new THREE.Group();
    var paint = new THREE.MeshLambertMaterial({ color: color });
    var isPolice = !!opts.police;

    var bodyH = typeId === 'van' ? 1.15 : 0.62;
    var body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, bodyH, spec.len), paint);
    body.position.y = 0.42 + bodyH / 2; body.castShadow = true; group.add(body);

    if (typeId === 'van') {
      var back = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 1.15, spec.len * 0.55), paint);
      back.position.set(0, 0.42 + bodyH + 0.55, -spec.len * 0.18); back.castShadow = true; group.add(back);
      var shield = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.86, 0.62, 0.1), glassMat);
      shield.position.set(0, 0.42 + bodyH + 0.28, spec.len * 0.31); group.add(shield);
    } else {
      var cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.84, 0.5, spec.len * spec.cabin), glassMat);
      cabin.position.set(0, 0.42 + bodyH + 0.24, -spec.len * 0.04); cabin.castShadow = true; group.add(cabin);
    }
    if (typeId === 'taxi') {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffd23e }));
      sign.position.set(0, 1.62, 0); group.add(sign);
    }
    if (typeId === 'kestrel') {
      var spoiler = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.92, 0.08, 0.4),
        new THREE.MeshLambertMaterial({ color: 0x181820 }));
      spoiler.position.set(0, 1.12, -spec.len / 2 + 0.25); group.add(spoiler);
    }
    // Wheels.
    var wheels = [];
    var wx = spec.wid / 2 - 0.05, wz = spec.len / 2 - 0.85;
    [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.36, p[1]);
      group.add(w); wheels.push(w);
    });
    // Headlights + tail lights (emissive boxes read as glow at dusk).
    [[-0.6, 1], [0.6, 1]].forEach(function (p) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), lightMat);
      hl.position.set(p[0] * spec.wid * 0.6, 0.78, spec.len / 2 + 0.02); group.add(hl);
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), tailMat);
      tl.position.set(p[0] * spec.wid * 0.6, 0.82, -spec.len / 2 - 0.02); group.add(tl);
    });
    if (isPolice) {
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.wid + 0.04, 0.3, spec.len * 0.7),
        new THREE.MeshLambertMaterial({ color: 0x1d2735 }));
      stripe.position.y = 0.85; group.add(stripe);
      var bar = new THREE.Group();
      var red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      red.position.x = -0.3; bar.add(red);
      var blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
      blue.position.x = 0.3; bar.add(blue);
      bar.position.y = 1.62; group.add(bar);
      group.userData.lightBar = bar;
    }

    var car = {
      type: typeId, spec: spec, group: group, wheels: wheels,
      x: 0, z: 0, angle: 0, speed: 0, steerVis: 0,
      mode: 'parked', health: 100, dead: false, stolen: false,
      isPolice: isPolice, ownedByPlayer: false, cruise: 11 + Math.random() * 4,
      dirX: 0, dirZ: 1, lane: 0, stuckT: 0
    };
    group.userData.car = car;
    all.push(car);
    return car;
  }

  function placeCar(car, x, z, angle) {
    car.x = x; car.z = z; car.angle = angle;
    car.group.position.set(x, 0, z);
    car.group.rotation.y = angle;
  }

  // Shared arcade drive model. throttle -1..1, steer -1..1 (left positive).
  // Mutates car.x/z/angle/speed, resolves building + bounds collisions.
  function driveCar(car, dt, throttle, steer, handbrake) {
    var spec = car.spec;
    var maxF = spec.topSpeed, maxR = 9;
    if (throttle > 0) car.speed += spec.accel * throttle * dt * (car.speed < 0 ? 2.2 : 1);
    else if (throttle < 0) {
      if (car.speed > 0.5) car.speed -= spec.accel * 1.7 * dt; // braking
      else car.speed += spec.accel * 0.6 * throttle * dt;      // reverse
    } else {
      car.speed -= car.speed * 0.55 * dt; // engine drag
    }
    if (handbrake) car.speed -= car.speed * 2.4 * dt;
    car.speed = NHN.u.clamp(car.speed, -maxR, maxF);
    if (Math.abs(car.speed) < 0.04 && throttle === 0) car.speed = 0;

    var steerAuthority = NHN.u.clamp(Math.abs(car.speed) / 6, 0, 1) * (handbrake ? 1.5 : 1);
    car.angle += steer * spec.grip * 0.42 * steerAuthority * dt * (car.speed < 0 ? -1 : 1);
    car.steerVis = NHN.u.lerp(car.steerVis, steer, 0.25);

    var nx = car.x + Math.sin(car.angle) * car.speed * dt;
    var nz = car.z + Math.cos(car.angle) * car.speed * dt;
    var pos = { x: nx, z: nz };
    var hit = NHN.city.collide(pos, spec.wid * 0.72);
    if (hit && Math.abs(car.speed) > 6) NHN.fxCrash = true;
    if (hit) car.speed *= 0.35;
    car.x = NHN.u.clamp(pos.x, -168, 168);
    car.z = NHN.u.clamp(pos.z, -168, 236);
    if (car.z > C.waterZ + 6 && !(car.x > C.marina.x - 5 && car.x < C.marina.x + 5)) {
      car.z = C.waterZ + 6; car.speed *= 0.4; // the sea is not a road
    }
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.angle;
    var spin = car.speed * dt / 0.36;
    for (var i = 0; i < car.wheels.length; i++) {
      car.wheels[i].rotation.x += spin;
      if (i < 2) car.wheels[i].rotation.y = car.steerVis * 0.42;
    }
    return hit;
  }

  // --- Traffic -------------------------------------------------------------
  // Cars follow the road grid: cardinal heading, right-hand lane offset,
  // random turns at intersections, slow for anything ahead.
  function laneTarget(car) {
    // Desired centre of the car's lane given its heading.
    if (car.dirZ === 1) return { axis: 'x', v: car.roadLine - 2.9 };   // heading +z: lane left of centreline? (right-hand: x-2.9)
    if (car.dirZ === -1) return { axis: 'x', v: car.roadLine + 2.9 };
    if (car.dirX === 1) return { axis: 'z', v: car.roadLine + 2.9 };
    return { axis: 'z', v: car.roadLine - 2.9 };
  }

  function spawnTraffic(scene, count, rand) {
    var types = ['sedan', 'sedan', 'taxi', 'pickup', 'van', 'kestrel'];
    for (var i = 0; i < count; i++) {
      var vertical = rand() < 0.5;
      var line = NHN.u.pick(rand, NHN.city.roadsX);
      var other = NHN.u.pick(rand, NHN.city.roadsZ);
      var car = makeCar(NHN.u.pick(rand, types), NHN.u.pick(rand, C.carPaints));
      car.mode = 'traffic';
      if (vertical) {
        car.dirX = 0; car.dirZ = rand() < 0.5 ? 1 : -1; car.roadLine = line;
        car.x = line; car.z = other + (rand() - 0.5) * 30;
      } else {
        car.dirZ = 0; car.dirX = rand() < 0.5 ? 1 : -1; car.roadLine = other === C.boardwalkZ ? line : line;
        car.roadLine = other; car.x = line + (rand() - 0.5) * 30; car.z = other;
      }
      car.angle = Math.atan2(car.dirX, car.dirZ);
      var lt = laneTarget(car);
      if (lt.axis === 'x') car.x = lt.v; else car.z = lt.v;
      scene.add(car.group);
      placeCar(car, car.x, car.z, car.angle);
      traffic.push(car);
    }
  }

  function spawnParked(scene, rand) {
    var spots = NHN.city.curbSpots.concat(NHN.city.lotSpots);
    var types = ['sedan', 'sedan', 'pickup', 'van', 'taxi', 'kestrel'];
    for (var i = 0; i < spots.length; i++) {
      if (rand() < 0.45) continue;
      var car = makeCar(NHN.u.pick(rand, types), NHN.u.pick(rand, C.carPaints));
      car.mode = 'parked';
      scene.add(car.group);
      placeCar(car, spots[i].x, spots[i].z, spots[i].angle + (rand() - 0.5) * 0.05);
      parked.push(car);
    }
  }

  function obstacleAhead(car, ctx) {
    var fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    var look = 8 + Math.abs(car.speed) * 0.7;
    function blocks(ox, oz) {
      var dx = ox - car.x, dz = oz - car.z;
      var ahead = dx * fx + dz * fz;
      if (ahead < 1 || ahead > look) return false;
      var side = Math.abs(dx * fz - dz * fx);
      return side < 2.1;
    }
    if (ctx.playerPos && blocks(ctx.playerPos.x, ctx.playerPos.z)) return true;
    for (var i = 0; i < all.length; i++) {
      var o = all[i];
      if (o === car || o.dead) continue;
      if (blocks(o.x, o.z)) return true;
    }
    return false;
  }

  function nearestLine(lines, v) {
    var best = lines[0], bd = 1e9;
    for (var i = 0; i < lines.length; i++) {
      var d = Math.abs(v - lines[i]);
      if (d < bd) { bd = d; best = lines[i]; }
    }
    return best;
  }

  function updateTraffic(dt, ctx) {
    for (var i = 0; i < traffic.length; i++) {
      var car = traffic[i];
      if (car.mode !== 'traffic' || car.dead) continue;
      // Intersection? Near a crossing line on the perpendicular axis.
      var lines = car.dirZ !== 0 ? NHN.city.roadsZ : NHN.city.roadsX;
      var along = car.dirZ !== 0 ? car.z : car.x;
      var nearCross = false;
      for (var j = 0; j < lines.length; j++) if (Math.abs(along - lines[j]) < 1.6) { nearCross = true; break; }
      if (nearCross && Math.random() < 0.012) {
        // Turn onto the crossing road: the new travel line is the road
        // the car is currently crossing, snapped to the grid.
        var turn = Math.random() < 0.5 ? 1 : -1;
        if (car.dirZ !== 0) {
          car.roadLine = nearestLine(NHN.city.roadsZ, car.z);
          car.dirX = turn * car.dirZ; car.dirZ = 0;
        } else {
          car.roadLine = nearestLine(NHN.city.roadsX, car.x);
          car.dirZ = -turn * car.dirX; car.dirX = 0;
        }
      }
      // World edge: U-turn onto the opposite lane of the same road.
      if (car.x < -158 || car.x > 158 || car.z < -158 || car.z > 170) {
        if (car.dirZ !== 0) car.dirZ = -car.dirZ; else car.dirX = -car.dirX;
        car.x = NHN.u.clamp(car.x, -156, 156);
        car.z = NHN.u.clamp(car.z, -156, 168);
      }
      var targetAngle = Math.atan2(car.dirX, car.dirZ);
      var diff = targetAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      var steer = NHN.u.clamp(diff * 2.2, -1, 1);
      // Lane keeping: nudge angle toward lane centre.
      var lt = laneTarget(car);
      var laneErr = (lt.axis === 'x' ? lt.v - car.x : lt.v - car.z);
      steer += NHN.u.clamp(laneErr * 0.12, -0.5, 0.5) * (car.dirZ !== 0 || car.dirX !== 0 ? 1 : 1);

      var blocked = obstacleAhead(car, ctx);
      var throttle = blocked ? -0.4 : (car.speed < car.cruise ? 0.75 : 0);
      if (blocked && car.speed < 0.4) throttle = 0;
      driveCar(car, dt, throttle, steer, false);
      if (Math.abs(car.speed) < 0.2) { car.stuckT += dt; } else car.stuckT = 0;
      if (car.stuckT > 4) { // nudge out of gridlock with a random turn
        car.dirX = -car.dirX; car.dirZ = -car.dirZ; car.stuckT = 0;
      }
    }
  }

  return {
    makeCar: makeCar, placeCar: placeCar, driveCar: driveCar,
    spawnTraffic: spawnTraffic, spawnParked: spawnParked,
    updateTraffic: updateTraffic, all: all, traffic: traffic, parked: parked
  };
})();
