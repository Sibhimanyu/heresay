/*
 * The feedback SDK for the web. One line in the host page:
 *
 *   <script src="https://<sdk-host>/sdk.js" data-key="pk_..." defer></script>
 *
 * The defaults are the recommended setup; every attribute below is optional. The full list, with
 * what each is for, is public/guides/customize-web.md.
 *
 *   Who and what:  data-version, data-user-id, data-user-label, data-user-email
 *   Button:        data-position   right (default) | left | top-right | top-left | center
 *                  data-offset     "20" or "x,y" in px from the edges
 *                  data-button     always (default) | none (open it from the app's own menu)
 *                                  | desktop (not on phones) | scroll (after the first scroll)
 *                  data-label      the button text, default "Report"
 *                  data-style      pill (default) | icon | tab
 *                  data-size       regular (default) | small | large
 *                  data-fill       neutral (default) | accent
 *                  data-shadow     soft (default) | none | strong
 *                  data-hide-on    "/checkout,/login": paths where the button stays hidden
 *   Look:          data-accent     "#0f766e"; a hex colour. The logo follows it too, unless
 *                  data-mark="heresay" keeps the Heresay teal.
 *                  data-theme      auto (default, follows the device) | light | dark
 *                  data-font       system (default) | inherit (the page's font)
 *   Words:         data-lang       the page's <html lang> (default) | auto (the browser) | en | fr | ta | hi
 *                  data-placeholder, data-thanks, data-types ("broken,confusing,improvement,idea")
 *   Panel:         data-panel      corner (default) | sheet | center
 *                  data-width      regular (default) | narrow | wide
 *                  data-backdrop   dim (default) | clear | blur
 *                  data-preferences show (default) | hide
 *                  data-intro      "auto": introduce the button a few seconds after the first load
 * Optional calls, any time after the script runs:
 *   Feedback.identify({ id, label, email })   who is signed in; then nobody is asked their name
 *   Feedback.setVersion("1.4.0")
 *   Feedback.setScreen("Checkout")    for apps whose URL does not change per screen
 *   Feedback.open({ type, text })     type and text optional: starts a report already filled in
 *   Feedback.on("sent", fn)           fn({ id, type }) after each report is sent; returns an off()
 *   Feedback.introduce({ title, body })   once per device: a bubble saying the button is there
 *   data-preview                      for the dashboard's designer: nothing is sent or stored
 *   Feedback.openPreferences()        a note about their setup, and a name and email if not signed in
 *
 * Not configurable, on purpose: the Heresay mark on the button, the report types' names (they set
 * the priority), the "Your reports" tab (reporters read why a report was declined), and the
 * "Powered by Heresay" line, so people can tell the app uses an outside tool.
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

  function attr(n) { var v = script.getAttribute('data-' + n); return v == null ? '' : String(v).trim(); }
  /** One of the allowed values, lower-cased, or the default. Anything else is ignored. */
  function pick(n, allowed, dflt) { var v = attr(n).toLowerCase(); return allowed.indexOf(v) >= 0 ? v : dflt; }
  /** Plain text from an attribute or a call, trimmed and cut to a length. Only ever set as text. */
  function words(v, max) { v = v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); return v ? v.slice(0, max) : null; }

  var HERESAY_URL = 'https://sibhimanyu.github.io/heresay/';
  // data-preview: the dashboard's designer shows the real widget with nothing sent or stored.
  var PREVIEW = script.hasAttribute('data-preview');

  // ---- words -----------------------------------------------------------------------------

  var STR = {
    en: {
      report: 'Report', reportAria: 'Report a problem',
      update: 'Report a problem. {n} of your reports have an update',
      close: 'Close', dialog: 'Feedback',
      tabNew: 'Report', tabMine: 'Your reports', tabPrefs: 'Preferences',
      what: 'What is it?', whatHappened: 'What happened?', ph: 'What happened, or what would you change?',
      send: 'Send', sending: 'Sending…',
      pickType: 'Pick what kind of report this is.', sayWhat: 'Say what happened.', cantSend: 'Could not send. Try again.',
      attachedPrefs: 'This page, the app version and your preferences are attached.',
      attached: 'This page and the app version are attached.',
      types: {
        broken: ['Broken', 'Something does not work'],
        confusing: ['Confusing', 'I could not tell how to do something'],
        improvement: ['Could be better', 'It works, but it could be better'],
        idea: ['Idea', 'Something that does not exist yet'],
      },
      status: { open: 'Waiting for the developer', accepted: 'Accepted, being worked on', fixed: 'Fixed', declined: 'Declined' },
      optional: '(optional)', yourName: 'Your name', email: 'Email',
      emailHint: 'Only if you are happy for the team to reply to you.',
      setup: 'About your setup', setupHint: 'Sent with every report, so you only say it once.',
      setupPh: 'For example: I use a screen reader, or I am usually on slow Wi-Fi.',
      signedAs: 'Signed in as {who}', yourAccount: 'your account',
      seesReply: '{email}. The team sees this with each report and can reply.',
      sees: 'The team sees this with each report.',
      badEmail: 'That email does not look right.', saved: 'Saved on this device.',
      clear: 'Clear all', save: 'Save',
      kept: 'Kept in this browser and sent only with reports you choose to send.',
      none: 'Nothing sent from this device yet.', why: 'Why: ',
      introAria: 'About the Report button', introTitle: 'Help make this app better',
      introBody: 'Use {label} any time to share an idea or tell the team what you would change. A real person reads every report, and you will see what happens to yours right here.',
      got: 'Got it', tryIt: 'Try it',
      sentTo: 'Sent to this app’s team', powered: 'Powered by Heresay',
    },
    fr: {
      report: 'Signaler', reportAria: 'Signaler un problème',
      update: 'Signaler un problème. {n} de vos signalements ont du nouveau',
      close: 'Fermer', dialog: 'Signalement',
      tabNew: 'Signaler', tabMine: 'Vos signalements', tabPrefs: 'Préférences',
      what: 'De quoi s’agit-il ?', whatHappened: 'Que s’est-il passé ?', ph: 'Que s’est-il passé, ou que changeriez-vous ?',
      send: 'Envoyer', sending: 'Envoi…',
      pickType: 'Choisissez le type de signalement.', sayWhat: 'Dites ce qui s’est passé.', cantSend: 'Envoi impossible. Réessayez.',
      attachedPrefs: 'Cette page, la version de l’app et vos préférences sont jointes.',
      attached: 'Cette page et la version de l’app sont jointes.',
      types: {
        broken: ['Cassé', 'Quelque chose ne marche pas'],
        confusing: ['Déroutant', 'Je ne voyais pas comment faire'],
        improvement: ['Pourrait être mieux', 'Ça marche, mais ça pourrait être mieux'],
        idea: ['Idée', 'Quelque chose qui n’existe pas encore'],
      },
      status: { open: 'En attente de l’équipe', accepted: 'Accepté, en cours', fixed: 'Corrigé', declined: 'Refusé' },
      optional: '(facultatif)', yourName: 'Votre nom', email: 'E-mail',
      emailHint: 'Seulement si vous acceptez que l’équipe vous réponde.',
      setup: 'Votre configuration', setupHint: 'Envoyé avec chaque signalement, pour ne le dire qu’une fois.',
      setupPh: 'Par exemple : j’utilise un lecteur d’écran, ou mon Wi-Fi est souvent lent.',
      signedAs: 'Connecté en tant que {who}', yourAccount: 'votre compte',
      seesReply: '{email}. L’équipe le voit avec chaque signalement et peut vous répondre.',
      sees: 'L’équipe le voit avec chaque signalement.',
      badEmail: 'Cette adresse e-mail ne semble pas correcte.', saved: 'Enregistré sur cet appareil.',
      clear: 'Tout effacer', save: 'Enregistrer',
      kept: 'Conservé dans ce navigateur, et envoyé seulement avec les signalements que vous envoyez.',
      none: 'Aucun signalement envoyé depuis cet appareil.', why: 'Pourquoi : ',
      introAria: 'À propos du bouton Signaler', introTitle: 'Aidez à améliorer cette app',
      introBody: 'Utilisez {label} à tout moment pour partager une idée ou dire à l’équipe ce que vous changeriez. Une vraie personne lit chaque signalement, et vous verrez ici ce qu’il devient.',
      got: 'Compris', tryIt: 'Essayer',
      sentTo: 'Envoyé à l’équipe de cette app', powered: 'Propulsé par Heresay',
    },
    ta: {
      report: 'தெரிவி', reportAria: 'சிக்கலைத் தெரிவிக்கவும்',
      update: 'சிக்கலைத் தெரிவிக்கவும். உங்கள் {n} புகார்களில் புதிய தகவல் உள்ளது',
      close: 'மூடு', dialog: 'கருத்து',
      tabNew: 'தெரிவி', tabMine: 'உங்கள் புகார்கள்', tabPrefs: 'விருப்பங்கள்',
      what: 'இது என்ன வகை?', whatHappened: 'என்ன நடந்தது?', ph: 'என்ன நடந்தது, அல்லது எதை மாற்ற விரும்புகிறீர்கள்?',
      send: 'அனுப்பு', sending: 'அனுப்புகிறது…',
      pickType: 'இது எந்த வகைப் புகார் என்பதைத் தேர்ந்தெடுக்கவும்.', sayWhat: 'என்ன நடந்தது என்று சொல்லுங்கள்.', cantSend: 'அனுப்ப முடியவில்லை. மீண்டும் முயலவும்.',
      attachedPrefs: 'இந்தப் பக்கம், ஆப் பதிப்பு மற்றும் உங்கள் விருப்பங்கள் இணைக்கப்படும்.',
      attached: 'இந்தப் பக்கமும் ஆப் பதிப்பும் இணைக்கப்படும்.',
      types: {
        broken: ['வேலை செய்யவில்லை', 'ஏதோ ஒன்று சரியாக இயங்கவில்லை'],
        confusing: ['குழப்பமாக உள்ளது', 'எப்படிச் செய்வது என்று புரியவில்லை'],
        improvement: ['இன்னும் சிறப்பாக்கலாம்', 'வேலை செய்கிறது, ஆனால் மேம்படுத்தலாம்'],
        idea: ['யோசனை', 'இன்னும் இல்லாத ஒன்று'],
      },
      status: { open: 'டெவலப்பருக்காகக் காத்திருக்கிறது', accepted: 'ஏற்கப்பட்டது, வேலை நடக்கிறது', fixed: 'சரிசெய்யப்பட்டது', declined: 'நிராகரிக்கப்பட்டது' },
      optional: '(விருப்பத்தேர்வு)', yourName: 'உங்கள் பெயர்', email: 'மின்னஞ்சல்',
      emailHint: 'குழு உங்களுக்குப் பதில் அனுப்பலாம் என்றால் மட்டும்.',
      setup: 'உங்கள் அமைப்பு பற்றி', setupHint: 'ஒவ்வொரு புகாருடனும் அனுப்பப்படும், எனவே ஒருமுறை சொன்னால் போதும்.',
      setupPh: 'உதாரணமாக: நான் ஸ்கிரீன் ரீடர் பயன்படுத்துகிறேன், அல்லது என் Wi-Fi பெரும்பாலும் மெதுவாக இருக்கும்.',
      signedAs: '{who} ஆக உள்நுழைந்துள்ளீர்கள்', yourAccount: 'உங்கள் கணக்கு',
      seesReply: '{email}. ஒவ்வொரு புகாருடனும் குழு இதைப் பார்க்கும், பதிலும் அனுப்பலாம்.',
      sees: 'ஒவ்வொரு புகாருடனும் குழு இதைப் பார்க்கும்.',
      badEmail: 'இந்த மின்னஞ்சல் சரியாகத் தெரியவில்லை.', saved: 'இந்தச் சாதனத்தில் சேமிக்கப்பட்டது.',
      clear: 'அனைத்தையும் அழி', save: 'சேமி',
      kept: 'இந்த உலாவியில் வைக்கப்படும்; நீங்கள் அனுப்பும் புகார்களுடன் மட்டுமே அனுப்பப்படும்.',
      none: 'இந்தச் சாதனத்திலிருந்து இன்னும் எதுவும் அனுப்பப்படவில்லை.', why: 'காரணம்: ',
      introAria: 'தெரிவி பொத்தான் பற்றி', introTitle: 'இந்த ஆப்பை இன்னும் சிறப்பாக்க உதவுங்கள்',
      introBody: 'ஒரு யோசனையைப் பகிர அல்லது நீங்கள் எதை மாற்ற விரும்புகிறீர்கள் என்று குழுவிடம் சொல்ல, எப்போது வேண்டுமானாலும் {label} ஐப் பயன்படுத்துங்கள். ஒவ்வொரு கருத்தையும் ஒருவர் படிக்கிறார்; உங்களுடையதற்கு என்ன ஆனது என்பதை இங்கேயே பார்க்கலாம்.',
      got: 'சரி', tryIt: 'முயன்று பாருங்கள்',
      sentTo: 'இந்த ஆப்பின் குழுவுக்கு அனுப்பப்படும்', powered: 'Heresay மூலம் இயங்குகிறது',
    },
    hi: {
      report: 'रिपोर्ट करें', reportAria: 'समस्या की रिपोर्ट करें',
      update: 'समस्या की रिपोर्ट करें। आपकी {n} रिपोर्ट में नई जानकारी है',
      close: 'बंद करें', dialog: 'फ़ीडबैक',
      tabNew: 'रिपोर्ट', tabMine: 'आपकी रिपोर्ट', tabPrefs: 'प्राथमिकताएँ',
      what: 'यह क्या है?', whatHappened: 'क्या हुआ?', ph: 'क्या हुआ, या आप क्या बदलना चाहेंगे?',
      send: 'भेजें', sending: 'भेजा जा रहा है…',
      pickType: 'चुनें कि यह किस तरह की रिपोर्ट है।', sayWhat: 'बताइए क्या हुआ।', cantSend: 'भेजा नहीं जा सका। फिर से कोशिश करें।',
      attachedPrefs: 'यह पेज, ऐप का वर्शन और आपकी प्राथमिकताएँ साथ भेजी जाती हैं।',
      attached: 'यह पेज और ऐप का वर्शन साथ भेजे जाते हैं।',
      types: {
        broken: ['टूटा हुआ', 'कुछ काम नहीं कर रहा'],
        confusing: ['उलझन भरा', 'समझ नहीं आया कि कैसे करें'],
        improvement: ['बेहतर हो सकता है', 'काम करता है, पर बेहतर हो सकता है'],
        idea: ['सुझाव', 'कुछ ऐसा जो अभी नहीं है'],
      },
      status: { open: 'डेवलपर का इंतज़ार', accepted: 'स्वीकार, इस पर काम चल रहा है', fixed: 'ठीक हो गया', declined: 'अस्वीकार' },
      optional: '(वैकल्पिक)', yourName: 'आपका नाम', email: 'ईमेल',
      emailHint: 'सिर्फ़ तब, जब आप चाहते हैं कि टीम आपको जवाब दे।',
      setup: 'आपके सेटअप के बारे में', setupHint: 'हर रिपोर्ट के साथ भेजा जाता है, ताकि आपको एक ही बार बताना पड़े।',
      setupPh: 'जैसे: स्क्रीन रीडर के साथ इस्तेमाल, या अक्सर धीमा Wi-Fi।',
      signedAs: '{who} के रूप में साइन इन', yourAccount: 'आपका खाता',
      seesReply: '{email}. टीम हर रिपोर्ट के साथ इसे देखती है और जवाब दे सकती है।',
      sees: 'टीम हर रिपोर्ट के साथ इसे देखती है।',
      badEmail: 'यह ईमेल सही नहीं लग रहा।', saved: 'इस डिवाइस पर सेव हो गया।',
      clear: 'सब हटाएँ', save: 'सेव करें',
      kept: 'इसी ब्राउज़र में रखा जाता है, और सिर्फ़ आपकी भेजी रिपोर्ट के साथ जाता है।',
      none: 'इस डिवाइस से अभी तक कुछ नहीं भेजा गया।', why: 'वजह: ',
      introAria: 'रिपोर्ट बटन के बारे में', introTitle: 'इस ऐप को और बेहतर बनाने में मदद करें',
      introBody: 'कोई आइडिया बताने या टीम को यह बताने के लिए कि आप क्या बदलना चाहेंगे, कभी भी {label} का इस्तेमाल करें। हर रिपोर्ट कोई इंसान पढ़ता है, और आपकी रिपोर्ट का क्या हुआ, यह आप यहीं देखेंगे।',
      got: 'ठीक है', tryIt: 'आज़माएँ',
      sentTo: 'इस ऐप की टीम को भेजा जाता है', powered: 'Heresay द्वारा संचालित',
    },
  };
  /** The page's own language by default, so the widget speaks like the app around it. */
  function language() {
    var want = attr('lang').toLowerCase();
    var tries = want === 'auto' ? (navigator.languages || [navigator.language || ''])
      : [want || document.documentElement.getAttribute('lang') || ''];
    for (var i = 0; i < tries.length; i++) {
      var code = String(tries[i] || '').toLowerCase().slice(0, 2);
      if (STR[code]) return code;
    }
    return 'en';
  }
  var LANG = language();
  var S = STR[LANG];
  function fmt(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k]; }); }

  // ---- the developer's choices -----------------------------------------------------------

  /** Where the button sits is the developer's choice (data-position), not the reporter's. */
  var POS = ({
    left: ['l', 'b'], 'bottom-left': ['l', 'b'], 'top-right': ['r', 't'], 'top-left': ['l', 't'],
    center: ['c', 'b'], 'bottom-center': ['c', 'b'],
  })[attr('position').toLowerCase()] || ['r', 'b'];
  var STYLE = pick('style', ['pill', 'icon', 'tab'], 'pill');
  if (STYLE === 'tab' && POS[0] === 'c') POS = ['r', 'b'];
  var LEFT = POS[0] === 'l';
  var OFFSET = (function () {
    var m = /^(\d{1,4})(?:\s*,\s*(\d{1,4}))?$/.exec(attr('offset'));
    var clamp = function (n) { return Math.min(400, +n); };
    return m ? [clamp(m[1]), clamp(m[2] != null ? m[2] : m[1])] : [20, 20];
  })();
  var BUTTON = pick('button', ['always', 'none', 'desktop', 'scroll'], 'always');
  var SIZE = pick('size', ['regular', 'small', 'large'], 'regular');
  var LABEL = words(attr('label'), 40) || S.report;
  var HIDE_ON = attr('hide-on').split(',').map(function (p) { return p.trim().replace(/\/+$/, ''); })
    .filter(function (p) { return p.charAt(0) === '/'; });
  var PANEL = pick('panel', ['corner', 'sheet', 'center'], 'corner');
  var WIDTH = ({ narrow: 320, wide: 460 })[attr('width').toLowerCase()] || 380;
  var BACKDROP = pick('backdrop', ['dim', 'clear', 'blur'], 'dim');
  var PREFS_TAB = pick('preferences', ['show', 'hide'], 'show') === 'show';
  var PLACEHOLDER = words(attr('placeholder'), 120) || S.ph;
  var THANKS = words(attr('thanks'), 160);

  var TYPES = ['broken', 'confusing', 'improvement', 'idea'].map(function (id) {
    return { id: id, label: S.types[id][0], hint: S.types[id][1] };
  });
  /** The types the reporter can pick. Names and priorities never change; a developer can only leave some out. */
  var OFFERED = (function () {
    var want = attr('types').toLowerCase().split(',').map(function (s) { return s.trim(); });
    var some = TYPES.filter(function (t) { return want.indexOf(t.id) >= 0; });
    return some.length ? some : TYPES;
  })();

  var state = {
    version: script.getAttribute('data-version') || null,
    userId: script.getAttribute('data-user-id') || null,
    userLabel: script.getAttribute('data-user-label') || null,
    userEmail: script.getAttribute('data-user-email') || null,
    screen: null,
    type: null,
    draft: '',
    justSent: false,
    reports: [],
  };
  var listeners = [];

  // ---- storage ---------------------------------------------------------------------------

  var mem = {};
  function load(k) { if (PREVIEW) return mem[k] || null; try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } }
  function save(k, v) { if (PREVIEW) { mem[k] = v; return; } try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }

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
    if (PREVIEW) return Promise.resolve({ report: { id: 'preview', type: type, text: text, status: 'open', created_at: new Date().toISOString() } });
    // text/plain keeps this a "simple" request: no CORS preflight round trip.
    return fetch(API + '/reports', {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ key: KEY, device_id: deviceId(), sdk: 'web', type: type, text: text, context: context(), reporter: reporter() }),
    }).then(body);
  }

  function refresh() {
    if (PREVIEW) return Promise.resolve();
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

  var DARK = '--fb-bg:#16181d;--fb-fg:#eceef1;--fb-mute:#9aa1ad;--fb-line:#2c313a;--fb-acc:#2dd4bf;--fb-acc-fg:#0b1f1d;--fb-bad:#f2b8b5;--fb-mark:#2dd4bf';
  var THEME = pick('theme', ['auto', 'light', 'dark'], 'auto');
  var FAB_H = { small: 40, regular: 48, large: 58 }[SIZE];

  var CSS = [
    ':host{all:initial;--fb-bg:#fff;--fb-fg:#15171c;--fb-mute:#5b6472;--fb-line:#e3e6ea;--fb-acc:#0f766e;--fb-acc-fg:#fff;--fb-bad:#b42318;--fb-mark:#0b5e57;--fb-eye:#fff;',
    '--fb-x:' + OFFSET[0] + 'px;--fb-y:' + OFFSET[1] + 'px;--fb-h:' + FAB_H + 'px;--fb-w:' + WIDTH + 'px;',
    'font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fb-fg)}',
    THEME === 'dark' ? ':host{' + DARK + '}' : THEME === 'light' ? '' : '@media (prefers-color-scheme:dark){:host{' + DARK + '}}',
    pick('font', ['system', 'inherit'], 'system') === 'inherit' ? ':host{font-family:inherit}' : '',
    '*{box-sizing:border-box;font:inherit;color:inherit}',
    '[hidden]{display:none!important}',

    // the button
    '.fab{position:fixed;z-index:2147483000;display:flex;align-items:center;gap:6px;',
    'padding:9px 14px;border-radius:999px;border:1px solid var(--fb-line);background:var(--fb-bg);color:var(--fb-fg);',
    'box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer;font-weight:600;white-space:nowrap}',
    '.fab.r{right:var(--fb-x)}.fab.l{left:var(--fb-x)}.fab.c{left:50%;transform:translateX(-50%)}',
    '.fab.b{bottom:var(--fb-y)}.fab.t{top:var(--fb-y)}',
    '.fab.sz-small{padding:6px 10px;font-size:12.5px}.fab.sz-small svg{width:14px;height:14px}',
    '.fab.sz-large{padding:12px 18px;font-size:16px}.fab.sz-large svg{width:22px;height:22px}',
    '.fab.st-icon{padding:10px;border-radius:50%}.fab.st-icon.sz-small{padding:7px}.fab.st-icon.sz-large{padding:13px}',
    '.fab.st-icon .lbl{display:none}',
    '.fab.st-tab{writing-mode:vertical-rl;top:50%;bottom:auto;transform:translateY(-50%);padding:14px 8px;right:0;border-radius:10px 0 0 10px;border-right:0}',
    '.fab.st-tab.l{left:0;right:auto;border-radius:0 10px 10px 0;border-left:0;border-right:1px solid var(--fb-line)}',
    '.fab.st-tab .mark{display:none}',
    '.fab.sh-none{box-shadow:none}.fab.sh-strong{box-shadow:0 10px 30px rgba(0,0,0,.35)}',
    '.fab.fill{background:var(--fb-acc);color:var(--fb-acc-fg);border-color:var(--fb-acc)}',
    '.fab.fill .mark{color:var(--fb-acc-fg)}.fab.fill .eye{fill:var(--fb-acc)}.fab.fill .dot{background:var(--fb-acc-fg)}',
    '@media (max-width:640px){.fab.desktop{display:none}}',

    // the introduction
    '.intro{position:fixed;z-index:2147483000;width:min(300px,calc(100vw - 40px));padding:14px 16px;',
    'background:var(--fb-bg);border:1px solid var(--fb-line);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.22);animation:fb-in .25s ease-out}',
    '.intro.r{right:var(--fb-x)}.intro.l{left:var(--fb-x)}.intro.c{left:50%;margin-left:min(-150px,calc(20px - 50vw))}',
    '.intro.b{bottom:calc(var(--fb-y) + var(--fb-h) + 8px)}.intro.t{top:calc(var(--fb-y) + var(--fb-h) + 8px)}',
    '.intro:after{content:"";position:absolute;bottom:-7px;right:36px;width:12px;height:12px;background:var(--fb-bg);',
    'border-right:1px solid var(--fb-line);border-bottom:1px solid var(--fb-line);transform:rotate(45deg)}',
    '.intro.st-icon:after{right:calc(var(--fb-h) / 2 - 6px)}.intro.st-icon.l:after{left:calc(var(--fb-h) / 2 - 6px)}.intro.l:after{right:auto;left:36px}.intro.c:after{right:auto;left:calc(50% - 6px)}',
    '.intro.t:after{bottom:auto;top:-7px;transform:rotate(225deg)}',
    '.intro.side{top:50%;bottom:auto;transform:translateY(-50%);animation:none}.intro.side.r{right:56px}.intro.side.l{left:56px}.intro.side:after{display:none}',
    '.intro b{display:block;margin-bottom:4px;font-weight:700}',
    '.intro p{margin:0 0 12px;color:var(--fb-mute);font-size:13px}',
    '.intro .row{margin-top:0;justify-content:flex-end}',
    '.intro .by{margin-top:12px;padding-top:8px}',
    '@keyframes fb-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '@media (prefers-reduced-motion:reduce){.intro{animation:none}}',
    '.mark{display:inline-flex;color:var(--fb-mark)}.mark svg{display:block}.eye{fill:var(--fb-eye)}',
    '.dot{width:8px;height:8px;border-radius:50%;background:var(--fb-acc)}',

    // the panel
    '.scrim{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:flex-end;padding:16px}',
    '.scrim.l{justify-content:flex-start}.scrim.c{justify-content:center}.scrim.t{align-items:flex-start}.scrim.side{align-items:center}',
    '.scrim.center{align-items:center;justify-content:center}',
    '.scrim.sheet{padding:0;align-items:stretch}',
    '.scrim.clear{background:none}',
    '.scrim.blur{background:rgba(0,0,0,.18);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}',
    '.panel{width:min(var(--fb-w),100%);max-height:min(600px,calc(100vh - 32px));overflow:auto;background:var(--fb-bg);',
    'border:1px solid var(--fb-line);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.3);padding:16px;display:flex;flex-direction:column}',
    '.sheet .panel{max-height:none;height:100%;border-radius:0;border-width:0 0 0 1px}',
    '.sheet.l .panel{border-width:0 1px 0 0}',
    '.main{flex:1}',
    '.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}',
    '.tabs{display:flex;gap:4px;flex-wrap:wrap}',
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
    'textarea:focus,input:focus,.type:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--fb-acc);outline-offset:1px}',
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
    '.thanks{padding:10px 12px;margin:0 0 8px;border-radius:10px;background:var(--fb-line)}',
    '.item{border-top:1px solid var(--fb-line);padding:10px 0}',
    '.item:first-child{border-top:0}',
    '.status{font-size:12px;font-weight:600}',
    '.status.fixed,.status.accepted{color:var(--fb-fg)}',
    '.reason{margin-top:4px;padding:8px;border-radius:8px;background:var(--fb-line);font-size:13px}',
    '.text{margin:2px 0;white-space:pre-wrap;word-break:break-word}',
    '.empty{color:var(--fb-mute);padding:12px 0}',
    // Always shown: people should be able to tell this is an outside tool, and who reads it.
    '.by{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px;padding-top:10px;',
    'border-top:1px solid var(--fb-line);font-size:11.5px;color:var(--fb-mute)}',
    '.by a{display:inline-flex;align-items:center;gap:4px;margin-left:auto;color:inherit;text-decoration:none;font-weight:600;white-space:nowrap}',
    '.by a:hover{text-decoration:underline}.by .mark svg{width:13px;height:13px}',
  ].join('');

  /**
   * The host app's own accent, if it gave one. Only a plain hex colour is accepted, so the
   * attribute cannot inject CSS. The text on top of it is whichever of white or ink reads better.
   * The logo follows the accent too (data-mark="heresay" keeps the teal), in each theme only
   * where it stays visible against the button.
   */
  function accentCss(v, keepMark, theme) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((v || '').trim());
    if (!m) return '';
    var hex = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
    var lin = [0, 2, 4].map(function (i) {
      var c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    var L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    var fg = (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.0598) ? '#fff' : '#15171c';
    var css = ':host{--fb-acc:#' + hex + ';--fb-acc-fg:' + fg + '}';
    if (keepMark) return css;
    var onLight = 1.05 / (L + 0.05) >= 3, onDark = (L + 0.05) / (0.0098 + 0.05) >= 3; // #16181d
    var mark = ':host{--fb-mark:#' + hex + '}';
    if (theme === 'dark') return css + (onDark ? mark : '');
    if (theme === 'light') return css + (onLight ? mark : '');
    return css + (onLight ? '@media (prefers-color-scheme:light){' + mark + '}' : '') +
      (onDark ? '@media (prefers-color-scheme:dark){' + mark + '}' : '');
  }
  CSS += accentCss(attr('accent'), pick('mark', ['accent', 'heresay'], 'accent') === 'heresay', THEME);

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
    s.innerHTML = '<svg viewBox="0 0 200 200" width="18" height="18" aria-hidden="true"><path d="M174 100L177 105L180 110L181 116L180 121L178 126L174 131L169 134L164 137L159 139L154 141L149 143L146 146L143 149L141 154L139 159L137 164L134 169L131 174L126 178L121 180L116 181L110 180L105 177L100 174L95 170L91 167L87 164L83 163L79 162L74 162L69 163L63 164L57 164L51 164L46 162L41 159L38 154L36 149L36 143L36 137L37 131L38 126L38 121L37 117L36 113L33 109L30 105L26 100L23 95L20 90L19 84L20 79L22 74L26 69L31 66L36 63L41 61L46 59L51 57L54 54L57 51L59 46L61 41L63 36L66 31L69 26L74 22L79 20L84 19L90 20L95 23L100 26L105 30L109 33L113 36L117 37L121 38L126 38L131 37L137 36L143 36L149 36L154 38L159 41L162 46L164 51L164 57L164 63L163 69L162 74L162 79L163 83L164 87L167 91L170 95Z" fill="currentColor"/><path class="eye" d="M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z" transform="translate(80 106) rotate(-24) scale(1.25)"/><path class="eye" d="M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z" transform="translate(124 101) rotate(-24) scale(1.25)"/></svg>';
    return s;
  }

  /** "Powered by Heresay", on every view. Not configurable. */
  function byline(sentTo) {
    return el('div', { class: 'by' }, [
      sentTo ? el('span', { text: S.sentTo }) : null,
      el('a', { href: HERESAY_URL, target: '_blank', rel: 'noopener' }, [markEl(), document.createTextNode(S.powered)]),
    ]);
  }

  var PLACE = POS.join(' ') + (STYLE === 'tab' ? ' side' : '');
  var fabDot = el('span', { class: 'dot', hidden: '' });
  var fab = el('button', {
    class: ['fab', PLACE, 'st-' + STYLE, 'sz-' + SIZE, 'sh-' + pick('shadow', ['soft', 'none', 'strong'], 'soft'),
      pick('fill', ['neutral', 'accent'], 'neutral') === 'accent' ? 'fill' : '', BUTTON === 'desktop' ? 'desktop' : ''].join(' '),
    type: 'button', 'aria-haspopup': 'dialog', title: S.reportAria + ' · ' + S.powered,
    onclick: function () { open(); },
  }, [markEl(), el('span', { class: 'lbl', text: LABEL }), fabDot]);
  if (BUTTON !== 'none') root.appendChild(fab);

  // The button can wait for the first scroll. On a page that never scrolls, it shows after 10s.
  var revealed = BUTTON !== 'scroll';
  function reveal() { if (revealed) return; revealed = true; placeFab(); }
  if (!revealed) {
    ['scroll', 'wheel', 'touchmove'].forEach(function (e) { window.addEventListener(e, reveal, { passive: true, once: true }); });
    setTimeout(reveal, 10000);
  }
  /** Hidden on the paths the developer listed: that path, or anything under it. */
  function hiddenHere() {
    var p = location.pathname.replace(/\/+$/, '');
    return HIDE_ON.some(function (h) { return p === h || p.indexOf(h + '/') === 0; });
  }
  var lastPath = null;
  function placeFab() {
    lastPath = location.pathname;
    var off = !revealed || hiddenHere();
    if (off) fab.setAttribute('hidden', ''); else fab.removeAttribute('hidden');
    if (off && bubble) { bubble.remove(); bubble = null; }
  }
  /** Can the reporter see the button right now? The introduction points at it. */
  function fabShowing() {
    return BUTTON !== 'none' && fab.isConnected && !fab.hasAttribute('hidden') && getComputedStyle(fab).display !== 'none';
  }
  // Single-page apps change the path without reloading; check cheaply, only when paths are listed.
  if (HIDE_ON.length) setInterval(function () { if (location.pathname !== lastPath) placeFab(); }, 500);

  var scrim = null, view = 'new', listBox = null, lastFocus = null;

  function renderBadge() {
    var n = unseen();
    if (n) fabDot.removeAttribute('hidden'); else fabDot.setAttribute('hidden', '');
    fab.setAttribute('aria-label', n ? fmt(S.update, { n: n }) : S.reportAria);
  }
  renderBadge();

  function open(which) {
    if (dead) return;
    if (scrim) { if (which) { view = which; renderPanel(); } return; }
    if (bubble) { bubble.remove(); bubble = null; }
    lastFocus = document.activeElement;
    view = which || (unseen() ? 'mine' : 'new');
    var cls = PANEL === 'center' ? 'center' : PLACE + (PANEL === 'sheet' ? ' sheet' : '');
    scrim = el('div', { class: 'scrim ' + cls + ' ' + BACKDROP, onclick: function (e) { if (e.target === scrim) close(); } });
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
    state.justSent = false;
    renderBadge();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderPanel() {
    scrim.textContent = '';
    if (view === 'prefs' && !PREFS_TAB) view = 'new';
    var tab = function (id, label) {
      return el('button', {
        class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(view === id),
        onclick: function () { if (view === 'mine') markSeen(); state.justSent = false; view = id; renderPanel(); },
      }, [document.createTextNode(label)]);
    };
    var panel = el('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': S.dialog }, [
      el('div', { class: 'head' }, [
        el('div', { class: 'tabs', role: 'tablist' }, [tab('new', S.tabNew), tab('mine', S.tabMine), PREFS_TAB ? tab('prefs', S.tabPrefs) : null]),
        el('button', { class: 'x', type: 'button', 'aria-label': S.close, text: '×', onclick: close }),
      ]),
      el('div', { class: 'main' }, [view === 'new' ? formView() : view === 'prefs' ? prefsView() : listView()]),
      byline(view === 'new'),
    ]);
    scrim.appendChild(panel);
    var first = panel.querySelector(view === 'new' ? (state.type ? 'textarea' : '.type') : view === 'prefs' ? 'input,textarea' : '.tab[aria-selected=true]');
    if (first) first.focus();
  }

  function formView() {
    var err = el('div', { class: 'err', role: 'alert' });
    var text = el('textarea', {
      'aria-label': S.whatHappened, maxlength: '2000',
      placeholder: PLACEHOLDER,
      oninput: function () { state.draft = text.value; },
    });
    text.value = state.draft;
    var sendBtn = el('button', { class: 'send', type: 'submit', text: S.send });
    var types = OFFERED.map(function (t) {
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
        if (!state.type) { err.textContent = S.pickType; return; }
        if (!text.value.trim()) { err.textContent = S.sayWhat; text.focus(); return; }
        sendBtn.disabled = true;
        sendBtn.textContent = S.sending;
        var type = state.type;
        send(type, text.value.trim()).then(function (b) {
          state.type = null;
          state.draft = '';
          state.reports = [b.report].concat(state.reports);
          markSeen();
          state.justSent = true;
          view = 'mine';
          renderPanel();
          listeners.forEach(function (fn) { try { fn({ id: b.report && b.report.id, type: type }); } catch (x) { console.error(x); } });
        }).catch(function (x) {
          err.textContent = x.message || S.cantSend;
          sendBtn.disabled = false;
          sendBtn.textContent = S.send;
        });
      },
    }, [
      el('fieldset', {}, [el('legend', { text: S.what })].concat(types)),
      text,
      el('div', { class: 'row' }, [
        el('span', { class: 'small', text: reporter() ? S.attachedPrefs : S.attached }),
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
        el('span', {}, [document.createTextNode(label + ' '), el('i', { text: S.optional })]),
        input, hint ? el('span', { class: 'hint', text: hint }) : null,
      ]);
    };
    var name = el('input', { type: 'text', maxlength: '80', autocomplete: 'name' });
    var email = el('input', { type: 'email', maxlength: '200', autocomplete: 'email' });
    var note = el('textarea', { maxlength: '500', placeholder: S.setupPh });
    name.value = p.name || ''; email.value = p.email || ''; note.value = p.note || '';
    var err = el('div', { class: 'err', role: 'alert' });

    // Signed in: the app already told the team who this is. Say so, and ask nothing twice.
    var who = null;
    if (signedIn) {
      var shown = state.userLabel || state.userEmail || S.yourAccount;
      var initials = (state.userLabel || state.userEmail || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2)
        .map(function (w) { return w[0].toUpperCase(); }).join('');
      who = el('div', { class: 'who' }, [
        el('span', { class: 'avatar', 'aria-hidden': 'true', text: initials }),
        el('div', {}, [
          el('b', { text: fmt(S.signedAs, { who: shown }) }),
          el('span', { class: 'small', text: state.userEmail && state.userLabel
            ? fmt(S.seesReply, { email: state.userEmail }) : S.sees }),
        ]),
      ]);
    }

    return el('form', {
      role: 'tabpanel', novalidate: '',
      onsubmit: function (e) {
        e.preventDefault();
        err.textContent = '';
        var em = email.value.trim();
        if (!signedIn && em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { err.textContent = S.badEmail; email.focus(); return; }
        savePrefs(signedIn ? { name: p.name, email: p.email, note: note.value.trim() }
          : { name: name.value.trim(), email: em, note: note.value.trim() });
        status.textContent = S.saved;
      },
    }, [
      who,
      signedIn ? null : field(S.yourName, name),
      signedIn ? null : field(S.email, email, S.emailHint),
      field(S.setup, note, S.setupHint),
      el('div', { class: 'row' }, [
        el('button', { class: 'link', type: 'button', text: S.clear, onclick: function () {
          savePrefs({});
          renderPanel();
        } }),
        el('span', {}, [status, document.createTextNode(' '), el('button', { class: 'send', type: 'submit', text: S.save })]),
      ]),
      err,
      el('p', { class: 'small', text: S.kept }),
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
    if (state.justSent && THANKS) listBox.appendChild(el('div', { class: 'thanks', role: 'status', text: THANKS }));
    if (!state.reports.length) {
      listBox.appendChild(el('div', { class: 'empty', text: S.none }));
      return;
    }
    var s = seen();
    state.reports.forEach(function (r) {
      var label = (TYPES.filter(function (t) { return t.id === r.type; })[0] || {}).label || r.type;
      var fresh = r.status !== 'open' && s[r.id] !== r.status;
      listBox.appendChild(el('div', { class: 'item' }, [
        el('div', { class: 'status ' + r.status, text: (fresh ? '● ' : '') + (S.status[r.status] || r.status) }),
        el('div', { class: 'text', text: r.text }),
        el('div', { class: 'small', text: label + ' · ' + new Date(r.created_at).toLocaleDateString(LANG) }),
        r.status === 'declined' && r.decline_reason
          ? el('div', { class: 'reason', text: S.why + r.decline_reason }) : null,
        r.status === 'fixed' && r.fix_note
          ? el('div', { class: 'reason', text: r.fix_note }) : null,
      ]));
    });
  }

  // ---- introduction ----------------------------------------------------------------------

  // People can't use a button they never noticed. Once per device and app, a bubble says what it
  // is for. The host app picks the moment (introduce()), or data-intro="auto" does it on load.
  // With no button on screen (data-button="none", a hidden path, a phone in desktop mode) there
  // is nothing to point at, so it does nothing; the app tells people about its own menu item.
  var INTRO_KEY = 'fbsdk.introduced.' + KEY;
  var bubble = null;
  function introduce(o) {
    o = o || {};
    if (!revealed && !hiddenHere()) reveal();
    if (dead || bubble || scrim || load(INTRO_KEY) || !fabShowing()) return false;
    save(INTRO_KEY, new Date().toISOString());
    var done = function () { if (bubble) { bubble.remove(); bubble = null; } };
    var label = LABEL === S.report ? LABEL : '“' + LABEL + '”';
    bubble = el('div', { class: 'intro ' + PLACE + ' st-' + STYLE, role: 'dialog', 'aria-label': S.introAria }, [
      el('b', { text: words(o.title, 80) || S.introTitle }),
      el('p', { text: words(o.body, 280) || fmt(S.introBody, { label: label }) }),
      el('div', { class: 'row' }, [
        el('button', { class: 'link', type: 'button', text: S.got, onclick: done }),
        el('button', { class: 'send', type: 'button', text: S.tryIt, onclick: function () { done(); open('new'); } }),
      ]),
      byline(false),
    ]);
    bubble.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(); });
    root.appendChild(bubble);
    return true;
  }

  function mount() {
    if (dead) return;
    if (!host.isConnected) document.body.appendChild(host);
    placeFab();
    refresh();
    if (attr('intro') === 'auto') setTimeout(introduce, 3000);
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
    /** Open the report form. { type, text } fill it in; the reporter still reviews and sends. */
    open: function (o) {
      o = o || {};
      if (OFFERED.some(function (t) { return t.id === o.type; })) state.type = o.type;
      if (o.text != null) state.draft = String(o.text).slice(0, 2000);
      open('new');
    },
    openPreferences: function () { if (PREFS_TAB) open('prefs'); },
    /** Show the one-time introduction now. False if it was already shown on this device. */
    introduce: function (o) { return introduce(o); },
    /** on('sent', fn): fn({ id, type }) after each report is sent. Returns a function that stops it. */
    on: function (event, fn) {
      if (event !== 'sent' || typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    close: close,
  };
})();
