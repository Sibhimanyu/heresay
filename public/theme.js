/* Theme: follows the device by default; the sidebar button cycles Auto, Light, Dark. */
(function () {
  var root = document.documentElement, KEY = 'heresay-theme', order = ['auto', 'light', 'dark'];
  function get() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function apply(t) { if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t); }
  apply(get());
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('theme-toggle');
    if (!b) return;
    function label() { var t = get(); b.querySelector('.theme-name').textContent = t === 'auto' ? 'Auto' : t === 'dark' ? 'Dark' : 'Light'; b.title = 'Theme: ' + t + ' (click to change)'; }
    b.addEventListener('click', function () {
      var t = order[(order.indexOf(get()) + 1) % order.length];
      try { localStorage.setItem(KEY, t); } catch (e) {}
      apply(t); label();
    });
    label();
  });
})();
