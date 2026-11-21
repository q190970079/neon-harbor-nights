// Neon Harbor Nights — hud.js
// DOM heads-up display: health, cash, stars, objective, prompts,
// subtitles, banners — plus the canvas minimap.
window.NHN = window.NHN || {};

NHN.hud = (function () {
  var el = {};
  var subTimer = 0;
  var mapCtx = null;

  function grab(id) { return document.getElementById(id); }

  function init() {
    ['hud', 'minimap', 'stars', 'cash', 'healthFill', 'objective', 'prompt',
     'speedo', 'ammo', 'subtitle', 'banner', 'bustWrap', 'bustFill', 'timer',
     'carName'].forEach(function (id) { el[id] = grab(id); });
    if (el.minimap) mapCtx = el.minimap.getContext('2d');
  }

  function showSubtitle(who, text) {
    if (!el.subtitle) return;
    el.subtitle.innerHTML = '<b>' + who + ':</b> ' + text;
    el.subtitle.style.opacity = '1';
    subTimer = 5.5;
  }

  function showBanner(text) {
    if (!el.banner) return;
    el.banner.textContent = text;
    el.banner.style.opacity = '1';
    el.banner.style.transform = 'translate(-50%, 0)';
    setTimeout(function () {
      el.banner.style.opacity = '0';
      el.banner.style.transform = 'translate(-50%, -12px)';
    }, 2600);
  }

  function setPrompt(text) {
    if (!el.prompt) return;
    if (text) { el.prompt.textContent = text; el.prompt.style.opacity = '1'; }
    else el.prompt.style.opacity = '0';
  }

  function update(dt) {
    var s = NHN.state;
    if (!s || !el.cash) return;
    if (subTimer > 0) { subTimer -= dt; if (subTimer <= 0) el.subtitle.style.opacity = '0'; }

    el.cash.textContent = '$' + Math.max(0, Math.floor(s.cash)).toLocaleString('en-US');
    var stars = '';
    for (var i = 0; i < 5; i++) stars += i < NHN.police.level ? '★' : '☆';
    el.stars.textContent = stars;
    el.stars.style.opacity = NHN.police.level > 0 ? '1' : '0.25';
    el.healthFill.style.width = NHN.u.clamp(s.health, 0, 100) + '%';
    el.healthFill.style.background = s.health > 35 ? 'linear-gradient(90deg,#37d67a,#7be495)' : 'linear-gradient(90deg,#d63a37,#e47b7b)';
    el.objective.textContent = NHN.missions.objectiveText();

    var tl = NHN.missions.timeLeft;
    if (tl >= 0) {
      el.timer.style.display = 'block';
      el.timer.textContent = '⏱ ' + Math.ceil(tl) + 's';
      el.timer.style.color = tl < 12 ? '#ff5a4d' : '#ffd98a';
    } else el.timer.style.display = 'none';

    if (s.mode === 'drive' && s.driving) {
      el.speedo.style.display = 'block';
      el.speedo.innerHTML = Math.round(Math.abs(s.driving.speed) * 3.6) + '<small> km/h</small>';
      el.carName.style.display = 'block';
      el.carName.textContent = s.driving.spec.name + (s.driving.stolen ? '  ·  STOLEN' : '');
    } else {
      el.speedo.style.display = 'none';
      el.carName.style.display = 'none';
    }
    if (s.mode === 'foot') {
      el.ammo.style.display = 'block';
      el.ammo.textContent = 'PISTOL  ' + s.ammo + ' / ' + s.reserve;
    } else el.ammo.style.display = 'none';

    var b = NHN.police.bust01;
    el.bustWrap.style.display = b > 0.02 ? 'block' : 'none';
    if (b > 0.02) el.bustFill.style.width = (b * 100) + '%';

    drawMinimap();
  }

  function drawMinimap() {
    if (!mapCtx) return;
    var s = NHN.state;
    var g = mapCtx, S = 180, half = 95; // world units visible each way
    var scale = (S / 2) / half;
    g.fillStyle = '#1d1830';
    g.fillRect(0, 0, S, S);
    function px(x) { return S / 2 + (x - s.px) * scale; }
    function pz(z) { return S / 2 + (z - s.pz) * scale; }

    // Water + beach at the south edge.
    g.fillStyle = '#1d5f74';
    g.fillRect(0, pz(NHN.CONFIG.waterZ), S, S - pz(NHN.CONFIG.waterZ));
    g.fillStyle = '#d9b078';
    g.fillRect(0, pz(NHN.CONFIG.beachZ), S, Math.max(0, pz(NHN.CONFIG.waterZ) - pz(NHN.CONFIG.beachZ)));

    // Roads.
    g.strokeStyle = '#4a4658'; g.lineWidth = Math.max(2, NHN.CONFIG.roadHalf * 2 * scale * 0.8);
    var i, lines = NHN.city.roadsX;
    g.beginPath();
    for (i = 0; i < lines.length; i++) { g.moveTo(px(lines[i]), 0); g.lineTo(px(lines[i]), S); }
    lines = NHN.city.roadsZ;
    for (i = 0; i < lines.length; i++) { g.moveTo(0, pz(lines[i])); g.lineTo(S, pz(lines[i])); }
    g.stroke();

    // Traffic + parked cars.
    g.fillStyle = '#cfd4dc';
    var cars = NHN.vehicles.all;
    for (i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (c.isPolice || c === s.driving || c.dead) continue;
      g.fillRect(px(c.x) - 1.5, pz(c.z) - 1.5, 3, 3);
    }
    // Police — flashing blue.
    var flash = Math.sin(performance.now() * 0.012) > 0;
    g.fillStyle = flash ? '#3a86ff' : '#ff3b30';
    var pc = NHN.police.cars;
    for (i = 0; i < pc.length; i++) {
      if (pc[i].dead) continue;
      g.beginPath(); g.arc(px(pc[i].x), pz(pc[i].z), 3, 0, 7); g.fill();
    }
    // Mission target.
    var tgt = NHN.missions.target();
    if (tgt) {
      g.fillStyle = '#ffc94d';
      g.beginPath();
      var tx = px(tgt.x), tz = pz(tgt.z);
      g.moveTo(tx, tz - 6); g.lineTo(tx + 4.5, tz + 3.5); g.lineTo(tx - 4.5, tz + 3.5);
      g.closePath(); g.fill();
    }
    // Player arrow (map is north-up: canvas rotation is PI - heading).
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(Math.PI - (s.facing || 0));
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(4.6, 5); g.lineTo(0, 2.4); g.lineTo(-4.6, 5);
    g.closePath(); g.fill();
    g.restore();
  }

  return { init: init, update: update, showSubtitle: showSubtitle,
           showBanner: showBanner, setPrompt: setPrompt };
})();
