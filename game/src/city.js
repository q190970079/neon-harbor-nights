// Neon Harbor Nights — city.js
// Builds Verde Bay: road grid, sunset towers, beach, marina and pier.
// Exposes colliders (AABBs), road helpers and parking spots for the
// traffic, pedestrian and mission systems.
window.NHN = window.NHN || {};

NHN.city = (function () {
  var C = NHN.CONFIG;
  var colliders = [];      // {x0,z0,x1,z1} solid building footprints
  var curbSpots = [];      // kerbside parking spots {x,z,angle}
  var lotSpots = [];       // car-park spots {x,z,angle}
  var boats = [];
  var foam = [];
  var lampHeads = null;

  var roadsX = C.gridLines.slice();                       // avenues (run N-S)
  var roadsZ = C.gridLines.concat([C.boardwalkZ]);        // streets (run E-W)

  function isRoad(x, z) {
    var i;
    if (z > -162 && z < 182) {
      for (i = 0; i < roadsX.length; i++) if (Math.abs(x - roadsX[i]) <= C.roadHalf + 0.3) return true;
    }
    if (x > -162 && x < 162) {
      for (i = 0; i < roadsZ.length; i++) if (Math.abs(z - roadsZ[i]) <= C.roadHalf + 0.3) return true;
    }
    return false;
  }

  // Canvas facade: dark slab with a grid of lit/unlit windows.
  function facadeTexture(rand, base, litRatio) {
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
    var g = cv.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    for (var y = 10; y < 240; y += 18) {
      for (var x = 10; x < 118; x += 18) {
        var lit = rand() < litRatio;
        g.fillStyle = lit ? (rand() < 0.5 ? '#ffd98a' : '#aee6ff') : '#232433';
        g.fillRect(x, y, 11, 12);
      }
    }
    var tex = new THREE.CanvasTexture(cv);
    return tex;
  }

  function signTexture(text, bg, fg) {
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    var g = cv.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fg; g.fillText(text, 256, 68);
    return new THREE.CanvasTexture(cv);
  }

  function addCollider(x, z, w, d) {
    colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
  }

  // Circle-vs-AABB resolve: pushes (pos) out of every collider; returns true if hit.
  function collide(pos, radius) {
    var hit = false;
    for (var i = 0; i < colliders.length; i++) {
      var b = colliders[i];
      var nx = NHN.u.clamp(pos.x, b.x0, b.x1);
      var nz = NHN.u.clamp(pos.z, b.z0, b.z1);
      var dx = pos.x - nx, dz = pos.z - nz;
      var d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.0001) {
          var d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          // Centre inside the box: push out along the smallest penetration.
          var pl = pos.x - b.x0, pr = b.x1 - pos.x, pt = pos.z - b.z0, pb = b.z1 - pos.z;
          var m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = b.x0 - radius; else if (m === pr) pos.x = b.x1 + radius;
          else if (m === pt) pos.z = b.z0 - radius; else pos.z = b.z1 + radius;
        }
      }
    }
    return hit;
  }

  function box(w, h, d, mat, x, y, z, parent) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || NHN.city.scene).add(m);
    return m;
  }

  function build(scene, rand) {
    NHN.city.scene = scene;
    var asphalt = new THREE.MeshLambertMaterial({ color: C.asphalt });
    var walkMat = new THREE.MeshLambertMaterial({ color: C.sidewalk });
    var grassMat = new THREE.MeshLambertMaterial({ color: 0x3f6b3a });
    var sandMat = new THREE.MeshLambertMaterial({ color: C.sand });

    // Base ground (under everything) and beach/ocean strips.
    var base = new THREE.Mesh(new THREE.PlaneGeometry(760, 760),
      new THREE.MeshLambertMaterial({ color: 0x2e2a38 }));
    base.rotation.x = -Math.PI / 2; base.position.y = -0.08; base.receiveShadow = true;
    scene.add(base);

    var sand = new THREE.Mesh(new THREE.PlaneGeometry(760, 60), sandMat);
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, -0.02, C.beachZ + 18);
    sand.receiveShadow = true; scene.add(sand);

    var sea = new THREE.Mesh(new THREE.PlaneGeometry(760, 260),
      new THREE.MeshLambertMaterial({ color: C.water, transparent: true, opacity: 0.94 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.12, C.waterZ + 128);
    scene.add(sea);
    NHN.city.sea = sea;
    for (var f = 0; f < 3; f++) {
      var fm = new THREE.Mesh(new THREE.PlaneGeometry(760, 1.1),
        new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 0.5 }));
      fm.rotation.x = -Math.PI / 2; fm.position.set(0, 0.2, C.waterZ + f * 3.2);
      scene.add(fm); foam.push(fm);
    }

    // Sidewalk slabs then asphalt on top, for avenues and streets.
    function strip(cx, cz, w, l, vertical) {
      var sw = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? w : l, vertical ? l : w), walkMat);
      sw.rotation.x = -Math.PI / 2; sw.position.set(cx, 0.0, cz); sw.receiveShadow = true; scene.add(sw);
      var rd = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? w - 5.2 : l, vertical ? l : w - 5.2), asphalt);
      rd.rotation.x = -Math.PI / 2; rd.position.set(cx, 0.03, cz); rd.receiveShadow = true; scene.add(rd);
    }
    var i, j;
    for (i = 0; i < roadsX.length; i++) strip(roadsX[i], 8, C.walkHalf * 2, 348, true);
    for (i = 0; i < roadsZ.length; i++) {
      var zz = roadsZ[i];
      strip(0, zz, C.walkHalf * 2, 330, false);
    }

    // Dashed centre lines as one InstancedMesh.
    var dashGeo = new THREE.BoxGeometry(0.28, 0.04, 3.2);
    var dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c25a });
    var positions = [];
    for (i = 0; i < roadsX.length; i++)
      for (j = -160; j < 176; j += 8) positions.push([roadsX[i], j, true]);
    for (i = 0; i < roadsZ.length; i++)
      for (j = -158; j < 160; j += 8) positions.push([j, roadsZ[i], false]);
    var dashes = new THREE.InstancedMesh(dashGeo, dashMat, positions.length);
    var mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    for (i = 0; i < positions.length; i++) {
      e.set(0, positions[i][2] ? 0 : Math.PI / 2, 0); q.setFromEuler(e);
      mtx.compose(new THREE.Vector3(positions[i][0], 0.06, positions[i][1]), q, one);
      dashes.setMatrixAt(i, mtx);
    }
    scene.add(dashes);

    buildBlocks(rand);
    buildPalmsAndLamps(rand);
    buildPier(rand);
  }

  function buildBlocks(rand) {
    var scene = NHN.city.scene;
    var bases = ['#4a4258', '#5d4a4a', '#42525e', '#574a63'];
    var facades = [];
    for (var t = 0; t < 4; t++) {
      var tex = facadeTexture(rand, bases[t], 0.55);
      facades.push(new THREE.MeshLambertMaterial({ map: tex, emissive: 0xcc9955, emissiveMap: tex, emissiveIntensity: 0.55 }));
    }
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2733 });
    var L = C.gridLines;
    // Special blocks: hospital (0,0), police station (5,0), lockup (0,4).
    var special = { '0,0': 'hospital', '5,0': 'police', '0,4': 'lockup' };
    var parks = { '2,2': true, '4,1': true };
    var lots = { '3,3': true, '1,5': true };

    for (var bx = 0; bx < 6; bx++) {
      for (var bz = 0; bz < 6; bz++) {
        var x0 = L[bx] + C.walkHalf + 1, x1 = L[bx + 1] - C.walkHalf - 1;
        var z0 = L[bz] + C.walkHalf + 1, z1 = L[bz + 1] - C.walkHalf - 1;
        var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, key = bx + ',' + bz;

        if (special[key]) { buildSpecial(special[key], cx, cz, x1 - x0, rand); continue; }
        if (parks[key]) {
          var g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0),
            new THREE.MeshLambertMaterial({ color: 0x3f6b3a }));
          g.rotation.x = -Math.PI / 2; g.position.set(cx, 0.04, cz); g.receiveShadow = true; scene.add(g);
          continue;
        }
        if (lots[key]) {
          var lot = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0),
            new THREE.MeshLambertMaterial({ color: 0x3b3a44 }));
          lot.rotation.x = -Math.PI / 2; lot.position.set(cx, 0.04, cz); lot.receiveShadow = true; scene.add(lot);
          for (var s = 0; s < 6; s++) {
            lotSpots.push({ x: x0 + 5 + s * 4.4, z: cz - 6, angle: Math.PI });
            lotSpots.push({ x: x0 + 5 + s * 4.4, z: cz + 6, angle: 0 });
          }
          continue;
        }
        // Ordinary block: four towers on the quadrants, varied heights.
        var offs = [[-7.4, -7.4], [7.4, -7.4], [-7.4, 7.4], [7.4, 7.4]];
        for (var k = 0; k < 4; k++) {
          if (rand() < 0.14) continue; // occasional gap / courtyard
          var w = 11 + rand() * 3.5, d = 11 + rand() * 3.5;
          var h = 10 + Math.pow(rand(), 1.6) * 34;
          var bxPos = cx + offs[k][0], bzPos = cz + offs[k][1];
          var mat = facades[(rand() * facades.length) | 0];
          var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          b.position.set(bxPos, h / 2, bzPos);
          b.castShadow = true; b.receiveShadow = true;
          scene.add(b);
          var roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), roofMat);
          roof.position.set(bxPos, h + 0.25, bzPos); scene.add(roof);
          addCollider(bxPos, bzPos, w, d);
        }
      }
    }

    // Kerbside parking spots along a few avenues.
    var spotRand = NHN.u.rng(777);
    for (var a = 0; a < roadsX.length; a++) {
      for (var z = -150; z < 150; z += 15) {
        if (spotRand() < 0.42) {
          var side = spotRand() < 0.5 ? -1 : 1;
          curbSpots.push({ x: roadsX[a] + side * (C.roadHalf - 1.1), z: z + spotRand() * 5, angle: side > 0 ? Math.PI : 0 });
        }
      }
    }
  }

  function buildSpecial(kind, cx, cz, size, rand) {
    var scene = NHN.city.scene;
    var conf = {
      hospital: { at: C.hospital, label: 'VERDE BAY GENERAL', bg: '#e8e8f0', fg: '#c0272d', wall: 0xd8d5cc },
      police:   { at: C.policeStn, label: 'VBPD — CENTRAL', bg: '#26324e', fg: '#cfe2ff', wall: 0x707a8c },
      lockup:   { at: C.lockup, label: 'HARBOR LOCKUPS', bg: '#3a3a3a', fg: '#ffb36b', wall: 0x8c8578 }
    }[kind];
    var w = 24, d = 16, h = kind === 'lockup' ? 6 : 11;
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: conf.wall }));
    b.position.set(conf.at.x, h / 2, conf.at.z);
    b.castShadow = true; b.receiveShadow = true; scene.add(b);
    addCollider(conf.at.x, conf.at.z, w, d);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 5),
      new THREE.MeshBasicMaterial({ map: signTexture(conf.label, conf.bg, conf.fg) }));
    sign.position.set(conf.at.x, h + 1.2, conf.at.z + d / 2 + 0.3);
    scene.add(sign);
    if (kind === 'hospital') {
      var crossMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
      box(3.4, 1.1, 0.3, crossMat, conf.at.x, h - 2.4, conf.at.z + d / 2 + 0.2, scene);
      box(1.1, 3.4, 0.3, crossMat, conf.at.x, h - 2.4, conf.at.z + d / 2 + 0.2, scene);
    }
  }

  function buildPalmsAndLamps(rand) {
    var scene = NHN.city.scene;
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
    var crownMat = new THREE.MeshLambertMaterial({ color: 0x3e8e4f });
    var trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.6, 6);
    var crownGeo = new THREE.SphereGeometry(2.5, 7, 5);

    function palm(x, z) {
      var g = new THREE.Group();
      var trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 2.8; trunk.rotation.z = (rand() - 0.5) * 0.24;
      trunk.castShadow = true; g.add(trunk);
      var crown = new THREE.Mesh(crownGeo, crownMat);
      crown.scale.set(1.25, 0.5, 1.25); crown.position.y = 5.9; crown.castShadow = true; g.add(crown);
      g.position.set(x, 0, z);
      scene.add(g);
    }
    var i, x, z;
    for (i = 0; i < 46; i++) { // boardwalk + beach palms
      x = -155 + i * 6.8 + (rand() - 0.5) * 2;
      palm(x, C.boardwalkZ + 11 + (rand() - 0.5) * 2.5);
    }
    for (i = 0; i < 22; i++) { // park palms (inside the park block)
      palm(-35 + rand() * 24, -35 + rand() * 24);
    }
    for (i = 0; i < 10; i++) palm(60 + rand() * 70, 172 + rand() * 4);

    // Street lamps: instanced poles + emissive heads.
    var poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5);
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x3c3f4a });
    var headGeo = new THREE.SphereGeometry(0.32, 6, 5);
    var headMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    var spots = [];
    for (i = 0; i < roadsX.length; i++)
      for (z = -150; z < 168; z += 23) spots.push([roadsX[i] + ((z / 23) % 2 === 0 ? 7.4 : -7.4), z]);
    for (i = 0; i < roadsZ.length; i++)
      for (x = -150; x < 160; x += 23) spots.push([x, roadsZ[i] - 7.4]);
    var poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    var heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    var mtx = new THREE.Matrix4();
    for (i = 0; i < spots.length; i++) {
      mtx.makeTranslation(spots[i][0], 2.7, spots[i][1]); poles.setMatrixAt(i, mtx);
      mtx.makeTranslation(spots[i][0], 5.5, spots[i][1]); heads.setMatrixAt(i, mtx);
    }
    scene.add(poles); scene.add(heads);
    lampHeads = heads;
  }

  function buildPier(rand) {
    var scene = NHN.city.scene;
    var woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    var deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 44), woodMat);
    deck.position.set(C.marina.x, 0.55, (C.waterZ + C.pierEnd.z) / 2 + 4);
    deck.castShadow = true; deck.receiveShadow = true; scene.add(deck);
    addCollider(C.marina.x - 6.4, C.pierEnd.z - 10, 1.2, 60); // water guards either side
    addCollider(C.marina.x + 6.4, C.pierEnd.z - 10, 1.2, 60);
    // Marina docks + moored boats.
    var hullMat = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
    var cabinMat = new THREE.MeshLambertMaterial({ color: 0x38618c });
    for (var i = 0; i < 5; i++) {
      var bx = 58 + i * 17, bz = 202 + (i % 2) * 9;
      var boat = new THREE.Group();
      var hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 7.5), hullMat);
      hull.position.y = 0.5; boat.add(hull);
      var cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.6), cabinMat);
      cab.position.set(0, 1.5, -0.6); boat.add(cab);
      boat.position.set(bx, 0.1, bz);
      boat.rotation.y = (rand() - 0.5) * 0.4;
      scene.add(boat); boats.push(boat);
    }
    // Crates and barriers around the marina apron.
    var crateMat = new THREE.MeshLambertMaterial({ color: 0xa8793f });
    for (i = 0; i < 12; i++) {
      var cx = 66 + rand() * 52, cz = 168 + rand() * 8;
      box(1.6, 1.6, 1.6, crateMat, cx, 0.8, cz, scene);
    }
    // "VERDE BAY" welcome sign on the boardwalk.
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5),
      new THREE.MeshBasicMaterial({ map: signTexture('VERDE BAY', '#20304a', '#ffd98a'), side: THREE.DoubleSide }));
    sign.position.set(-30, 6.5, C.boardwalkZ + 9); scene.add(sign);
    box(0.4, 6.5, 0.4, new THREE.MeshLambertMaterial({ color: 0x444444 }), -42, 3.25, C.boardwalkZ + 9, scene);
    box(0.4, 6.5, 0.4, new THREE.MeshLambertMaterial({ color: 0x444444 }), -18, 3.25, C.boardwalkZ + 9, scene);
    // Hotel billboard.
    var bb = new THREE.Mesh(new THREE.PlaneGeometry(18, 9),
      new THREE.MeshBasicMaterial({ map: signTexture('HOTEL AZURE', '#5a2a6e', '#ffe9a8'), side: THREE.DoubleSide }));
    bb.position.set(120, 15, -60); bb.rotation.y = Math.PI / 2; scene.add(bb);
  }

  function update(dt, t) {
    for (var i = 0; i < foam.length; i++) {
      foam[i].position.z = C.waterZ + i * 3.2 + Math.sin(t * 0.7 + i) * 0.8;
      foam[i].material.opacity = 0.32 + 0.18 * Math.sin(t * 0.9 + i * 2);
    }
    for (var b = 0; b < boats.length; b++) {
      boats[b].position.y = 0.1 + Math.sin(t * 0.8 + b * 1.7) * 0.14;
      boats[b].rotation.z = Math.sin(t * 0.6 + b) * 0.03;
    }
  }

  return {
    build: build, update: update, collide: collide, isRoad: isRoad,
    colliders: colliders, curbSpots: curbSpots, lotSpots: lotSpots,
    roadsX: roadsX, roadsZ: roadsZ
  };
})();
