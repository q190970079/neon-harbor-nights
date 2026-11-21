// Neon Harbor Nights — people.js
// Low-poly person factory plus the sidewalk crowd: wandering
// pedestrians who stroll the pavements and scatter from danger.
window.NHN = window.NHN || {};

NHN.people = (function () {
  var C = NHN.CONFIG;
  var crowd = [];

  function makePerson(shirt, pants, skin) {
    var g = new THREE.Group();
    var shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    var pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    var skinMat = new THREE.MeshLambertMaterial({ color: skin });

    var legGeo = new THREE.BoxGeometry(0.17, 0.78, 0.2);
    var legL = new THREE.Mesh(legGeo, pantsMat); legL.position.set(-0.13, 0.39, 0);
    var legR = new THREE.Mesh(legGeo, pantsMat); legR.position.set(0.13, 0.39, 0);
    legL.castShadow = legR.castShadow = true;
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.28), shirtMat);
    torso.position.y = 1.09; torso.castShadow = true;
    var armGeo = new THREE.BoxGeometry(0.13, 0.6, 0.16);
    var armL = new THREE.Mesh(armGeo, shirtMat); armL.position.set(-0.34, 1.12, 0);
    var armR = new THREE.Mesh(armGeo, shirtMat); armR.position.set(0.34, 1.12, 0);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), skinMat);
    head.position.y = 1.58; head.castShadow = true;
    g.add(legL, legR, torso, armL, armR, head);
    return { group: g, legL: legL, legR: legR, armL: armL, armR: armR, phase: Math.random() * 6 };
  }

  // Animate limbs for a walking person; amp scales with speed.
  function animateWalk(p, t, speed01) {
    var s = Math.sin(t * (6 + speed01 * 5) + p.phase) * (0.25 + speed01 * 0.45);
    p.legL.rotation.x = s; p.legR.rotation.x = -s;
    p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8;
  }

  function sidewalkTarget(rand) {
    // A point on a random pavement: beside an avenue or a street.
    var lines = NHN.city.roadsX.concat(NHN.city.roadsZ);
    var line = NHN.u.pick(rand, lines);
    var side = rand() < 0.5 ? -1 : 1;
    var off = C.roadHalf + 2.1;
    if (rand() < 0.5) return { x: line + side * off, z: -155 + rand() * 320 };
    return { x: -155 + rand() * 315, z: line + side * off };
  }

  function spawnCrowd(scene, count, rand) {
    for (var i = 0; i < count; i++) {
      var p = makePerson(NHN.u.pick(rand, C.shirtColors), NHN.u.pick(rand, C.pantsColors),
                         NHN.u.pick(rand, C.skinColors));
      var start = sidewalkTarget(rand);
      p.x = start.x; p.z = start.z;
      p.tx = start.x; p.tz = start.z;
      p.speed = 1.1 + rand() * 0.9;
      p.angle = rand() * Math.PI * 2;
      p.state = 'walk'; // walk | flee | down
      p.fleeT = 0;
      p.group.position.set(p.x, 0, p.z);
      scene.add(p.group);
      crowd.push(p);
    }
  }

  function update(dt, t, ctx, rand) {
    var danger = ctx.danger; // {x,z,r,speed} — fast car / gunfire / player sprinting car
    for (var i = 0; i < crowd.length; i++) {
      var p = crowd[i];
      if (p.state === 'down') continue;
      var dx = p.tx - p.x, dz = p.tz - p.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var speed = p.speed;

      if (danger && NHN.u.dist(p.x, p.z, danger.x, danger.z) < danger.r) {
        p.state = 'flee'; p.fleeT = 1.6;
      }
      if (p.state === 'flee') {
        p.fleeT -= dt;
        var ax = p.x - danger.x, az = p.z - danger.z;
        var ad = Math.sqrt(ax * ax + az * az) || 1;
        dx = ax / ad; dz = az / ad; d = 10; speed = 4.6;
        if (p.fleeT <= 0) { p.state = 'walk'; var nt = sidewalkTarget(rand); p.tx = nt.x; p.tz = nt.z; }
      } else if (d < 1.2) {
        var t2 = sidewalkTarget(rand); p.tx = t2.x; p.tz = t2.z;
        dx = p.tx - p.x; dz = p.tz - p.z; d = Math.sqrt(dx * dx + dz * dz) || 1;
      }
      if (d > 0.01) {
        var vx = (dx / d) * speed, vz = (dz / d) * speed;
        var pos = { x: p.x + vx * dt, z: p.z + vz * dt };
        NHN.city.collide(pos, 0.4);
        p.x = NHN.u.clamp(pos.x, -165, 165);
        p.z = NHN.u.clamp(pos.z, -165, 190);
        p.angle = NHN.u.angleLerp(p.angle, Math.atan2(vx, vz), 0.18);
      }
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = p.angle;
      animateWalk(p, t, speed / 5);
      // Hit by a fast-moving car?
      if (ctx.trafficHit) {
        var hitCar = ctx.trafficHit(p.x, p.z);
        if (hitCar) knockDown(p);
      }
    }
  }

  function knockDown(p) {
    if (p.state === 'down') return;
    p.state = 'down';
    p.group.rotation.x = -Math.PI / 2;
    p.group.position.y = 0.25;
    if (NHN.onPedDown) NHN.onPedDown(p);
  }

  function reviveAll() {
    for (var i = 0; i < crowd.length; i++) {
      var p = crowd[i];
      if (p.state === 'down') {
        p.state = 'walk'; p.group.rotation.x = 0; p.group.position.y = 0;
      }
    }
  }

  return {
    makePerson: makePerson, animateWalk: animateWalk,
    spawnCrowd: spawnCrowd, update: update,
    knockDown: knockDown, reviveAll: reviveAll, crowd: crowd
  };
})();
