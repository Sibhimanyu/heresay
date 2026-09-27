/*
 * The feedback SDK for the web. One line in the host page:
 *
 *   <script src="https://<sdk-host>/sdk.js" data-key="pk_..." defer></script>
 *
 * Optional attributes: data-version, data-user-id, data-user-label, data-position ("left").
 * Optional calls, any time after the script runs:
 *   Feedback.identify({ id, label })   who the host app says the user is
 *   Feedback.setVersion("1.4.0")
 *   Feedback.setScreen("Pump room")    for apps whose URL does not change per screen
 *   Feedback.open()
 *
 * No account, no cookies. The reporter is a random per-device id kept in localStorage, and
 * that id is also what lets them see what happened to their own reports.
 */
(function () {
  'use strict';
  if (window.Feedback && window.Feedback.__loaded) return;

  var script = document.currentScript
    || document.querySelector('script[src*="sdk.js"][data-key]');
  if (!script) return;
  var KEY = script.getAttribute('data-key');
  var API = new URL(script.src, location.href).origin + '/v1';
  if (!KEY) { console.warn('[feedback] missing data-key on the sdk.js script tag'); return; }

  var state = {
    version: script.getAttribute('data-version') || null,
    userId: script.getAttribute('data-user-id') || null,
    userLabel: script.getAttribute('data-user-label') || null,
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
    };
  }

  // ---- network ---------------------------------------------------------------------------

  function body(res) {
    return res.json().catch(function () { return {}; }).then(function (b) {
      if (!res.ok) throw new Error(b.error || ('HTTP ' + res.status));
      return b;
    });
  }

  function send(type, text) {
    // text/plain keeps this a "simple" request: no CORS preflight round trip.
    return fetch(API + '/reports', {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ key: KEY, device_id: deviceId(), type: type, text: text, context: context() }),
    }).then(body);
  }

  function refresh() {
    return fetch(API + '/reports/mine', {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ key: KEY, device_id: deviceId() }),
    }).then(body).then(function (b) {
      state.reports = b.reports || [];
      renderBadge();
      renderList();
    }).catch(function () { /* offline or blocked: the button still works */ });
  }

  // ---- ui --------------------------------------------------------------------------------

  var CSS = [
    ':host{all:initial;--fb-bg:#fff;--fb-fg:#1a1d1b;--fb-mute:#5d6660;--fb-line:#dde2de;--fb-acc:#1f6f4a;--fb-acc-fg:#fff;--fb-bad:#b3261e;',
    'font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fb-fg)}',
    '@media (prefers-color-scheme:dark){:host{--fb-bg:#171c19;--fb-fg:#e8ece9;--fb-mute:#9aa49e;--fb-line:#2c342f;--fb-acc:#5fc28d;--fb-acc-fg:#0d1210;--fb-bad:#f2b8b5}}',
    '*{box-sizing:border-box;font:inherit;color:inherit}',
    '.fab{position:fixed;bottom:20px;right:20px;z-index:2147483000;display:flex;align-items:center;gap:6px;',
    'padding:9px 14px;border-radius:999px;border:1px solid var(--fb-line);background:var(--fb-bg);color:var(--fb-fg);',
    'box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer;font-weight:600}',
    '.fab.left{right:auto;left:20px}',
    '.dot{width:8px;height:8px;border-radius:50%;background:var(--fb-acc)}',
    '.scrim{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:flex-end;padding:16px}',
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
    'textarea:focus,.type:focus-visible,button:focus-visible{outline:2px solid var(--fb-acc);outline-offset:1px}',
    '.row{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px}',
    '.small{font-size:12px;color:var(--fb-mute)}',
    '.send{padding:9px 16px;border:0;border-radius:10px;background:var(--fb-acc);color:var(--fb-acc-fg);font-weight:600;cursor:pointer}',
    '.send[disabled]{opacity:.5;cursor:default}',
    '.err{color:var(--fb-bad);font-size:13px;margin-top:8px}',
    '.item{border-top:1px solid var(--fb-line);padding:10px 0}',
    '.item:first-child{border-top:0}',
    '.status{font-size:12px;font-weight:600}',
    '.status.fixed,.status.accepted{color:var(--fb-acc)}',
    '.reason{margin-top:4px;padding:8px;border-radius:8px;background:var(--fb-line);font-size:13px}',
    '.text{margin:2px 0;white-space:pre-wrap;word-break:break-word}',
    '.empty{color:var(--fb-mute);padding:12px 0}',
  ].join('');

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

  var fabDot = el('span', { class: 'dot', hidden: '' });
  var fab = el('button', {
    class: 'fab' + (script.getAttribute('data-position') === 'left' ? ' left' : ''),
    type: 'button', 'aria-haspopup': 'dialog', onclick: function () { open(); },
  }, [el('span', { text: 'Report' }), fabDot]);
  root.appendChild(fab);

  var scrim = null, view = 'new', listBox = null, lastFocus = null;

  function renderBadge() {
    var n = unseen();
    if (n) fabDot.removeAttribute('hidden'); else fabDot.setAttribute('hidden', '');
    fab.setAttribute('aria-label', n ? 'Report a problem. ' + n + ' of your reports have an update' : 'Report a problem');
  }

  renderBadge();

  function open(which) {
    if (scrim) return;
    lastFocus = document.activeElement;
    view = which || (unseen() ? 'mine' : 'new');
    scrim = el('div', { class: 'scrim', onclick: function (e) { if (e.target === scrim) close(); } });
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
        el('div', { class: 'tabs', role: 'tablist' }, [tab('new', 'Report'), tab('mine', 'Your reports')]),
        el('button', { class: 'x', type: 'button', 'aria-label': 'Close', text: '×', onclick: close }),
      ]),
      view === 'new' ? formView() : listView(),
    ]);
    scrim.appendChild(panel);
    var first = panel.querySelector(view === 'new' ? '.type' : '.tab[aria-selected=true]');
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
        el('span', { class: 'small', text: 'The current screen and app version are attached.' }),
        sendBtn,
      ]),
      err,
    ]);
    return form;
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
      ]));
    });
  }

  function mount() {
    if (!host.isConnected) document.body.appendChild(host);
    refresh();
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  window.Feedback = {
    __loaded: true,
    identify: function (u) {
      u = u || {};
      state.userId = u.id != null ? String(u.id) : null;
      state.userLabel = u.label != null ? String(u.label) : null;
    },
    setVersion: function (v) { state.version = v != null ? String(v) : null; },
    setScreen: function (s) { state.screen = s != null ? String(s) : null; },
    open: function () { open('new'); },
    close: close,
  };
})();
