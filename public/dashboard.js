/* The developer's side: see reports, accept or decline them, hand accepted ones to an agent. */
(function () {
  'use strict';
  var auth = firebase.auth();
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    auth.useEmulator('http://127.0.0.1:9199');
  }

  var $ = function (id) { return document.getElementById(id); };
  var TYPE_LABEL = { broken: 'Broken', confusing: 'Confusing', improvement: 'Could be better', idea: 'Idea' };
  var STATUS_LABEL = { open: 'Open', accepted: 'Accepted', fixed: 'Fixed', declined: 'Declined' };
  var projects = [], current = null, reports = [], filter = 'open';

  function api(method, path, body) {
    return auth.currentUser.getIdToken().then(function (tok) {
      return fetch('/v1' + path, {
        method: method,
        headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (b) {
        if (!res.ok) { var e = new Error(b.error || ('HTTP ' + res.status)); e.status = res.status; throw e; }
        return b;
      });
    });
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  // ---- auth ------------------------------------------------------------------------------

  $('signin').onclick = function () { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); };
  $('signout').onclick = function () { auth.signOut(); };
  auth.onAuthStateChanged(function (user) {
    $('gate').hidden = !!user;
    $('app').hidden = !user;
    if (user) loadProjects();
  });

  // ---- projects --------------------------------------------------------------------------

  function loadProjects(selectId) {
    return api('GET', '/projects').then(function (b) {
      projects = b.projects;
      var sel = $('project');
      sel.textContent = '';
      projects.forEach(function (p) { sel.appendChild(el('option', { value: p.id, text: p.name })); });
      sel.hidden = !projects.length;
      $('setup-btn').hidden = !projects.length;
      if (!projects.length) { $('create').hidden = false; $('filters').hidden = true; return; }
      var want = selectId || localStorage.getItem('dash.project');
      current = projects.filter(function (p) { return p.id === want; })[0] || projects[0];
      sel.value = current.id;
      $('filters').hidden = false;
      renderSnippet();
      loadReports();
    });
  }

  $('project').onchange = function (e) {
    current = projects.filter(function (p) { return p.id === e.target.value; })[0];
    localStorage.setItem('dash.project', current.id);
    $('setup').hidden = true;
    renderSnippet();
    loadReports();
  };
  $('new-btn').onclick = function () { $('create').hidden = !$('create').hidden; };
  $('setup-btn').onclick = function () { $('setup').hidden = !$('setup').hidden; };

  $('create-form').onsubmit = function (e) {
    e.preventDefault();
    var f = e.target;
    $('create-err').textContent = '';
    var origin = f.origin.value.trim();
    api('POST', '/projects', { name: f.name.value, allowed_origins: origin ? [origin] : [] })
      .then(function (b) {
        f.reset();
        $('create').hidden = true;
        localStorage.setItem('dash.project', b.project.id);
        return loadProjects(b.project.id).then(function () { $('setup').hidden = false; });
      })
      .catch(function (x) { $('create-err').textContent = x.message; });
  };

  function snippet() {
    return '<script src="' + location.origin + '/sdk.js" data-key="' + current.key + '" defer></scr' + 'ipt>';
  }
  function renderSnippet() { $('snippet').textContent = snippet(); }
  $('copy-snippet').onclick = function () {
    navigator.clipboard.writeText(snippet()).then(function () { $('copy-snippet').textContent = 'Copied'; });
  };

  // ---- reports ---------------------------------------------------------------------------

  function loadReports() {
    if (!current) return;
    return api('GET', '/projects/' + current.id + '/reports').then(function (b) {
      reports = b.reports;
      render();
    });
  }
  setInterval(function () { if (auth.currentUser && !document.hidden && !document.querySelector('.actions textarea')) loadReports(); }, 30000);

  function renderFilters() {
    var box = $('filters');
    box.textContent = '';
    ['open', 'accepted', 'fixed', 'declined', 'all'].forEach(function (f) {
      var n = f === 'all' ? reports.length : reports.filter(function (r) { return r.status === f; }).length;
      box.appendChild(el('button', {
        'aria-pressed': String(filter === f),
        onclick: function () { filter = f; render(); },
      }, [(f === 'all' ? 'All' : STATUS_LABEL[f]) + ' ' + n]));
    });
  }

  function render() {
    renderFilters();
    var box = $('reports');
    box.textContent = '';
    var shown = reports.filter(function (r) { return filter === 'all' || r.status === filter; });
    $('empty').hidden = shown.length > 0;
    $('empty').textContent = reports.length ? 'Nothing here.' : 'No reports yet. Add the line from Setup to your app.';
    shown.forEach(function (r) { box.appendChild(row(r)); });
  }

  function ctxLine(c) {
    return [c.route, c.app_version && ('v' + c.app_version), c.platform, c.os, c.browser, c.user_label || c.user_id]
      .filter(Boolean).join(' · ');
  }

  function row(r) {
    var err = el('span', { class: 'err' });
    var actions = el('div', { class: 'actions' });
    var act = function (action, body) {
      err.textContent = '';
      return api('POST', '/projects/' + current.id + '/reports/' + r.id + '/' + action, body)
        .then(loadReports)
        .catch(function (x) { err.textContent = x.message; if (x.status === 409) loadReports(); });
    };

    if (r.status === 'open') {
      actions.appendChild(el('button', { class: 'btn primary', text: 'Accept', onclick: function () { act('accept'); } }));
      actions.appendChild(el('button', {
        class: 'btn', text: 'Decline…',
        onclick: function () {
          actions.textContent = '';
          var reason = el('textarea', { placeholder: 'Why? The person who sent this will read it.', 'aria-label': 'Reason for declining' });
          var confirm = el('button', { class: 'btn', text: 'Decline', onclick: function () {
            if (!reason.value.trim()) { err.textContent = 'Give a reason. They will see it.'; reason.focus(); return; }
            act('decline', { reason: reason.value });
          } });
          actions.appendChild(reason);
          actions.appendChild(confirm);
          actions.appendChild(el('button', { class: 'btn ghost', text: 'Cancel', onclick: render }));
          actions.appendChild(err);
          reason.focus();
        },
      }));
    }
    if (r.status === 'accepted') {
      actions.appendChild(el('button', {
        class: 'btn primary', text: 'Copy prompt for agent',
        onclick: function (e) {
          var b = e.target;
          api('GET', '/projects/' + current.id + '/reports/' + r.id + '/prompt')
            .then(function (x) { return navigator.clipboard.writeText(x.prompt); })
            .then(function () { b.textContent = 'Copied'; })
            .catch(function (x) { err.textContent = x.message; });
        },
      }));
      actions.appendChild(el('button', { class: 'btn', text: 'Mark fixed', onclick: function () { act('fixed'); } }));
    }
    actions.appendChild(err);

    return el('article', { class: 'report' }, [
      el('div', { class: 'meta' }, [
        el('span', { class: 'pill ' + r.type, text: TYPE_LABEL[r.type] }),
        el('time', { datetime: r.created_at, text: new Date(r.created_at).toLocaleString() }),
        el('span', { class: 'status', text: STATUS_LABEL[r.status] }),
      ]),
      el('p', { class: 'text', text: r.text }),
      el('div', { class: 'ctx', text: ctxLine(r.context) }),
      r.decline_reason ? el('div', { class: 'reason', text: 'Declined: ' + r.decline_reason }) : null,
      r.status === 'fixed' || r.status === 'declined' ? null : actions,
    ]);
  }
})();
