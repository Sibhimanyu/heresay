/*
 * The feedback SDK for the web. One line in the host page:
 *
 *   <script src="https://<sdk-host>/sdk.js" data-key="pk_..." defer></script>
 *
 * Optional attributes: data-version, data-user-id, data-user-label, data-position ("left"),
 *   data-accent ("#0f766e"; a hex colour, to match the host app. Defaults to Heresay peacock).
 * Optional calls, any time after the script runs:
 *   Feedback.identify({ id, label, email })   who is signed in; then nobody is asked their name
 *   Feedback.setVersion("1.4.0")
 *   Feedback.setScreen("Checkout")    for apps whose URL does not change per screen
 *   Feedback.open()
 *   Feedback.openPreferences()        a note about their setup, and a name and email if not signed in
 *
 * No account, no cookies. The reporter is a random per-device id kept in localStorage, and
 * that id is also what lets them see what happened to their own reports. Their preferences are
 * kept on the device too, and sent with each report only if they filled them in.
 */
(function () {
  'use strict';
  if (window.Feedback && window.Feedback.__loaded) return;

  var script = document.currentScript
    || document.querySelector('script[data-key][src*="sdk"]');
  if (!script) return;
  var KEY = script.getAttribute('data-key');
  // The API normally sits beside sdk.js. data-api points elsewhere, for backends that serve
  // functions from a different address than static files.
  var API = (script.getAttribute('data-api') || new URL(script.src, location.href).origin + '/v1').replace(/\/+$/, '');
  if (!KEY) { console.warn('[feedback] missing data-key on the sdk.js script tag'); return; }

  var state = {
    version: script.getAttribute('data-version') || null,
    userId: script.getAttribute('data-user-id') || null,
    userLabel: script.getAttribute('data-user-label') || null,
    userEmail: script.getAttribute('data-user-email') || null,
    screen: null,
    type: null,
    reports: [],
  };

  var TYPES = [
    { id: 'broken', label: 'Broken', hint: 'Something does not work' },
    { id: 'confusing', label: 'Confusing', hint: 'I could not tell how to do something' },
    { id: 'improvement', label: 'Could be better', hint: 'It works, but it could be better' },
    { id: 'idea', label: 'Idea', hint: 'Something that does not exist yet' },
  ];
  var STATUS = {
    open: 'Waiting for the developer',
    accepted: 'Accepted, being worked on',
    fixed: 'Fixed',
    declined: 'Declined',
  };

  // ---- storage ---------------------------------------------------------------------------

  var mem = {};
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }

  function deviceId() {
    var id = load('fbsdk.device');
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      id = 'd_' + Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      save('fbsdk.device', id);
    }
    return id;
  }

  /** Statuses the reporter has already seen, so a new outcome can show a dot. */
  function seen() { try { return JSON.parse(load('fbsdk.seen.' + KEY) || '{}'); } catch (e) { return {}; } }
  function markSeen() {
    var s = {};
    state.reports.forEach(function (r) { s[r.id] = r.status; });
    save('fbsdk.seen.' + KEY, JSON.stringify(s));
  }
  function unseen() {
    var s = seen();
    return state.reports.filter(function (r) { return r.status !== 'open' && s[r.id] !== r.status; }).length;
  }

  /**
   * What the reporter chose to tell the team. Per device and per app. Everything is optional;
   * an empty field is simply not sent.
   */
  var PREFS_KEY = 'fbsdk.prefs.' + KEY;
  function prefs() {
    try {
      var p = JSON.parse(load(PREFS_KEY) || '{}');
      return p && typeof p === 'object' ? p : {};
    } catch (e) { return {}; }
  }
  function savePrefs(p) { save(PREFS_KEY, JSON.stringify(p)); }
  /** The host app said who is signed in. Then it speaks for them, and nobody types a name. */
  function identified() { return !!(state.userId || state.userLabel || state.userEmail); }
  function reporter() {
    var p = prefs();
    var mine = !identified();
    var r = { name: mine && p.name || null, email: mine && p.email || null, note: p.note || null };
    return r.name || r.email || r.note ? r : null;
  }
  /** Where the button sits is the developer's choice (data-position), not the reporter's. */
  var LEFT = script.getAttribute('data-position') === 'left';

  // ---- context ---------------------------------------------------------------------------

  function platformInfo() {
    var ua = navigator.userAgent;
    var os = null, m;
    if ((m = /iPhone OS ([\d_]+)|iPad.*OS ([\d_]+)/.exec(ua))) os = 'iOS ' + (m[1] || m[2]).replace(/_/g, '.');
    else if ((m = /Android ([\d.]+)/.exec(ua))) os = 'Android ' + m[1];
    else if ((m = /Mac OS X ([\d_]+)/.exec(ua))) os = 'macOS ' + m[1].replace(/_/g, '.');
    else if (/Windows NT/.test(ua)) os = 'Windows';
    else if (/Linux/.test(ua)) os = 'Linux';
    var browser = null;
    if ((m = /Edg\/([\d]+)/.exec(ua))) browser = 'Edge ' + m[1];
    else if ((m = /Firefox\/([\d]+)/.exec(ua))) browser = 'Firefox ' + m[1];
    else if ((m = /Chrome\/([\d]+)/.exec(ua))) browser = 'Chrome ' + m[1];
    else if ((m = /Version\/([\d.]+).*Safari/.exec(ua))) browser = 'Safari ' + m[1];
    return { os: os, browser: browser };
  }

  /**
   * Which framework built the page, from the marks each one leaves. Only used to show the team
   * the right install steps; a wrong guess costs nothing. Checked most specific first.
   */
  function framework() {
    try {
      var w = window, d = document;
      if (w.__NEXT_DATA__ || w.next || d.getElementById('__next') || d.querySelector('script[src*="/_next/"]')) return 'next';
      if (w.__NUXT__ || w.useNuxtApp || d.getElementById('__nuxt')) return 'nuxt';
      if (w.__sveltekit_dev || d.querySelector('[data-sveltekit-preload-data],[data-sveltekit-reload]') ||
        Object.keys(w).some(function (k) { return k.indexOf('__sveltekit_') === 0; })) return 'svelte';
      if (w.getAllAngularRootElements || d.querySelector('[ng-version]')) return 'angular';
      if (w.__VUE__ || d.querySelector('[data-v-app]')) return 'vue';
      var roots = d.querySelectorAll('body > div, #root, #app');
      for (var i = 0; i < roots.length; i++) {
        var n = roots[i];
        if (n._reactRootContainer) return 'react';
        for (var k in n) if (k.indexOf('__reactContainer') === 0 || k.indexOf('__reactFiber') === 0) return 'react';
      }
      return 'html';
    } catch (e) { return null; }
  }

  /** The page, without its query string: that is where apps put tokens and personal data. */
  function pageUrl() {
    try { return location.origin + location.pathname + location.hash; } catch (e) { return null; }
  }

  function context() {
    var p = platformInfo();
    return {
      route: state.screen || (location.pathname + location.hash),
      app_version: state.version,
      platform: 'web',
      os: p.os,
      browser: p.browser,
      user_id: state.userId,
      user_label: state.userLabel,
      user_email: state.userEmail,
      framework: framework(),
      page_title: (document.title || '').trim() || null,
      page_url: pageUrl(),
      viewport: Math.round(window.innerWidth) + 'x' + Math.round(window.innerHeight),
    };
  }

  // ---- network ---------------------------------------------------------------------------

  // A 404 means the key is unknown: the app was deleted from the dashboard, or the key is
  // wrong. Nothing will ever work, so take the widget off the page once rather than keep
  // offering a button that fails.
  var dead = false;
  function unknownKey() {
    if (dead) return;
    dead = true;
    close();
    host.remove();
    console.warn('[heresay] this key isn\'t known to ' + new URL(API).origin +
      '; the app may have been deleted. Remove the Heresay script tag.');
  }

  function body(res) {
    return res.json().catch(function () { return {}; }).then(function (b) {
      if (res.status === 404) unknownKey();
      if (!res.ok) throw new Error(b.error || ('HTTP ' + res.status));
      return b;
    });
  }

  function send(type, text) {
    // text/plain keeps this a "simple" request: no CORS preflight round trip.
    return fetch(API + '/reports', {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ key: KEY, device_id: deviceId(), sdk: 'web', type: type, text: text, context: context(), reporter: reporter() }),
    }).then(body);
  }

  function refresh() {
    return fetch(API + '/reports/mine', {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      // sdk tells the dashboard the widget is live in this app (install check).
      body: JSON.stringify({ key: KEY, device_id: deviceId(), sdk: 'web' }),
    }).then(body).then(function (b) {
      state.reports = b.reports || [];
      renderBadge();
      renderList();
    }).catch(function () { /* offline or blocked: the button still works */ });
  }

  // ---- ui --------------------------------------------------------------------------------

  var CSS = [
    ':host{all:initial;--fb-bg:#fff;--fb-fg:#15171c;--fb-mute:#5b6472;--fb-line:#e3e6ea;--fb-acc:#0f766e;--fb-acc-fg:#fff;--fb-bad:#b42318;--fb-mark:#0b5e57;',
    'font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fb-fg)}',
    '@media (prefers-color-scheme:dark){:host{--fb-bg:#16181d;--fb-fg:#eceef1;--fb-mute:#9aa1ad;--fb-line:#2c313a;--fb-acc:#2dd4bf;--fb-acc-fg:#0b1f1d;--fb-bad:#f2b8b5;--fb-mark:#2dd4bf}}',
    '*{box-sizing:border-box;font:inherit;color:inherit}',
    '.fab{position:fixed;bottom:20px;right:20px;z-index:2147483000;display:flex;align-items:center;gap:6px;',
    'padding:9px 14px;border-radius:999px;border:1px solid var(--fb-line);background:var(--fb-bg);color:var(--fb-fg);',
    'box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer;font-weight:600}',
    '.fab.left{right:auto;left:20px}',
    '.mark{display:inline-flex;color:var(--fb-mark)}.mark svg{display:block}',
    '.dot{width:8px;height:8px;border-radius:50%;background:var(--fb-acc)}',
    '.scrim{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:flex-end;padding:16px}',
    '.scrim.left{justify-content:flex-start}',
    '.panel{width:min(380px,100%);max-height:min(560px,calc(100vh - 32px));overflow:auto;background:var(--fb-bg);',
    'border:1px solid var(--fb-line);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.3);padding:16px}',
    '.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}',
    '.tabs{display:flex;gap:4px}',
    '.tab{border:0;background:none;padding:6px 10px;border-radius:8px;cursor:pointer;color:var(--fb-mute);font-weight:600}',
    '.tab[aria-selected=true]{background:var(--fb-line);color:var(--fb-fg)}',
    '.x{border:0;background:none;cursor:pointer;font-size:20px;line-height:1;padding:4px 8px;color:var(--fb-mute)}',
    'fieldset{border:0;padding:0;margin:0 0 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    'legend{margin-bottom:8px;font-weight:600}',
    '.type{text-align:left;padding:10px;border:1px solid var(--fb-line);border-radius:10px;background:none;cursor:pointer}',
    '.type b{display:block;font-weight:600}',
    '.type span{display:block;font-size:12px;color:var(--fb-mute)}',
    '.type[aria-pressed=true]{border-color:var(--fb-acc);box-shadow:inset 0 0 0 1px var(--fb-acc)}',
    'textarea{width:100%;min-height:96px;resize:vertical;padding:10px;border:1px solid var(--fb-line);border-radius:10px;background:none}',
    'input[type=text],input[type=email]{width:100%;padding:9px 10px;border:1px solid var(--fb-line);border-radius:10px;background:none}',
    'textarea:focus,input:focus,.type:focus-visible,button:focus-visible{outline:2px solid var(--fb-acc);outline-offset:1px}',
    '.field{display:block;margin:0 0 12px}',
    '.field>span{display:block;font-weight:600;margin-bottom:4px}',
    '.field>span i{font-style:normal;font-weight:400;color:var(--fb-mute)}',
    '.field textarea{min-height:64px}',
    '.hint{display:block;font-size:12px;color:var(--fb-mute);margin-top:4px}',
    '.who{display:flex;gap:10px;align-items:center;padding:10px 12px;margin:0 0 12px;border-radius:10px;background:var(--fb-line)}',
    '.who b{display:block}',
    '.avatar{flex:none;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--fb-acc);color:var(--fb-acc-fg);font-weight:700;font-size:13px}',
    '.link{border:0;background:none;padding:0;cursor:pointer;color:var(--fb-mute);text-decoration:underline;font-size:12px}',
    '.row{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px}',
    '.small{font-size:12px;color:var(--fb-mute)}',
    '.send{padding:9px 16px;border:0;border-radius:10px;background:var(--fb-acc);color:var(--fb-acc-fg);font-weight:600;cursor:pointer}',
    '.send[disabled]{opacity:.5;cursor:default}',
    '.err{color:var(--fb-bad);font-size:13px;margin-top:8px}',
    '.item{border-top:1px solid var(--fb-line);padding:10px 0}',
    '.item:first-child{border-top:0}',
    '.status{font-size:12px;font-weight:600}',
    '.status.fixed,.status.accepted{color:var(--fb-fg)}',
    '.reason{margin-top:4px;padding:8px;border-radius:8px;background:var(--fb-line);font-size:13px}',
    '.text{margin:2px 0;white-space:pre-wrap;word-break:break-word}',
    '.empty{color:var(--fb-mute);padding:12px 0}',
  ].join('');

  /**
   * The host app's own accent, if it gave one. Only a plain hex colour is accepted, so the
   * attribute cannot inject CSS. The text on top of it is whichever of white or ink reads better.
   */
  function accentCss(v) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((v || '').trim());
    if (!m) return '';
    var hex = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
    var lin = [0, 2, 4].map(function (i) {
      var c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    var L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    var fg = (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.0598) ? '#fff' : '#15171c';
    return ':host{--fb-acc:#' + hex + ';--fb-acc-fg:' + fg + '}';
  }
  CSS += accentCss(script.getAttribute('data-accent'));

  var host = document.createElement('div');
  host.setAttribute('data-feedback-sdk', '');
  var root = host.attachShadow({ mode: 'open' });
  var style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  /** The Heresay mark, compact: a soft wave with quote-mark eyes. Drawn from a constant string. */
  function markEl() {
    var s = document.createElement('span');
    s.className = 'mark';
    s.innerHTML = '<svg viewBox="0 0 200 200" width="18" height="18" aria-hidden="true"><path d="M174 100L177 105L180 110L181 116L180 121L178 126L174 131L169 134L164 137L159 139L154 141L149 143L146 146L143 149L141 154L139 159L137 164L134 169L131 174L126 178L121 180L116 181L110 180L105 177L100 174L95 170L91 167L87 164L83 163L79 162L74 162L69 163L63 164L57 164L51 164L46 162L41 159L38 154L36 149L36 143L36 137L37 131L38 126L38 121L37 117L36 113L33 109L30 105L26 100L23 95L20 90L19 84L20 79L22 74L26 69L31 66L36 63L41 61L46 59L51 57L54 54L57 51L59 46L61 41L63 36L66 31L69 26L74 22L79 20L84 19L90 20L95 23L100 26L105 30L109 33L113 36L117 37L121 38L126 38L131 37L137 36L143 36L149 36L154 38L159 41L162 46L164 51L164 57L164 63L163 69L162 74L162 79L163 83L164 87L167 91L170 95Z" fill="currentColor"/><path d="M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z" fill="#fff" transform="translate(80 106) rotate(-24) scale(1.25)"/><path d="M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z" fill="#fff" transform="translate(124 101) rotate(-24) scale(1.25)"/></svg>';
    return s;
  }
  var fabDot = el('span', { class: 'dot', hidden: '' });
  var fab = el('button', {
    class: 'fab' + (LEFT ? ' left' : ''),
    type: 'button', 'aria-haspopup': 'dialog', onclick: function () { open(); },
  }, [markEl(), el('span', { text: 'Report' }), fabDot]);
  root.appendChild(fab);

  var scrim = null, view = 'new', listBox = null, lastFocus = null;

  function renderBadge() {
    var n = unseen();
    if (n) fabDot.removeAttribute('hidden'); else fabDot.setAttribute('hidden', '');
    fab.setAttribute('aria-label', n ? 'Report a problem. ' + n + ' of your reports have an update' : 'Report a problem');
  }

  renderBadge();

  function open(which) {
    if (scrim || dead) return;
    lastFocus = document.activeElement;
    view = which || (unseen() ? 'mine' : 'new');
    scrim = el('div', { class: 'scrim' + (LEFT ? ' left' : ''), onclick: function (e) { if (e.target === scrim) close(); } });
    scrim.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    root.appendChild(scrim);
    renderPanel();
    refresh();
  }

  function close() {
    if (!scrim) return;
    if (view === 'mine') markSeen();
    scrim.remove();
    scrim = null;
    listBox = null;
    renderBadge();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderPanel() {
    scrim.textContent = '';
    var tab = function (id, label) {
      return el('button', {
        class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(view === id),
        onclick: function () { if (view === 'mine') markSeen(); view = id; renderPanel(); },
      }, [document.createTextNode(label)]);
    };
    var panel = el('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Feedback' }, [
      el('div', { class: 'head' }, [
        el('div', { class: 'tabs', role: 'tablist' }, [tab('new', 'Report'), tab('mine', 'Your reports'), tab('prefs', 'Preferences')]),
        el('button', { class: 'x', type: 'button', 'aria-label': 'Close', text: '×', onclick: close }),
      ]),
      view === 'new' ? formView() : view === 'prefs' ? prefsView() : listView(),
    ]);
    scrim.appendChild(panel);
    var first = panel.querySelector(view === 'new' ? '.type' : view === 'prefs' ? 'input,textarea' : '.tab[aria-selected=true]');
    if (first) first.focus();
  }

  function formView() {
    var err = el('div', { class: 'err', role: 'alert' });
    var text = el('textarea', {
      'aria-label': 'What happened?', maxlength: '2000',
      placeholder: 'What happened, or what would you change?',
    });
    var sendBtn = el('button', { class: 'send', type: 'submit', text: 'Send' });
    var types = TYPES.map(function (t) {
      return el('button', {
        class: 'type', type: 'button', 'aria-pressed': String(state.type === t.id), 'data-type': t.id,
        onclick: function () {
          state.type = t.id;
          types.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-type') === t.id)); });
          text.focus();
        },
      }, [el('b', { text: t.label }), el('span', { text: t.hint })]);
    });
    var form = el('form', {
      onsubmit: function (e) {
        e.preventDefault();
        err.textContent = '';
        if (!state.type) { err.textContent = 'Pick what kind of report this is.'; return; }
        if (!text.value.trim()) { err.textContent = 'Say what happened.'; text.focus(); return; }
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';
        send(state.type, text.value.trim()).then(function (b) {
          state.type = null;
          state.reports = [b.report].concat(state.reports);
          markSeen();
          view = 'mine';
          renderPanel();
        }).catch(function (x) {
          err.textContent = x.message || 'Could not send. Try again.';
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send';
        });
      },
    }, [
      el('fieldset', {}, [el('legend', { text: 'What is it?' })].concat(types)),
      text,
      el('div', { class: 'row' }, [
        el('span', { class: 'small', text: reporter()
          ? 'This page, the app version and your preferences are attached.'
          : 'This page and the app version are attached.' }),
        sendBtn,
      ]),
      err,
    ]);
    return form;
  }

  function prefsView() {
    var p = prefs();
    var signedIn = identified();
    var status = el('span', { class: 'small', role: 'status' });
    var field = function (label, input, hint) {
      return el('label', { class: 'field' }, [
        el('span', {}, [document.createTextNode(label + ' '), el('i', { text: '(optional)' })]),
        input, hint ? el('span', { class: 'hint', text: hint }) : null,
      ]);
    };
    var name = el('input', { type: 'text', maxlength: '80', autocomplete: 'name' });
    var email = el('input', { type: 'email', maxlength: '200', autocomplete: 'email' });
    var note = el('textarea', { maxlength: '500', placeholder: 'For example: I use a screen reader, or I am usually on slow Wi-Fi.' });
    name.value = p.name || ''; email.value = p.email || ''; note.value = p.note || '';
    var err = el('div', { class: 'err', role: 'alert' });

    // Signed in: the app already told the team who this is. Say so, and ask nothing twice.
    var who = null;
    if (signedIn) {
      var shown = state.userLabel || state.userEmail || 'your account';
      var initials = (state.userLabel || state.userEmail || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2)
        .map(function (w) { return w[0].toUpperCase(); }).join('');
      who = el('div', { class: 'who' }, [
        el('span', { class: 'avatar', 'aria-hidden': 'true', text: initials }),
        el('div', {}, [
          el('b', { text: 'Signed in as ' + shown }),
          el('span', { class: 'small', text: state.userEmail && state.userLabel
            ? state.userEmail + '. The team sees this with each report and can reply.'
            : 'The team sees this with each report.' }),
        ]),
      ]);
    }

    return el('form', {
      role: 'tabpanel', novalidate: '',
      onsubmit: function (e) {
        e.preventDefault();
        err.textContent = '';
        var em = email.value.trim();
        if (!signedIn && em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { err.textContent = 'That email does not look right.'; email.focus(); return; }
        savePrefs(signedIn ? { name: p.name, email: p.email, note: note.value.trim() }
          : { name: name.value.trim(), email: em, note: note.value.trim() });
        status.textContent = 'Saved on this device.';
      },
    }, [
      who,
      signedIn ? null : field('Your name', name),
      signedIn ? null : field('Email', email, 'Only if you are happy for the team to reply to you.'),
      field('About your setup', note, 'Sent with every report, so you only say it once.'),
      el('div', { class: 'row' }, [
        el('button', { class: 'link', type: 'button', text: 'Clear all', onclick: function () {
          savePrefs({});
          renderPanel();
        } }),
        el('span', {}, [status, document.createTextNode(' '), el('button', { class: 'send', type: 'submit', text: 'Save' })]),
      ]),
      err,
      el('p', { class: 'small', text: 'Kept in this browser and sent only with reports you choose to send.' }),
    ]);
  }

  function listView() {
    listBox = el('div', { role: 'tabpanel' });
    renderList();
    return listBox;
  }

  function renderList() {
    if (!listBox) return;
    listBox.textContent = '';
    if (!state.reports.length) {
      listBox.appendChild(el('div', { class: 'empty', text: 'Nothing sent from this device yet.' }));
      return;
    }
    var s = seen();
    state.reports.forEach(function (r) {
      var label = (TYPES.filter(function (t) { return t.id === r.type; })[0] || {}).label || r.type;
      var fresh = r.status !== 'open' && s[r.id] !== r.status;
      listBox.appendChild(el('div', { class: 'item' }, [
        el('div', { class: 'status ' + r.status, text: (fresh ? '● ' : '') + STATUS[r.status] }),
        el('div', { class: 'text', text: r.text }),
        el('div', { class: 'small', text: label + ' · ' + new Date(r.created_at).toLocaleDateString() }),
        r.status === 'declined' && r.decline_reason
          ? el('div', { class: 'reason', text: 'Why: ' + r.decline_reason }) : null,
        r.status === 'fixed' && r.fix_note
          ? el('div', { class: 'reason', text: r.fix_note }) : null,
      ]));
    });
  }

  function mount() {
    if (dead) return;
    if (!host.isConnected) document.body.appendChild(host);
    refresh();
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  window.Heresay = window.Feedback = {
    __loaded: true,
    identify: function (u) {
      u = u || {};
      state.userId = u.id != null ? String(u.id) : null;
      state.userLabel = u.label != null ? String(u.label) : null;
      state.userEmail = u.email != null ? String(u.email) : null;
      if (scrim && view === 'prefs') renderPanel();
    },
    setVersion: function (v) { state.version = v != null ? String(v) : null; },
    setScreen: function (s) { state.screen = s != null ? String(s) : null; },
    open: function () { open('new'); },
    openPreferences: function () { open('prefs'); },
    close: close,
  };
})();
