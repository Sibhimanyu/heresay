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
    if (parts[0] === 'new') return newAppView(view, parts[1]);
    if (parts[0] === 'apps' && parts[1]) {
      return withProject(parts[1], function (p) {
        if (parts[2] === 'setup') setupView(view, p);
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
        grid.appendChild(el('a', { class: 'app-card', href: '#/apps/' + p.id }, [
          icon(platformOf(p.platform)),
          el('div', {}, [el('b', { text: p.name }), el('span', { class: 'mute', text: platformOf(p.platform).label + (p.framework ? ' · ' + frameworkLabel(p.framework) : '') })]),
          count,
        ]));
        api('GET', '/projects/' + p.id + '/reports').then(function (r) {
          var open = r.reports.filter(function (x) { return x.status === 'open'; }).length;
          count.textContent = r.reports.length ? (open ? open + ' open' : 'All answered') : 'No reports yet';
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

  function stepper(active) {
    var steps = ['Platform', 'Details', 'Install', 'Test'];
    return el('ol', { class: 'steps' }, steps.map(function (s, i) {
      return el('li', { class: i + 1 < active ? 'done' : i + 1 === active ? 'now' : '' }, [el('span', { text: String(i + 1) }), s]);
    }));
  }

  function newAppView(view, platform) {
    if (!platform) {
      view.appendChild(stepper(1));
      view.appendChild(el('h1', { text: 'What are you adding Heresay to?' }));
      var grid = el('div', { class: 'platforms' });
      PLATFORMS.forEach(function (p) {
        grid.appendChild(el(p.ready ? 'a' : 'div', {
          class: 'platform' + (p.ready ? '' : ' soon'), href: p.ready ? '#/new/' + p.id : null,
          'aria-disabled': p.ready ? null : 'true',
        }, [icon(p), el('b', { text: p.label }), el('span', { class: 'mute', text: p.note }), p.ready ? null : el('span', { class: 'tag', text: 'Soon' })]));
      });
      view.appendChild(grid);
      view.appendChild(el('p', { class: 'mute small', text: 'Other platforms can already send reports through the API. See the docs, under Other platforms.' }));
      return;
    }

    view.appendChild(stepper(2));
    var native = !!platformOf(platform).apple;
    view.appendChild(el('h1', { text: 'About your ' + platformOf(platform).label + ' app' }));
    var err = el('p', { class: 'err', role: 'alert' });
    var fw = 'unknown';
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
      el('div', { class: 'row' }, [el('a', { class: 'btn ghost', href: '#/new', text: 'Back' }), el('button', { class: 'btn primary', text: 'Create app' })]),
      err,
    ] : [
      el('label', {}, ['Name', el('input', { name: 'name', required: true, maxlength: '80', placeholder: 'Acme web', autocomplete: 'off' })]),
      el('div', { class: 'field' }, [el('span', { class: 'lbl' }, ['Built with ', el('span', { class: 'opt', text: 'optional' })]), chips,
        el('p', { class: 'hint', text: 'Only changes the install steps we show. Not sure? Leave it: your coding agent can work it out, and the general steps work everywhere.' })]),
      el('label', {}, ['Where it runs', el('textarea', { name: 'origins', rows: '3', placeholder: 'https://app.example.com\nhttp://localhost:3000' })]),
      el('p', { class: 'hint', text: 'One address per line: your live site and anywhere you test it. Only these sites can send reports with this app’s key. Leave it empty to allow any site while you try things out.' }),
      el('div', { class: 'row' }, [el('a', { class: 'btn ghost', href: '#/new', text: 'Back' }), el('button', { class: 'btn primary', text: 'Create app' })]),
      err,
    ]);
    form.onsubmit = function (e) {
      e.preventDefault();
      err.textContent = '';
      var origins = native ? [] : form.origins.value.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      api('POST', '/projects', { name: form.name.value, platform: platform, framework: native ? 'swiftui' : (fw === 'unknown' ? null : fw), allowed_origins: origins })
        .then(function (b) { projects.push(b.project); location.hash = '#/apps/' + b.project.id + '/setup'; })
        .catch(function (x) { err.textContent = x.message; });
    };
    view.appendChild(form);
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

  function agentPromptFor(p) {
    if (platformOf(p.platform).apple) {
      return [
        'Add Heresay, an in-app feedback button, to this ' + platformOf(p.platform).label + ' app.',
        '',
        '1. Add the Swift package ' + SWIFT_PACKAGE + ' (product "Heresay") to the app target.',
        '2. In the App struct\'s init, call Heresay.configure(key: "' + p.key + '", url: URL(string: "' + location.origin + '")!).',
        p.platform === 'macos'
          ? '3. Add .heresay() to the root view of the main WindowGroup, and .commands { HeresayCommands() } to that WindowGroup.'
          : '3. Add .heresayReportButton() to the root view of the main WindowGroup.',
        '4. If the app has signed-in users, call Heresay.identify(id:label:) after sign-in and Heresay.identify() after sign-out.',
        '5. Where it is easy, call Heresay.setScreen("<screen name>") when the main screens appear.',
        '',
        'Change nothing else. Reference: ' + location.origin + '/guides/install-apple.md',
      ].join('\n');
    }
    return [
      'Add Heresay, an in-app feedback button, to this app.',
      '',
      '1. Load this script once on every page, as late as possible: before </body>, or the framework\'s equivalent (for Next.js, next/script with strategy="afterInteractive" in the root layout).',
      '',
      '   ' + tag(p),
      '',
      '2. If the app has signed-in users, call window.Heresay?.identify({ id: user.id, label: user.name }) after sign-in, and window.Heresay?.identify() after sign-out.',
      '3. If the app has a version number (for example package.json "version"), add data-version="<version>" to the tag.',
      '4. If screens change without the URL changing, call window.Heresay?.setScreen("<screen name>") on each change.',
      '',
      'Change nothing else. Reference: ' + location.origin + '/docs.html',
    ].join('\n');
  }

  function setupView(view, p) {
    view.appendChild(stepper(3));
    view.appendChild(el('div', { class: 'head' }, [
      el('h1', { text: 'Put Heresay in ' + p.name }),
      el('a', { class: 'btn ghost', href: '#/apps/' + p.id, text: 'Go to reports' }),
    ]));

    // Without a known framework, the agent is the better default: it can see the code.
    var agentFirst = !platformOf(p.platform).apple && (!p.framework || p.framework === 'other');
    var panes = { hand: el('div', { hidden: agentFirst }, byHand(p)), agent: el('div', { hidden: !agentFirst }, [
      el('ol', { class: 'agent-steps' }, [
        el('li', {}, [el('b', { text: 'In your app’s repo, run:' }), codeBlock('npx heresay connect --url ' + location.origin),
          el('p', { class: 'hint', text: 'It opens this dashboard to make a token for the repo, and adds the Heresay skill and MCP server for your agent. The token stays on your computer, not in the repo.' })]),
        el('li', {}, [el('b', { text: 'Then tell your agent:' }), codeBlock('Add Heresay to this app'),
          el('p', { class: 'hint', text: 'It installs the SDK in the right place, sends a test, and checks it arrived. Later, “Fix the next Heresay report” works the same way.' })]),
      ]),
      el('details', { class: 'where' }, [el('summary', { text: 'No MCP? Paste a one-off prompt instead' }),
        el('p', { class: 'hint', text: 'For any coding agent, in your app’s folder:' }), codeBlock(agentPromptFor(p))]),
    ]) };
    var tabs = el('div', { class: 'seg', role: 'tablist' });
    (agentFirst ? [['agent', 'Ask your coding agent'], ['hand', 'Add it yourself']] : [['hand', 'Add it yourself'], ['agent', 'Ask your coding agent']]).forEach(function (t, i) {
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
      platformOf(p.platform).apple
        ? el('p', { class: 'hint', text: 'Your key is meant to be public: it can only send reports, never read them. It is fine in your source code.' })
        : el('p', { class: 'hint', html: 'Your key is meant to be public: it only lets the sites you listed send reports. Optional extras (who is signed in, your app version, your brand colour) are in the <a href="/docs.html#options" target="_blank">docs</a>.' }),
    ]));

    var status = el('div', { class: 'wait', role: 'status' });
    var tryIt = platformOf(p.platform).apple ? null
      : el('a', { class: 'btn', href: '/demo.html?key=' + encodeURIComponent(p.key), target: '_blank', rel: 'noopener', text: 'Send a test report' });
    view.appendChild(el('section', { class: 'card test' }, [
      el('div', { class: 'test-head' }, [el('span', { class: 'stepnum', text: '4' }), el('h2', { text: 'Send your first report' })]),
      el('p', { class: 'mute', text: platformOf(p.platform).apple
        ? 'Run your app, ' + (p.platform === 'macos' ? 'choose Help › Report a Problem…' : 'tap Report in the corner') + ' and send anything. It shows up here within a few seconds.'
        : 'Open your app, tap Report in the corner and send anything. Or use our test page. It shows up here within a few seconds.' }),
      status,
      tryIt ? el('div', { class: 'row' }, [tryIt]) : null,
    ]));

    var seen = null;
    function check() {
      api('GET', '/projects/' + p.id + '/reports').then(function (b) {
        if (seen === null) seen = b.reports.length;
        var fresh = b.reports.length > seen;
        if (!b.reports.length) {
          status.className = 'wait';
          status.textContent = 'Waiting for your first report…';
          return;
        }
        var first = b.reports.slice().sort(function (a, c) { return a.created_at < c.created_at ? 1 : -1; })[0];
        status.className = 'wait ok';
        status.textContent = '';
        status.appendChild(el('b', { text: fresh || seen === 0 ? 'It works. ' : 'Reports are coming in. ' }));
        status.appendChild(document.createTextNode('Latest: “' + first.text.slice(0, 120) + '”'));
        status.appendChild(el('a', { class: 'btn primary', href: '#/apps/' + p.id, text: 'See reports' }));
        stopTimer();
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
    view.appendChild(el('div', { class: 'head' }, [
      el('div', { class: 'title' }, [icon(platformOf(p.platform)), el('div', {}, [el('h1', { text: p.name }),
        p.framework ? el('span', { class: 'mute small', text: frameworkLabel(p.framework) + (p.framework_detected ? ' (detected)' : '') }) : null])]),
      el('a', { class: 'btn', href: '#/apps/' + p.id + '/setup', text: 'Install' }),
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
    return [c.route, c.app_version && ('v' + c.app_version), c.platform, c.os, c.browser, c.user_label || c.user_id]
      .filter(Boolean).join(' · ');
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
