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
    syncLoader();
  }

  /**
   * One Glance loader for the whole dashboard, from the first paint until a page is ready. It is
   * never recreated, so the animation never restarts. A view marks what it is still waiting for
   * with loading(); while any of those is alone in its box the view stays hidden, then the page
   * appears in one go.
   */
  var loader = $('loader'), loaderTimer = null;
  function loading(tag) {
    return el(tag || 'div', { class: 'loading', 'aria-hidden': 'true' });
  }
  function syncLoader() {
    // Signed in: wait for the view. Otherwise wait until we know who this is (sign-in or blocked).
    var waiting = !$('app').hidden ? !!$('view').querySelector('.loading:only-child') : $('gate').hidden && $('blocked').hidden;
    document.body.classList.toggle('pending', waiting);
    if (!waiting) document.body.classList.remove('booting');
    if (waiting && !loader.classList.contains('on')) {
      // A quick page never flashes the loader; it just appears.
      if (!loaderTimer) loaderTimer = setTimeout(function () { loaderTimer = null; loader.classList.add('on'); }, 250);
    } else if (!waiting) {
      clearTimeout(loaderTimer); loaderTimer = null;
      loader.classList.remove('on');
    }
  }
  new MutationObserver(syncLoader).observe($('view'), { childList: true, subtree: true });

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

  /** One message at a time, bottom of the screen, with an optional action. Read out by screen readers. */
  var toastBox = null, toastTimer = null;
  function toast(text, action) {
    if (!toastBox) {
      toastBox = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastBox);
    }
    clearTimeout(toastTimer);
    toastBox.textContent = '';
    toastBox.appendChild(el('span', { class: 'toast-tick', 'aria-hidden': 'true' }));
    toastBox.appendChild(el('span', { text: text }));
    if (action) toastBox.appendChild(el('button', { type: 'button', text: action.label, onclick: function () { hideToast(); action.run(); } }));
    toastBox.classList.add('on');
    toastTimer = setTimeout(hideToast, 6000);
  }
  function hideToast() { if (toastBox) toastBox.classList.remove('on'); }

  /** A button that is working: spinner, a new label, and no second click. */
  function busyButton(b, label) {
    var was = b.textContent;
    b.disabled = true;
    b.classList.add('busy');
    b.setAttribute('aria-busy', 'true');
    b.textContent = label;
    return function () { b.disabled = false; b.classList.remove('busy'); b.removeAttribute('aria-busy'); b.textContent = was; };
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
      route();  // first, so the view is already waiting when the app is shown
      show('app');
      checkForUpdate(b);
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

  // ---- a newer Heresay -------------------------------------------------------------------

  /** a.b.c > x.y.z, numerically. Anything unparseable is never newer. */
  function newer(a, b) {
    var p = function (v) { return String(v).split('-')[0].split('.').map(Number); };
    var x = p(a), y = p(b);
    if (x.length !== 3 || x.some(isNaN)) return false;
    for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > (y[i] || 0);
    return false;
  }

  /**
   * Each team runs its own Heresay, so nothing updates it but them. Owners (who can run the
   * update) see a quiet banner when npm has a newer release; it goes away per version once
   * dismissed. A slow or blocked registry just means no banner.
   */
  function checkForUpdate(who) {
    if (who.role !== 'owner' || !who.version) return;
    fetch('https://registry.npmjs.org/create-heresay/latest').then(function (r) { return r.ok ? r.json() : null; }).then(function (pkg) {
      if (!pkg || !newer(pkg.version, who.version)) return;
      var key = 'heresay.update-dismissed';
      try { if (localStorage.getItem(key) === pkg.version) return; } catch (e) { /* private mode */ }
      var box = $('update');
      box.textContent = '';
      var cmd = 'npx create-heresay update';
      var copy = el('button', { class: 'btn', type: 'button', text: 'Copy command', onclick: function () {
        navigator.clipboard.writeText(cmd).then(function () { copy.textContent = 'Copied'; });
      } });
      box.appendChild(el('div', { class: 'update-in' }, [
        el('p', {}, [el('b', { text: 'Heresay ' + pkg.version + ' is out.' }),
          document.createTextNode(' This one runs ' + who.version + '. On the computer that set it up, run '),
          el('code', { text: cmd }), document.createTextNode('. It takes a few minutes, and nothing is lost.')]),
        copy,
        el('button', { class: 'btn ghost', type: 'button', text: 'Not now', 'aria-label': 'Dismiss until the next version', onclick: function () {
          try { localStorage.setItem(key, pkg.version); } catch (e) { /* private mode */ }
          box.hidden = true;
        } }),
      ]));
      box.hidden = false;
    }).catch(function () { /* offline or blocked: no banner */ });
  }

  // ---- routes ----------------------------------------------------------------------------

  window.addEventListener('hashchange', function () { if (me) route(); });

  function route() {
    stopTimer();
    var hash = location.hash.replace(/^#\/?/, '');
    var query = new URLSearchParams(hash.split('?')[1] || '');
    var parts = hash.split('?')[0].split('/').filter(Boolean);
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      var active = parts[0] === 'team' || parts[0] === 'notifications' ? parts[0] : 'apps';
      a.setAttribute('aria-current', String(active === a.dataset.nav));
    });
    var view = $('view');
    view.textContent = '';
    view.appendChild(loading());
    view.classList.remove('wide');
    if (parts[0] === 'team') return teamView(view);
    if (parts[0] === 'notifications') return notificationsView(view);
    if (parts[0] === 'connect') return connectView(view, query);
    if (parts[0] === 'new') return newAppView(view, parts[1], query);
    if (parts[0] === 'apps' && parts[1]) {
      return withProject(parts[1], function (p) {
        if (parts[2] === 'setup') setupView(view, p);
        else if (parts[2] === 'design' && (p.platform === 'web' || platformOf(p.platform).apple)) designView(view, p);
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
  /** Platforms with an SDK whose look can be designed. */
  var designable = function (p) { return p.platform === 'web' || !!platformOf(p.platform).apple; };
  var platformOf = function (id) { return PLATFORMS.filter(function (x) { return x.id === id; })[0] || PLATFORMS[0]; };
  /** Apps that are platforms of one product share its id: the first app's. */
  var productOf = function (p) { return p.product_id || p.id; };
  var siblings = function (p) {
    var mine = projects.filter(function (x) { return productOf(x) === productOf(p); });
    if (!mine.some(function (x) { return x.id === p.id; })) mine.push(p);
    return mine.sort(function (a, b) { return a.created_at.localeCompare(b.created_at); });
  };
  var productName = function (p) { return siblings(p)[0].name; };
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
      // One card per product; one line per platform in it, each with its own state.
      var seen = {};
      projects.forEach(function (first) {
        if (seen[productOf(first)]) return;
        seen[productOf(first)] = true;
        var sibs = siblings(first);
        var many = sibs.length > 1;
        var rows = sibs.map(function (p) {
          var count = el('span', { class: 'count', text: ' ' });
          var line = el('a', { class: 'app-card' + (many ? ' platform-line' : ''), href: '#/apps/' + p.id }, [
            icon(platformOf(p.platform)),
            el('div', {}, [el('b', { text: many ? platformOf(p.platform).label : p.name }),
              el('span', { class: 'mute', text: many ? (p.framework ? frameworkLabel(p.framework) : ' ') : platformOf(p.platform).label + (p.framework ? ' · ' + frameworkLabel(p.framework) : '') })]),
            count,
          ]);
          api('GET', '/projects/' + p.id + '/reports').then(function (r) {
            var open = r.reports.filter(function (x) { return x.status === 'open'; }).length;
            // No report yet means setup isn't proven: send them back to finish it.
            if (!r.reports.length && !p.sdk_seen && !p.code_found) { line.href = '#/apps/' + p.id + '/setup'; count.textContent = 'Setup not finished'; count.className = 'count todo'; return; }
            count.textContent = !r.reports.length ? 'No reports yet' : open ? open + ' open' : 'All answered';
            if (open) count.className = 'count on';
          });
          return line;
        });
        var add = el('a', { class: 'add-platform', href: '#/new?product=' + productOf(first), text: '+ Add a platform' });
        grid.appendChild(many
          ? el('div', { class: 'product-card' }, [el('div', { class: 'product-head' }, [el('b', { text: first.name }), add])].concat(rows))
          : el('div', { class: 'product-card single' }, [rows[0], add]));
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
  var NATIVE_LABELS = { swiftui: 'SwiftUI', uikit: 'UIKit', appkit: 'AppKit' };
  function frameworkLabel(id) { var f = FRAMEWORKS.filter(function (x) { return x[0] === id; })[0]; return f ? f[1] : NATIVE_LABELS[id] || id; }

  /**
   * The four steps. Earlier ones are links, so you can go back and change things; later ones
   * aren't, because each step needs the one before it. `tested` marks the last step done.
   */
  function stepper(active, p, tested, query) {
    var q = p ? '?app=' + p.id : (query || '');
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
    var productId = query && query.get('product');
    if (editId) return withProject(editId, function (p) { drawNewApp(view, platform, p, null); });
    if (productId) {
      return api('GET', '/projects').then(function (b) {
        projects = b.projects;
        var first = projects.filter(function (x) { return productOf(x) === productId; })[0];
        if (!first) { location.hash = '#/'; return; }
        drawNewApp(view, platform, null, first);
      });
    }
    drawNewApp(view, platform, null, null);
  }

  /** `sibling`: adding another platform to that app's product, not a new product. */
  function drawNewApp(view, platform, editing, sibling) {
    var q = editing ? '?app=' + editing.id : sibling ? '?product=' + productOf(sibling) : '';
    var has = sibling ? siblings(sibling) : [];
    if (!platform) {
      view.appendChild(stepper(1, editing, false, q));
      view.appendChild(el('h1', { text: sibling ? 'Add a platform to ' + productName(sibling) : 'What are you adding Heresay to?' }));
      if (sibling) view.appendChild(el('p', { class: 'mute', text: 'Its reports join the same inbox. Each platform gets its own key and install steps.' }));
      var grid = el('div', { class: 'platforms' });
      PLATFORMS.forEach(function (p) {
        var there = has.filter(function (x) { return x.platform === p.id; })[0];
        grid.appendChild(el(p.ready && !there ? 'a' : 'div', {
          class: 'platform' + (p.ready ? '' : ' soon') + (there ? ' added' : '') + (editing && editing.platform === p.id ? ' current' : ''),
          href: p.ready && !there ? '#/new/' + p.id + q : null,
          'aria-disabled': p.ready && !there ? null : 'true',
        }, [icon(p), el('b', { text: p.label }), el('span', { class: 'mute', text: p.note }),
          there ? el('span', { class: 'tag', text: 'Added' }) : p.ready ? null : el('span', { class: 'tag', text: 'Soon' })]));
      });
      view.appendChild(grid);
      view.appendChild(el('p', { class: 'mute small', text: 'Other platforms can already send reports through the API. See the docs, under Other platforms.' }));
      return;
    }

    view.appendChild(stepper(2, editing, false, q));
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
    // Signed-in apps pass who it is to Heresay, so the person reporting is never asked their name.
    var signIn = editing && editing.sign_in ? editing.sign_in : sibling && sibling.sign_in ? sibling.sign_in : 'unknown';
    var signChips = el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Do people sign in?' });
    [['yes', 'Yes, they sign in'], ['no', 'No, anyone can use it'], ['unknown', 'Not sure']].forEach(function (c) {
      signChips.appendChild(el('button', {
        type: 'button', role: 'radio', 'aria-checked': String(c[0] === signIn), text: c[1],
        onclick: function (e) {
          signIn = c[0];
          signChips.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-checked', String(b === e.target)); });
        },
      }));
    });
    var signField = el('div', { class: 'field' }, [el('span', { class: 'lbl' }, ['Do people sign in to your app? ', el('span', { class: 'opt', text: 'optional' })]), signChips,
      el('p', { class: 'hint', text: 'If they do, your app tells Heresay who is signed in, so nobody types their name to send a report, and you can reply to them. Many users with many logins is fine: it follows whoever is signed in on that device.' })]);
    var form = el('form', { class: 'form' }, native ? [
      el('label', {}, ['Name', el('input', { name: 'name', required: true, maxlength: '80', placeholder: 'Acme for ' + platformOf(platform).label, autocomplete: 'off' })]),
      el('p', { class: 'hint', text: 'Native apps have no web address to lock the key to, so any copy of your app can send reports. The per-device, per-network and per-app rate limits still apply.' }),
      signField,
      el('div', { class: 'row' }, [el('a', { class: 'btn ghost', href: '#/new' + q, text: 'Back' }), el('button', { class: 'btn primary', text: editing ? 'Save and continue' : 'Create app' })]),
      err,
    ] : [
      el('label', {}, ['Name', el('input', { name: 'name', required: true, maxlength: '80', placeholder: 'Acme web', autocomplete: 'off' })]),
      el('div', { class: 'field' }, [el('span', { class: 'lbl' }, ['Built with ', el('span', { class: 'opt', text: 'optional' })]), chips,
        el('p', { class: 'hint', text: 'Only changes the install steps we show. Not sure? Leave it: your coding agent can work it out, and the general steps work everywhere.' })]),
      el('label', {}, ['Where it runs', el('textarea', { name: 'origins', rows: '3', placeholder: 'https://app.example.com\nhttp://localhost:3000' })]),
      el('p', { class: 'hint', text: 'One address per line: your live site and anywhere you test it. Only these sites can send reports with this app’s key. Leave it empty to allow any site while you try things out.' }),
      signField,
      el('div', { class: 'row' }, [el('a', { class: 'btn ghost', href: '#/new' + q, text: 'Back' }), el('button', { class: 'btn primary', text: editing ? 'Save and continue' : 'Create app' })]),
      err,
    ]);
    form.onsubmit = function (e) {
      e.preventDefault();
      err.textContent = '';
      var origins = native ? [] : form.origins.value.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      var body = { name: form.name.value, platform: platform, framework: native ? 'swiftui' : (fw === 'unknown' ? null : fw), allowed_origins: origins, sign_in: signIn === 'unknown' ? null : signIn };
      if (sibling) body.product_id = productOf(sibling);
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
    } else if (sibling) {
      form.name.value = productName(sibling);
      var web = has.filter(function (x) { return x.allowed_origins.length; })[0];
      if (!native && web) form.origins.value = web.allowed_origins.join('\n');
    }
    form.name.focus();
  }

  // ---- design ----------------------------------------------------------------------------

  /**
   * What a developer can change about the web widget, and the value we recommend first. Only
   * what differs from the recommendation goes in the tag. The full list: public/guides/customize-web.md.
   */
  var DESIGN = [
    { group: 'The button', items: [
      { a: 'position', label: 'Where it sits', c: [['', 'Bottom right'], ['left', 'Bottom left'], ['top-right', 'Top right'], ['top-left', 'Top left'], ['center', 'Bottom centre']] },
      { a: 'offset', label: 'Distance from the edge', c: [['', '20px'], ['40', '40px'], ['96', '96px, above a chat bubble']], text: 'or x,y like 24,96', pattern: /^\d{1,3}(\s*,\s*\d{1,3})?$/ },
      { a: 'button', label: 'When it shows', c: [['', 'Always'], ['none', 'Never: my app has its own menu item'], ['desktop', 'Not on phones'], ['scroll', 'After the first scroll']] },
      { a: 'label', label: 'Text', c: [['', 'Report'], ['Feedback', 'Feedback'], ['Help us improve', 'Help us improve'], ['Found a bug?', 'Found a bug?']], text: 'or your own words', max: 40 },
      { a: 'style', label: 'Style', c: [['', 'Pill with text'], ['icon', 'Icon only'], ['tab', 'Tab on the side']] },
      { a: 'size', label: 'Size', c: [['', 'Regular'], ['small', 'Small'], ['large', 'Large']] },
      { a: 'fill', label: 'Button colour', c: [['', 'White, or dark in dark mode'], ['accent', 'Filled with your colour']] },
      { a: 'shadow', label: 'Shadow', c: [['', 'Soft'], ['none', 'None'], ['strong', 'Strong']] },
      { a: 'hide-on', label: 'Hide it on these pages', c: [], text: '/checkout, /login', max: 300, hint: 'That path and everything under it.' },
    ]},
    { group: 'Look', items: [
      { a: 'accent', label: 'Your colour', color: true, c: [['', 'Heresay peacock', '#0f766e'], ['#7c3aed', 'Purple', '#7c3aed'], ['#2563eb', 'Blue', '#2563eb'], ['#e11d48', 'Rose', '#e11d48'], ['#15171c', 'Ink', '#15171c']] },
      { a: 'mark', label: 'Logo colour', c: [['', 'Follows your colour'], ['heresay', 'Heresay teal']] },
      { a: 'theme', label: 'Light or dark', c: [['', 'Follow the device'], ['light', 'Always light'], ['dark', 'Always dark']] },
      { a: 'font', label: 'Font', c: [['', 'System font'], ['inherit', 'My page’s font']] },
    ]},
    { group: 'Words', items: [
      { a: 'lang', label: 'Language', c: [['', 'My page’s language'], ['auto', 'The browser’s'], ['en', 'English'], ['fr', 'Français'], ['ta', 'தமிழ்'], ['hi', 'हिन्दी']], hint: 'English, French, Tamil and Hindi today; any other language shows English.' },
      { a: 'placeholder', label: 'Question in the text box', c: [['', 'What happened, or what would you change?']], text: 'or your own words', max: 120 },
      { a: 'types', label: 'Report types', c: [['', 'All four'], ['broken,confusing,improvement', 'No “Idea”'], ['broken,confusing', 'Only Broken and Confusing']], hint: 'Their names can’t change: the type sets the priority.' },
      { a: 'thanks', label: 'Thank-you line after sending', c: [['', 'None']], text: 'e.g. Thanks! We read every one.', max: 160 },
    ]},
    { group: 'The panel', items: [
      { a: 'panel', label: 'Where it opens', c: [['', 'Next to the button'], ['sheet', 'Side sheet'], ['center', 'Middle of the screen']] },
      { a: 'width', label: 'Width', c: [['', 'Regular'], ['narrow', 'Narrow'], ['wide', 'Wide']] },
      { a: 'backdrop', label: 'Behind it', c: [['', 'Dim the page'], ['clear', 'Leave the page clear'], ['blur', 'Blur']] },
      { a: 'preferences', label: 'Preferences tab', c: [['', 'Show'], ['hide', 'Hide']], hint: 'Hide it if your app calls identify() and asks nothing else.' },
      { a: 'intro', label: 'Introduce the button', c: [['', 'When my app calls introduce()'], ['auto', '3 seconds after the first visit']] },
    ]},
  ];
  var DESIGN_ITEMS = [].concat.apply([], DESIGN.map(function (g) { return g.items; }));

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /** The data- attributes a design adds to the tag, in the order the list shows them. */
  function designAttrs(cfg) {
    return DESIGN_ITEMS.filter(function (it) { return cfg[it.a]; }).map(function (it) { return ['data-' + it.a, cfg[it.a]]; });
  }

  function designTag(p, cfg) {
    var a = designAttrs(cfg);
    if (!a.length) return tag(p);
    return '<script src="' + SDK_URL + '"\n        data-key="' + p.key + '"' +
      a.map(function (x) { return '\n        ' + x[0] + '="' + esc(x[1]) + '"'; }).join('') + '\n        defer></scr' + 'ipt>';
  }

  /** A made-up page in the app's name, with the real widget on it in preview mode. */
  function previewDoc(p, cfg, show, dark) {
    var own = cfg.button === 'none';
    var attrs = designAttrs(cfg).map(function (x) { return ' ' + x[0] + '="' + esc(x[1]) + '"'; }).join('');
    var then = {
      panel: 'H.open();',
      intro: 'if(!H.introduce())document.getElementById("note").hidden=false;',
      sent: 'H.open({type:"broken",text:"The export button does nothing."});' +
        'document.querySelector("[data-feedback-sdk]").shadowRoot.querySelector(".send").click();',
    }[show] || '';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><style>' +
      'body{margin:0;min-height:1400px;font:15px/1.6 Georgia,serif;background:' + (dark ? '#111317;color:#e6e8eb' : '#fff;color:#1d2127') + '}' +
      'header{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;border-bottom:1px solid ' + (dark ? '#262a31' : '#e6e8eb') + ';font-weight:700;font-size:17px}' +
      'nav{display:flex;gap:16px;font:14px system-ui;font-weight:400;opacity:.8}nav a{color:inherit;text-decoration:none}nav a.own{border:1px dashed currentColor;padding:1px 8px;border-radius:6px}' +
      'main{padding:22px;max-width:620px}.bar{height:12px;border-radius:6px;margin:12px 0;background:' + (dark ? '#262a31' : '#eceef1') + '}' +
      '#note{position:fixed;left:22px;bottom:22px;font:13px system-ui;opacity:.7}</style></head><body>' +
      '<header>' + esc(productName(p)) + '<nav><a>Docs</a><a>Settings</a>' + (own ? '<a class="own" href="#" onclick="Heresay.open();return false">Feedback</a>' : '') + '</nav></header>' +
      '<main><h2 style="margin:0 0 8px">Welcome back</h2><p>A paragraph in this page’s own font, so you can see whether the widget matches it.</p>' +
      '<div class="bar" style="width:70%"></div><div class="bar" style="width:52%"></div><div class="bar" style="width:84%"></div></main>' +
      '<p id="note" hidden>' + (own ? 'No button, so no introduction. People open it from “Feedback” in your menu.' : 'No introduction here: the button is hidden on this page.') + '</p>' +
      '<script src="' + SDK_URL + '" data-key="' + p.key + '" data-preview' + attrs + '></scr' + 'ipt>' +
      '<script>var H=window.Heresay;' + then + '</scr' + 'ipt></body></html>';
  }

  /** The web kit: the real sdk.js in a sandboxed iframe, and a script tag. */
  function webKit(p) {
    return {
      groups: DESIGN,
      shows: [['button', 'Button'], ['panel', 'Panel'], ['intro', 'Introduction'], ['sent', 'After sending']],
      darkLabel: 'Dark app',
      changes: function (cfg) { return designAttrs(cfg).length; },
      preview: function () {
        var frame = el('iframe', { class: 'design-frame', title: 'Preview', sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox' });
        return { el: frame, draw: function (cfg, show, dark) { frame.srcdoc = previewDoc(p, cfg, show, dark); } };
      },
      code: function (cfg) {
        var out = [codeBlock(designTag(p, cfg))];
        if (cfg.button === 'none') {
          out.push(el('p', { class: 'hint', text: 'Then open it from your own menu item:' }));
          out.push(codeBlock('window.Heresay?.open();'));
        }
        return out;
      },
      prompt: function (cfg) {
        var a = designAttrs(cfg);
        return 'Update the Heresay script tag in this app (the one with data-key="' + p.key + '") so it looks like this. ' +
          'Keep it where it is and keep the framework\'s own way of writing it (for example next/script in Next.js). ' +
          'Remove any other design attributes it has (data-position, data-offset, data-button, data-label, data-style, data-size, data-fill, data-shadow, data-hide-on, data-accent, data-mark, data-theme, data-font, data-lang, data-placeholder, data-types, data-thanks, data-panel, data-width, data-backdrop, data-preferences, data-intro); keep data-key, data-version and anything about the signed-in user.\n\n' +
          designTag(p, cfg) + '\n' +
          (cfg.button === 'none' ? '\nThere is no floating button now, so add a "Send feedback" item to the app\'s own help or account menu that calls window.Heresay?.open().\n' : '') +
          (a.some(function (x) { return x[0] === 'data-intro'; }) ? '' : '\nIf the app doesn\'t call window.Heresay?.introduce() yet, call it once the main screen appears.\n') +
          '\nFor what each option does, read the Heresay guide customize-web (heresay_guide, or npx -y heresay@latest guide customize-web).';
      },
      fixed: 'Always there, whatever you choose: the Heresay mark on the button, the “Your reports” tab (people read why a report was declined), and “Powered by Heresay”, so people can tell your app uses an outside tool.',
    };
  }

  function designView(view, p) {
    var apple = platformOf(p.platform).apple;
    var kit = apple ? appleKit(p) : webKit(p);
    var KEY = 'heresay.design.' + p.id;
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { cfg = {}; }
    var show = kit.shows[0][0], dark = false;

    view.classList.add('wide');
    view.appendChild(el('a', { class: 'back', href: '#/apps/' + p.id, text: '← ' + productName(p) }));
    view.appendChild(el('div', { class: 'head' }, [el('div', {}, [
      el('h1', { text: 'Design the Report button' }),
      el('p', { class: 'mute', text: apple
        ? 'Every choice starts on what we recommend. Change what your app needs, then copy the Swift or the prompt for your coding agent. The preview is a close likeness of the ' + platformOf(p.platform).label + ' sheet, with your choices.'
        : 'Every choice starts on what we recommend. Change what your app needs, then copy the tag or the prompt for your coding agent.' }),
    ])]));

    var controls = el('div', { class: 'design-controls' });
    var preview = kit.preview();
    var codeBox = el('div');
    var changed = el('span', { class: 'hint' });

    function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* private mode */ } }
    function redraw() {
      save();
      preview.draw(cfg, show, dark);
      var n = kit.changes(cfg);
      changed.textContent = n ? n + ' change' + (n === 1 ? '' : 's') + ' from the recommended setup' : 'The recommended setup';
      codeBox.textContent = '';
      kit.code(cfg).forEach(function (x) { codeBox.appendChild(x); });
    }

    kit.groups.forEach(function (g) {
      controls.appendChild(el('h2', { class: 'design-group', text: g.group }));
      g.items.forEach(function (it) {
        var chips = el('div', { class: 'filters' });
        var input = it.text ? el('input', { type: 'text', placeholder: it.text, maxlength: String(it.max || 20), 'aria-label': it.label }) : null;
        var colour = it.color ? el('input', { type: 'color', 'aria-label': 'Any colour', value: cfg[it.a] || '#0f766e' }) : null;
        function sync() {
          var v = cfg[it.a] || '';
          var known = it.c.some(function (c) { return c[0] === v; });
          chips.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === v)); });
          if (input && document.activeElement !== input) input.value = known ? '' : v;
        }
        it.c.forEach(function (c) {
          chips.appendChild(el('button', { type: 'button', 'data-v': c[0], onclick: function () { cfg[it.a] = c[0]; sync(); redraw(); } },
            [c[2] ? el('span', { class: 'swatch', style: 'background:' + c[2] }) : null, c[1] + (c[0] === '' && it.c.length > 1 ? ' ' : ''),
              c[0] === '' && it.c.length > 1 ? el('span', { class: 'n', text: '· recommended' }) : null]));
        });
        if (colour) {
          colour.oninput = function () { cfg[it.a] = colour.value; sync(); redraw(); };
          chips.appendChild(el('label', { class: 'pick-colour' }, [colour, 'Any colour']));
        }
        if (input) {
          input.oninput = function () {
            var v = input.value.trim();
            if (!v) cfg[it.a] = '';
            else if (!it.pattern || it.pattern.test(v)) cfg[it.a] = it.list ? v.split(',').map(function (s) { return s.trim(); }).filter(Boolean).join(',') : v;
            else return;
            sync(); redraw();
          };
          chips.appendChild(input);
        }
        controls.appendChild(el('div', { class: 'design-item' }, [el('b', { text: it.label }), chips, it.hint ? el('p', { class: 'hint', text: it.hint }) : null]));
        sync();
      });
    });
    controls.appendChild(el('p', { class: 'hint design-fixed', text: kit.fixed }));

    var showSeg = el('div', { class: 'seg', role: 'tablist', 'aria-label': 'Show' });
    kit.shows.forEach(function (s) {
      showSeg.appendChild(el('button', { type: 'button', role: 'tab', 'aria-selected': String(s[0] === show), text: s[1], onclick: function () {
        show = s[0];
        showSeg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', String(b === this)); }, this);
        redraw();
      } }));
    });
    var darkBox = el('input', { type: 'checkbox', onchange: function () { dark = darkBox.checked; redraw(); } });

    view.appendChild(el('div', { class: 'design' }, [
      controls,
      el('div', { class: 'design-side' }, [
        el('div', { class: 'row tight design-toolbar' }, [showSeg, el('label', { class: 'small mute' }, [darkBox, ' ' + kit.darkLabel])]),
        preview.el,
        el('div', { class: 'row tight' }, [changed, el('span', { class: 'spacer' }),
          el('button', { class: 'btn ghost', type: 'button', text: 'Start over', onclick: function () { try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ } view.textContent = ''; designView(view, p); } }),
          copyButton(function () { return kit.prompt(cfg); }, 'Copy prompt for your agent')]),
        codeBox,
      ]),
    ]));
    redraw();
  }

  // ---- design, iOS and macOS ------------------------------------------------------------

  /**
   * The same choices for the Swift package, as `HeresayStyle`. Keys are the Swift parameter
   * names; the order is HeresayStyle.init's, which Swift requires.
   */
  function appleDesign(mac) {
    return [
      { group: 'The button', items: [
        { a: 'entry', label: mac ? 'How people open it' : 'The button', c: mac
          ? [['', 'Help › Report a Problem… (⌥⌘R)'], ['button', 'That, and a corner button'], ['none', 'My own button or menu item']]
          : [['', 'A button in the corner'], ['none', 'No button: my own button or menu item']],
          hint: mac ? 'Mac apps usually keep it in the Help menu, where people look for it.' : null },
        { a: 'position', label: 'Where the button sits', c: [['', 'Bottom right'], ['bottomLeading', 'Bottom left'], ['topTrailing', 'Top right'], ['topLeading', 'Top left'], ['bottom', 'Bottom centre']] },
        { a: 'offset', label: 'Distance from the edge', c: [['', '16 pt'], ['24', '24 pt'], ['80', '80 pt, above a tab bar']], text: 'or any number', pattern: /^\d{1,3}$/ },
        { a: 'label', label: 'Text', c: [['', 'Report'], ['Feedback', 'Feedback'], ['Help us improve', 'Help us improve'], ['Found a bug?', 'Found a bug?']], text: 'or your own words', max: 40 },
        { a: 'button', label: 'Style', c: [['', 'Pill with text'], ['icon', 'Icon only']] },
        { a: 'size', label: 'Size', c: [['', 'Regular'], ['small', 'Small'], ['large', 'Large']] },
        { a: 'fill', label: 'Button colour', c: [['', 'Filled with your colour'], ['neutral', 'System background']] },
        { a: 'shadow', label: 'Shadow', c: [['', 'Soft'], ['none', 'None'], ['strong', 'Strong']] },
        { a: 'hiddenOnScreens', label: 'Hide it on these screens', c: [], text: 'Checkout, Sign in', max: 200, list: true, hint: 'Screen names as your app sets them with Heresay.setScreen(…).' },
      ]},
      { group: 'Look', items: [
        { a: 'accent', label: 'Your colour', color: true, c: [['', 'Heresay peacock', '#0f766e'], ['#7c3aed', 'Purple', '#7c3aed'], ['#2563eb', 'Blue', '#2563eb'], ['#e11d48', 'Rose', '#e11d48'], ['#15171c', 'Ink', '#15171c']] },
        { a: 'markFollowsAccent', label: 'Logo colour', c: [['', 'Follows your colour'], ['false', 'Heresay teal']] },
        { a: 'theme', label: 'Light or dark', c: [['', 'Follow the app'], ['light', 'Always light'], ['dark', 'Always dark']] },
        { a: 'typeface', label: 'Typeface', c: [['', 'System'], ['rounded', 'Rounded'], ['serif', 'Serif']] },
      ]},
      { group: 'Words', items: [
        { a: 'language', label: 'Language', c: [['', 'My app’s language'], ['en', 'English'], ['fr', 'Français'], ['ta', 'தமிழ்'], ['hi', 'हिन्दी']], hint: 'English, French, Tamil and Hindi today; any other language shows English.' },
        { a: 'placeholder', label: 'Question in the text box', c: [['', 'What happened, or what would you change?']], text: 'or your own words', max: 120 },
        { a: 'types', label: 'Report types', c: [['', 'All four'], ['broken,confusing,improvement', 'No “Idea”'], ['broken,confusing', 'Only Broken and Confusing']], hint: 'Their names can’t change: the type sets the priority.' },
        { a: 'thanks', label: 'Thank-you line after sending', c: [['', 'None']], text: 'e.g. Thanks! We read every one.', max: 160 },
      ]},
      { group: 'The sheet', items: [
        { a: 'sheet', label: 'Size', c: mac ? [['', 'Regular'], ['compact', 'Narrow'], ['large', 'Wide']]
          : [['', 'Full height'], ['compact', 'Half height, pull up for more'], ['large', 'Full screen']] },
        { a: 'showsPreferences', label: 'Preferences tab', c: [['', 'Show'], ['false', 'Hide']], hint: 'Hide it if your app calls identify() and asks nothing else.' },
      ]},
    ];
  }

  var SWIFT_ORDER = ['position', 'offset', 'label', 'button', 'size', 'fill', 'shadow', 'hiddenOnScreens', 'markFollowsAccent',
    'theme', 'typeface', 'language', 'placeholder', 'types', 'thanks', 'sheet', 'showsPreferences'];

  function swiftString(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

  /** One HeresayStyle argument, in Swift. */
  function swiftArg(k, v) {
    if (k === 'offset') return k + ': ' + (+v);
    if (k === 'label' || k === 'placeholder' || k === 'thanks' || k === 'language') return k + ': ' + swiftString(v);
    if (k === 'hiddenOnScreens') return k + ': [' + v.split(',').map(swiftString).join(', ') + ']';
    if (k === 'types') return k + ': [' + v.split(',').map(function (t) { return '.' + t; }).join(', ') + ']';
    if (k === 'markFollowsAccent' || k === 'showsPreferences') return k + ': ' + v;
    return k + ': .' + v;
  }

  function swiftColor(hex) {
    var n = parseInt(hex.slice(1), 16);
    var c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (x) { return (x / 255).toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0'); });
    return 'Color(red: ' + c[0] + ', green: ' + c[1] + ', blue: ' + c[2] + ')';
  }

  function swiftConfigure(p, cfg) {
    var args = SWIFT_ORDER.filter(function (k) { return cfg[k]; }).map(function (k) { return swiftArg(k, cfg[k]); });
    var lines = ['key: "' + p.key + '"', 'url: URL(string: "' + location.origin + '")!'];
    if (cfg.accent) lines.push('accent: ' + swiftColor(cfg.accent));
    if (args.length) lines.push('style: HeresayStyle(\n        ' + args.join(',\n        ') + '\n    )');
    return 'Heresay.configure(\n    ' + lines.join(',\n    ') + '\n)';
  }

  /** Where the sheet (and the button) attach: the root view, and on the Mac the menu. */
  function swiftAttach(p, cfg) {
    var mac = p.platform === 'macos';
    var button = mac ? cfg.entry === 'button' : cfg.entry !== 'none';
    var view = 'ContentView().' + (button ? 'heresayReportButton()' : 'heresay()');
    if (mac && cfg.entry !== 'none') return 'WindowGroup {\n    ' + view + '\n}\n.commands { HeresayCommands() }   // Help › Report a Problem… (⌥⌘R)';
    return 'WindowGroup {\n    ' + view + '\n}' + (button ? '' : '\n\n// Then, from your own button or menu item:\nHeresay.present()');
  }

  function appleKit(p) {
    var mac = p.platform === 'macos';
    var groups = appleDesign(mac);
    return {
      groups: groups,
      shows: [['button', mac ? 'Window' : 'Button'], ['panel', 'Sheet'], ['intro', 'Introduction'], ['sent', 'After sending']],
      darkLabel: 'Dark mode',
      changes: function (cfg) { return Object.keys(cfg).filter(function (k) { return cfg[k]; }).length; },
      preview: function () {
        var box = el('div', { class: 'design-frame apple-frame', role: 'img', 'aria-label': 'Preview' });
        // The phone is drawn at its real size, then zoomed to fit the box.
        var fit = function () {
          var ph = box.querySelector('.am-phone');
          if (ph) ph.style.zoom = String(Math.min(1, (box.clientHeight - 28) / 630));
        };
        window.addEventListener('resize', fit);
        return { el: box, draw: function (cfg, show, dark) { box.innerHTML = appleMock(p, cfg, show, dark); fit(); } };
      },
      code: function (cfg) {
        return [el('p', { class: 'hint', text: 'In your App’s init():' }), codeBlock(swiftConfigure(p, cfg)),
          el('p', { class: 'hint', text: 'And on the root view:' }), codeBlock(swiftAttach(p, cfg))];
      },
      prompt: function (cfg) {
        return 'Update how Heresay is set up in this ' + (mac ? 'macOS' : 'iOS') + ' app (the Heresay.configure call with key "' + p.key + '") so it matches this. ' +
          'Keep the key, the URL and anything else it passes (version, session). Replace any existing accent: and style: arguments with these. ' +
          'Heresay 0.2.11 or later is needed for style:; update the Swift package if it is older.\n\n' +
          swiftConfigure(p, cfg) + '\n\nThe root view and scene:\n\n' + swiftAttach(p, cfg) + '\n' +
          (cfg.hiddenOnScreens ? '\nThe button hides on screens named with Heresay.setScreen(…). Make sure those screens call it with exactly these names: ' + cfg.hiddenOnScreens + '.\n' : '') +
          '\nIf the app doesn\'t call Heresay.introduce() yet, call it once the main screen appears.' +
          '\nFor what each option does, read the Heresay guide customize-apple (heresay_guide, or npx -y heresay@latest guide customize-apple).';
      },
      fixed: 'Always there, whatever you choose: the Heresay mark, the “Your reports” tab (people read why a report was declined), and “Powered by Heresay” in the sheet and the introduction, so people can tell your app uses an outside tool.',
    };
  }

  /** The words the preview shows, from Words.swift. Only a likeness needs these few. */
  var APPLE_WORDS = {
    en: { report: 'Report', send: 'Send', sendFeedback: 'Send feedback', straight: 'Straight to the {app} team', tabs: ['Report', 'Your reports', 'Preferences'],
      what: 'What is it?', happened: 'What happened?', ph: 'What happened, or what would you change?', attached: 'Sent with this screen and the app version.',
      types: [['Broken', 'Something doesn’t work'], ['Confusing', 'I couldn’t tell how'], ['Could be better', 'It works, and could be better'], ['Idea', 'Something that isn’t there yet']],
      powered: 'Powered by Heresay', introTitle: 'Help make this app better',
      introBody: '{reach} to share an idea or tell the team what you’d change. A real person reads every report, and you’ll see what happens to yours.',
      reachTap: 'Tap {label} in the corner any time', reachClick: 'Click {label} any time', reachMenu: 'Choose Help › Report a Problem… (⌥⌘R) any time', reachUse: 'Use {label} any time',
      tryIt: 'Try it', gotIt: 'Got it', cancel: 'Cancel', sentTitle: 'Sent. Thank you.', sentBody: 'A person on the team reads every report. You’ll see what happens to it under Your reports.',
      another: 'Send another', see: 'See your reports', menu: 'Report a Problem…' },
    fr: { report: 'Signaler', send: 'Envoyer', sendFeedback: 'Envoyer un retour', straight: 'Directement à l’équipe {app}', tabs: ['Signaler', 'Vos signalements', 'Préférences'],
      what: 'De quoi s’agit-il ?', happened: 'Que s’est-il passé ?', ph: 'Que s’est-il passé, ou que changeriez-vous ?', attached: 'Envoyé avec cet écran et la version de l’app.',
      types: [['Cassé', 'Quelque chose ne marche pas'], ['Déroutant', 'Je ne voyais pas comment faire'], ['Pourrait être mieux', 'Ça marche, mais ça pourrait être mieux'], ['Idée', 'Quelque chose qui n’existe pas encore']],
      powered: 'Propulsé par Heresay', introTitle: 'Aidez à améliorer cette app',
      introBody: '{reach} pour partager une idée ou dire à l’équipe ce que vous changeriez. Une vraie personne lit chaque signalement, et vous verrez ce qu’il devient.',
      reachTap: 'Touchez {label} dans le coin à tout moment', reachClick: 'Cliquez sur {label} à tout moment', reachMenu: 'Choisissez Aide › Signaler un problème… (⌥⌘R) à tout moment', reachUse: 'Utilisez {label} à tout moment',
      tryIt: 'Essayer', gotIt: 'Compris', cancel: 'Annuler', sentTitle: 'Envoyé. Merci.', sentBody: 'Une personne de l’équipe lit chaque signalement. Vous verrez ce qu’il devient dans Vos signalements.',
      another: 'En envoyer un autre', see: 'Voir vos signalements', menu: 'Signaler un problème…' },
    ta: { report: 'தெரிவி', send: 'அனுப்பு', sendFeedback: 'கருத்து அனுப்பு', straight: 'நேராக {app} குழுவுக்கு', tabs: ['தெரிவி', 'உங்கள் புகார்கள்', 'விருப்பங்கள்'],
      what: 'இது என்ன வகை?', happened: 'என்ன நடந்தது?', ph: 'என்ன நடந்தது, அல்லது எதை மாற்ற விரும்புகிறீர்கள்?', attached: 'இந்தத் திரை மற்றும் ஆப் பதிப்புடன் அனுப்பப்படும்.',
      types: [['வேலை செய்யவில்லை', 'ஏதோ ஒன்று சரியாக இயங்கவில்லை'], ['குழப்பமாக உள்ளது', 'எப்படிச் செய்வது என்று புரியவில்லை'], ['இன்னும் சிறப்பாக்கலாம்', 'வேலை செய்கிறது, ஆனால் மேம்படுத்தலாம்'], ['யோசனை', 'இன்னும் இல்லாத ஒன்று']],
      powered: 'Heresay மூலம் இயங்குகிறது', introTitle: 'இந்த ஆப்பை இன்னும் சிறப்பாக்க உதவுங்கள்',
      introBody: 'ஒரு யோசனையைப் பகிர அல்லது நீங்கள் எதை மாற்ற விரும்புகிறீர்கள் என்று குழுவிடம் சொல்ல, {reach}. ஒவ்வொரு கருத்தையும் ஒருவர் படிக்கிறார்; உங்களுடையதற்கு என்ன ஆனது என்பதைப் பார்க்கலாம்.',
      reachTap: 'எப்போது வேண்டுமானாலும் மூலையில் உள்ள {label} ஐத் தட்டுங்கள்', reachClick: 'எப்போது வேண்டுமானாலும் {label} ஐக் கிளிக் செய்யுங்கள்', reachMenu: 'எப்போது வேண்டுமானாலும் Help › சிக்கலைத் தெரிவி… (⌥⌘R) என்பதைத் தேர்ந்தெடுங்கள்', reachUse: 'எப்போது வேண்டுமானாலும் {label} ஐப் பயன்படுத்துங்கள்',
      tryIt: 'முயன்று பாருங்கள்', gotIt: 'சரி', cancel: 'ரத்துசெய்', sentTitle: 'அனுப்பப்பட்டது. நன்றி.', sentBody: 'குழுவில் ஒருவர் ஒவ்வொரு புகாரையும் படிக்கிறார். அதற்கு என்ன ஆனது என்பதை “உங்கள் புகார்கள்” பகுதியில் பார்க்கலாம்.',
      another: 'இன்னொன்று அனுப்பு', see: 'உங்கள் புகார்களைப் பார்', menu: 'சிக்கலைத் தெரிவி…' },
    hi: { report: 'रिपोर्ट करें', send: 'भेजें', sendFeedback: 'फ़ीडबैक भेजें', straight: 'सीधे {app} टीम को', tabs: ['रिपोर्ट', 'आपकी रिपोर्ट', 'प्राथमिकताएँ'],
      what: 'यह क्या है?', happened: 'क्या हुआ?', ph: 'क्या हुआ, या आप क्या बदलना चाहेंगे?', attached: 'इस स्क्रीन और ऐप के वर्शन के साथ भेजा जाता है।',
      types: [['टूटा हुआ', 'कुछ काम नहीं कर रहा'], ['उलझन भरा', 'समझ नहीं आया कि कैसे करें'], ['बेहतर हो सकता है', 'काम करता है, पर बेहतर हो सकता है'], ['सुझाव', 'कुछ ऐसा जो अभी नहीं है']],
      powered: 'Heresay द्वारा संचालित', introTitle: 'इस ऐप को और बेहतर बनाने में मदद करें',
      introBody: 'कोई आइडिया बताने या टीम को यह बताने के लिए कि आप क्या बदलना चाहेंगे, {reach}। हर रिपोर्ट कोई इंसान पढ़ता है, और आपकी रिपोर्ट का क्या हुआ, यह आप देखेंगे।',
      reachTap: 'कभी भी कोने में {label} पर टैप करें', reachClick: 'कभी भी {label} पर क्लिक करें', reachMenu: 'कभी भी Help › समस्या की रिपोर्ट करें… (⌥⌘R) चुनें', reachUse: 'कभी भी {label} का इस्तेमाल करें',
      tryIt: 'आज़माएँ', gotIt: 'ठीक है', cancel: 'रद्द करें', sentTitle: 'भेज दिया गया। धन्यवाद।', sentBody: 'टीम का कोई व्यक्ति हर रिपोर्ट पढ़ता है। इसका क्या हुआ, यह आप “आपकी रिपोर्ट” में देखेंगे।',
      another: 'एक और भेजें', see: 'अपनी रिपोर्ट देखें', menu: 'समस्या की रिपोर्ट करें…' },
  };
  var TYPE_IDS = ['broken', 'confusing', 'improvement', 'idea'];
  var TYPE_ICON = { broken: '⚠︎', confusing: '?', improvement: '✦', idea: '💡' };

  /** A likeness of the Swift package's button, sheet, alert and sent view, as HTML. */
  function appleMock(p, cfg, show, darkMode) {
    var mac = p.platform === 'macos';
    var w = APPLE_WORDS[cfg.language] || APPLE_WORDS.en;
    var fmt = function (s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k]; }); };
    var acc = cfg.accent || '#0f766e';
    var dark = cfg.theme === 'dark' || (cfg.theme !== 'light' && darkMode);
    var markC = cfg.markFollowsAccent === 'false' || !cfg.accent ? (dark ? '#2dd4bf' : '#0b5e57') : acc;
    var mark = function (c, s) { return '<span class="am-mark" style="width:' + s + 'px;height:' + s + 'px;background:' + c + '"></span>'; };
    var label = cfg.label || w.report;
    var hasButton = mac ? cfg.entry === 'button' : cfg.entry !== 'none';
    var face = { rounded: 'ui-rounded,"SF Pro Rounded",system-ui', serif: 'ui-serif,Georgia,serif' }[cfg.typeface] || '-apple-system,system-ui,sans-serif';
    var off = +(cfg.offset || 16);
    var pos = cfg.position || 'bottomTrailing';
    var place = (/top/.test(pos) ? 'top:' + (off + (mac ? 34 : 54)) + 'px;' : 'bottom:' + (off + (mac ? 0 : 20)) + 'px;') +
      (pos === 'bottom' ? 'left:50%;transform:translateX(-50%);' : /Leading/.test(pos) ? 'left:' + off + 'px;' : 'right:' + off + 'px;');
    var sz = { small: [11, 10, 6, 16], large: [16, 18, 12, 26] }[cfg.size] || [13, 14, 9, 21];
    var neutral = cfg.fill === 'neutral';
    var icon = cfg.button === 'icon';
    var btnDark = dark || darkMode;
    var shadow = { none: 'none', strong: '0 6px 16px rgba(0,0,0,.35)' }[cfg.shadow] || '0 3px 8px rgba(0,0,0,.18)';
    var button = hasButton && show !== 'panel' && show !== 'sent'
      ? '<div class="am-btn" style="' + place + 'font-size:' + sz[0] + 'px;padding:' + (icon ? (sz[2] + 1) + 'px' : sz[2] + 'px ' + sz[1] + 'px') + ';border-radius:999px;box-shadow:' + shadow + ';' +
        (neutral ? 'background:' + (btnDark ? 'rgba(40,42,48,.92)' : 'rgba(255,255,255,.92)') + ';color:' + (btnDark ? '#f2f2f7' : '#111') + ';border:1px solid rgba(127,127,127,.25)' : 'background:' + acc + ';color:#fff') + '">' +
        mark(neutral ? markC : '#fff', sz[3]) + (icon ? '' : '<b>' + esc(label) + '</b>') + '</div>' : '';

    var types = (cfg.types || TYPE_IDS.join(',')).split(',');
    var typeCards = types.map(function (t) {
      var tw = w.types[TYPE_IDS.indexOf(t)];
      return '<div class="am-type"><span class="am-ti" style="color:' + acc + ';background:' + acc + '1f">' + TYPE_ICON[t] + '</span><span><b>' + esc(tw[0]) + '</b><i>' + esc(tw[1]) + '</i></span></div>';
    }).join('');
    var tabs = [w.tabs[0], w.tabs[1]].concat(cfg.showsPreferences === 'false' ? [] : [w.tabs[2]]);
    var powered = '<div class="am-powered">' + mark(markC, 14) + esc(w.powered) + '</div>';
    var head = '<div class="am-head">' + mark(markC, 28) + '<div><b>' + esc(w.sendFeedback) + '</b><span>' + esc(fmt(w.straight, { app: productName(p) })) + '</span></div>' + (mac ? '' : '<em>✕</em>') + '</div>' +
      '<div class="am-seg">' + tabs.map(function (t, i) { return '<span' + (i === 0 ? ' class="on"' : '') + '>' + esc(t) + '</span>'; }).join('') + '</div>';
    var form = '<div class="am-body"><p class="am-lab">' + esc(w.what) + '</p><div class="am-types' + (mac ? ' grid' : '') + '">' + typeCards + '</div>' +
      '<p class="am-lab">' + esc(w.happened) + '</p><div class="am-text">' + esc(cfg.placeholder || w.ph) + '</div></div>' + powered +
      '<div class="am-foot"><span>' + esc(w.attached) + '</span>' + (mac ? '<u>' + esc(w.cancel) + '</u>' : '') + '<strong style="background:' + acc + '">' + esc(w.send) + '</strong></div>';
    var sent = '<div class="am-body am-sent">' + mark(markC, 56) + '<b>' + esc(w.sentTitle) + '</b>' + (cfg.thanks ? '<p>' + esc(cfg.thanks) + '</p>' : '') +
      '<p class="mute">' + esc(w.sentBody) + '</p><div><u>' + esc(w.another) + '</u><strong style="background:' + acc + '">' + esc(w.see) + '</strong></div></div>' + powered;
    var sheetSize = cfg.sheet || '';
    var sheet = show === 'panel' || show === 'sent'
      ? '<div class="am-dim"></div><div class="am-sheet ' + (mac ? 'mac ' : '') + (sheetSize || 'regular') + '">' + head + (show === 'sent' ? sent : form) + '</div>' : '';
    var reach = mac ? (cfg.entry !== 'none' ? w.reachMenu : fmt(hasButton ? w.reachClick : w.reachUse, { label: cfg.label ? '“' + cfg.label + '”' : w.report }))
      : fmt(hasButton ? w.reachTap : w.reachUse, { label: cfg.label ? '“' + cfg.label + '”' : w.report });
    // The introduction: a welcome sheet on iPhone, its own small window on the Mac.
    var badge = '<span class="am-badge" style="background:' + markC + '24">' + mark(markC, 32) + '</span>';
    var introText = badge + '<b>' + esc(w.introTitle) + '</b><p>' + esc(fmt(w.introBody, { reach: reach })) + '</p>';
    var alert = show !== 'intro' ? '' : mac
      ? '<div class="am-intro mac"><div class="am-intro-bar"><i></i></div><div class="am-intro-text">' + introText + '</div>' +
        '<div class="am-intro-foot">' + powered + '<u>' + esc(w.gotIt) + '</u><strong style="background:' + acc + '">' + esc(w.tryIt) + '</strong></div></div>'
      : '<div class="am-dim"></div><div class="am-intro"><div class="am-intro-text">' + introText + '</div>' +
        '<strong style="background:' + acc + '">' + esc(w.tryIt) + '</strong><u style="color:' + acc + '">' + esc(w.gotIt) + '</u>' + powered + '</div>';
    var menu = mac && cfg.entry !== 'none' && show === 'button'
      ? '<div class="am-menu"><span>' + esc(w.menu) + '</span><kbd>⌥⌘R</kbd></div>' : '';
    var rows = ['Groceries', 'Trip to Ooty', 'Quarterly plan', 'Book list'].map(function (r) { return '<li>' + r + '</li>'; }).join('');
    var app = mac
      ? '<div class="am-menubar"><b></b><b>' + esc(productName(p)) + '</b><span>File</span><span>Edit</span><span' + (menu ? ' class="on"' : '') + '>Help</span></div>' + menu +
        '<div class="am-window"><div class="am-titlebar"><i></i><i></i><i></i><span>' + esc(productName(p)) + '</span></div><div class="am-content"><h3>Notes</h3><ul>' + rows + '</ul></div>' + button + sheet + alert + '</div>'
      : '<div class="am-phone"><div class="am-status"><span>9:41</span><i></i></div><div class="am-content"><h3>Notes</h3><ul>' + rows + '</ul></div>' + button + sheet + alert + '</div>';
    return '<div class="am ' + (mac ? 'am-mac' : 'am-ios') + (darkMode ? ' app-dark' : '') + (dark ? ' dark' : '') + '" style="--acc:' + acc + ';font-family:' + face + '">' + app + '</div>';
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
      el('p', { class: 'hint', html: 'Optional: <code>Heresay.setScreen("Checkout")</code> as people move around, and <code>Heresay.present()</code> to open it from your own button. Needs iOS 16 or macOS 13.' }),
    ];
  }

  /** Signed-in apps: the one call that tells Heresay who it is. Required when they said yes. */
  function identifyStep(p) {
    var apple = platformOf(p.platform).apple;
    var code = apple
      ? '// after sign-in\nHeresay.identify(id: user.id, label: user.name, email: user.email)\n\n// after sign-out\nHeresay.identify()'
      : '// after sign-in\nwindow.Heresay?.identify({ id: user.id, label: user.name, email: user.email });\n\n// after sign-out\nwindow.Heresay?.identify();';
    if (p.sign_in === 'yes') {
      return [el('p', { html: '<b>Then, where your app signs people in,</b> tell Heresay who it is. Nobody is asked their name, and you can reply to them:' }), codeBlock(code)];
    }
    if (p.sign_in === 'no') return [];
    return [el('details', { class: 'where' }, [el('summary', { text: 'Do people sign in to your app?' }),
      el('p', { text: 'Then tell Heresay who is signed in, so nobody types their name to send a report:' }), codeBlock(code)])];
  }

  /** People who never noticed the button can't use it: a one-time introduction, shown by Heresay. */
  function introStep(p) {
    var apple = platformOf(p.platform).apple;
    return apple ? [
      el('p', { html: '<b>Last, tell people it’s there.</b> ' + (p.platform === 'macos' ? 'Under Help, nobody finds it by chance. ' : '') + 'Once the main screen appears, after sign-in and onboarding, show the one-time introduction. It says where to find Heresay and offers to open it:' }),
      codeBlock('MainView()\n    .onAppear { Heresay.introduce() }   // once per install; later calls do nothing'),
    ] : [
      el('p', { html: '<b>Last, tell people it’s there.</b> Add <code>data-intro="auto"</code> to the tag for a one-time bubble over the button. Apps with sign-in or onboarding: call this once the main screen appears instead:' }),
      codeBlock('window.Heresay?.introduce();   // once per device; later calls do nothing'),
    ];
  }

  function byHand(p) {
    return byHandSteps(p).concat(identifyStep(p), introStep(p));
  }

  function byHandSteps(p) {
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
      '   Then commit the files it added (.mcp.json, .claude/skills/heresay/, AGENTS.md, CLAUDE.md) in their own commit, so every checkout and worktree of this repo has the Heresay skill and MCP server. Commit nothing else with them.',
      '',
      '2. Print the install steps for this app and follow them. They include the app\'s key and exactly where the code goes' + (apple ? ' (a Swift package and one line of setup)' : ', for any framework') + '. Follow every required step, including telling the people who use the app that Heresay is there: call introduce() once the main screen appears, so it isn\'t hidden' + (apple ? ' under a menu' : ' in a corner') + '.',
      '',
      '   npx -y heresay@latest install ' + p.id,
      '',
      '3. Verify the install. This finds the app\'s key in the code and tells the Heresay dashboard, which is waiting for it:',
      '',
      '   npx -y heresay@latest check ' + p.id,
      '',
      '   You are done when it prints "installed": true and an empty "todo" list. If not, do what it says and run it again. Commit the install as its own change.',
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
        showPlatform ? el('span', { class: 'pill platform-pill', text: platformOf(p.platform).label }) : null,
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

  /** Most urgent first, oldest first within a type, as the server sorts one app's reports. */
  var TYPE_ORDER = { broken: 0, confusing: 1, improvement: 2, idea: 3 };
  function triageSort(rs) {
    return rs.slice().sort(function (a, b) {
      return ((a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1))
        || (TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
        || a.created_at.localeCompare(b.created_at);
    });
  }

  /**
   * One inbox for a product: every platform's reports together, each marked with where it came
   * from. Install, delete and repos stay per platform, because keys and code differ.
   */
  function reportsView(view, p) {
    var reports = [];
    var sibs = [p];
    var where = 'all';
    var filters = el('nav', { class: 'filters', 'aria-label': 'Filter' });
    var platformBar = el('nav', { class: 'filters platforms-filter', 'aria-label': 'Platform' });
    var list = el('div', { class: 'reports' }, [loading()]);
    var empty = el('p', { class: 'empty' });
    var ctxs = {};
    var head = el('div', { class: 'head' });
    var platformsBox = el('div', { class: 'product-platforms' });
    view.appendChild(el('a', { class: 'back', href: '#/', text: '← All apps' }));
    view.appendChild(head);
    view.appendChild(platformsBox);
    view.appendChild(platformBar);
    view.appendChild(filters);
    view.appendChild(list);
    view.appendChild(empty);

    function drawHead() {
      head.textContent = '';
      var many = sibs.length > 1;
      head.appendChild(el('div', { class: 'title' }, [
        many ? el('span', { class: 'picon', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M17 13v8M13 17h8"/></svg>' }) : icon(platformOf(p.platform)),
        el('div', {}, [el('h1', { text: productName(p) }),
          el('span', { class: 'mute small', text: many ? sibs.map(function (x) { return platformOf(x.platform).label; }).join(' · ')
            : (p.framework ? frameworkLabel(p.framework) + (p.framework_detected ? ' (detected)' : '') : platformOf(p.platform).label) })])]));
      head.appendChild(el('div', { class: 'row tight' }, [
        el('a', { class: 'btn ghost', href: '#/new?product=' + productOf(p), text: '+ Add a platform' }),
        many || !designable(p) ? null : el('a', { class: 'btn ghost', href: '#/apps/' + p.id + '/design', text: 'Design' }),
        many ? null : el('a', { class: 'btn', href: '#/apps/' + p.id + '/setup', text: 'Install' }),
        many ? null : el('a', { class: 'btn ghost', href: '#/apps/' + p.id + '/delete', text: 'Delete…' }),
      ]));
    }

    /** Per platform: where agents fix it, and its own Install and Delete. */
    function drawPlatforms() {
      platformsBox.textContent = '';
      var many = sibs.length > 1;
      sibs.forEach(function (x) {
        var repos = (ctxs[x.id] || {}).repos || [];
        platformsBox.appendChild(el('p', { class: 'repos-line' }, [
          many ? el('b', { text: platformOf(x.platform).label + ': ' }) : null,
          document.createTextNode(repos.length ? 'Agents fix these in ' + repos.join(', ') + ' · ' : 'No repo connected for agents yet · '),
          el('a', { href: '#/connect?app=' + x.id, text: 'Connect a repo' }),
          many ? document.createTextNode(' · ') : null,
          many ? el('a', { href: '#/apps/' + x.id + '/setup', text: 'Install' }) : null,
          many && designable(x) ? document.createTextNode(' · ') : null,
          many && designable(x) ? el('a', { href: '#/apps/' + x.id + '/design', text: 'Design' }) : null,
          many ? document.createTextNode(' · ') : null,
          many ? el('a', { href: '#/apps/' + x.id + '/delete', text: 'Delete…' }) : null,
        ]));
      });
    }

    function load() {
      return api('GET', '/projects').then(function (b) {
        projects = b.projects;
        sibs = siblings(p);
        drawHead();
        return Promise.all(sibs.map(function (x) {
          return Promise.all([api('GET', '/projects/' + x.id + '/reports'), api('GET', '/projects/' + x.id + '/repos')])
            .then(function (r) { ctxs[x.id] = { briefs: r[0].briefs || {}, repos: r[1].repos, project: x, reports: r[0].reports }; });
        }));
      }).then(function () {
        reports = triageSort([].concat.apply([], sibs.map(function (x) { return ctxs[x.id].reports; })));
        drawPlatforms();
        render();
      }).catch(function (x) {
        if (reports.length) return;  // a background refresh failed: keep what is on screen
        list.textContent = '';
        list.appendChild(el('p', { class: 'err', role: 'alert', text: x.message }));
        list.appendChild(el('button', { class: 'btn', text: 'Retry', onclick: function () { route(); } }));
      });
    }

    function render() {
      var many = sibs.length > 1;
      platformBar.textContent = '';
      platformBar.hidden = !many;
      if (many) {
        [{ id: 'all', label: 'All platforms' }].concat(sibs.map(function (x) { return { id: x.id, label: platformOf(x.platform).label }; })).forEach(function (f) {
          var n = f.id === 'all' ? reports.length : reports.filter(function (r) { return r.project_id === f.id; }).length;
          platformBar.appendChild(el('button', { 'aria-pressed': String(where === f.id), onclick: function () { where = f.id; render(); } },
            [f.label + ' ', el('span', { class: 'n', text: String(n) })]));
        });
      }
      var here = reports.filter(function (r) { return where === 'all' || r.project_id === where; });
      drawFilters(here);
      list.textContent = '';
      var shown = here.filter(function (r) { return filter === 'all' || r.status === filter; });
      empty.hidden = shown.length > 0;
      empty.textContent = '';
      if (!here.length) {
        empty.appendChild(document.createTextNode('No reports yet. '));
        empty.appendChild(el('a', { href: '#/apps/' + (where === 'all' ? p.id : where) + '/setup', text: 'Check the install' }));
      } else empty.textContent = filter === 'open' ? 'Nothing waiting. Every report has had its hearing.' : 'Nothing here.';
      shown.forEach(function (r) {
        var c = ctxs[r.project_id];
        list.appendChild(row(c.project, r, settled, c, many));
      });
    }

    function drawFilters(here) {
      here = here || reports.filter(function (r) { return where === 'all' || r.project_id === where; });
      filters.textContent = '';
      ['open', 'accepted', 'fixed', 'declined', 'all'].forEach(function (f) {
        var n = f === 'all' ? here.length : here.filter(function (r) { return r.status === f; }).length;
        filters.appendChild(el('button', {
          'aria-pressed': String(filter === f),
          onclick: function () { filter = f; render(); },
        }, [(f === 'all' ? 'All' : STATUS_LABEL[f]) + ' ', el('span', { class: 'n', text: String(n) })]));
      });
    }

    /**
     * A report moved. The card says so where the click was, the counts move at once, and only
     * then does it leave this filter, so nothing vanishes without a word.
     */
    function settled(r, card, done) {
      if (!done) return load();  // someone else got there first: show what they did
      drawFilters();
      var to = r.status;
      toast(DONE_TOAST[to], filter === to || filter === 'all' ? null : {
        label: 'View ' + STATUS_LABEL[to].toLowerCase(), run: function () { filter = to; render(); window.scrollTo(0, 0); },
      });
      card.classList.add('settled');
      setTimeout(function () {
        if (!card.isConnected) return;
        if (filter === 'all' || filter === to) return load();  // it stays in this list
        card.style.height = card.offsetHeight + 'px';
        card.getBoundingClientRect();
        card.classList.add('leaving');
        card.style.height = '0px';
        setTimeout(load, 320);
      }, 2200);
    }

    load();
    // Reports arrive while you read. Don't refresh under someone typing, or a card on its way out.
    every(30000, function () { if (!list.querySelector('textarea, .report.settled, .report .busy')) load(); });
  }

  function ctxLine(c) {
    return [c.page_title, c.route, c.app_version && ('v' + c.app_version), c.platform, c.os, c.browser,
      c.viewport]
      .filter(Boolean).join(' · ');
  }

  var mailto = function (e) { return el('a', { href: 'mailto:' + encodeURIComponent(e).replace(/%40/g, '@'), text: 'Reply' }); };

  /**
   * Who sent it. "Signed in" is what the app said (identify); "From" is what the reporter typed
   * in Preferences, their words, not verified.
   */
  function reporterLine(c, rp) {
    rp = rp || {};
    var app = [c.user_label || c.user_id, c.user_email].filter(Boolean).join(' · ');
    var typed = [rp.name, rp.email].filter(Boolean).join(' · ');
    if (!app && !typed && !rp.note) return null;
    var reply = c.user_email || rp.email;
    return el('div', { class: 'ctx' }, [
      app ? el('span', {}, [document.createTextNode('Signed in: ' + app + ' ')]) : null,
      !app && typed ? el('span', {}, [document.createTextNode('From: ' + typed + ' ')]) : null,
      reply ? mailto(reply) : null,
      rp.note ? el('div', { text: 'About their setup: ' + rp.note }) : null,
    ]);
  }

  var DONE_TOAST = {
    accepted: 'Accepted. It is waiting for a coding agent.',
    declined: 'Declined. They will see your reason.',
    fixed: 'Marked fixed. They will see it in “Your reports”.',
  };
  var BUSY_LABEL = { accept: 'Accepting…', decline: 'Declining…', fixed: 'Saving…' };

  function row(p, r, settled, ctx, showPlatform) {
    var brief = ctx.briefs[r.id];
    var err = el('span', { class: 'err', role: 'alert' });
    var actions = el('div', { class: 'actions' });
    var card, sentTo = null;
    var act = function (action, body, b) {
      if (action === 'accept') sentTo = (body && body.repo) || ctx.repos[0] || null;
      err.textContent = '';
      var undo = busyButton(b, BUSY_LABEL[action]);
      actions.querySelectorAll('button, select, textarea').forEach(function (c) { if (c !== b) c.disabled = true; });
      card.classList.add('working');
      return api('POST', '/projects/' + p.id + '/reports/' + r.id + '/' + action, body)
        .then(function (x) {
          Object.assign(r, x.report || {});
          card.classList.remove('working');
          showDone();
          settled(r, card, true);
        })
        .catch(function (x) {
          undo();
          card.classList.remove('working');
          actions.querySelectorAll('button, select, textarea').forEach(function (c) { c.disabled = false; });
          err.textContent = x.message;
          if (x.status === 409) settled(r, card, false);
        });
    };

    /** In place of the buttons: what just happened, in the colour of the new status. */
    function showDone() {
      status.className = 'status s-' + r.status;
      status.textContent = STATUS_LABEL[r.status];
      var line = r.status === 'accepted'
        ? 'Accepted. Waiting for an agent' + (sentTo ? ' in ' + sentTo : '') + '.'
        : r.status === 'declined' ? 'Declined. They will read your reason.' : 'Marked fixed. They will see it.';
      actions.textContent = '';
      actions.appendChild(el('div', { class: 'done-line s-' + r.status }, [
        el('span', { class: 'done-tick', 'aria-hidden': 'true' }), document.createTextNode(line),
      ]));
    }

    function submitOnCmdEnter(area, go) {
      area.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go.click(); } });
    }

    function buttons() {
      actions.textContent = '';
      if (r.status === 'open') {
        // Several repos hold this app's code: say where the fix goes, defaulting to the first.
        var pick = ctx.repos.length > 1 ? el('select', { 'aria-label': 'Where the fix goes' },
          ctx.repos.map(function (x) { return el('option', { value: x, text: 'Fix in ' + x }); })) : null;
        actions.appendChild(el('button', { class: 'btn primary', type: 'button', text: 'Accept', onclick: function (e) {
          act('accept', pick ? { repo: pick.value } : undefined, e.currentTarget);
        } }));
        if (pick) actions.appendChild(pick);
        actions.appendChild(el('button', { class: 'btn', type: 'button', text: 'Decline…', onclick: declineForm }));
      }
      if (r.status === 'accepted') {
        actions.appendChild(el('button', {
          class: 'btn primary', text: 'Copy prompt for agent',
          type: 'button',
          onclick: function (e) {
            var b = e.currentTarget;
            var undo = busyButton(b, 'Copying…');
            api('GET', '/projects/' + p.id + '/reports/' + r.id + '/prompt')
              .then(function (x) { return navigator.clipboard.writeText(x.prompt); })
              .then(function () {
                undo();
                b.textContent = 'Copied ✓';
                toast('Prompt copied. Paste it into your coding agent.');
                setTimeout(function () { b.textContent = 'Copy prompt for agent'; }, 2000);
              })
              .catch(function (x) { undo(); err.textContent = x.message; });
          },
        }));
        actions.appendChild(el('button', { class: 'btn', type: 'button', text: 'Mark fixed…', onclick: fixedForm }));
      }
      actions.appendChild(err);
    }

    function fixedForm() {
      actions.textContent = '';
      var note = el('textarea', { placeholder: 'What changed, in their words. The person who sent this will read it. Optional.', 'aria-label': 'Note for the reporter' });
      var go = el('button', { class: 'btn primary', type: 'button', text: 'Mark fixed', onclick: function (e) {
        act('fixed', note.value.trim() ? { note: note.value } : undefined, e.currentTarget);
      } });
      submitOnCmdEnter(note, go);
      actions.appendChild(note);
      actions.appendChild(go);
      actions.appendChild(el('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: buttons }));
      actions.appendChild(err);
      note.focus();
    }

    function declineForm() {
      actions.textContent = '';
      var reason = el('textarea', { placeholder: 'Why? The person who sent this will read it.', 'aria-label': 'Reason for declining' });
      var go = el('button', { class: 'btn primary', type: 'button', text: 'Decline', onclick: function (e) {
        if (!reason.value.trim()) { err.textContent = 'Give a reason. They will see it.'; reason.focus(); return; }
        act('decline', { reason: reason.value }, e.currentTarget);
      } });
      submitOnCmdEnter(reason, go);
      actions.appendChild(reason);
      actions.appendChild(go);
      actions.appendChild(el('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: buttons }));
      actions.appendChild(err);
      reason.focus();
    }
    buttons();

    var status = el('span', { class: 'status s-' + r.status, text: STATUS_LABEL[r.status] });
    card = el('article', { class: 'report t-' + r.type }, [
      el('div', { class: 'meta' }, [
        el('span', { class: 'pill ' + r.type, text: TYPE_LABEL[r.type] }),
        showPlatform ? el('span', { class: 'pill platform-pill', text: platformOf(p.platform).label }) : null,
        el('time', { datetime: r.created_at, text: new Date(r.created_at).toLocaleString() }),
        status,
      ]),
      el('p', { class: 'text', text: r.text }),
      el('div', { class: 'ctx', text: ctxLine(r.context) }),
      r.context.page_url ? el('div', { class: 'ctx' }, [el('a', { href: r.context.page_url, target: '_blank', rel: 'noopener noreferrer', text: r.context.page_url })]) : null,
      reporterLine(r.context, r.reporter),
      r.decline_reason ? el('div', { class: 'reason', text: 'Declined: ' + r.decline_reason }) : null,
      r.fix_note ? el('div', { class: 'reason', text: 'Told them: ' + r.fix_note }) : null,
      r.status === 'accepted' && brief ? el('div', { class: 'brief-line' }, [
        brief.claimed_by ? el('b', { text: 'In progress in ' + brief.claimed_by }) : document.createTextNode(brief.repo ? 'Waiting for an agent in ' + brief.repo : 'Waiting for an agent in any connected repo'),
      ]) : null,
      brief && brief.notes.length ? el('details', { class: 'notes' }, [el('summary', { text: brief.notes.length + (brief.notes.length === 1 ? ' note' : ' notes') + ' from agents' })]
        .concat(brief.notes.map(function (n) { return el('p', {}, [el('span', { class: 'mute', text: n.by.replace(/^agent:/, '') + ' · ' + new Date(n.at).toLocaleString() + ': ' }), n.text]); }))) : null,
      r.status === 'fixed' || r.status === 'declined' ? null : actions,
    ]);
    return card;
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

  // ---- notifications ---------------------------------------------------------------------

  function notificationsView(view) {
    view.appendChild(el('div', { class: 'head' }, [el('h1', { text: 'Notifications' })]));
    view.appendChild(el('p', { class: 'mute', text: 'Know when a report needs a hearing, or when work moves forward. These settings apply to every app in this Heresay.' }));
    if (me.role !== 'owner') {
      view.appendChild(el('section', { class: 'card' }, [el('p', { text: 'An owner can connect Telegram or Zoho Cliq and choose which events your team receives.' }), el('a', { href: '#/team', text: 'See team owners' })]));
      return;
    }
    var content = el('div', {}, [loading()]);
    view.appendChild(content);
    api('GET', '/notifications').then(function (b) {
      var settings = b.notifications;
      var choices = [
        ['new_report', 'New reports', 'A new report is waiting for a person to review it.'],
        ['accepted', 'Accepted reports', 'A person approved a report for a coding agent.'],
        ['fixed', 'Reports marked fixed', 'A teammate or coding agent marked a report fixed.'],
        ['handoff', 'Agent handoffs', 'An agent handed accepted work to another repo.'],
      ];
      var eventInputs = {};
      var eventsMsg = el('p', { role: 'status' });
      var eventSave = el('button', { class: 'btn primary', type: 'submit', text: 'Save events' });
      var eventsForm = el('form', { class: 'form notification-form' }, choices.map(function (choice) {
        var input = eventInputs[choice[0]] = el('input', { type: 'checkbox', name: choice[0], checked: settings.events[choice[0]] });
        return el('label', { class: 'notification-choice' }, [input, el('span', {}, [el('b', { text: choice[1] }), el('span', { class: 'hint', text: choice[2] })])]);
      }).concat([el('div', { class: 'row' }, [eventSave]), eventsMsg]));
      eventsForm.onsubmit = function (e) {
        e.preventDefault();
        var events = {};
        Object.keys(eventInputs).forEach(function (key) { events[key] = eventInputs[key].checked; eventInputs[key].disabled = true; });
        eventSave.disabled = true;
        eventsMsg.className = 'hint'; eventsMsg.textContent = 'Saving…';
        api('PATCH', '/notifications', { events: events }).then(function () {
          eventsMsg.className = 'ok-msg'; eventsMsg.textContent = 'Notification events saved.';
        }).catch(function (x) { eventsMsg.className = 'err'; eventsMsg.textContent = x.message; }).finally(function () {
          eventSave.disabled = false;
          Object.keys(eventInputs).forEach(function (key) { eventInputs[key].disabled = false; });
        });
      };
      content.appendChild(el('section', { class: 'card' }, [el('h2', { text: 'When to notify' }), eventsForm]));
      content.appendChild(el('p', { class: 'hint', text: 'Alerts include the app name, event, report ID, and a link to the dashboard. Reporter text and contact details stay in Heresay.' }));
      destination('telegram', 'Telegram', settings.telegram);
      destination('cliq', 'Zoho Cliq', settings.cliq);

      function destination(provider, title, saved) {
        var telegram = provider === 'telegram', dirty = false;
        var enabled = el('input', { type: 'checkbox', name: provider + '_enabled', checked: saved.enabled });
        var token = el('input', { type: 'password', name: provider + '_token', maxlength: 512, autocomplete: 'new-password', spellcheck: 'false' });
        var address = el('input', { type: 'text', name: telegram ? 'chat_id' : 'endpoint', value: telegram ? saved.chat_id : saved.endpoint, maxlength: telegram ? 100 : 300, autocomplete: 'off', spellcheck: 'false', placeholder: telegram ? '-1001234567890 or @yourchannel' : 'https://cliq.zoho.com/api/v2/channelsbyname/team/message' });
        var tokenHint = el('p', { class: 'hint' });
        var message = el('p', { role: 'status' });
        var save = el('button', { class: 'btn primary', type: 'submit', text: 'Save ' + title });
        var test = el('button', { class: 'btn', type: 'button', text: 'Send test notification' });
        var remove = el('button', { class: 'btn ghost', type: 'button', text: 'Disconnect' });
        var tg = telegram ? telegramGuide() : null;
        var form = el('form', { class: 'form notification-form' }, telegram ? [
          el('label', { class: 'notification-choice' }, [enabled, el('b', { text: 'Enable ' + title + ' notifications' })]),
          setupStep(1, 'Make a bot', [
            el('ol', { class: 'guide' }, [
              el('li', {}, [el('a', { class: 'btn', href: 'https://t.me/BotFather', target: '_blank', rel: 'noopener noreferrer', text: 'Open BotFather in Telegram ↗' })]),
              el('li', {}, ['Send ', el('code', { text: '/newbot' }), '. It asks for a name (anything, like “Acme alerts”), then a username that ends in “bot” (like acme_alerts_bot).']),
              el('li', {}, ['It replies with a long token that looks like ', el('code', { text: '123456789:AAH…' }), '. Copy it and paste it here.']),
            ]),
            el('label', {}, ['Bot token', token]), tokenHint, tg.botLine,
          ]),
          setupStep(2, 'Choose where alerts go', [tg.step2]),
          setupStep(3, 'Save and test', [
            el('p', { class: 'hint', text: 'Save, then send a test. It arrives from your bot in a few seconds.' }),
            el('div', { class: 'row tight' }, [save, test, remove]), message,
          ]),
        ] : [
          el('label', { class: 'notification-choice' }, [enabled, el('b', { text: 'Enable ' + title + ' notifications' })]),
          el('label', {}, ['Webhook token', token]), tokenHint,
          el('label', {}, ['Message endpoint', address]),
          el('p', { class: 'hint' }, ['In Cliq, open Bots & Tools → Webhook Tokens and generate a token. Use the bot or channel message endpoint from Get Webhook URL, without the ?zapikey part. Use your region’s Cliq domain. ', el('a', { href: 'https://www.zoho.com/cliq/help/platform/webhook-tokens.html', target: '_blank', rel: 'noopener noreferrer', text: 'Cliq setup guide' })]),
          el('div', { class: 'row' }, [save, test, remove]), message,
        ]);
        /**
         * Telegram has no screen that shows a chat ID, so we never ask for one up front. Once the
         * token checks out, the person picks who gets alerts, follows two or three taps, and this
         * page watches the bot until their chat turns up, then chooses it.
         */
        function telegramGuide() {
          var g = { botLine: el('div', { class: 'bot-line', 'aria-live': 'polite' }), step2: el('div', { class: 'tg-step2' }) };
          var bot = null, kind = 'private', chats = [], timer = null, until = 0, checking = null;
          var KIND = { private: 'Private chat', group: 'Group', supergroup: 'Group', channel: 'Channel' };
          var wait = el('div', { class: 'wait', role: 'status' });
          var list = el('div', { class: 'chat-list', role: 'radiogroup', 'aria-label': 'Send alerts to' });
          var chosen = el('p', { class: 'ok-msg chosen-line' });
          var manual = el('details', { class: 'where', open: !!saved.chat_id }, [
            el('summary', { text: 'Enter a chat ID yourself' }),
            el('label', {}, ['Chat ID or channel username', address]),
            el('p', { class: 'hint', text: 'Only if you already know it, like -1001234567890 or @yourchannel. Picking a chat above fills this in.' }),
          ]);
          var tabs = el('div', { class: 'seg', role: 'tablist', 'aria-label': 'Who gets alerts' });
          var how = el('ol', { class: 'guide' });
          var again = el('button', { class: 'btn', type: 'button', text: 'Look again', onclick: function () { watch(); } });

          function link(href, text) { return el('a', { class: 'btn', href: href, target: '_blank', rel: 'noopener noreferrer', text: text }); }
          function drawHow() {
            var at = '@' + bot.username, url = 'https://t.me/' + encodeURIComponent(bot.username);
            how.textContent = '';
            (kind === 'private' ? [
              [link(url, 'Open ' + at + ' in Telegram ↗')],
              ['Tap ', el('b', { text: 'Start' }), ' at the bottom of the chat. No Start button? Send it any message, like “hi”.'],
              ['Come back to this page. It finds the chat by itself.'],
            ] : kind === 'group' ? [
              [link(url + '?startgroup=heresay', 'Add ' + at + ' to a group ↗')],
              ['Telegram asks which group. Pick it and confirm.'],
              ['Come back to this page. It finds the group by itself. If it doesn’t, send ', el('code', { text: '/start' + at }), ' in the group.'],
            ] : [
              ['In Telegram, open your channel and tap its name, then ', el('b', { text: 'Administrators' }), ' → ', el('b', { text: 'Add Admin' }), '.'],
              ['Search for ', el('b', { text: at }), ', add it, and leave ', el('b', { text: 'Post Messages' }), ' on.'],
              ['Post anything in the channel, then come back to this page. It finds the channel by itself.'],
            ]).forEach(function (kids) { how.appendChild(el('li', {}, kids)); });
          }
          function drawTabs() {
            tabs.textContent = '';
            [['private', 'Just me'], ['group', 'A group'], ['channel', 'A channel']].forEach(function (t) {
              tabs.appendChild(el('button', { type: 'button', role: 'tab', 'aria-selected': String(kind === t[0]), text: t[1], onclick: function () {
                kind = t[0]; drawTabs(); drawHow(); drawChats(); watch();
              } }));
            });
          }
          function sameKind(c) { return kind === 'group' ? c.kind === 'group' || c.kind === 'supergroup' : c.kind === kind; }
          function pick(c) {
            address.value = c.id;
            enabled.checked = true;
            form.dispatchEvent(new Event('input'));
            stop();
            drawChats();
            feedback('Chat chosen. Save to start sending alerts there.');
          }
          function drawChats() {
            list.textContent = '';
            var hit = chats.filter(function (c) { return c.id === address.value; })[0];
            chosen.hidden = !address.value;
            chosen.textContent = hit ? '✓ Alerts will go to ' + hit.title + ' (' + KIND[hit.kind].toLowerCase() + ').'
              : address.value ? '✓ Alerts go to chat ' + address.value + '. Pick another below to change it.' : '';
            chats.forEach(function (c) {
              var radio = el('input', { type: 'radio', name: 'telegram_chat', value: c.id, checked: address.value === c.id });
              radio.onchange = function () { pick(c); };
              list.appendChild(el('label', { class: 'chat-choice' }, [radio, el('span', {}, [el('b', { text: c.title }), el('span', { class: 'mute', text: KIND[c.kind] })])]));
            });
            list.hidden = !chats.length;
          }
          function drawWait(state) {
            wait.textContent = '';
            wait.className = 'wait' + (state === 'idle' ? ' ok idle' : '');
            if (state === 'waiting') wait.appendChild(document.createTextNode('Waiting for ' + (kind === 'private' ? 'your message to' : kind === 'group' ? 'a group with' : 'a channel with') + ' @' + bot.username + '…'));
            else if (state === 'idle') { wait.appendChild(document.createTextNode('Nothing yet. Follow the steps above, then')); wait.appendChild(again); }
            wait.hidden = state === 'none';
          }
          function stop() { clearTimeout(timer); timer = null; if (bot) drawWait(address.value ? 'none' : 'idle'); }
          function watch() {
            clearTimeout(timer);
            until = Date.now() + 5 * 60 * 1000;
            drawWait('waiting');
            poll();
          }
          function poll() {
            if (!form.isConnected) return;
            lookup(true).then(function () {
              var match = chats.filter(sameKind)[0];
              if (match && !address.value) return pick(match);  // never replace a chat they already chose
              if (match) return stop();
              if (Date.now() > until) return stop();
              timer = setTimeout(poll, 6000);
            }).catch(stop);
          }
          function lookup(quiet) {
            return api('POST', '/notifications/telegram/lookup', { token: token.value.trim() }).then(function (b) {
              var fresh = !bot || bot.username !== b.bot.username;
              bot = b.bot; chats = b.chats;
              g.botLine.textContent = '';
              g.botLine.appendChild(el('p', { class: 'ok-msg' }, [el('b', { text: '✓ Token works. ' }), document.createTextNode('Your bot is ' + (bot.name || 'ready') + ' (@' + bot.username + ').')]));
              if (fresh) { g.step2.textContent = ''; drawTabs(); drawHow(); [el('p', { class: 'hint', text: 'Who should get the alerts?' }), tabs, how, wait, list, chosen, manual].forEach(function (n) { g.step2.appendChild(n); }); }
              drawChats();
            }).catch(function (x) {
              if (quiet && bot) return;
              g.botLine.textContent = '';
              g.botLine.appendChild(el('p', { class: 'err', role: 'alert', text: x.message }));
              throw x;
            });
          }
          function check() {
            clearTimeout(checking);
            checking = setTimeout(function () {
              lookup().then(function () { if (!address.value) watch(); else stop(); }).catch(function () {});
            }, 400);
          }
          g.step2.appendChild(el('p', { class: 'hint', text: 'Paste your bot token above first. Then this step shows exactly what to tap.' }));
          g.step2.appendChild(manual);
          token.addEventListener('input', function () { if (/^\d+:[A-Za-z0-9_-]{20,}$/.test(token.value.trim())) check(); });
          if (saved.configured) check();
          return g;
        }
        function refresh() {
          token.placeholder = saved.configured ? 'Leave blank to keep the saved token' : 'Paste your token';
          tokenHint.textContent = saved.configured ? 'A token is saved. Paste a new one to replace it.' : 'Your token is saved on the server and is never displayed here.';
          test.disabled = dirty || !saved.enabled;
          remove.disabled = !saved.configured;
        }
        function busy(on) {
          form.querySelectorAll('input, button').forEach(function (control) { control.disabled = on; });
          if (!on) refresh();
        }
        function feedback(text, bad) { message.className = bad ? 'err' : 'ok-msg'; message.textContent = text; }
        form.oninput = function () { dirty = true; test.disabled = true; feedback('Save your changes before sending a test.'); };
        form.onsubmit = function (e) {
          e.preventDefault();
          var patch = { enabled: enabled.checked, token: token.value.trim() };
          patch[telegram ? 'chat_id' : 'endpoint'] = address.value.trim();
          var body = {}; body[provider] = patch;
          busy(true); feedback('Saving…');
          api('PATCH', '/notifications', body).then(function (result) {
            saved = result.notifications[provider]; dirty = false; token.value = '';
            feedback(title + ' settings saved. Send a test to check delivery.');
          }).catch(function (x) { feedback(x.message, true); }).finally(function () { busy(false); });
        };
        test.onclick = function () {
          busy(true); feedback('Sending a test…');
          api('POST', '/notifications/test', { provider: provider }).then(function () {
            feedback('Test notification sent. Check ' + title + '.');
          }).catch(function (x) { feedback(x.message, true); }).finally(function () { busy(false); });
        };
        remove.onclick = function () {
          var body = {}, patch = { enabled: false, token: null };
          patch[telegram ? 'chat_id' : 'endpoint'] = '';
          body[provider] = patch;
          busy(true); feedback('Disconnecting…');
          api('PATCH', '/notifications', body).then(function (result) {
            saved = result.notifications[provider]; dirty = false; enabled.checked = false; token.value = ''; address.value = '';
            feedback(title + ' disconnected. The saved token was removed.');
          }).catch(function (x) { feedback(x.message, true); }).finally(function () { busy(false); });
        };
        refresh();
        content.appendChild(el('section', { class: 'card' }, [el('h2', { text: title }), form]));
      }
    }).catch(function (x) {
      content.appendChild(el('p', { class: 'err', role: 'alert', text: x.message }));
      content.appendChild(el('button', { class: 'btn', text: 'Retry', onclick: function () { route(); } }));
    });
  }

  // ---- team ------------------------------------------------------------------------------

  /** One numbered step of a setup, in the same style as the install steps. */
  function setupStep(n, title, kids) {
    return el('div', { class: 'setup-step' }, [
      el('div', { class: 'test-head' }, [el('span', { class: 'stepnum', text: String(n) }), el('b', { text: title })]),
      el('div', { class: 'setup-body' }, kids),
    ]);
  }

  function teamView(view) {
    var owner = me.role === 'owner';
    var list = el('ul', { class: 'members' }, [loading('li')]);
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
