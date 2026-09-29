/* The team's side of a Heresay: sign in, add apps, read reports, accept or decline them. */
(function () {
  'use strict';
  var auth = firebase.auth();
  var LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (LOCAL) auth.useEmulator('http://127.0.0.1:9199');

  var $ = function (id) { return document.getElementById(id); };
  var TYPE_LABEL = { broken: 'Broken', confusing: 'Confusing', improvement: 'Could be better', idea: 'Idea' };
  var STATUS_LABEL = { open: 'Open', accepted: 'Accepted', fixed: 'Fixed', declined: 'Declined' };
  var SDK_URL = location.origin + '/sdk/v1.js';
  var me = null, projects = [], timer = null;

  // ---- plumbing --------------------------------------------------------------------------

  function api(method, path, body) {
    return auth.currentUser.getIdToken().then(function (tok) {
      return fetch('/v1' + path, {
        method: method,
        headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (b) {
        if (!res.ok) { var e = new Error(b.error || ('HTTP ' + res.status)); e.status = res.status; e.code = b.code; throw e; }
        return b;
      });
    });
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function show(which) {
    ['gate', 'blocked', 'app'].forEach(function (id) { $(id).hidden = id !== which; });
  }

  function copyButton(getText, label) {
    var b = el('button', { class: 'btn', type: 'button', text: label || 'Copy' });
    b.onclick = function () {
      navigator.clipboard.writeText(getText()).then(function () {
        b.textContent = 'Copied';
        setTimeout(function () { b.textContent = label || 'Copy'; }, 1600);
      });
    };
    return b;
  }

  function codeBlock(text) {
    return el('div', { class: 'code' }, [el('pre', { text: text }), copyButton(function () { return text; })]);
  }

  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function every(ms, fn) {
    stopTimer();
    timer = setInterval(function () { if (!document.hidden) fn(); }, ms);
  }

  // ---- sign-in ---------------------------------------------------------------------------

  function gateMsg(text, bad) { $('gate-msg').textContent = text; $('gate-msg').className = 'gate-msg' + (bad ? ' bad' : ''); }

  $('google').onclick = function () {
    gateMsg('');
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function (e) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      if (e.code === 'auth/operation-not-allowed') gateMsg('Google sign-in is off for this Heresay. Use an email link instead.', true);
      else if (e.code === 'auth/popup-blocked') gateMsg('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.', true);
      else gateMsg(e.message, true);
    });
  };

  var finishingLink = auth.isSignInWithEmailLink(location.href);
  $('link-form').onsubmit = function (e) {
    e.preventDefault();
    var email = $('link-email').value.trim();
    if (finishingLink) return finishLink(email);
    gateMsg('Sending…');
    auth.sendSignInLinkToEmail(email, { url: location.origin + '/app/', handleCodeInApp: true })
      .then(function () {
        localStorage.setItem('heresay.email', email);
        gateMsg('Check your inbox at ' + email + '. The link signs you in here. It can take a minute, and may land in spam.');
      })
      .catch(function (x) {
        gateMsg(x.code === 'auth/operation-not-allowed'
          ? 'Email links are off for this Heresay. Use Google instead.' : x.message, true);
      });
  };

  function finishLink(email) {
    auth.signInWithEmailLink(email, location.href)
      .then(function () { localStorage.removeItem('heresay.email'); history.replaceState(null, '', '/app/'); finishingLink = false; })
      .catch(function (x) {
        gateMsg(x.code === 'auth/invalid-action-code'
          ? 'That link has expired or was already used. Ask for a new one.' : x.message, true);
        history.replaceState(null, '', '/app/'); finishingLink = false;
        $('link-form').querySelector('button').textContent = 'Email me a sign-in link';
      });
  }
  if (finishingLink) {
    var saved = localStorage.getItem('heresay.email');
    if (saved) finishLink(saved);
    else {
      // Opened on another device: we need the address again before Firebase will accept the link.
      $('link-form').querySelector('button').textContent = 'Finish signing in';
      gateMsg('Type the email the link was sent to, to finish signing in.');
    }
  }

  $('signout').onclick = $('blocked-out').onclick = function () { auth.signOut(); };

  auth.onAuthStateChanged(function (user) {
    stopTimer();
    if (!user) { me = null; show('gate'); return; }
    api('GET', '/me').then(function (b) {
      me = b;
      $('who').textContent = b.email;
      show('app');
      route();
    }).catch(function (x) {
      show('blocked');
      if (x.code === 'not_member') {
        $('blocked-title').textContent = 'You’re not on this team yet';
        $('blocked-text').textContent = (user.email || 'This account') + ' isn’t a member of this Heresay. Ask an owner to add you under Team, then sign in again.';
      } else if (x.code === 'no_instance') {
        $('blocked-title').textContent = 'Setup isn’t finished';
        $('blocked-text').textContent = 'This Heresay has no owner yet. Run npx create-heresay again on the computer that set it up; it picks up where it stopped.';
      } else {
        $('blocked-title').textContent = 'Can’t reach this Heresay';
        $('blocked-text').textContent = x.message;
      }
    });
  });

  // ---- routes ----------------------------------------------------------------------------

  window.addEventListener('hashchange', function () { if (me) route(); });

  function route() {
    stopTimer();
    var hash = location.hash.replace(/^#\/?/, '');
    var query = new URLSearchParams(hash.split('?')[1] || '');
    var parts = hash.split('?')[0].split('/').filter(Boolean);
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.setAttribute('aria-current', String((parts[0] === 'team') === (a.dataset.nav === 'team')));
    });
    var view = $('view');
    view.textContent = '';
    if (parts[0] === 'team') return teamView(view);
    if (parts[0] === 'connect') return connectView(view, query);
    if (parts[0] === 'new') return newAppView(view, parts[1], query);
    if (parts[0] === 'apps' && parts[1]) {
      return withProject(parts[1], function (p) {
        if (parts[2] === 'setup') setupView(view, p);
        else if (parts[2] === 'delete') deleteView(view, p);
        else reportsView(view, p);
      });
    }
    appsView(view);
  }

  function withProject(id, fn) {
    var hit = projects.filter(function (p) { return p.id === id; })[0];
    if (hit) return fn(hit);
    api('GET', '/projects/' + id).then(function (b) { fn(b.project); })
      .catch(function () { location.hash = '#/'; });
  }

  // ---- apps ------------------------------------------------------------------------------

  var PLATFORMS = [
    { id: 'web', label: 'Web', note: 'Any site or web app', ready: true,
      icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>' },
    { id: 'ios', label: 'iOS', note: 'iPhone and iPad, SwiftUI', ready: true, apple: true,
      icon: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>' },
    { id: 'macos', label: 'macOS', note: 'Mac apps, SwiftUI', ready: true, apple: true,
      icon: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M1.5 19.5h21"/>' },
    { id: 'android', label: 'Android', note: 'Phones and tablets',
      icon: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M8 8a4 4 0 0 1 8 0M8.5 4.5l1 1.5M15.5 4.5l-1 1.5"/>' },
    { id: 'react-native', label: 'React Native', note: 'One app, both stores',
      icon: '<ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>' },
    { id: 'flutter', label: 'Flutter', note: 'Dart, any platform',
      icon: '<path d="M14 3 5 12l3 3L20 3zM14 12l-5 5 5 5h6l-5-5 5-5z"/>' },
  ];
  var platformOf = function (id) { return PLATFORMS.filter(function (x) { return x.id === id; })[0] || PLATFORMS[0]; };
  var icon = function (p) { return el('span', { class: 'picon', html: '<svg viewBox="0 0 24 24" aria-hidden="true">' + p.icon + '</svg>' }); };

  function appsView(view) {
    api('GET', '/projects').then(function (b) {
      projects = b.projects;
      if (!projects.length) {
        view.appendChild(el('section', { class: 'hello' }, [
          el('h1', { text: 'Add your first app' }),
          el('p', { class: 'mute', text: 'Heresay puts a Report button in your app. When someone taps it, the report lands here, and they hear back when you answer.' }),
          el('a', { class: 'btn primary', href: '#/new', text: 'Add an app' }),
        ]));
        return;
      }
      view.appendChild(el('div', { class: 'head' }, [
        el('h1', { text: 'Apps' }),
        el('a', { class: 'btn primary', href: '#/new', text: 'Add an app' }),
      ]));
      var grid = el('div', { class: 'apps' });
      projects.forEach(function (p) {
        var count = el('span', { class: 'count', text: ' ' });
        var card = el('a', { class: 'app-card', href: '#/apps/' + p.id }, [
          icon(platformOf(p.platform)),
          el('div', {}, [el('b', { text: p.name }), el('span', { class: 'mute', text: platformOf(p.platform).label + (p.framework ? ' · ' + frameworkLabel(p.framework) : '') })]),
          count,
        ]);
        grid.appendChild(card);
        api('GET', '/projects/' + p.id + '/reports').then(function (r) {
          var open = r.reports.filter(function (x) { return x.status === 'open'; }).length;
          // No report yet means setup isn't proven: send them back to finish it.
          if (!r.reports.length && !p.sdk_seen && !p.code_found) { card.href = '#/apps/' + p.id + '/setup'; count.textContent = 'Setup not finished'; count.className = 'count todo'; return; }
          count.textContent = !r.reports.length ? 'No reports yet' : open ? open + ' open' : 'All answered';
          if (open) count.className = 'count on';
        });
      });
      view.appendChild(grid);
    });
  }

  // ---- add an app ------------------------------------------------------------------------

  // 'unknown' is sent as no framework: many apps are built by an agent and their owner may not know.
  var FRAMEWORKS = [
    ['unknown', 'Not sure'], ['html', 'Plain HTML'], ['react', 'React'], ['next', 'Next.js'], ['vue', 'Vue'], ['nuxt', 'Nuxt'],
    ['svelte', 'SvelteKit'], ['angular', 'Angular'], ['other', 'Something else'],
  ];
  function frameworkLabel(id) { var f = FRAMEWORKS.filter(function (x) { return x[0] === id; })[0]; return f ? f[1] : id; }

  /**
   * The four steps. Earlier ones are links, so you can go back and change things; later ones
   * aren't, because each step needs the one before it. `tested` marks the last step done.
   */
  function stepper(active, p, tested) {
    var q = p ? '?app=' + p.id : '';
    var links = ['#/new' + q, p ? '#/new/' + p.platform + q : null, p ? '#/apps/' + p.id + '/setup' : null, null];
    var names = ['Platform', 'Details', 'Install', 'Test'];
    return el('ol', { class: 'steps' }, names.map(function (s, i) {
      var n = i + 1;
      var cls = n < active || (tested && n <= 4) ? 'done' : n === active ? 'now' : '';
      var inner = [el('span', { text: tested && n <= 4 ? '✓' : String(n) }), s];
      var back = n < active && links[i];
      return el('li', { class: cls }, back ? [el('a', { href: links[i], 'aria-label': 'Back to ' + s }, inner)] : inner);
    }));
  }

  /** Adding an app, or with ?app=<id>, going back to change one that already exists. */
  function newAppView(view, platform, query) {
    var editId = query && query.get('app');
    if (editId) return withProject(editId, function (p) { drawNewApp(view, platform, p); });
    drawNewApp(view, platform, null);
  }

  function drawNewApp(view, platform, editing) {
    var q = editing ? '?app=' + editing.id : '';
    if (!platform) {
      view.appendChild(stepper(1, editing));
      view.appendChild(el('h1', { text: 'What are you adding Heresay to?' }));
      var grid = el('div', { class: 'platforms' });
      PLATFORMS.forEach(function (p) {
        grid.appendChild(el(p.ready ? 'a' : 'div', {
          class: 'platform' + (p.ready ? '' : ' soon') + (editing && editing.platform === p.id ? ' current' : ''), href: p.ready ? '#/new/' + p.id + q : null,
          'aria-disabled': p.ready ? null : 'true',
        }, [icon(p), el('b', { text: p.label }), el('span', { class: 'mute', text: p.note }), p.ready ? null : el('span', { class: 'tag', text: 'Soon' })]));
      });
      view.appendChild(grid);
      view.appendChild(el('p', { class: 'mute small', text: 'Other platforms can already send reports through the API. See the docs, under Other platforms.' }));
      return;
    }

    view.appendChild(stepper(2, editing));
    var native = !!platformOf(platform).apple;
    view.appendChild(el('h1', { text: 'About your ' + platformOf(platform).label + ' app' }));
    var err = el('p', { class: 'err', role: 'alert' });
    var fw = editing && editing.framework && !editing.framework_detected ? editing.framework : 'unknown';
    var chips = el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Framework' });
    FRAMEWORKS.forEach(function (f) {
      chips.appendChild(el('button', {
        type: 'button', role: 'radio', 'aria-checked': String(f[0] === fw), text: f[1],
        onclick: function (e) {
          fw = f[0];
          chips.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-checked', String(b === e.target)); });
        },
      }));
    });
    var form = el('form', { class: 'form' }, native ? [
      el('label', {}, ['Name', el('input', { name: 'name', required: true, maxlength: '80', placeholder: 'Acme for ' + platformOf(platform).label, autocomplete: 'off' })]),
      el('p', { class: 'hint', text: 'Native apps have no web address to lock the key to, so any copy of your app can send reports. The per-device, per-network and per-app rate limits still apply.' }),
      el('div', { class: 'row' }, [el('a', { class: 'btn ghost', href: '#/new' + q, text: 'Back' }), el('button', { class: 'btn primary', text: editing ? 'Save and continue' : 'Create app' })]),
      err,
    ] : [
      el('label', {}, ['Name', el('input', { name: 'name', required: true, maxlength: '80', placeholder: 'Acme web', autocomplete: 'off' })]),
      el('div', { class: 'field' }, [el('span', { class: 'lbl' }, ['Built with ', el('span', { class: 'opt', text: 'optional' })]), chips,
        el('p', { class: 'hint', text: 'Only changes the install steps we show. Not sure? Leave it: your coding agent can work it out, and the general steps work everywhere.' })]),
      el('label', {}, ['Where it runs', el('textarea', { name: 'origins', rows: '3', placeholder: 'https://app.example.com\nhttp://localhost:3000' })]),
      el('p', { class: 'hint', text: 'One address per line: your live site and anywhere you test it. Only these sites can send reports with this app’s key. Leave it empty to allow any site while you try things out.' }),
      el('div', { class: 'row' }, [el('a', { class: 'btn ghost', href: '#/new' + q, text: 'Back' }), el('button', { class: 'btn primary', text: editing ? 'Save and continue' : 'Create app' })]),
      err,
    ]);
    form.onsubmit = function (e) {
      e.preventDefault();
      err.textContent = '';
      var origins = native ? [] : form.origins.value.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      var body = { name: form.name.value, platform: platform, framework: native ? 'swiftui' : (fw === 'unknown' ? null : fw), allowed_origins: origins };
      // Editing keeps the key, so a line already pasted into the app keeps working.
      (editing ? api('PATCH', '/projects/' + editing.id, body) : api('POST', '/projects', body))
        .then(function (b) {
          projects = projects.filter(function (x) { return x.id !== b.project.id; }).concat([b.project]);
          location.hash = '#/apps/' + b.project.id + '/setup';
        })
        .catch(function (x) { err.textContent = x.message; });
    };
    view.appendChild(form);
    if (editing) {
      form.name.value = editing.name;
      if (!native) form.origins.value = editing.allowed_origins.join('\n');
    }
    form.name.focus();
  }

  // ---- install and test ------------------------------------------------------------------

  function tag(p) { return '<script src="' + SDK_URL + '" data-key="' + p.key + '" defer></scr' + 'ipt>'; }

  /** Where the tag goes for one framework: [where, code]. */
  function placement(fw, p) {
    if (fw === 'next') {
      return ['In <code>app/layout.tsx</code>, inside <code>&lt;body&gt;</code> after <code>{children}</code>:',
        "import Script from 'next/script';\n\n<Script src=\"" + SDK_URL + "\" data-key=\"" + p.key + "\" strategy=\"afterInteractive\" />"];
    }
    if (fw === 'nuxt') {
      return ['In <code>nuxt.config.ts</code>:',
        "export default defineNuxtConfig({\n  app: { head: { script: [{ src: '" + SDK_URL + "', 'data-key': '" + p.key + "', defer: true }] } },\n});"];
    }
    return [{
      html: 'Paste this before <code>&lt;/body&gt;</code> on every page:',
      react: 'Paste this before <code>&lt;/body&gt;</code> in <code>index.html</code> (Vite) or <code>public/index.html</code> (Create React App):',
      vue: 'Paste this before <code>&lt;/body&gt;</code> in <code>index.html</code>:',
      svelte: 'Paste this before <code>&lt;/body&gt;</code> in <code>src/app.html</code>:',
      angular: 'Paste this before <code>&lt;/body&gt;</code> in <code>src/index.html</code>:',
    }[fw] || 'Load this once on every page, as late as you can, for example before <code>&lt;/body&gt;</code>:', tag(p)];
  }

  var SWIFT_PACKAGE = 'https://github.com/Sibhimanyu/heresay-swift';

  function appleByHand(p) {
    var mac = p.platform === 'macos';
    var code = [
      'import SwiftUI',
      'import Heresay',
      '',
      '@main',
      'struct MyApp: App {',
      '    init() {',
      '        Heresay.configure(key: "' + p.key + '", url: URL(string: "' + location.origin + '")!)',
      '    }',
      '    var body: some Scene {',
      '        WindowGroup {',
      mac ? '            ContentView().heresay()' : '            ContentView().heresayReportButton()',
      '        }',
    ].concat(mac ? ['        .commands { HeresayCommands() }'] : []).concat(['    }', '}']).join('\n');
    return [
      el('p', { html: '<b>1.</b> In Xcode, choose <b>File › Add Package Dependencies…</b> and paste:' }),
      codeBlock(SWIFT_PACKAGE),
      el('p', { html: '<b>2.</b> Configure it once, where your app starts, and add the ' + (mac ? 'menu item (Help › Report a Problem…)' : 'Report button') + ':' }),
      codeBlock(code),
      el('p', { class: 'hint', html: 'Optional: <code>Heresay.identify(id:label:)</code> after sign-in, <code>Heresay.setScreen("Checkout")</code> as people move around, and <code>Heresay.present()</code> to open it from your own button. Needs iOS 16 or macOS 13.' }),
    ];
  }

  function byHand(p) {
    if (platformOf(p.platform).apple) return appleByHand(p);
    var fw = p.framework;
    if (fw && fw !== 'other') {
      var one = placement(fw, p);
      return [el('p', { html: one[0] }), codeBlock(one[1])];
    }
    // No framework given: the one tag that works anywhere, and where it goes for the common ones.
    var where = el('details', { class: 'where' }, [el('summary', { text: 'Where does this go in my project?' })]);
    FRAMEWORKS.forEach(function (f) {
      if (f[0] === 'unknown' || f[0] === 'other') return;
      var x = placement(f[0], p);
      var same = x[1] === tag(p); // same tag as above: say where, don't repeat it
      where.appendChild(el('div', { class: 'where-item' }, [el('b', { text: f[1] }),
        el('p', { html: same ? x[0].replace(/^Paste this/, 'Paste the tag').replace(/:$/, '.') : x[0] }),
        same ? null : codeBlock(x[1])]));
    });
    return [
      el('p', { html: 'Load this once on every page, as late as you can, for example just before <code>&lt;/body&gt;</code>:' }),
      codeBlock(tag(p)),
      where,
    ];
  }

  /** The unused prompt token last made for an app in this tab (hst_<id>_<secret>), or set it. */
  function promptToken(appId, token) {
    var k = 'heresay.prompt-token.' + appId;
    try {
      if (token === undefined) return sessionStorage.getItem(k);
      sessionStorage.setItem(k, token);
    } catch (e) { return null; }
  }

  /** One prompt that connects the repo, installs Heresay and waits for the test report. */
  function onePrompt(p, token) {
    var apple = platformOf(p.platform).apple;
    return [
      'Set up Heresay, in-app feedback, in this repo. Do these steps in order.',
      '',
      '1. Connect this repo to Heresay. This adds .mcp.json, a Heresay skill and an AGENTS.md section, and saves the token in ~/.heresay, outside the repo. Do not copy the token into any file.',
      '',
      '   npx -y heresay@latest connect --url ' + location.origin + ' --token ' + token + ' --yes',
      '',
      '2. Print the install steps for this app and follow them. They include the app\'s key and exactly where the code goes' + (apple ? ' (a Swift package and one line of setup).' : ', for any framework.'),
      '',
      '   npx -y heresay@latest install ' + p.id,
      '',
      '3. Verify the install. This finds the app\'s key in the code and tells the Heresay dashboard, which is waiting for it:',
      '',
      '   npx -y heresay@latest check ' + p.id,
      '',
      '   You are done when it prints "installed": true. If it doesn\'t, fix what it says and run it again.',
      '',
      'Change nothing else in the app.',
    ].join('\n');
  }

  function setupView(view, p) {
    var apple = platformOf(p.platform).apple;
    var steps = stepper(3, p, false);
    view.appendChild(steps);
    view.appendChild(el('div', { class: 'head' }, [el('h1', { text: 'Put Heresay in ' + p.name })]));

    // The agent route: one prompt by default, with the same thing as two steps for people who
    // would rather run the command themselves.
    // The prompt is copied, not shown: it's long, and it carries a token.
    var promptBox = el('div', { class: 'copy-prompt' });
    var copyBtn = el('button', { class: 'btn primary', type: 'button', text: 'Copy prompt' });
    var copyNote = el('p', { class: 'hint', role: 'status', text: 'It connects the repo, installs Heresay and verifies it. This page ticks over by itself when it’s done.' });
    function makePrompt() {
      // The same prompt every time for this app in this tab, so going back to explore while an
      // agent works on it doesn't hand out a second token. A new one only once the last is used
      // by a repo or revoked. No repo yet: the token binds to whichever repo runs it first.
      var cached = promptToken(p.id);
      var fresh = function () {
        return api('POST', '/agent-tokens', { app_ids: [p.id] }).then(function (b) {
          promptToken(p.id, b.token);
          return onePrompt(p, b.token);
        });
      };
      if (!cached) return fresh();
      var id = cached.split('_')[1];
      return api('GET', '/agent-tokens').then(function (b) {
        var t = b.tokens.filter(function (x) { return x.id === id; })[0];
        return t && !t.repo ? onePrompt(p, cached) : fresh();
      });
    }
    copyBtn.onclick = function () {
      copyBtn.disabled = true;
      var text = makePrompt();
      // Safari only allows a copy inside the click, so hand the clipboard a promise of the text.
      var copied = window.ClipboardItem && navigator.clipboard.write
        ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(function (t) { return new Blob([t], { type: 'text/plain' }); }) })])
        : text.then(function (t) { return navigator.clipboard.writeText(t); });
      Promise.all([text, copied]).then(function () {
        copyBtn.disabled = false;
        copyBtn.textContent = 'Copied ✓';
        copyNote.className = 'ok-msg';
        copyNote.innerHTML = '';
        copyNote.appendChild(document.createTextNode('Copied. Paste it into your coding agent and send it. It carries a token for this app that works only in the first repo that uses it; you can revoke it under '));
        copyNote.appendChild(el('a', { href: '#/connect', text: 'Connected repos' }));
        copyNote.appendChild(document.createTextNode('.'));
        setTimeout(function () { copyBtn.textContent = 'Copy prompt'; }, 2500);
      }).catch(function (x) {
        copyBtn.disabled = false;
        copyNote.className = 'err';
        copyNote.textContent = x && x.message ? x.message : 'Couldn’t copy. Try again.';
      });
    };
    promptBox.appendChild(copyBtn);
    promptBox.appendChild(copyNote);

    // The agent route comes first on every platform; doing it by hand is the fallback.
    var panes = { hand: el('div', { hidden: true }, byHand(p)), agent: el('div', {}, [
      el('p', { html: 'Open your coding agent (Claude Code, Cursor, Codex, …) in your app’s repo, then paste in this prompt.' }),
      promptBox,
      el('details', { class: 'alt' }, [el('summary', { text: 'Prefer to run the command yourself?' }),
        el('ol', { class: 'agent-steps' }, [
          el('li', {}, [el('b', { text: 'In your app’s repo, run:' }), codeBlock('npx heresay connect --url ' + location.origin),
            el('p', { class: 'hint', text: 'It opens this dashboard to make a token for the repo, and adds the Heresay skill and MCP server for your agent. The token stays on your computer, not in the repo.' })]),
          el('li', {}, [el('b', { text: 'Then tell your agent:' }), codeBlock('Add Heresay to this app'),
            el('p', { class: 'hint', text: 'It installs Heresay in the right place and verifies it. Later, “Fix the next Heresay report” works the same way.' })]),
        ])]),
    ]) };
    var tabs = el('div', { class: 'seg', role: 'tablist' });
    [['agent', 'Ask your coding agent'], ['hand', 'Add it yourself']].forEach(function (t, i) {
      tabs.appendChild(el('button', {
        type: 'button', role: 'tab', 'aria-selected': String(i === 0), text: t[1],
        onclick: function (e) {
          tabs.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', String(b === e.target)); });
          panes.hand.hidden = t[0] !== 'hand'; panes.agent.hidden = t[0] !== 'agent';
        },
      }));
    });
    view.appendChild(el('section', { class: 'card' }, [
      tabs, panes.hand, panes.agent,
      apple
        ? el('p', { class: 'hint', text: 'Your key is meant to be public: it can only send reports, never read them. It is fine in your source code.' })
        : el('p', { class: 'hint', html: 'Your key is meant to be public: it only lets the sites you listed send reports. Optional extras (who is signed in, your app version, your brand colour) are in the <a href="/docs.html#options" target="_blank">docs</a>.' }),
    ]));

    // Step 4 lives on this page and needs nobody to do anything: it completes when Heresay is
    // found in the code (the agent's `heresay check`) or seen running in the app (any SDK call).
    // Nothing moves on until then, because that is the proof the install works.
    var rowCode = checkRow('In your code', 'Waiting for your agent to confirm it, or for your app to load it.');
    var rowRun = checkRow('Running in your app', apple ? 'Waiting for your app to start with Heresay in it.' : 'Waiting for a page with Heresay on it to load, anywhere: your live site or localhost.');
    var status = el('div', { class: 'wait', role: 'status', text: 'Checking automatically…' });
    var feed = el('ul', { class: 'feed', 'aria-live': 'polite' });
    var cont = el('button', { class: 'btn primary', type: 'button', disabled: true, text: 'Continue to reports' });
    cont.onclick = function () { location.hash = '#/apps/' + p.id; };
    var lockNote = el('span', { class: 'hint', text: 'Unlocks as soon as the install is verified.' });
    view.appendChild(el('section', { class: 'card test' }, [
      el('div', { class: 'test-head' }, [el('span', { class: 'stepnum', text: '4' }), el('h2', { text: 'Verify' })]),
      el('p', { class: 'mute', text: 'Heresay checks this by itself. No test report needed.' }),
      el('ul', { class: 'checks-list' }, [rowCode.li, rowRun.li]),
      status,
      feed,
      el('div', { class: 'row split' }, [el('span', { class: 'spacer' }), lockNote, cont]),
    ]));

    function checkRow(title, waiting) {
      var mark = el('span', { class: 'mark', 'aria-hidden': 'true' });
      var detail = el('span', { class: 'mute small', text: waiting });
      var li = el('li', {}, [mark, el('div', {}, [el('b', { text: title }), detail])]);
      return {
        li: li,
        set: function (text) { li.className = 'ok'; detail.textContent = text; },
        // The other check proved it already; this one stops waiting and says it is optional.
        settle: function (text) { if (li.className !== 'ok') { li.className = 'skip'; detail.textContent = text; } },
      };
    }

    var known = {}, first = true;
    function ago(iso) {
      var s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
      return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : new Date(iso).toLocaleString();
    }
    function check() {
      Promise.all([api('GET', '/projects/' + p.id), api('GET', '/projects/' + p.id + '/reports')]).then(function (x) {
        var app = x[0].project, rs = x[1].reports.slice().sort(function (a, c) { return a.created_at < c.created_at ? 1 : -1; });
        if (app.code_found) rowCode.set('Found in ' + app.code_found.file + ' (' + app.code_found.repo + '), ' + ago(app.code_found.at));
        if (app.sdk_seen) rowRun.set('Seen on ' + app.sdk_seen.where + ', ' + ago(app.sdk_seen.at));
        var ok = !!(app.code_found || app.sdk_seen || rs.length);
        if (ok && cont.disabled) {
          cont.disabled = false;
          lockNote.remove();
          status.className = 'wait ok';
          status.textContent = 'Installed. Reports will arrive here and on the reports page.';
          steps.replaceWith(steps = stepper(3, p, true));
        }
        if (ok) {
          rowCode.settle('Optional. Your coding agent confirms it with npx heresay check.');
          rowRun.settle('Optional. Shows here the first time your app loads Heresay.');
        }
        // Any reports that do come in show up live, so nobody has to leave the page to see one.
        feed.textContent = '';
        rs.slice(0, 5).forEach(function (r) {
          feed.appendChild(el('li', { class: !first && !known[r.id] ? 'fresh' : '' }, [
            el('span', { class: 'pill ' + r.type, text: TYPE_LABEL[r.type] }),
            el('span', { class: 'feed-text', text: r.text }),
            el('span', { class: 'mute small', text: [r.context.route, r.context.platform, new Date(r.created_at).toLocaleTimeString()].filter(Boolean).join(' · ') }),
          ]));
          known[r.id] = true;
        });
        first = false;
      }).catch(function () {});
    }
    check();
    every(3000, check);
  }

  // ---- reports ---------------------------------------------------------------------------

  var filter = 'open';

  function reportsView(view, p) {
    var reports = [];
    var filters = el('nav', { class: 'filters', 'aria-label': 'Filter' });
    var list = el('div', { class: 'reports' });
    var empty = el('p', { class: 'empty' });
    var ctx = { repos: [], briefs: {} };
    var repoLine = el('p', { class: 'repos-line' });
    view.appendChild(el('a', { class: 'back', href: '#/', text: '← All apps' }));
    view.appendChild(el('div', { class: 'head' }, [
      el('div', { class: 'title' }, [icon(platformOf(p.platform)), el('div', {}, [el('h1', { text: p.name }),
        p.framework ? el('span', { class: 'mute small', text: frameworkLabel(p.framework) + (p.framework_detected ? ' (detected)' : '') }) : null])]),
      el('div', { class: 'row tight' }, [
        el('a', { class: 'btn', href: '#/apps/' + p.id + '/setup', text: 'Install' }),
        el('a', { class: 'btn ghost', href: '#/apps/' + p.id + '/delete', text: 'Delete…' }),
      ]),
    ]));
    view.appendChild(repoLine);
    view.appendChild(filters);
    view.appendChild(list);
    view.appendChild(empty);

    function load() {
      return Promise.all([
        api('GET', '/projects/' + p.id + '/reports'),
        api('GET', '/projects/' + p.id + '/repos'),
      ]).then(function (x) {
        reports = x[0].reports; ctx.briefs = x[0].briefs || {}; ctx.repos = x[1].repos;
        repoLine.textContent = '';
        repoLine.appendChild(document.createTextNode(ctx.repos.length
          ? 'Agents fix these in: ' + ctx.repos.join(', ') + ' · ' : 'No repo connected for agents yet · '));
        repoLine.appendChild(el('a', { href: '#/connect?app=' + p.id, text: 'Connect a repo' }));
        render();
      });
    }

    function render() {
      filters.textContent = '';
      ['open', 'accepted', 'fixed', 'declined', 'all'].forEach(function (f) {
        var n = f === 'all' ? reports.length : reports.filter(function (r) { return r.status === f; }).length;
        filters.appendChild(el('button', {
          'aria-pressed': String(filter === f),
          onclick: function () { filter = f; render(); },
        }, [(f === 'all' ? 'All' : STATUS_LABEL[f]) + ' ', el('span', { class: 'n', text: String(n) })]));
      });
      list.textContent = '';
      var shown = reports.filter(function (r) { return filter === 'all' || r.status === filter; });
      empty.hidden = shown.length > 0;
      empty.textContent = '';
      if (!reports.length) {
        empty.appendChild(document.createTextNode('No reports yet. '));
        empty.appendChild(el('a', { href: '#/apps/' + p.id + '/setup', text: 'Check the install' }));
      } else empty.textContent = filter === 'open' ? 'Nothing waiting. Every report has had its hearing.' : 'Nothing here.';
      shown.forEach(function (r) { list.appendChild(row(p, r, load, ctx)); });
    }

    load();
    // Reports arrive while you read. Don't refresh under someone typing a decline reason.
    every(30000, function () { if (!list.querySelector('textarea')) load(); });
  }

  function ctxLine(c) {
    return [c.page_title, c.route, c.app_version && ('v' + c.app_version), c.platform, c.os, c.browser,
      c.viewport, c.user_label || c.user_id]
      .filter(Boolean).join(' · ');
  }

  /** What the reporter said about themselves, in the SDK's Preferences. Their words, not verified. */
  function reporterLine(rp) {
    if (!rp) return null;
    var who = [rp.name, rp.email].filter(Boolean).join(' · ');
    return el('div', { class: 'ctx' }, [
      who ? el('span', {}, [document.createTextNode('From: ' + who + ' ')]) : null,
      rp.email ? el('a', { href: 'mailto:' + encodeURIComponent(rp.email).replace(/%40/g, '@'), text: 'Reply' }) : null,
      rp.note ? el('div', { text: 'About their setup: ' + rp.note }) : null,
    ]);
  }

  function row(p, r, reload, ctx) {
    var brief = ctx.briefs[r.id];
    var err = el('span', { class: 'err' });
    var actions = el('div', { class: 'actions' });
    var act = function (action, body) {
      err.textContent = '';
      return api('POST', '/projects/' + p.id + '/reports/' + r.id + '/' + action, body)
        .then(reload)
        .catch(function (x) { err.textContent = x.message; if (x.status === 409) reload(); });
    };

    function buttons() {
      actions.textContent = '';
      if (r.status === 'open') {
        // Several repos hold this app's code: say where the fix goes, defaulting to the first.
        var pick = ctx.repos.length > 1 ? el('select', { 'aria-label': 'Where the fix goes' },
          ctx.repos.map(function (x) { return el('option', { value: x, text: 'Fix in ' + x }); })) : null;
        actions.appendChild(el('button', { class: 'btn primary', text: 'Accept', onclick: function () {
          act('accept', pick ? { repo: pick.value } : undefined);
        } }));
        if (pick) actions.appendChild(pick);
        actions.appendChild(el('button', { class: 'btn', text: 'Decline…', onclick: declineForm }));
      }
      if (r.status === 'accepted') {
        actions.appendChild(el('button', {
          class: 'btn primary', text: 'Copy prompt for agent',
          onclick: function (e) {
            var b = e.target;
            api('GET', '/projects/' + p.id + '/reports/' + r.id + '/prompt')
              .then(function (x) { return navigator.clipboard.writeText(x.prompt); })
              .then(function () { b.textContent = 'Copied'; })
              .catch(function (x) { err.textContent = x.message; });
          },
        }));
        actions.appendChild(el('button', { class: 'btn', text: 'Mark fixed…', onclick: fixedForm }));
      }
      actions.appendChild(err);
    }

    function fixedForm() {
      actions.textContent = '';
      var note = el('textarea', { placeholder: 'What changed, in their words. The person who sent this will read it. Optional.', 'aria-label': 'Note for the reporter' });
      actions.appendChild(note);
      actions.appendChild(el('button', { class: 'btn primary', text: 'Mark fixed', onclick: function () {
        act('fixed', note.value.trim() ? { note: note.value } : undefined);
      } }));
      actions.appendChild(el('button', { class: 'btn ghost', text: 'Cancel', onclick: buttons }));
      actions.appendChild(err);
      note.focus();
    }

    function declineForm() {
      actions.textContent = '';
      var reason = el('textarea', { placeholder: 'Why? The person who sent this will read it.', 'aria-label': 'Reason for declining' });
      actions.appendChild(reason);
      actions.appendChild(el('button', { class: 'btn', text: 'Decline', onclick: function () {
        if (!reason.value.trim()) { err.textContent = 'Give a reason. They will see it.'; reason.focus(); return; }
        act('decline', { reason: reason.value });
      } }));
      actions.appendChild(el('button', { class: 'btn ghost', text: 'Cancel', onclick: buttons }));
      actions.appendChild(err);
      reason.focus();
    }
    buttons();

    return el('article', { class: 'report' }, [
      el('div', { class: 'meta' }, [
        el('span', { class: 'pill ' + r.type, text: TYPE_LABEL[r.type] }),
        el('time', { datetime: r.created_at, text: new Date(r.created_at).toLocaleString() }),
        el('span', { class: 'status s-' + r.status, text: STATUS_LABEL[r.status] }),
      ]),
      el('p', { class: 'text', text: r.text }),
      el('div', { class: 'ctx', text: ctxLine(r.context) }),
      r.context.page_url ? el('div', { class: 'ctx' }, [el('a', { href: r.context.page_url, target: '_blank', rel: 'noopener noreferrer', text: r.context.page_url })]) : null,
      reporterLine(r.reporter),
      r.decline_reason ? el('div', { class: 'reason', text: 'Declined: ' + r.decline_reason }) : null,
      r.fix_note ? el('div', { class: 'reason', text: 'Told them: ' + r.fix_note }) : null,
      r.status === 'accepted' && brief ? el('div', { class: 'brief-line' }, [
        brief.claimed_by ? el('b', { text: 'In progress in ' + brief.claimed_by }) : document.createTextNode(brief.repo ? 'Waiting for an agent in ' + brief.repo : 'Waiting for an agent in any connected repo'),
      ]) : null,
      brief && brief.notes.length ? el('details', { class: 'notes' }, [el('summary', { text: brief.notes.length + (brief.notes.length === 1 ? ' note' : ' notes') + ' from agents' })]
        .concat(brief.notes.map(function (n) { return el('p', {}, [el('span', { class: 'mute', text: n.by.replace(/^agent:/, '') + ' · ' + new Date(n.at).toLocaleString() + ': ' }), n.text]); }))) : null,
      r.status === 'fixed' || r.status === 'declined' ? null : actions,
    ]);
  }

  // ---- delete an app ---------------------------------------------------------------------

  /** The prompt that takes Heresay back out of a repo: the code, then the agent files. */
  function removePrompt(p) {
    var apple = platformOf(p.platform).apple;
    return [
      'Remove Heresay, an in-app feedback SDK, from this repo. Do these steps in order.',
      '',
      '1. Read the removal steps and follow them:',
      '',
      '   npx -y heresay@latest guide uninstall',
      '',
      '2. Remove it from the app\'s code. Search for the key ' + p.key + ' and for "' + (apple ? 'Heresay' : 'sdk/v1.js') + '". ' + (apple
        ? 'Remove the Heresay Swift package dependency, `import Heresay`, the Heresay.configure(…) call, .heresayReportButton() / .heresay(), HeresayCommands, and any Heresay.identify / setScreen / present calls.'
        : 'Remove the Heresay script tag (or its next/script, nuxt.config or layout entry) and any window.Heresay calls such as identify or setScreen.'),
      '',
      '3. Remove the agent files Heresay added (.mcp.json entry, skill, AGENTS.md section, saved token):',
      '',
      '   npx -y heresay@latest disconnect --yes',
      '',
      'Change nothing else. Build and run the tests to make sure nothing else broke.',
    ].join('\n');
  }

  function deleteView(view, p) {
    var owner = me.role === 'owner';
    view.appendChild(el('div', { class: 'head' }, [
      el('div', { class: 'title' }, [icon(platformOf(p.platform)), el('h1', { text: 'Delete ' + p.name })]),
      el('a', { class: 'btn ghost', href: '#/apps/' + p.id, text: 'Cancel' }),
    ]));

    view.appendChild(el('section', { class: 'card' }, [
      el('h2', { text: '1. Take Heresay out of your code' }),
      el('p', { class: 'mute', text: 'Do this first, so nothing in your app still points at Heresay. Paste this into your coding agent, in the app’s repo:' }),
      codeBlock(removePrompt(p)),
      el('details', { class: 'where' }, [el('summary', { text: 'Or remove it by hand' }), el('ol', { class: 'agent-steps' }, (platformOf(p.platform).apple ? [
        'In Xcode, remove the Heresay package from the target (Project › Package Dependencies).',
        'Delete import Heresay, the Heresay.configure(…) line, .heresayReportButton() or .heresay(), and HeresayCommands.',
        'Delete any Heresay.identify, setScreen, present or send calls.',
      ] : [
        'Delete the Heresay script tag (search your code for ' + p.key + ' or sdk/v1.js). In Next.js it is a <Script> in the layout; in Nuxt an entry in nuxt.config.',
        'Delete any window.Heresay calls (identify, setScreen, open).',
        'If you set a Content Security Policy for Heresay, take its address out of script-src and connect-src.',
      ]).concat(['In the repo, run npx heresay disconnect. It removes the .mcp.json entry, the Heresay skill, the AGENTS.md section and the saved token.']).map(function (t) { return el('li', { text: t }); }))]),
    ]));

    var err = el('p', { class: 'err', role: 'alert' });
    var confirm = el('input', { name: 'confirm', autocomplete: 'off', placeholder: p.name, 'aria-label': 'Type the app’s name to confirm' });
    var go = el('button', { class: 'btn danger', type: 'submit', disabled: true, text: 'Delete ' + p.name });
    confirm.oninput = function () { go.disabled = confirm.value !== p.name; };
    var form = el('form', { class: 'form' }, [
      el('p', { text: 'This deletes the app and every report sent from it, for everyone on the team. People who sent reports can no longer see them, and the key stops working: any copy of the app still carrying it hides its Report button. Connected repos keep their tokens for their other apps.' }),
      el('label', {}, ['Type ', el('b', { text: p.name }), ' to confirm', confirm]),
      el('div', { class: 'row' }, [go]),
      err,
    ]);
    form.onsubmit = function (e) {
      e.preventDefault();
      err.textContent = '';
      go.disabled = true;
      api('DELETE', '/projects/' + p.id, { confirm: confirm.value }).then(function () {
        projects = projects.filter(function (x) { return x.id !== p.id; });
        location.hash = '#/';
      }).catch(function (x) { err.textContent = x.message; go.disabled = false; });
    };
    view.appendChild(el('section', { class: 'card' }, owner ? [el('h2', { text: '2. Delete the app from Heresay' }), form]
      : [el('h2', { text: '2. Delete the app from Heresay' }), el('p', { class: 'mute', text: 'Only an owner can delete an app. Ask one of the owners on the Team page.' })]));
  }

  // ---- connect a repo for coding agents ----------------------------------------------------

  function connectView(view, query) {
    view.appendChild(el('div', { class: 'head' }, [el('h1', { text: 'Connect a repo for your coding agent' })]));
    view.appendChild(el('p', { class: 'mute', text: 'A token lets agents working in one repo see the accepted reports for the apps whose code is there, claim them, and mark them fixed. They never see open reports, and never accept or decline.' }));
    var err = el('p', { class: 'err', role: 'alert' });
    var out = el('div');
    var boxes = el('div', { class: 'checks' });
    var repo = el('input', { name: 'repo', required: true, placeholder: 'github.com/acme/web', value: query.get('repo') || '', autocomplete: 'off', spellcheck: 'false' });
    var form = el('form', { class: 'form' }, [
      el('label', {}, ['Repo', repo]),
      el('p', { class: 'hint', html: 'As git knows it. <code>npx heresay connect</code> fills this in for you.' }),
      el('div', { class: 'field' }, [el('span', { class: 'lbl', text: 'Apps whose code is in this repo' }), boxes,
        el('p', { class: 'hint', text: 'A monorepo can have several. An agent can also add a new app from the repo later.' })]),
      el('div', { class: 'row' }, [el('button', { class: 'btn primary', text: 'Create token' })]),
      err,
    ]);
    view.appendChild(el('section', { class: 'card' }, [form, out]));
    var list = el('ul', { class: 'members' });
    view.appendChild(el('section', { class: 'card' }, [el('h2', { text: 'Connected repos' }), list]));

    api('GET', '/projects').then(function (b) {
      projects = b.projects;
      var want = query.get('app');
      if (!projects.length) boxes.appendChild(el('p', { class: 'hint', text: 'No apps yet. Connect anyway: your agent can create the app from the repo.' }));
      projects.forEach(function (p) {
        boxes.appendChild(el('label', { class: 'check' }, [
          el('input', { type: 'checkbox', value: p.id, checked: want ? p.id === want : projects.length === 1 }),
          ' ' + p.name, el('span', { class: 'mute', text: ' · ' + platformOf(p.platform).label }),
        ]));
      });
      drawTokens();
    });

    function drawTokens() {
      api('GET', '/agent-tokens').then(function (b) {
        list.textContent = '';
        if (!b.tokens.length) list.appendChild(el('li', { class: 'mute', text: 'None yet.' }));
        b.tokens.forEach(function (t) {
          var names = t.app_ids.map(function (id) { var p = projects.filter(function (x) { return x.id === id; })[0]; return p ? p.name : id; });
          list.appendChild(el('li', {}, [
            el('span', { class: 'picon', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-12 7"/></svg>' }),
            el('div', {}, [el('b', { text: t.repo }), el('span', { class: 'mute', text: (names.join(', ') || 'no apps yet') + ' · by ' + t.created_by + ' · ' + (t.last_used_at ? 'last used ' + new Date(t.last_used_at).toLocaleDateString() : 'not used yet') })]),
            el('button', { class: 'btn ghost', text: 'Revoke', onclick: function () {
              api('DELETE', '/agent-tokens/' + t.id).then(drawTokens).catch(function (x) { err.textContent = x.message; });
            } }),
          ]));
        });
      });
    }

    form.onsubmit = function (e) {
      e.preventDefault();
      err.textContent = '';
      var ids = [].slice.call(boxes.querySelectorAll('input:checked')).map(function (i) { return i.value; });
      api('POST', '/agent-tokens', { repo: repo.value, app_ids: ids }).then(function (b) {
        form.hidden = true;
        out.appendChild(el('div', { class: 'token-out' }, [
          el('h2', { text: 'Token for ' + b.agent.repo }),
          el('p', { text: 'Paste it where npx heresay connect asks for it. It is shown only once.' }),
          codeBlock(b.token),
          el('p', { class: 'hint', html: 'Haven’t started it? In the repo, run <code>npx heresay connect --url ' + location.origin + '</code>.' }),
        ]));
        drawTokens();
      }).catch(function (x) { err.textContent = x.message; });
    };
    repo.focus();
  }

  // ---- team ------------------------------------------------------------------------------

  function teamView(view) {
    var owner = me.role === 'owner';
    var list = el('ul', { class: 'members' });
    var err = el('p', { class: 'err', role: 'alert' });
    view.appendChild(el('div', { class: 'head' }, [el('h1', { text: 'Team' })]));
    view.appendChild(el('p', { class: 'mute', text: 'Everyone here can read and answer reports for every app. Owners can also change the team.' }));
    view.appendChild(el('p', { class: 'mute' }, ['Coding agents get access per repo, not per person: ', el('a', { href: '#/connect', text: 'Connected repos' }), '.']));

    function draw(members) {
      list.textContent = '';
      members.forEach(function (m) {
        list.appendChild(el('li', {}, [
          el('span', { class: 'avatar', text: m.email.charAt(0).toUpperCase() }),
          el('div', {}, [el('b', { text: m.email + (m.email === me.email ? ' (you)' : '') }), el('span', { class: 'mute', text: m.role === 'owner' ? 'Owner' : 'Member' })]),
          owner && m.email !== me.email ? el('button', {
            class: 'btn ghost', text: 'Remove',
            onclick: function () {
              err.textContent = '';
              api('DELETE', '/team/' + encodeURIComponent(m.email)).then(function (b) { draw(b.members); })
                .catch(function (x) { err.textContent = x.message; });
            },
          }) : null,
        ]));
      });
    }

    view.appendChild(el('section', { class: 'card' }, [list, err]));
    if (owner) {
      var form = el('form', { class: 'invite' }, [
        el('label', { class: 'sr', for: 'invite-email', text: 'Email' }),
        el('input', { id: 'invite-email', name: 'email', type: 'email', required: true, placeholder: 'teammate@company.com' }),
        el('select', { name: 'role', 'aria-label': 'Role' }, [el('option', { value: 'member', text: 'Member' }), el('option', { value: 'owner', text: 'Owner' })]),
        el('button', { class: 'btn primary', text: 'Add' }),
      ]);
      form.onsubmit = function (e) {
        e.preventDefault();
        err.textContent = '';
        api('POST', '/team', { email: form.email.value, role: form.role.value }).then(function (b) {
          draw(b.members);
          form.reset();
          err.className = 'ok-msg';
          err.textContent = 'Added. Send them this address; they sign in with that email: ' + location.origin + '/app/';
        }).catch(function (x) { err.className = 'err'; err.textContent = x.message; });
      };
      view.appendChild(el('section', { class: 'card' }, [el('h2', { text: 'Add someone' }), form]));
    }
    api('GET', '/team').then(function (b) { draw(b.members); });
  }
})();
