// Neon Harbor Nights — missions.js
// Sana's campaign: five jobs that walk Milo from broke wheelman to
// the crew's go-to driver. A step machine with beacons, timers,
// payouts and story subtitles; free roam continues after the finale.
window.NHN = window.NHN || {};

NHN.missions = (function () {
  var C = NHN.CONFIG;
  var index = 5;          // current mission; 5 = campaign finished / not started
  var step = 0;
  var started = false;
  var timeLeft = -1;      // countdown for timed steps, -1 = none
  var beacon = null, beaconTop = null, carMarker = null;
  var sana = null;
  var kestrel = null;     // the marked sports car of mission 2
  var van = null;         // the crew van of mission 5
  var scene = null;

  function say(who, text) { NHN.hud.showSubtitle(who, text); }
  function playerNear(x, z, r) {
    var s = NHN.state;
    return NHN.u.dist(s.px, s.pz, x, z) < r;
  }
  function driving(car) { return NHN.state.driving === car; }

  var MISSIONS = [
    {
      title: 'First Contact',
      steps: [{
        objective: 'Meet Sana at the marina',
        target: function () { return C.marina; },
        radius: 4.5,
        check: function () { return playerNear(C.marina.x, C.marina.z, 4.5); },
        enter: function () { say('Sana', 'Milo. You came. Verde Bay eats drivers alive — let me feed you some work instead.'); },
        done: function () { say('Sana', 'A collector owes me a Kestrel GT. It is parked uptown. Take it, bring it to my lockup. Quietly, ideally.'); }
      }],
      pay: 150
    },
    {
      title: 'Grand Tour',
      steps: [
        {
          objective: 'Steal the marked Kestrel GT',
          target: function () { return kestrel ? { x: kestrel.x, z: kestrel.z } : null; },
          check: function () { return driving(kestrel); },
          enter: function () { say('Sana', 'Gold marker, orange paint. The owner will notice — expect company.'); },
          done: function () { say('Milo', 'Got it. Now the lockup, before every cop in the bay wakes up.'); }
        },
        {
          objective: 'Deliver the Kestrel GT to the lockup',
          target: function () { return { x: C.lockup.x, z: C.lockup.z + 13 }; },
          radius: 7,
          check: function () { return driving(kestrel) && playerNear(C.lockup.x, C.lockup.z + 13, 7); },
          done: function () { say('Sana', 'Clean work. You just made the bay a little more mine.'); }
        }
      ],
      pay: 800
    },
    {
      title: 'Checkpoint City',
      steps: [
        {
          objective: 'Checkpoint dash — hit every beacon',
          checkpoints: [{ x: 0, z: -92 }, { x: 92, z: 0 }, { x: 0, z: 92 }, { x: -92, z: 0 }],
          cpIndex: 0, time: 85,
          target: function () { return this.checkpoints[this.cpIndex]; },
          check: function () { return false; }, // handled in update()
          enter: function () { say('Sana', 'A courier route, timed. Prove the city is yours, Milo.'); },
          done: function () { say('Sana', 'Fast and tidy. The crews are starting to ask your name.'); }
        }
      ],
      pay: 600
    },
    {
      title: 'Heat',
      steps: [{
        objective: 'Lose the police — break line of sight and stay hidden',
        target: function () { return null; },
        check: function () { return NHN.police.level === 0; },
        enter: function () {
          NHN.police.setLevel(3);
          say('Sana', 'Change of plans — you are hot. Three stars hot. Vanish, Milo.');
        },
        done: function () { say('Sana', 'Gone like a rumour. One last job, and it is the big one.'); }
      }],
      pay: 700
    },
    {
      title: 'Pier Pressure',
      steps: [
        {
          objective: 'Take the crew van at the marina',
          target: function () { return van ? { x: van.x, z: van.z } : null; },
          check: function () { return driving(van); },
          enter: function () {
            NHN.police.setLevel(2);
            say('Sana', 'The van is loaded and the bay is watching. Two pickups, then the pier. Go.');
          },
          done: function () { say('Milo', 'Van rolling. Pickups next.'); }
        },
        {
          objective: 'Collect the west boardwalk pickup',
          target: function () { return { x: -46, z: C.boardwalkZ }; },
          radius: 7,
          check: function () { return driving(van) && playerNear(-46, C.boardwalkZ, 7); },
          done: function () { NHN.audio.sfx.pickup(); say('Crew', 'Package one aboard. East side, fast.'); }
        },
        {
          objective: 'Collect the east-side pickup',
          target: function () { return { x: 138, z: 46 }; },
          radius: 7,
          check: function () { return driving(van) && playerNear(138, 46, 7); },
          enter: function () { NHN.police.setLevel(3); },
          done: function () { NHN.audio.sfx.pickup(); say('Crew', 'Package two aboard. Pier. Now.'); }
        },
        {
          objective: 'Reach the getaway point at the end of the pier',
          target: function () { return C.pierEnd; },
          radius: 7,
          check: function () { return playerNear(C.pierEnd.x, C.pierEnd.z, 7); },
          enter: function () { NHN.police.setLevel(4); say('Sana', 'Every light in the bay is behind you. Bring it home, Milo.'); },
          done: function () { say('Sana', 'That is how legends start in Verde Bay. The city is yours now — keep it loud.'); }
        }
      ],
      pay: 2000
    }
  ];

  function currentStep() {
    if (index < 0 || index >= MISSIONS.length) return null;
    return MISSIONS[index].steps[step];
  }

  function enterStep() {
    var st = currentStep();
    timeLeft = st && st.time ? st.time : -1;
    if (st && st.enter) st.enter();
  }

  function startCampaign() {
    started = true;
    index = 0; step = 0;
    enterStep();
  }

  function advance() {
    var m = MISSIONS[index];
    var st = m.steps[step];
    if (st.done) st.done();
    step++;
    if (step >= m.steps.length) {
      NHN.state.addCash(m.pay);
      NHN.audio.sfx.jingle();
      NHN.hud.showBanner('JOB DONE — ' + m.title + '  +$' + m.pay);
      index++; step = 0;
      if (index >= MISSIONS.length) {
        NHN.hud.showBanner('CAMPAIGN COMPLETE — Verde Bay is yours');
        NHN.state.campaignDone = true;
        return;
      }
    }
    enterStep();
    NHN.state.save();
  }

  function failTimed() {
    var st = currentStep();
    say('Sana', 'Too slow. The route is still there — run it again.');
    st.cpIndex = 0;
    timeLeft = st.time;
  }

  function update(dt) {
    // Beacon follows the current target.
    var st = currentStep();
    var tgt = st && st.target ? st.target() : null;
    if (beacon) {
      if (tgt && started) {
        beacon.visible = true;
        beacon.position.set(tgt.x, 9, tgt.z);
        beaconTop.position.set(tgt.x, 19 + Math.sin(performance.now() * 0.004) * 0.8, tgt.z);
        beaconTop.visible = true;
        beaconTop.rotation.y += dt * 2;
      } else { beacon.visible = false; beaconTop.visible = false; }
    }
    if (carMarker) {
      if (index === 1 && step === 0 && kestrel && !kestrel.dead) {
        carMarker.visible = true;
        carMarker.position.set(kestrel.x, 3.4 + Math.sin(performance.now() * 0.005) * 0.3, kestrel.z);
        carMarker.rotation.y += dt * 3;
      } else carMarker.visible = false;
    }
    if (!started || !st) return;

    // Timed checkpoint step is driven here rather than by check().
    if (st.checkpoints) {
      timeLeft -= dt;
      if (timeLeft <= 0) { failTimed(); return; }
      var cp = st.checkpoints[st.cpIndex];
      if (playerNear(cp.x, cp.z, 8)) {
        NHN.audio.sfx.chime();
        st.cpIndex++;
        NHN.hud.showBanner('CHECKPOINT ' + st.cpIndex + ' / ' + st.checkpoints.length);
        if (st.cpIndex >= st.checkpoints.length) { advance(); }
      }
      return;
    }
    if (st.check && st.check()) advance();
  }

  function objectiveText() {
    var st = currentStep();
    if (!started) return 'Head to the marina and meet Sana';
    if (!st) return 'Free roam — Verde Bay is yours';
    var t = 'JOB ' + (index + 1) + ' · ' + MISSIONS[index].title + ': ' + st.objective;
    if (st.checkpoints) t += '  (' + st.cpIndex + '/' + st.checkpoints.length + ')';
    return t;
  }

  function target() {
    var st = currentStep();
    if (!started) return C.marina;
    return st && st.target ? st.target() : null;
  }

  // Debug/shot helper: jump straight to a mission step.
  function force(i, s) {
    started = true;
    index = i; step = s || 0;
    enterStep();
  }

  function init(sc) {
    scene = sc;
    // Beacon: translucent gold pillar + spinning diamond cap.
    var geo = new THREE.CylinderGeometry(1.6, 1.6, 18, 12, 1, true);
    var mat = new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    beacon = new THREE.Mesh(geo, mat);
    beacon.visible = false; scene.add(beacon);
    beaconTop = new THREE.Mesh(new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffc94d }));
    beaconTop.visible = false; scene.add(beaconTop);
    carMarker = new THREE.Mesh(new THREE.OctahedronGeometry(0.8),
      new THREE.MeshBasicMaterial({ color: 0xffa726 }));
    carMarker.visible = false; scene.add(carMarker);

    // Sana waits at the marina in a coral jacket.
    var sp = NHN.people.makePerson(0xff6f61, 0x22303c, 0xc68642);
    sp.group.position.set(C.marina.x, 0, C.marina.z);
    sp.group.rotation.y = Math.PI;
    scene.add(sp.group);
    sana = { x: C.marina.x, z: C.marina.z, person: sp };

    // The marked Kestrel GT, parked uptown on avenue 46.
    kestrel = NHN.vehicles.makeCar('kestrel', 0xe8762a);
    kestrel.mode = 'parked';
    scene.add(kestrel.group);
    NHN.vehicles.placeCar(kestrel, 46 - (C.roadHalf - 1.1), -30, Math.PI);
    NHN.vehicles.parked.push(kestrel);

    // The crew van, waiting on the marina apron.
    van = NHN.vehicles.makeCar('van', 0x4a6b8a);
    van.mode = 'parked';
    scene.add(van.group);
    NHN.vehicles.placeCar(van, 70, 168, Math.PI / 2);
    NHN.vehicles.parked.push(van);
  }

  return {
    init: init, update: update, startCampaign: startCampaign,
    objectiveText: objectiveText, target: target, force: force,
    get sana() { return sana; },
    kestrel: function () { return kestrel; }, van: function () { return van; },
    get index() { return index; },
    get started() { return started; },
    get timeLeft() { return timeLeft; },
    setState: function (i) {
      index = i; step = 0; started = true;
      if (i < MISSIONS.length) enterStep();
    }
  };
})();
