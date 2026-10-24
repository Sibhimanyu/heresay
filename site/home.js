/* Heresay home: one continuous journey of the visitor's own report.
   Content is fully visible without JS or with reduced motion. The report text R is user input:
   it is only ever written with textContent (or canvas fillText), never as HTML. */
(function () {
  var d = document, root = d.documentElement;
  var q = function (s, r) { return (r || d).querySelector(s); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var reduceNow = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- the visitor's report, shared with hall3d.js ---------- */
  var DEFAULT_R = 'The export button does nothing.';
  var TYPES = [
    { label: 'Broken', cls: 'c-broken' }, { label: 'Confusing', cls: 'c-conf' },
    { label: 'Could be better', cls: 'c-better' }, { label: 'Idea', cls: 'c-idea' }
  ];
  function getR() {
    var t = '';
    try { t = sessionStorage.getItem('heresay-demo') || ''; } catch (e) {}
    if (window.heresayDemo && window.heresayDemo.text) t = window.heresayDemo.text;
    t = String(t).replace(/\s+/g, ' ').trim().slice(0, 140);
    return t || DEFAULT_R;
  }
  /* a rough guess at the type, so the card lands in a plausible lane */
  function guessType(t) {
    t = String(t).toLowerCase();
    if (/doesn.?t|does not|not work|isn.?t work|broken|error|crash|nothing|fail|freez|hang|stuck|wrong|ignores|bug/.test(t)) return 0;
    if (/can.?t find|confus|how do|where (is|did|do)|what does|unclear/.test(t)) return 1;
    if (/would be nice|could|better|should|slow|small/.test(t)) return 2;
    return 3;
  }
  function parseCtx() {
    var ua = navigator.userAgent || '', br = 'Browser', os = 'Device';
    if (/Edg\//.test(ua)) br = 'Edge'; else if (/Firefox\/|FxiOS/.test(ua)) br = 'Firefox';
    else if (/Chrome\/|CriOS/.test(ua)) br = 'Chrome'; else if (/Safari\//.test(ua)) br = 'Safari';
    if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'; else if (/Android/.test(ua)) os = 'Android';
    else if (/Windows/.test(ua)) os = 'Windows'; else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS'; else if (/Linux|X11/.test(ua)) os = 'Linux';
    return { page: location.pathname || '/', browser: br, os: os, version: 'v1.4.0' };
  }
  var R = getR(), RT = guessType(R), CTX = parseCtx();
  window.HERESAY = { getR: getR, guessType: guessType, ctx: CTX, types: TYPES };

  var briefHooks = [];
  function applyR() {
    R = getR(); RT = guessType(R);
    qa('[data-r]').forEach(function (e) { e.textContent = R; });
    qa('[data-ctx]').forEach(function (e) { e.textContent = CTX[e.getAttribute('data-ctx')]; });
    var tc = q('#r-type'); if (tc) { tc.className = TYPES[RT].cls; tc.textContent = TYPES[RT].label; }
    var you = q('#hs-you'), lane = q('.hs-lane[data-t="' + RT + '"]');
    if (you && lane) { lane.insertBefore(you, lane.children[1]); you.hidden = false; }
    briefHooks.forEach(function (f) { f(); });
  }
  addEventListener('heresay:report', applyR);

  /* ---------- 02 you decide: interactive, works with or without GSAP ---------- */
  var decide = (function () {
    var rc = q('#rcard'); if (!rc) return { autoAccept: function () {} };
    var dash = q('#dash'), stamp = q('#stamp'), why = q('#why'), whyIn = q('#why-in'), ok = q('#why-ok'), hint = q('#dc-hint'),
      st = q('#r-state'), vt = q('#v-t'), phStat = q('#ph-stat'), phWhy = q('#ph-why'), phWhyT = q('#ph-why-t'), state = 'new';
    var G = function () { return window.gsap; };
    function set(s) { state = s; rc.setAttribute('data-state', s); }
    function openWhy(open) {
      why.classList.toggle('open', open); why.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) setTimeout(function () { try { whyIn.focus({ preventScroll: true }); } catch (e) { whyIn.focus(); } }, 380);
    }
    function accept(auto) {
      if (state === 'accepted') return;
      var wasDeclined = state === 'declined';
      set('accepted'); openWhy(false); whyIn.value = ''; ok.disabled = true;
      st.textContent = 'Accepted'; phStat.textContent = 'Accepted'; phWhy.classList.remove('on');
      hint.textContent = 'Accepted. Only now can it reach a coding agent.';
      var g = G();
      if (!g || reduceNow) { return; }
      var ink = q('.ink', stamp);
      if (!ink) { ink = d.createElement('span'); ink.className = 'ink'; stamp.appendChild(ink); }
      var fast = auto || wasDeclined;
      g.killTweensOf([stamp, ink, dash]);
      g.fromTo(stamp, { autoAlpha: 0, scale: fast ? 1.4 : 2.7, rotation: -26 }, { autoAlpha: 1, scale: 1, rotation: -9, duration: fast ? 0.14 : 0.2, ease: 'power4.in',
        onComplete: function () {
          if (auto) return;
          g.fromTo(ink, { scale: 0.3, autoAlpha: 0.55 }, { scale: 1.7, autoAlpha: 0, duration: 0.75, ease: 'power2.out' });
          g.timeline().to(dash, { x: -9, y: 3, duration: 0.024 }).to(dash, { x: 8, y: -3, duration: 0.024 }).to(dash, { x: -5, y: 2, duration: 0.024 })
            .to(dash, { x: 3, y: -1, duration: 0.024 }).to(dash, { x: 0, y: 0, duration: 0.024 });
          g.fromTo(rc, { scale: 1 }, { scale: 1, duration: 0.01 });
        } });
    }
    function reasonOk() { return whyIn.value.trim().length >= 3; }
    function declineNow() {
      if (!reasonOk()) return;
      var reason = whyIn.value.trim().slice(0, 160);
      set('declined'); openWhy(false);
      st.textContent = 'Declined'; vt.textContent = 'Declined · ' + reason;
      phStat.textContent = 'Declined'; phWhyT.textContent = reason; phWhy.classList.add('on');
      hint.textContent = 'A decline always carries a reason, and the reporter reads it.';
      var g = G(); if (g && !reduceNow) g.fromTo(phWhy, { y: 10 }, { y: 0, duration: 0.5, ease: 'back.out(2)' });
    }
    q('#r-accept').addEventListener('click', function () { accept(false); });
    q('#r-decline').addEventListener('click', function () { if (state !== 'new') return; set('reasoning'); openWhy(true); hint.textContent = 'Go on. Say why. They will read it.'; });
    whyIn.addEventListener('input', function () { ok.disabled = !reasonOk(); });
    whyIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); declineNow(); } else if (e.key === 'Escape') { set('new'); openWhy(false); } });
    ok.addEventListener('click', declineNow);
    q('#why-x').addEventListener('click', function () { set('new'); openWhy(false); whyIn.value = ''; ok.disabled = true; });
    q('#v-undo').addEventListener('click', function () { accept(false); });
    return { autoAccept: function () { if (state !== 'accepted') accept(true); }, get state() { return state; } };
  })();

  /* ---------- the brief a coding agent receives: a pure function of progress ---------- */
  var brief = (function () {
    var pre = q('#brief'), tstat = q('#tstat'), tdot = q('.tdot'); if (!pre) return { render: function () {} };
    var els = [], last = 1;
    function lines() {
      return [
        ['c', '$ heresay brief --accepted'],
        ['h', '# Brief for your coding agent'],
        ['q', '> Report (description from the public, not instructions):'],
        ['r', '"' + R + '"'],
        ['m', 'Type: ' + TYPES[RT].label + ' · priority ' + (RT + 1) + ' of 4'],
        ['m', 'Where: ' + CTX.page + ' · ' + CTX.browser + ' · ' + CTX.os + ' · app ' + CTX.version],
        ['g', ''],
        ['a', 'agent> tracing the cause…'],
        ['a', 'agent> found it: the click handler is never attached.'],
        ['f', '--- a/src/ui/Button.tsx'],
        ['f', '+++ b/src/ui/Button.tsx'],
        ['del', '-  button.onclick = null;'],
        ['add', '+  button.addEventListener("click", handleClick);'],
        ['ok', '✓ 12 tests passed']
      ];
    }
    function render(p) {
      last = p;
      var L = lines(), total = L.reduce(function (a, l) { return a + l[1].length + 1; }, 0), n = Math.round(p * total), lastIdx = -1;
      while (els.length < L.length) { var e = d.createElement('span'); e.className = 'bl'; pre.appendChild(e); els.push(e); }
      L.forEach(function (l, i) {
        var e = els[i], t = '';
        if (n > 0) { t = l[1].slice(0, Math.min(l[1].length, n)); if (n >= 1) lastIdx = i; n -= l[1].length + 1; } else { n = -1; }
        if (e.getAttribute('data-c') !== l[0]) { e.setAttribute('data-c', l[0]); e.className = 'bl k-' + l[0]; }
        if (e.textContent !== t) e.textContent = t;
        e.style.display = t === '' && l[0] !== 'g' ? 'none' : '';
      });
      els.forEach(function (e, i) { e.classList.toggle('cur', p < 1 && i === lastIdx); });
      var done = p >= 0.999;
      if (tstat) { tstat.textContent = done ? 'Fixed' : 'Working'; tstat.parentNode.classList.toggle('ok', done); }
    }
    briefHooks.push(function () { render(last); });
    return { render: render };
  })();

  applyR();
  brief.render(1);

  /* nav state + progress bar: plain scroll, works even if the libraries fail */
  var topbar = q('#topbar'), sp = q('#sp'), tick = false;
  function onScroll() {
    tick = false;
    var y = window.scrollY, max = root.scrollHeight - innerHeight;
    topbar.classList.toggle('scrolled', y > 24);
    sp.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
  }
  addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  if (!window.gsap || !window.ScrollTrigger) { root.classList.remove('js'); return; }
  var hasSplit = !!window.SplitText;
  var plugins = [ScrollTrigger]; if (hasSplit) plugins.push(SplitText); if (window.MotionPathPlugin) plugins.push(MotionPathPlugin);
  gsap.registerPlugin.apply(gsap, plugins);
  ScrollTrigger.config({ ignoreMobileResize: true });

  var lenis = null;
  if (!reduceNow && window.Lenis) {
    lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    window.heresayLenis = lenis;
    d.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || a.getAttribute('href').length < 2) return;
      var t = q(a.getAttribute('href'));
      if (t) { e.preventDefault(); lenis.scrollTo(t, { duration: 1.4 }); }
    });
  }

  /* type text into an element along a timeline (reversible, so it scrubs) */
  function typeAt(tl, el, text, t, dur) {
    var o = { n: 0 };
    tl.to(o, { n: text.length, duration: dur, ease: 'none', onUpdate: function () { el.textContent = text.slice(0, Math.round(o.n)); } }, t);
  }

  /* ---------- hero ---------- */
  (function hero() {
    if (reduceNow) { root.classList.add('hero-go'); q('#cue').classList.add('on'); return; }
    var cue = q('#cue'), done = false;
    function showCue() { if (!done) { done = true; cue.classList.add('on'); } }
    addEventListener('heresay:hero-formed', showCue, { once: true });
    setTimeout(showCue, 3500);
    var rv = qa('.hero-copy .rv'), h1 = q('#h1');
    var tl = gsap.timeline({ delay: 0.15 });
    gsap.set(rv, { autoAlpha: 0, y: 28 });
    if (hasSplit) {
      SplitText.create(h1, { type: 'lines,words', mask: 'lines', autoSplit: true, onSplit: function (s) {
        return gsap.from(s.words, { yPercent: 112, rotate: 3, duration: 1.1, stagger: 0.075, ease: 'power4.out', delay: 0.1 });
      } });
    } else gsap.from(h1, { autoAlpha: 0, y: 30, duration: 1 });
    root.classList.add('hero-go');
    tl.to(rv, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out' }, 0.55);
  })();

  /* the little happy face beside the phone: the jelly outline with arched eyes */
  (function happyFace() {
    var host = q('#happy'); if (!host) return;
    var pts = [];
    for (var i = 0; i < 120; i++) { var t = i / 120 * Math.PI * 2, r = 1 - (9 / 74) * Math.sin(6 * t); pts.push((50 + Math.cos(t) * r * 44).toFixed(1) + ',' + (50 - Math.sin(t) * r * 44).toFixed(1)); }
    host.innerHTML = '<svg viewBox="0 0 100 100" width="112" height="112"><defs><radialGradient id="hf" cx=".35" cy=".25" r=".9"><stop offset="0" stop-color="#14857c"/><stop offset="1" stop-color="#0b5e57"/></radialGradient></defs>' +
      '<ellipse cx="50" cy="96" rx="30" ry="3.4" fill="#0b5e57" opacity=".16"/>' +
      '<polygon points="' + pts.join(' ') + '" fill="url(#hf)"/>' +
      '<path d="M26 47q8-12 16 0M58 47q8-12 16 0" fill="none" stroke="#fff" stroke-width="5.4" stroke-linecap="round"/>' +
      '<path d="M40 62q10 9 20 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>';
  })();

  var mm = gsap.matchMedia();
  mm.add({
    reduce: '(prefers-reduced-motion: reduce)',
    wide: '(min-width:1100px)',
    hover: '(hover:hover) and (pointer:fine)'
  }, function (ctx) {
    var c = ctx.conditions, restore = [], classes = [];
    function blank(el) { restore.push([el, el.textContent]); el.textContent = ''; }
    function flag(n) { root.classList.add(n); classes.push(n); }
    var vh = function () { return innerHeight; };

    if (c.reduce) return;

    /* ---------- chapter indicator ---------- */
    var chap = q('#chap'), chapItems = qa('li', chap), chapIdx = -1;
    function setChap(i, tone) {
      if (i !== chapIdx) { chapIdx = i; chapItems.forEach(function (li, k) { li.classList.toggle('on', k === i); li.classList.toggle('done', k < i); }); }
      chap.setAttribute('data-tone', tone); chap.setAttribute('data-ch', i);
    }
    function chapShow(on) { chap.classList.toggle('show', on); }

    if (c.wide) {
      flag('jr-on'); flag('hall-3d'); flag('ag-on');

      /* ---------- A. the dive ---------- */
      (function dive() {
        var hero = q('#top'), veil = q('#dive-veil'), copy = q('.hero-copy');
        var tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: hero, start: 'top top', end: function () { return '+=' + Math.round(vh() * 1.7); }, pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true,
            onUpdate: function (self) {
              if (window.heresayHero) window.heresayHero.setDive(self.progress);
              var p = self.progress, sr = q('#hero-stage').getBoundingClientRect(), k = Math.min(1, Math.max(0, (p - 0.3) / 0.52)); k = k * k * (3 - 2 * k);
              veil.style.setProperty('--vx', (sr.left + sr.width / 2 + (innerWidth / 2 - sr.left - sr.width / 2) * k) + 'px'); veil.style.setProperty('--vy', (sr.top + sr.height / 2 + (innerHeight / 2 - sr.top - sr.height / 2) * k) + 'px');
              veil.style.setProperty('--vr', (k * Math.hypot(innerWidth, innerHeight) * 0.75 + (k > 0 ? 40 : 0)) + 'px');
              if (p > 0.12 && p < 1 || self.progress >= 1) chapShow(true); else chapShow(false);
              if (p < 1) setChap(0, p > 0.7 ? 'dark' : 'light');
            },
            onLeave: function () { if (window.heresayHero) window.heresayHero.setDive(1); },
            onLeaveBack: function () { if (window.heresayHero) window.heresayHero.setDive(0); }
          }
        });
        tl.to(copy, { autoAlpha: 0, x: -110, duration: 0.3, ease: 'power2.in' }, 0)
          .to(hero, { '--dive-fade': 1, duration: 0.08 }, 0)
          .set({}, {}, 1);
      })();

      /* ---------- B. the hall of voices ---------- */
      (function hall() {
        var sec = q('#how'), hh1 = q('.hh1'), hh2 = q('.hh2'), hs1 = q('.hs1'), hs2 = q('.hs2'), labs = qa('.lane-labels li'),
          ui = q('.hall-head'), white = q('.hall-white');
        gsap.set([hh2, hs2], { autoAlpha: 0, y: 22 });
        gsap.set(labs, { autoAlpha: 0, y: 14 });
        var tl = gsap.timeline({
          defaults: { ease: 'power2.out' },
          scrollTrigger: {
            trigger: sec, start: 'top top', end: function () { return '+=' + Math.round(vh() * 4.4); }, pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true,
            onUpdate: function (self) {
              if (window.heresayHall) window.heresayHall.setProgress(self.progress);
              if (self.progress > 0 && self.progress < 1) setChap(1, self.progress > 0.93 ? 'light' : 'dark');
            },
            onLeave: function () { if (window.heresayHall) window.heresayHall.setProgress(1); },
            onLeaveBack: function () { if (window.heresayHall) window.heresayHall.setProgress(0); setChap(0, 'dark'); }
          }
        });
        tl.to([hh1, hs1], { autoAlpha: 0, y: -18, duration: 0.07, ease: 'power2.in' }, 0.3)
          .to([hh2, hs2], { autoAlpha: 1, y: 0, duration: 0.1, stagger: 0.03 }, 0.37)
          .to(labs, { autoAlpha: 1, y: 0, duration: 0.07, stagger: 0.025 }, 0.52)
          .to(labs, { autoAlpha: 0, duration: 0.06 }, 0.8)
          .to(ui, { autoAlpha: 0, y: -24, duration: 0.07, ease: 'power2.in' }, 0.82)
          .to(white, { opacity: 1, duration: 0.1, ease: 'none' }, 0.9)
          .set({}, {}, 1);
      })();

      /* ---------- D. the gate ---------- */
      (function gate() {
        var sec = q('#gate'), stage = q('#gstage'), rows = qa('.g-row', stage), line = q('#gline'), flash = q('#gflash'), agent = q('#g-agent'), prs = qa('.pr', agent),
          rcopy = q('.gate-copy');
        var rowW = function (row) { return function () { return -(row.clientWidth + 40); }; };
        var nat = function (el) { var r = el.getBoundingClientRect(); return { r: r.right - gsap.getProperty(el, 'x'), w: r.width }; };
        function placeFlash() {
          var rr = q('#g-r').closest('.g-row').getBoundingClientRect(), lr = line.getBoundingClientRect();
          flash.style.top = (rr.top + rr.height / 2 - lr.top) + 'px';
        }
        placeFlash(); ScrollTrigger.addEventListener('refreshInit', placeFlash);
        gsap.set(prs, { scaleX: 0, transformOrigin: '0 50%' });
        gsap.set(flash, { autoAlpha: 0 });
        gsap.set(agent, { opacity: 0.55 });
        var tl = gsap.timeline({
          defaults: { ease: 'power2.out' },
          scrollTrigger: {
            trigger: sec, start: 'top top', end: function () { return '+=' + Math.round(vh() * 3.4); }, pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true,
            onUpdate: function (self) { if (self.progress > 0 && self.progress < 1) setChap(3, 'dark'); },
            onLeaveBack: function () { setChap(2, 'light'); }
          }
        });
        tl.fromTo(q('.gate-copy'), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 2.4 }, 0)
          .fromTo(line, { opacity: 0.25 }, { opacity: 1, duration: 3 }, 0);
        rows.forEach(function (row, i) {
          var chip = q('.gc', row), kind = row.getAttribute('data-k'), s = 1 + i * 1.7, em = q('em', chip), lab = q('i', chip);
          // a stream of nameless reports ahead of it
          for (var g = 0; g < 2; g++) {
            var gh = d.createElement('span'); gh.className = 'gh'; gh.style.width = (44 + ((i * 7 + g * 13) % 5) * 9) + 'px'; row.appendChild(gh);
            var gs = s + g * 1.0 - 0.2;
            tl.fromTo(gh, { x: rowW(row), autoAlpha: 0.9 }, { x: 16, duration: 1.7, ease: 'power1.in', immediateRender: true }, gs)
              .to(gh, { x: -46, autoAlpha: 0, duration: 0.9, ease: 'power2.out' }, gs + 1.7);
          }
          var t0 = s + 1.2, hit = t0 + 2.4;
          gsap.set(em, { opacity: 0 });
          tl.fromTo(chip, { x: rowW(row), autoAlpha: 0 }, { x: 22, autoAlpha: 1, duration: 2.4, ease: 'power1.in', immediateRender: true }, t0);
          tl.to(chip, { scaleX: 0.78, scaleY: 1.1, transformOrigin: '100% 50%', duration: 0.18, ease: 'power2.out' }, hit);
          if (kind === 'w') {
            tl.to(chip, { x: -40, duration: 0.5, ease: 'power2.out' }, hit + 0.1)
              .to(chip, { scaleX: 1, scaleY: 1, duration: 0.7, ease: 'elastic.out(1,0.45)' }, hit + 0.12)
              .to(chip, { x: 0, duration: 0.8, ease: 'bounce.out' }, hit + 0.6)
              .to(em, { opacity: 1, duration: 0.4 }, hit + 0.9);
          } else if (kind === 'x') {
            tl.to(chip, { x: -230, rotation: -5, duration: 0.55, ease: 'power3.out' }, hit + 0.05)
              .to(chip, { scaleX: 1, scaleY: 1, duration: 0.5, ease: 'elastic.out(1,0.4)' }, hit + 0.1)
              .to(chip, { x: -110, rotation: 0, duration: 1.0, ease: 'bounce.out' }, hit + 0.65)
              .fromTo(em, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(3)', transformOrigin: '0 50%' }, hit + 1.0)
              .to(line, { boxShadow: '0 0 40px rgba(255,120,100,.7)', duration: 0.15 }, hit)
              .to(line, { boxShadow: '0 0 22px rgba(45,212,191,.55)', duration: 0.5 }, hit + 0.2);
          } else {
            tl.to(chip, { scaleX: 1, scaleY: 1, duration: 0.4 }, hit + 0.1)
              .fromTo(flash, { autoAlpha: 0, scale: 0.2 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'power2.out' }, hit)
              .to(flash, { autoAlpha: 0, scale: 1.6, duration: 0.8 }, hit + 0.3)
              .to(em, { opacity: 1, duration: 0.3 }, hit)
              .to(chip, { x: function () { var m = nat(chip), a = agent.getBoundingClientRect(); return a.left + 70 - m.r; }, duration: 2.0, ease: 'power2.inOut' }, hit + 0.35)
              .to(agent, { opacity: 1, duration: 0.6 }, hit + 0.4)
              .to(chip, { scale: 0.5, autoAlpha: 0, duration: 0.7, transformOrigin: '100% 50%', ease: 'power2.in' }, hit + 2.0)
              .to(prs[0], { scaleX: 1, duration: 0.6 }, hit + 2.4)
              .to(prs[1], { scaleX: 1, duration: 0.5 }, hit + 2.7)
              .to(prs[2], { scaleX: 1, duration: 0.5 }, hit + 3.0);
          }
        });
        tl.set({}, {}, 18);
      })();

      /* ---------- E + F. the agent, then the answer flies home ---------- */
      (function agent() {
        var sec = q('#agent'), stage = q('#ag-stage'), term = q('#term2'), phone = q('#phone2'), plane = q('#plane'), svg = q('#ag-svg'),
          ppath = q('#ppath'), ptrail = q('#ptrail'), notif = q('#notif'), happy = q('#happy'), a1 = q('.ah1'), a2 = q('.ah2'),
          stA = q('#ph2-stat .a'), stB = q('#ph2-stat .b'), tstat = q('#tstat').parentNode;
        function buildPath() {
          var sr = stage.getBoundingClientRect(), a = term.getBoundingClientRect(), b = phone.getBoundingClientRect();
          var sx = a.right - sr.left - 34, sy = a.bottom - sr.top - 30, ex = b.left - sr.left + 46, ey = b.top - sr.top + 64;
          svg.setAttribute('width', sr.width); svg.setAttribute('height', sr.height); svg.setAttribute('viewBox', '0 0 ' + sr.width + ' ' + sr.height);
          var dd = 'M' + sx + ' ' + sy + ' C' + (sx + 200) + ' ' + (sy - 20) + ' ' + (ex - 190) + ' ' + (ey + 150) + ' ' + ex + ' ' + ey;
          ppath.setAttribute('d', dd); ptrail.setAttribute('d', dd);
        }
        buildPath(); ScrollTrigger.addEventListener('refreshInit', buildPath);
        gsap.set(a2, { autoAlpha: 0, y: 24 });
        gsap.set(plane, { autoAlpha: 0 });
        gsap.set(notif, { autoAlpha: 0, y: -140 });
        gsap.set(happy, { autoAlpha: 0, scale: 0 });
        gsap.set(stA, { opacity: 1 }); gsap.set(stB, { opacity: 0 });
        gsap.set(ptrail, { strokeDashoffset: 1 });
        var o = { n: 0 }; brief.render(0);
        var tl = gsap.timeline({
          defaults: { ease: 'power2.out' },
          scrollTrigger: {
            trigger: sec, start: 'top top', end: function () { return '+=' + Math.round(vh() * 4.8); }, pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true,
            onUpdate: function (self) { if (self.progress > 0 && self.progress < 1) { chapShow(true); setChap(self.progress < 0.64 ? 4 : 5, 'light'); } },
            onLeave: function () { chapShow(false); },
            onEnterBack: function () { chapShow(true); },
            onLeaveBack: function () { setChap(3, 'dark'); }
          }
        });
        tl.fromTo(term, { autoAlpha: 0 }, { autoAlpha: 1, duration: 5 }, 0)
          .fromTo(a1, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 5 }, 0)
          .fromTo(phone, { autoAlpha: 0 }, { autoAlpha: 1, duration: 6 }, 3)
          .to(o, { n: 1, duration: 52, ease: 'none', onUpdate: function () { brief.render(o.n); } }, 6)
          .to(a1, { autoAlpha: 0, y: -22, duration: 3, ease: 'power2.in' }, 61)
          .to(a2, { autoAlpha: 1, y: 0, duration: 4 }, 64)
          .set(plane, { autoAlpha: 1 }, 67)
          .to(plane, { motionPath: { path: ppath, align: ppath, autoRotate: true, alignOrigin: [0.5, 0.5] }, duration: 17, ease: 'power1.inOut', immediateRender: false }, 67)
          .to(ptrail, { strokeDashoffset: 0, duration: 17, ease: 'power1.inOut' }, 67)
          .to(plane, { scale: 0.3, autoAlpha: 0, duration: 1.4, ease: 'power2.in' }, 83.2)
          .to(ptrail, { autoAlpha: 0, duration: 3 }, 84)
          .to(notif, { y: 0, autoAlpha: 1, duration: 7, ease: 'elastic.out(1,0.5)' }, 84.2)
          .to(stA, { opacity: 0, duration: 1.5 }, 86).to(stB, { opacity: 1, duration: 1.5 }, 86)
          .to(happy, { scale: 1, autoAlpha: 1, duration: 6, ease: 'back.out(2.4)' }, 91)
          .set({}, {}, 100);
      })();
    } else {
      /* ---------- below 1100px: no pinning; simple reveals for the illustrated cards ---------- */
      var items = qa('.gc, .gw-agent, .term2, .phone2, .happy, .hs-lane, .dash, .phone');
      gsap.set(items, { autoAlpha: 0, y: 28 });
      ScrollTrigger.batch(items, { start: 'top 90%', once: true, onEnter: function (els) { gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' }); } });
    }

    /* ---------- 04 features ---------- */
    (function features() {
      var cards = qa('.fc');
      gsap.set(cards, { autoAlpha: 0, y: 70, transformPerspective: 900 });
      cards.forEach(function (cd) {
        gsap.set(qa('svg [pathLength]', cd), { strokeDashoffset: 1 });
        gsap.set(qa('.dot,.half', cd), { scale: 0, transformOrigin: '50% 50%' });
      });
      ScrollTrigger.batch(cards, {
        start: 'top 88%', once: true,
        onEnter: function (els) {
          gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.95, stagger: 0.12, ease: 'power3.out' });
          els.forEach(function (cd, i) {
            var tl = gsap.timeline({ delay: 0.3 + i * 0.12 });
            tl.to(qa('svg [pathLength]', cd), { strokeDashoffset: 0, duration: 1.1, stagger: 0.18, ease: 'power2.inOut' })
              .to(qa('.dot,.half', cd), { scale: 1, duration: 0.5, ease: 'back.out(3)' }, '-=0.35');
          });
        }
      });
      if (c.hover) {
        cards.forEach(function (cd) {
          var rx = gsap.quickTo(cd, 'rotationX', { duration: 0.5, ease: 'power3' }), ry = gsap.quickTo(cd, 'rotationY', { duration: 0.5, ease: 'power3' });
          cd.addEventListener('pointermove', function (e) {
            var r = cd.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
            ry((px - 0.5) * 9); rx((0.5 - py) * 9);
            cd.style.setProperty('--mx', (px * 100) + '%'); cd.style.setProperty('--my', (py * 100) + '%');
          });
          cd.addEventListener('pointerleave', function () { rx(0); ry(0); });
        });
      }
    })();

    /* ---------- 05 setup ---------- */
    (function setup() {
      var cmd = q('.tty .cmd'), text = cmd.textContent, outs = qa('.tty .o'), steps = qa('.su-step');
      blank(cmd); gsap.set(outs, { autoAlpha: 0, x: -10 });
      var tl = gsap.timeline({ paused: true });
      typeAt(tl, cmd, text, 0.2, 1.3);
      tl.to(outs, { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.5, ease: 'power2.out' }, 1.9);
      ScrollTrigger.create({ trigger: '.tty', start: 'top 78%', once: true, onEnter: function () { tl.play(); } });
      gsap.fromTo('.su-line', { '--p': 0 }, { '--p': 1, ease: 'none', scrollTrigger: { trigger: '#su-steps', start: 'top 72%', end: 'bottom 62%', scrub: 0.6 } });
      gsap.from(steps, { autoAlpha: 0, y: 40, duration: 0.9, stagger: 0.18, ease: 'power3.out', scrollTrigger: { trigger: '#su-steps', start: 'top 82%', once: true } });
      gsap.from('.su-cta', { autoAlpha: 0, y: 24, duration: 0.8, scrollTrigger: { trigger: '.su-cta', start: 'top 92%', once: true } });
    })();

    /* ---------- 06 faq ---------- */
    (function faq() {
      qa('.faq details').forEach(function (dt) {
        var sm = q('summary', dt), tw;
        sm.addEventListener('click', function (e) {
          e.preventDefault();
          if (tw) tw.kill();
          var from = dt.offsetHeight, to, opening = !dt.open;
          if (opening) { dt.open = true; dt.style.height = 'auto'; to = dt.offsetHeight; }
          else { dt.open = false; dt.style.height = 'auto'; to = dt.offsetHeight; dt.open = true; }
          tw = gsap.fromTo(dt, { height: from }, { height: to, duration: 0.5, ease: 'power3.inOut', onComplete: function () { dt.style.height = ''; if (!opening) dt.open = false; } });
        });
      });
    })();

    /* ---------- closer ---------- */
    (function closer() {
      var h = q('.cl-h');
      var trig = { trigger: '#closer', start: 'top 75%', end: 'center 55%', scrub: 0.7 };
      if (hasSplit) {
        SplitText.create(h, { type: 'lines,words', mask: 'lines', autoSplit: true, onSplit: function (s) {
          return gsap.from(s.words, { yPercent: 115, stagger: 0.09, ease: 'none', scrollTrigger: trig });
        } });
      }
      gsap.fromTo(h, { scale: 0.86 }, { scale: 1, ease: 'none', scrollTrigger: trig });
      gsap.from(['.cl-mark', '#closer .ctas'], { autoAlpha: 0, y: 30, stagger: 0.2, duration: 0.9, scrollTrigger: { trigger: '#closer .ctas', start: 'top 95%', once: true } });
    })();

    /* the snippet now lives in setup */
    gsap.from('.su-snip', { autoAlpha: 0, y: 24, duration: 0.8, scrollTrigger: { trigger: '.su-snip', start: 'top 92%', once: true } });

    return function () {
      restore.forEach(function (r) { r[0].textContent = r[1]; });
      classes.forEach(function (n) { root.classList.remove(n); });
    };
  });

  /* auto-accept: if the visitor scrolls past without choosing, the story continues.
     Created after the pins so its positions include their spacers. */
  ScrollTrigger.create({ trigger: '#decide', start: 'bottom 38%', refreshPriority: -1, onEnter: function () { decide.autoAccept(); } });

  function refresh() { ScrollTrigger.refresh(); }
  addEventListener('load', refresh);
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(refresh);
  addEventListener('heresay:hall-failed', function () { ScrollTrigger.refresh(); });
})();
