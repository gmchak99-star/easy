(function () {
  'use strict';
  var S = window.SITE;
  var byKey = {}, partById = {};
  S.pages.forEach(function (p) { byKey[p.key] = p; });
  S.parts.forEach(function (p) { partById[p.id] = p; });

  var STAGES = [
    { n: 1, name: '우리말 비교', desc: '우리말은 이렇게, 영어는 이렇게 — 두 말의 생각 차이를 먼저 비교해요.' },
    { n: 2, name: '리뷰', desc: '방금 배운 원리를 다시 짚어요. 핵심만 눈으로 보며 들어요.' },
    { n: 3, name: 'Practice', desc: '소리 내어 따라 말하며 연습해요. 멈추고 직접 말해 보세요.' }
  ];

  /* ---------- storage ---------- */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var REPEATS = [1, 2, 3, 5, 10, 20, 30, 50, 100];
  var SLEEPS = [0, 15, 30, 60, 90];
  function pageTitle(p) { return '원리 ' + p.num + ' ' + p.title; }
  function stageName(n) { return STAGES[n - 1].n + '. ' + STAGES[n - 1].name; }
  function fmt(t) { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }

  /* ---------- state ---------- */
  var st = {
    key: null, stage: null, units: [], u: 0, played: 0, wantPlay: false,
    speed: LS.get('pr_speed', 1),
    repeat: LS.get('pr_repeat', 1),   // 0 = infinite
    loop: LS.get('pr_loop', false),
    en: LS.get('pr_en', false),       // 영어 음성만 재생(한국어 구간 건너뜀)
    auto: LS.get('pr_auto', true),
    compact: LS.get('pr_compact', null),
    sleepMin: 0, sleepEnd: 0,
    viewKey: null
  };
  if (st.compact === null) st.compact = window.innerWidth < 760;
  var audio = new Audio();
  audio.preload = 'auto';
  try { audio.preservesPitch = true; audio.webkitPreservesPitch = true; audio.mozPreservesPitch = true; } catch (e) {}
  var timer = null, pendingStart = null, sleepTimer = null;

  /* ---------- navigation ---------- */
  function renderToc() {
    var h = '<button id="tocClose" class="toc-close" type="button">✕ 목차 숨기기</button>';
    S.parts.forEach(function (part) {
      h += '<div class="tp">' + esc(part.title) + '</div>';
      S.pages.filter(function (p) { return p.part === part.id; }).forEach(function (p) {
        h += '<a href="#' + p.key + '" data-key="' + p.key + '"><b>' + p.num + '</b>' + esc(p.title) + '</a>';
      });
    });
    h += '<div class="offline"><div>비행기 모드나 데이터 없이 들으려면 음성을 저장해 두세요.</div>' +
      '<button class="chip" id="offBtn" type="button">음성 전부 오프라인 저장</button> <span id="offMsg"></span></div>';
    $('toc').innerHTML = h;
  }
  function markToc() {
    var links = $('toc').querySelectorAll('a[data-key]');
    for (var i = 0; i < links.length; i++) {
      var k = links[i].getAttribute('data-key');
      links[i].classList.toggle('on', k === st.viewKey);
      var dot = links[i].querySelector('.dot');
      if (dot) dot.remove();
      if (k === st.key) { var d = document.createElement('span'); d.className = 'dot'; d.title = '재생 중인 페이지'; links[i].appendChild(d); }
    }
  }

  function renderPage(key) {
    var p = byKey[key] || S.pages[0];
    st.viewKey = p.key;
    var part = partById[p.part];
    var last = LS.get('pr_last', null);
    var h = '';
    if (last && byKey[last.key] && !st.key) {
      var lp = byKey[last.key];
      h += '<div class="resume"><span>이어서 듣기 · <b>' + esc(pageTitle(lp)) + '</b> · ' + stageName(last.stage) + '</span>' +
        '<button class="chip" id="resumeBtn">이어서 재생</button></div>';
    }
    h += '<p class="partname">' + esc(part.title) + '</p>';
    h += '<header class="ph"><span class="no">원리 ' + p.num + '</span></header>';
    h += '<h1 class="title-big">' + esc(p.title) + '</h1>';
    h += '<div class="audiobar"><button class="kotgl" id="enTgl" aria-pressed="false">🔊 영어만 듣기</button><button class="kotgl" id="txTgl" aria-pressed="false">글자 가리기</button></div>';
    p.stages.forEach(function (sg, i) {
      var S0 = STAGES[i];
      h += '<section class="stage" data-stage="' + S0.n + '"><div class="sh"><h2><span class="sn">' + S0.n + '</span>' + esc(S0.name) + '</h2>';
      h += sg.a ? '<button class="abtn" data-stage="' + S0.n + '" aria-label="' + esc(S0.name) + ' 음성 재생">▶ 재생</button>'
                : '<button class="abtn" disabled>음성 준비 중</button>';
      h += '</div><p class="sdesc">' + esc(S0.desc) + '</p>';
      if (sg.t.length) {
        h += '<ul class="seg">';
        sg.t.forEach(function (r, ri) {
          h += '<li data-stage="' + S0.n + '" data-i="' + ri + '"><span class="tm">' + fmt(r[0]) + '</span><span class="tx">' + esc(r[2]) + '</span></li>';
        });
        h += '</ul>';
      } else {
        h += '<p class="empty">' + (sg.a ? '텍스트를 아직 불러오지 않았어요. 음성은 위 버튼으로 들을 수 있어요.' : '음성과 텍스트를 준비하고 있어요.') + '</p>';
      }
      h += '</section>';
    });
    var idx = S.pages.indexOf(p);
    h += '<div class="pager nextlink">' +
      (idx > 0 ? '<a href="#' + S.pages[idx - 1].key + '">← ' + esc(pageTitle(S.pages[idx - 1])) + '</a>' : '<span></span>') +
      (idx < S.pages.length - 1 ? '<a href="#' + S.pages[idx + 1].key + '">' + esc(pageTitle(S.pages[idx + 1])) + ' →</a>' : '<span></span>') + '</div>';
    $('content').innerHTML = h;
    window.scrollTo(0, 0);
    markToc();
    setToc(false);
    LS.set('pr_view', p.key);
    applyHide();
    applyEnBtn();
    highlight();
  }

  function route() {
    var k = (location.hash || '').replace('#', '');
    renderPage(byKey[k] ? k : LS.get('pr_view', 'r01'));
  }

  /* ---------- units / positions ---------- */
  // 텍스트(문장 구간)가 있으면 문장 단위, 없으면 음성 전체를 한 덩어리로 재생
  function buildUnits(key, stage) {
    var sg = byKey[key].stages[stage - 1];
    if (!sg.a) return [];
    if (sg.t.length) {
      var all = sg.t.map(function (r, i) { return { i: i, s: r[0], e: r[1], text: r[2] }; });
      if (st.en) {
        var onlyEn = all.filter(function (u) { return !/[가-힣]/.test(u.text); });
        if (onlyEn.length) return onlyEn;
      }
      return all;
    }
    return [{ i: 0, s: 0, e: Infinity, text: STAGES[stage - 1].name + ' (전체 음성)' }];
  }
  function unitIndexFor(units, i) {   // 문장 번호 i 이상 중 가장 가까운 재생 구간
    for (var k = 0; k < units.length; k++) if (units[k].i >= i) return k;
    return Math.max(0, units.length - 1);
  }
  function posMap() { return LS.get('pr_pos', {}); }
  function savePos() {
    if (!st.key) return;
    var m = posMap(); m[st.key + '|' + st.stage + (st.en ? '|en' : '')] = st.u; LS.set('pr_pos', m);
    LS.set('pr_last', { key: st.key, stage: st.stage, u: st.u });
  }
  function audioSrc(key, stage) { return 'audio/' + byKey[key].num + '_' + stage + '.mp3'; }

  /* ---------- playback core ---------- */
  function applyRate() { audio.defaultPlaybackRate = st.speed; audio.playbackRate = st.speed; }
  function seek(t) {
    if (audio.readyState >= 1) { try { audio.currentTime = t; } catch (e) {} }
    else { pendingStart = t; }
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    if (!st.units.length || audio.paused) return;
    var un = st.units[st.u];
    if (un.e === Infinity) return;
    var ms = Math.max(30, ((un.e - audio.currentTime) / st.speed) * 1000 + 15);
    timer = setTimeout(check, ms);
  }
  function check() {
    if (!st.units.length || audio.paused) return;
    var un = st.units[st.u];
    if (un.e !== Infinity && audio.currentTime >= un.e - 0.02) advance(); else schedule();
  }
  function jump(u) {              // 같은 음성 안에서 u번째 구간으로
    st.u = u;
    seek(st.units[u].s);
    if (audio.paused && st.wantPlay) play();
  }
  function goUnit(u) {
    st.played = 0;
    jump(u);
    updateUI(); savePos();
  }
  function nextTarget() {          // 다음 재생할 (페이지, 단계). 없으면 null
    var key = st.key, stage = st.stage;
    for (var guard = 0; guard < 100; guard++) {
      if (stage < 3) stage++;
      else {
        var idx = S.pages.indexOf(byKey[key]);
        if (idx + 1 >= S.pages.length) return null;
        key = S.pages[idx + 1].key; stage = 1;
      }
      if (byKey[key].stages[stage - 1].a) return { key: key, stage: stage };
    }
    return null;
  }
  function goNextStage(fromAuto) {
    var t = nextTarget();
    if (!t) return false;
    var follow = (st.viewKey === st.key);
    var was = st.wantPlay || fromAuto;
    load(t.key, t.stage, 0, was);
    if (follow && location.hash !== '#' + t.key) location.hash = '#' + t.key;
    toast('다음 단계로 넘어갔어요 · ' + pageTitle(byKey[t.key]) + ' · ' + stageName(t.stage));
    return true;
  }
  function advance() {
    var target = st.repeat === 0 ? Infinity : st.repeat;
    st.played++;
    if (st.played < target) { jump(st.u); updateUI(); return; }
    st.played = 0;
    if (st.u + 1 < st.units.length) { jump(st.u + 1); updateUI(); savePos(); return; }
    if (st.loop) { jump(0); updateUI(); savePos(); return; }
    if (st.auto && goNextStage(true)) return;
    st.wantPlay = false; audio.pause(); st.u = 0; savePos(); seek(st.units[0].s); updateUI();
    toast('끝까지 들었어요.');
  }
  function play() {
    st.wantPlay = true;
    applyRate();
    var pr = audio.play();
    if (pr && pr.catch) pr.catch(function () { updateUI(); });
  }
  function pause() { st.wantPlay = false; audio.pause(); savePos(); updateUI(); }
  function toggle() { if (!st.key) return; if (audio.paused) play(); else pause(); }
  function prev() { if (!st.key) return; goUnit(Math.max(0, st.u - 1)); }
  function next() {
    if (!st.key) return;
    if (st.u + 1 < st.units.length) { goUnit(st.u + 1); return; }
    if (st.auto) { if (!goNextStage(false)) toast('마지막이에요.'); }
    else toast('이 단계의 마지막이에요.');
  }

  function load(key, stage, startU, autoplay) {
    var same = (st.key === key && st.stage === stage && audio.getAttribute('src'));
    var units = buildUnits(key, stage);
    if (!units.length) { toast('이 단계는 아직 음성이 없어요.'); return; }
    st.key = key; st.stage = stage; st.units = units;
    st.u = Math.min(Math.max(0, startU || 0), units.length - 1);
    st.played = 0; st.wantPlay = !!autoplay;
    $('player').hidden = false;
    applyCompact();
    if (!same) {
      audio.src = audioSrc(key, stage);
      pendingStart = units[st.u].s;
      audio.load();
    } else {
      seek(units[st.u].s);
    }
    applyRate();
    if (autoplay) play();
    updateUI(); savePos(); markToc();
    setMediaSession();
  }

  audio.addEventListener('loadedmetadata', function () {
    applyRate();
    if (pendingStart !== null) { try { audio.currentTime = pendingStart; } catch (e) {} pendingStart = null; }
  });
  audio.addEventListener('timeupdate', function () {
    if (st.sleepEnd && Date.now() >= st.sleepEnd) { sleepDone(); return; }
    if (!st.units.length) return;
    var un = st.units[st.u];
    if (un && un.e !== Infinity && audio.currentTime >= un.e - 0.02) advance();
  });
  audio.addEventListener('play', function () { updateUI(); schedule(); setPlaybackState(); });
  audio.addEventListener('pause', function () { updateUI(); setPlaybackState(); });
  audio.addEventListener('ended', function () {
    if (!st.key || !st.wantPlay) return;
    var un = st.units[st.u];
    if (un && (un.e === Infinity || st.u === st.units.length - 1 || audio.currentTime >= un.e - 0.3)) advance();
  });
  audio.addEventListener('ratechange', function () { schedule(); });
  audio.addEventListener('error', function () { if (!st.key) return; toast('음성 파일을 불러오지 못했어요.'); });

  /* ---------- sleep timer ---------- */
  function sleepLabel() {
    if (!st.sleepEnd) return '⏲ 타이머 끔';
    return '⏲ ' + Math.max(0, Math.ceil((st.sleepEnd - Date.now()) / 60000)) + '분 뒤 끔';
  }
  function setSleep(min) {
    st.sleepMin = min;
    clearTimeout(sleepTimer);
    if (!min) { st.sleepEnd = 0; }
    else { st.sleepEnd = Date.now() + min * 60000; sleepTimer = setTimeout(sleepDone, min * 60000 + 50); }
    $('bSleep').textContent = sleepLabel();
  }
  function sleepDone() {
    if (!st.sleepEnd) return;
    setSleep(0); pause(); toast('타이머가 끝나서 멈췄어요.');
  }
  setInterval(function () { if (st.sleepEnd) { if (Date.now() >= st.sleepEnd) sleepDone(); else $('bSleep').textContent = sleepLabel(); } }, 15000);

  /* ---------- UI ---------- */
  function highlight(scroll) {
    var c = $('content');
    var all = c.querySelectorAll('.seg li.playing'), i;
    for (i = 0; i < all.length; i++) all[i].classList.remove('playing');
    var sts = c.querySelectorAll('.stage.playing-stage');
    for (i = 0; i < sts.length; i++) sts[i].classList.remove('playing-stage');
    if (!st.key || st.viewKey !== st.key || !st.units.length) return;
    var sec = c.querySelector('.stage[data-stage="' + st.stage + '"]');
    if (sec) sec.classList.add('playing-stage');
    var un = st.units[st.u];
    var li = c.querySelector('.seg li[data-stage="' + st.stage + '"][data-i="' + un.i + '"]');
    if (li) {
      li.classList.add('playing');
      if (scroll && $('fs').hidden) li.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  function repLabel() { return st.repeat === 0 ? '∞' : st.repeat; }
  function updateUI() {
    updateSettingsUI();
    if (!st.key) return;
    var p = byKey[st.key], un = st.units[st.u];
    var playing = !audio.paused;
    $('pTitle').textContent = pageTitle(p) + ' · ' + stageName(st.stage);
    $('pTitle').setAttribute('href', '#' + p.key);
    $('pCount').textContent = st.units.length > 1 ? ((st.u + 1) + ' / ' + st.units.length + ' · 반복 ' + (st.played + 1) + '/' + repLabel()) : '전체 재생';
    $('pText').textContent = un.text;
    $('bPlay').textContent = playing ? '⏸' : '▶';
    $('bPlay').setAttribute('aria-label', playing ? '일시정지' : '재생');
    $('fPlay').textContent = playing ? '⏸' : '▶';
    $('fsEn').textContent = un.text;
    $('fsMeta').textContent = pageTitle(p) + ' · ' + stageName(st.stage) + ' · ' + (st.u + 1) + '/' + st.units.length;
    highlight(playing);
    setMediaSession();
  }
  function updateSettingsUI() {
    $('rVal').textContent = st.repeat === 0 ? '∞' : st.repeat + '회';
    $('rInf').setAttribute('aria-pressed', st.repeat === 0 ? 'true' : 'false');
    $('bLoop').setAttribute('aria-pressed', st.loop ? 'true' : 'false');
    $('bAuto').setAttribute('aria-pressed', st.auto ? 'true' : 'false');
    $('bSleep').textContent = sleepLabel();
    applyEnBtn();
    var sp = document.querySelectorAll('.speed');
    for (var i = 0; i < sp.length; i++) sp[i].setAttribute('aria-pressed', parseFloat(sp[i].getAttribute('data-rate')) === st.speed ? 'true' : 'false');
  }
  function applyCompact() {
    $('player').classList.toggle('compact', !!st.compact);
    $('bMore').textContent = st.compact ? '설정 ▴' : '설정 ▾';
    $('bMore').setAttribute('aria-expanded', st.compact ? 'false' : 'true');
  }
  function applyHide() {
    var hide = LS.get('pr_hide', '0') === '1';
    document.documentElement.classList.toggle('hidetext', hide);
    var t = $('txTgl');
    if (t) { t.setAttribute('aria-pressed', hide ? 'true' : 'false'); t.textContent = hide ? '글자 보이기' : '글자 가리기'; t.classList.toggle('on', hide); }
  }

  var toastTimer = null;
  function toast(msg, actionLabel, action) {
    var t = $('toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (actionLabel ? '<button id="toastAct">' + esc(actionLabel) + '</button>' : '');
    t.hidden = false;
    if (actionLabel) $('toastAct').onclick = function () { t.hidden = true; action(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 5000);
  }

  /* ---------- media session ---------- */
  function setMediaSession() {
    if (!('mediaSession' in navigator) || !st.key || !window.MediaMetadata) return;
    var p = byKey[st.key], un = st.units[st.u];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: un ? un.text : p.title,
        artist: pageTitle(p) + ' · ' + stageName(st.stage),
        album: '영어 원리',
        artwork: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }]
      });
    } catch (e) {}
  }
  function setPlaybackState() {
    if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing'; } catch (e) {} }
  }
  if ('mediaSession' in navigator) {
    var acts = {
      play: function () { play(); }, pause: function () { pause(); },
      previoustrack: function () { prev(); }, nexttrack: function () { next(); },
      seekbackward: function () { prev(); }, seekforward: function () { next(); }
    };
    Object.keys(acts).forEach(function (a) { try { navigator.mediaSession.setActionHandler(a, acts[a]); } catch (e) {} });
  }

  /* ---------- fullscreen reading mode ---------- */
  var wakeLock = null;
  function openFs() {
    if (!st.key) return;
    var el = $('fs');
    el.hidden = false;
    try { if (el.requestFullscreen) el.requestFullscreen().catch(function () {}); else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen(); } catch (e) {}
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {}); } catch (e) {}
    updateUI();
  }
  function closeFs() {
    var el = $('fs');
    if (el.hidden) return;
    el.hidden = true;
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (e) {}
    try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
    highlight(true);
  }
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && !$('fs').hidden) closeFs(); });
  document.addEventListener('webkitfullscreenchange', function () { if (!document.webkitFullscreenElement && !$('fs').hidden) closeFs(); });
  $('fs').addEventListener('dblclick', function (e) { if (!e.target.closest('button')) closeFs(); });
  var lastTap = 0;
  $('fs').addEventListener('touchend', function (e) {
    if (e.target.closest('button')) return;
    var now = Date.now();
    if (now - lastTap < 350) { closeFs(); e.preventDefault(); lastTap = 0; } else { lastTap = now; }
  }, { passive: false });

  /* ---------- table of contents drawer ---------- */
  function setToc(open) {
    $('toc').hidden = !open; $('tocBack').hidden = !open;
    $('tocBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { var on = $('toc').querySelector('a.on'); if (on) on.scrollIntoView({ block: 'center' }); }
  }

  /* ---------- offline save ---------- */
  function saveOffline() {
    var msg = $('offMsg');
    if (!window.caches || !/^https?:$/.test(location.protocol)) { msg.textContent = '이 주소에서는 저장할 수 없어요. (https로 열어야 해요)'; return; }
    var urls = [];
    S.pages.forEach(function (p) { p.stages.forEach(function (sg, i) { if (sg.a) urls.push(audioSrc(p.key, i + 1)); }); });
    if (!urls.length) { msg.textContent = '저장할 음성이 아직 없어요.'; return; }
    var done = 0, failed = 0;
    $('offBtn').disabled = true;
    caches.open('pr-audio-v1').then(function (cache) {
      var i = 0;
      function step() {
        if (i >= urls.length) {
          msg.textContent = failed ? ('저장 완료 (' + failed + '개 실패, 다시 눌러 보세요)') : '모두 저장했어요. 이제 오프라인에서도 들을 수 있어요.';
          $('offBtn').disabled = false; return;
        }
        var u = urls[i++];
        cache.match(u).then(function (hit) {
          if (hit) return;
          return fetch(u).then(function (r) { if (!r.ok) throw new Error('x'); return cache.put(u, r); });
        }).catch(function () { failed++; }).then(function () { done++; msg.textContent = done + ' / ' + urls.length + ' 저장 중…'; step(); });
      }
      step();
    }).catch(function () { msg.textContent = '저장할 수 없었어요.'; $('offBtn').disabled = false; });
  }

  function setEn(on) {
    st.en = !!on; LS.set('pr_en', st.en);
    if (st.key && st.units.length) {
      var cur = st.units[st.u].i;
      st.units = buildUnits(st.key, st.stage);
      st.u = unitIndexFor(st.units, cur); st.played = 0;
      seek(st.units[st.u].s);
      if (audio.paused && st.wantPlay) play();
      savePos();
    }
    updateUI(); applyEnBtn();
    toast(st.en ? '영어 음성만 들려요. (한국어 구간은 건너뛰어요)' : '한국어+영어 모두 들려요.');
  }
  function applyEnBtn() {
    var b = $('bEn'); if (b) b.setAttribute('aria-pressed', st.en ? 'true' : 'false');
    var t = $('enTgl'); if (t) { t.setAttribute('aria-pressed', st.en ? 'true' : 'false'); t.classList.toggle('on', st.en); t.textContent = st.en ? '🔊 영어만 듣는 중' : '🔊 영어만 듣기'; }
  }

  /* ---------- events ---------- */
  function startStage(key, stage, fromU) {
    var saved = posMap()[key + '|' + stage + (st.en ? '|en' : '')];
    var n = buildUnits(key, stage).length;
    var u = 0, resumed = false;
    if (typeof fromU === 'number') u = unitIndexFor(buildUnits(key, stage), fromU);
    else if (typeof saved === 'number' && saved > 0 && saved < n) { u = saved; resumed = true; }
    load(key, stage, u, true);
    if (resumed) toast('멈춘 곳(' + (u + 1) + '번째)부터 이어서 재생해요.', '처음부터', function () { goUnit(0); });
  }

  $('content').addEventListener('click', function (e) {
    if (e.target.id === 'enTgl') { setEn(!st.en); return; }
    if (e.target.id === 'txTgl') { LS.set('pr_hide', LS.get('pr_hide', '0') === '1' ? '0' : '1'); applyHide(); return; }
    var b = e.target.closest('.abtn');
    if (b && !b.disabled && st.viewKey) {
      var stage = parseInt(b.getAttribute('data-stage'), 10);
      if (st.key === st.viewKey && st.stage === stage) { toggle(); return; }
      startStage(st.viewKey, stage); return;
    }
    if (e.target.id === 'resumeBtn') {
      var last = LS.get('pr_last', null);
      if (last) { location.hash = '#' + last.key; setTimeout(function () { load(last.key, last.stage, last.u, true); }, 30); }
      return;
    }
    var li = e.target.closest('.seg li');
    if (li && st.viewKey) {
      var s2 = parseInt(li.getAttribute('data-stage'), 10), i = parseInt(li.getAttribute('data-i'), 10);
      if (st.key === st.viewKey && st.stage === s2) { st.wantPlay = true; goUnit(unitIndexFor(st.units, i)); play(); }
      else startStage(st.viewKey, s2, i);
    }
  });
  $('toc').addEventListener('click', function (e) {
    if (e.target.closest('#tocClose')) setToc(false);
    else if (e.target.closest('#offBtn')) saveOffline();
  });

  $('bPlay').onclick = toggle; $('fPlay').onclick = toggle;
  $('bPrev').onclick = prev; $('fPrev').onclick = prev;
  $('bNext').onclick = next; $('fNext').onclick = next;
  $('bEn').onclick = function () { setEn(!st.en); };
  $('bRestart').onclick = function () { if (st.key) { st.wantPlay = true; goUnit(0); play(); } };
  $('bFull').onclick = openFs;
  $('bMore').onclick = function () { st.compact = !st.compact; LS.set('pr_compact', st.compact); applyCompact(); };
  $('bClose').onclick = function () {
    pause(); closeFs(); $('player').hidden = true; st.key = null; st.units = [];
    audio.removeAttribute('src'); audio.load(); markToc(); highlight();
  };
  function stepRepeat(dir) {
    var cur = st.repeat === 0 ? REPEATS[REPEATS.length - 1] : st.repeat, i;
    if (dir < 0) { for (i = REPEATS.length - 1; i >= 0; i--) if (REPEATS[i] < cur) { cur = REPEATS[i]; break; } if (i < 0) cur = REPEATS[0]; }
    else { for (i = 0; i < REPEATS.length; i++) if (REPEATS[i] > cur) { cur = REPEATS[i]; break; } if (i >= REPEATS.length) cur = REPEATS[REPEATS.length - 1]; }
    st.repeat = cur; LS.set('pr_repeat', st.repeat); st.played = 0; updateUI();
  }
  $('rMinus').onclick = function () { stepRepeat(-1); };
  $('rPlus').onclick = function () { stepRepeat(1); };
  $('rInf').onclick = function () { st.repeat = st.repeat === 0 ? 1 : 0; LS.set('pr_repeat', st.repeat); st.played = 0; updateUI(); };
  $('bLoop').onclick = function () { st.loop = !st.loop; LS.set('pr_loop', st.loop); updateUI(); };
  $('bAuto').onclick = function () { st.auto = !st.auto; LS.set('pr_auto', st.auto); updateUI(); };
  $('bSleep').onclick = function () {
    var i = SLEEPS.indexOf(st.sleepMin); setSleep(SLEEPS[(i + 1) % SLEEPS.length]);
    toast(st.sleepMin ? ('타이머 ' + st.sleepMin + '분: 그때 멈춰요.') : '타이머를 껐어요.');
  };
  var sp = document.querySelectorAll('.speed');
  for (var i = 0; i < sp.length; i++) sp[i].onclick = function () {
    st.speed = parseFloat(this.getAttribute('data-rate')); LS.set('pr_speed', st.speed); applyRate(); schedule(); updateUI();
  };
  $('tocBtn').onclick = function () { setToc($('toc').hidden); };
  $('tocBack').onclick = function () { setToc(false); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeFs(); setToc(false); return; }
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (!st.key) return;
    if (e.key === ' ' && !(e.target && e.target.tagName === 'BUTTON')) { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', savePos);
  document.addEventListener('visibilitychange', function () { if (document.hidden) savePos(); });
  window.addEventListener('beforeunload', savePos);

  /* ---------- init ---------- */
  renderToc();
  route();
  applyRate();
  applyCompact();
  updateSettingsUI();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
  }
})();
