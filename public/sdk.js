/*
 * The feedback SDK for the web. One line in the host page:
 *
 *   <script src="https://<sdk-host>/sdk.js" data-key="pk_..." defer></script>
 *
 * The defaults are the recommended setup; every attribute below is optional. The full list, with
 * what each is for, is public/guides/customize-web.md.
 *
 *   Who and what:  data-version, data-user-id, data-user-label, data-user-email
 *   Button:        data-position   bottom-right (default) | bottom-left | top-right | top-left | bottom-center
 *                                  | left-tab | right-tab (a tab on the side edge) | none (no button; call Heresay.open())
 *                                  (older right, left, center still work)
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
 *   Layout:        data-layout     composer (default: type pills and a text box) | steps (pick what it is,
 *                                  then say it) | bar (a compact floating composer beside the button)
 *   Panel:         data-panel      corner (default beside the floating button) | sheet | center | beside
 *                                  (beside: next to the app's own button; without it an app's own
 *                                  button opens a centred window, or a docked bar. bar ignores the rest)
 *                  data-width      regular (default) | narrow | wide
 *                  data-backdrop   dim (default) | clear | blur
 *                  data-preferences show (default) | hide  ("Your name and email" in Your reports)
 *                  data-intro      "auto": introduce the button a few seconds after the first load
 *   Trail:         data-trail      on (default) | off | the parts to keep, e.g. "pages errors requests"
 *                                  (pages, clicks, requests, errors). What happened in the app before
 *                                  a report; see "the trail" below. data-heresay-private on any element
 *                                  keeps its text out of click records.
 *   Offering help: data-nudge  off (default) | on | the signals to watch, e.g. "clicks errors"
 *                                  (clicks, errors, requests; stalled, circles, refused). When someone seems stuck, a small note
 *                                  by the button asks if they want to tell the team. See "offering
 *                                  help" below.
 * Optional calls, any time after the script runs:
 *   Feedback.identify({ id, label, email })   who is signed in; then nobody is asked their name
 *   Feedback.setVersion("1.4.0")
 *   Feedback.setScreen("Checkout")    for apps whose URL does not change per screen
 *   Feedback.open({ type, text })     type and text optional: starts a report already filled in
 *   Feedback.on("sent", fn)           fn({ id, type }) after each report is sent; returns an off()
 *   Feedback.introduce({ title, body })   once per device: a bubble saying the button is there
 *   Feedback.nudge({ stuck })         the app saw trouble itself: offer to report it, as data-nudge does
 *   data-preview                      for the dashboard's designer: nothing is sent or stored
 *   Feedback.openPreferences()        opens Your reports with "Your name and email" expanded (if not signed in)
 *
 * Not configurable, on purpose: the Heresay mark on the button, the report types' names (they set
 * the priority), the "Your reports" view (reporters read why a report was declined), and the
 * "Powered by Heresay" line, so people can tell the app uses an outside tool.
 *
 * No account, no cookies. The reporter is a random per-device id kept in localStorage, and
 * that id is also what lets them see what happened to their own reports. Their preferences are
 * kept on the device too, and sent with each report only if they filled them in.
 * The panel is quiet: no tabs and no trail on show. The trail is collected for the team and the
 * reporter is not asked about it; the developer controls it (data-trail, data-heresay-private).
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
      close: 'Close', dialog: 'Feedback', back: 'Back to Report',
      mine: 'Your reports', mineAria: 'Your reports, {n} with an update', kindAria: 'What kind of report is this?', reportLabel: 'Your report',
      phNone: 'What’s on your mind?',
      send: 'Send', sending: 'Sending…', cantSend: 'Could not send. Try again.',
      sentMsg: 'Sent. You’ll see the reply under Your reports.', done: 'Done',
      types: {
        broken: ['Broken', 'What went wrong?'],
        confusing: ['Confusing', 'What were you trying to do?'],
        improvement: ['Could be better', 'What would make it better?'],
        idea: ['Idea', 'What would you like?'],
      },
      status: { open: 'Waiting for the developer', accepted: 'Accepted, being worked on', fixed: 'Fixed', declined: 'Declined', withdrawn: 'You took this back' },
      takeBack: 'Take back', takeBackAsk: 'Take this back? It isn’t deleted: the team sees you withdrew it.', takeBackWhy: 'Why? (optional)', takeBackYes: 'Take it back', keep: 'Keep it', yourWhy: 'Your reason: ',
      fresh: 'New update', nameEmail: 'Your name and email', nameOpt: 'Name (optional)', emailOpt: 'Email (optional)',
      signedAs: 'Signed in as {who}', yourAccount: 'your account',
      badEmail: 'That email does not look right.', saved: 'Saved on this device.',
      none: 'Nothing sent from this device yet.', why: 'Why: ',
      introAria: 'About the Report button', introTitle: 'Spotted something off?', introBody: 'Tell the team here.',
      got: 'Got it',
      nudgeStuckTitle: 'Stuck on something?', nudgeStuckBody: 'If something here isn’t clear, tell the team. A real person reads it.', nudgeAria: 'Offer to report a problem', nudgeTitle: 'Something not working?', nudgeBody: 'Tell the team what happened. A real person reads it.', nudgeYes: 'Tell the team', nudgeNo: 'Not now',
      fixedIn: 'Fixed in version {v}.', updateTo: 'Update to {v} to get it.',
      sentTo: 'Sent to this app’s team', powered: 'Powered by Heresay',
      whatsGoing: 'What’s going on?', typeChip: 'Type', tellTeam: 'Tell the team…', sentBar: 'Sent. Replies show under Your reports.', backType: 'Back to choose a type',
    },
    fr: {
      report: 'Signaler', reportAria: 'Signaler un problème',
      update: 'Signaler un problème. {n} de vos signalements ont du nouveau',
      close: 'Fermer', dialog: 'Signalement', back: 'Retour à Signaler',
      mine: 'Vos signalements', mineAria: 'Vos signalements, {n} avec du nouveau', kindAria: 'De quel type de signalement s’agit-il ?', reportLabel: 'Votre signalement',
      phNone: 'Qu’avez-vous en tête ?',
      send: 'Envoyer', sending: 'Envoi…', cantSend: 'Envoi impossible. Réessayez.',
      sentMsg: 'Envoyé. Vous verrez la réponse dans Vos signalements.', done: 'Terminé',
      types: {
        broken: ['Cassé', 'Que s’est-il passé ?'],
        confusing: ['Déroutant', 'Que cherchiez-vous à faire ?'],
        improvement: ['À améliorer', 'Qu’est-ce qui serait mieux ?'],
        idea: ['Idée', 'Que souhaiteriez-vous ?'],
      },
      status: { open: 'En attente de l’équipe', accepted: 'Accepté, en cours', fixed: 'Corrigé', declined: 'Refusé', withdrawn: 'Vous l’avez retiré' },
      takeBack: 'Retirer', takeBackAsk: 'Retirer ce signalement ? Il n’est pas supprimé : l’équipe voit que vous l’avez retiré.', takeBackWhy: 'Pourquoi ? (facultatif)', takeBackYes: 'Le retirer', keep: 'Le garder', yourWhy: 'Votre raison : ',
      fresh: 'Nouveauté', nameEmail: 'Votre nom et e-mail', nameOpt: 'Nom (facultatif)', emailOpt: 'E-mail (facultatif)',
      signedAs: 'Connecté en tant que {who}', yourAccount: 'votre compte',
      badEmail: 'Cette adresse e-mail ne semble pas correcte.', saved: 'Enregistré sur cet appareil.',
      none: 'Aucun signalement envoyé depuis cet appareil.', why: 'Pourquoi : ',
      introAria: 'À propos du bouton Signaler', introTitle: 'Vous avez repéré un souci ?', introBody: 'Dites-le à l’équipe ici.',
      got: 'Compris',
      nudgeStuckTitle: 'Bloqué quelque part ?', nudgeStuckBody: 'Si quelque chose n’est pas clair ici, dites-le à l’équipe. Une vraie personne le lit.', nudgeAria: 'Proposition de signaler un problème', nudgeTitle: 'Quelque chose ne marche pas ?', nudgeBody: 'Dites à l’équipe ce qui s’est passé. Une vraie personne le lit.', nudgeYes: 'Signaler', nudgeNo: 'Pas maintenant',
      fixedIn: 'Corrigé dans la version {v}.', updateTo: 'Passez à la {v} pour en profiter.',
      sentTo: 'Envoyé à l’équipe de cette app', powered: 'Propulsé par Heresay',
      whatsGoing: 'Que se passe-t-il ?', typeChip: 'Type', tellTeam: 'Dites-le à l’équipe…', sentBar: 'Envoyé. Les réponses s’affichent dans Vos signalements.', backType: 'Retour au choix du type',
    },
    ta: {
      report: 'தெரிவி', reportAria: 'சிக்கலைத் தெரிவிக்கவும்',
      update: 'சிக்கலைத் தெரிவிக்கவும். உங்கள் {n} புகார்களில் புதிய தகவல் உள்ளது',
      close: 'மூடு', dialog: 'கருத்து', back: 'தெரிவி பக்கத்துக்குத் திரும்பு',
      mine: 'உங்கள் புகார்கள்', mineAria: 'உங்கள் புகார்கள், {n} இல் புதிய தகவல் உள்ளது', kindAria: 'இது எந்த வகைப் புகார்?', reportLabel: 'உங்கள் புகார்',
      phNone: 'உங்கள் மனதில் என்ன இருக்கிறது?',
      send: 'அனுப்பு', sending: 'அனுப்புகிறது…', cantSend: 'அனுப்ப முடியவில்லை. மீண்டும் முயலவும்.',
      sentMsg: 'அனுப்பப்பட்டது. பதிலை “உங்கள் புகார்கள்” பகுதியில் பார்க்கலாம்.', done: 'முடிந்தது',
      types: {
        broken: ['பழுது', 'என்ன தவறு நடந்தது?'],
        confusing: ['குழப்பம்', 'என்ன செய்ய முயன்றீர்கள்?'],
        improvement: ['மேம்படுத்த', 'எப்படி மேம்படுத்தலாம்?'],
        idea: ['யோசனை', 'உங்களுக்கு என்ன வேண்டும்?'],
      },
      status: { open: 'டெவலப்பருக்காகக் காத்திருக்கிறது', accepted: 'ஏற்கப்பட்டது, வேலை நடக்கிறது', fixed: 'சரிசெய்யப்பட்டது', declined: 'நிராகரிக்கப்பட்டது', withdrawn: 'நீங்கள் திரும்பப் பெற்றீர்கள்' },
      takeBack: 'திரும்பப் பெறு', takeBackAsk: 'இதைத் திரும்பப் பெறவா? இது நீக்கப்படாது: நீங்கள் திரும்பப் பெற்றதைக் குழு பார்க்கும்.', takeBackWhy: 'ஏன்? (விருப்பத்தேர்வு)', takeBackYes: 'திரும்பப் பெறு', keep: 'வைத்திரு', yourWhy: 'உங்கள் காரணம்: ',
      fresh: 'புதிய தகவல்', nameEmail: 'உங்கள் பெயர் மற்றும் மின்னஞ்சல்', nameOpt: 'பெயர் (விருப்பத்தேர்வு)', emailOpt: 'மின்னஞ்சல் (விருப்பத்தேர்வு)',
      signedAs: '{who} ஆக உள்நுழைந்துள்ளீர்கள்', yourAccount: 'உங்கள் கணக்கு',
      badEmail: 'இந்த மின்னஞ்சல் சரியாகத் தெரியவில்லை.', saved: 'இந்தச் சாதனத்தில் சேமிக்கப்பட்டது.',
      none: 'இந்தச் சாதனத்திலிருந்து இன்னும் எதுவும் அனுப்பப்படவில்லை.', why: 'காரணம்: ',
      introAria: 'தெரிவி பொத்தான் பற்றி', introTitle: 'ஏதாவது சரியில்லையா?', introBody: 'குழுவிடம் இங்கேயே சொல்லுங்கள்.',
      got: 'சரி',
      nudgeStuckTitle: 'எங்காவது சிக்கிக்கொண்டீர்களா?', nudgeStuckBody: 'இங்கே ஏதாவது புரியவில்லை என்றால், குழுவிடம் சொல்லுங்கள். ஒருவர் அதைப் படிப்பார்.', nudgeAria: 'சிக்கலைத் தெரிவிக்க ஒரு அழைப்பு', nudgeTitle: 'ஏதாவது வேலை செய்யவில்லையா?', nudgeBody: 'என்ன நடந்தது என்று குழுவிடம் சொல்லுங்கள். ஒருவர் அதைப் படிப்பார்.', nudgeYes: 'குழுவிடம் சொல்', nudgeNo: 'இப்போது வேண்டாம்',
      fixedIn: 'பதிப்பு {v} இல் சரிசெய்யப்பட்டது.', updateTo: 'இதைப் பெற {v} க்குப் புதுப்பிக்கவும்.',
      sentTo: 'இந்த ஆப்பின் குழுவுக்கு அனுப்பப்படும்', powered: 'Heresay மூலம் இயங்குகிறது',
      whatsGoing: 'என்ன நடக்கிறது?', typeChip: 'வகை', tellTeam: 'குழுவிடம் சொல்லுங்கள்…', sentBar: 'அனுப்பப்பட்டது. பதில்கள் “உங்கள் புகார்கள்” பகுதியில் தெரியும்.', backType: 'வகையைத் தேர்வுசெய்ய திரும்பு',
    },
    hi: {
      report: 'रिपोर्ट करें', reportAria: 'समस्या की रिपोर्ट करें',
      update: 'समस्या की रिपोर्ट करें। आपकी {n} रिपोर्ट में नई जानकारी है',
      close: 'बंद करें', dialog: 'फ़ीडबैक', back: 'रिपोर्ट पर वापस जाएँ',
      mine: 'आपकी रिपोर्ट', mineAria: 'आपकी रिपोर्ट, {n} में नई जानकारी है', kindAria: 'यह किस तरह की रिपोर्ट है?', reportLabel: 'आपकी रिपोर्ट',
      phNone: 'आपके मन में क्या है?',
      send: 'भेजें', sending: 'भेजा जा रहा है…', cantSend: 'भेजा नहीं जा सका। फिर से कोशिश करें।',
      sentMsg: 'भेज दिया गया। जवाब आपको “आपकी रिपोर्ट” में दिखेगा।', done: 'हो गया',
      types: {
        broken: ['टूटा हुआ', 'क्या गड़बड़ हुई?'],
        confusing: ['उलझन', 'आप क्या करने की कोशिश कर रहे थे?'],
        improvement: ['बेहतर हो', 'क्या बेहतर हो सकता है?'],
        idea: ['सुझाव', 'आप क्या चाहेंगे?'],
      },
      status: { open: 'डेवलपर का इंतज़ार', accepted: 'स्वीकार, इस पर काम चल रहा है', fixed: 'ठीक हो गया', declined: 'अस्वीकार', withdrawn: 'आपने इसे वापस ले लिया' },
      takeBack: 'वापस लें', takeBackAsk: 'इसे वापस लें? यह हटाया नहीं जाएगा: टीम देखेगी कि आपने इसे वापस लिया।', takeBackWhy: 'क्यों? (वैकल्पिक)', takeBackYes: 'वापस लें', keep: 'रहने दें', yourWhy: 'आपकी वजह: ',
      fresh: 'नई जानकारी', nameEmail: 'आपका नाम और ईमेल', nameOpt: 'नाम (वैकल्पिक)', emailOpt: 'ईमेल (वैकल्पिक)',
      signedAs: '{who} के रूप में साइन इन', yourAccount: 'आपका खाता',
      badEmail: 'यह ईमेल सही नहीं लग रहा।', saved: 'इस डिवाइस पर सेव हो गया।',
      none: 'इस डिवाइस से अभी तक कुछ नहीं भेजा गया।', why: 'वजह: ',
      introAria: 'रिपोर्ट बटन के बारे में', introTitle: 'कुछ गड़बड़ दिखी?', introBody: 'टीम को यहीं बताइए।',
      got: 'ठीक है',
      nudgeStuckTitle: 'कहीं अटक गए?', nudgeStuckBody: 'अगर यहाँ कुछ साफ़ नहीं है, तो टीम को बताइए। इसे कोई इंसान पढ़ता है।', nudgeAria: 'समस्या बताने का सुझाव', nudgeTitle: 'कुछ काम नहीं कर रहा?', nudgeBody: 'टीम को बताइए क्या हुआ। इसे कोई इंसान पढ़ता है।', nudgeYes: 'टीम को बताएँ', nudgeNo: 'अभी नहीं',
      fixedIn: 'वर्शन {v} में ठीक किया गया।', updateTo: 'इसे पाने के लिए {v} पर अपडेट करें।',
      sentTo: 'इस ऐप की टीम को भेजा जाता है', powered: 'Heresay द्वारा संचालित',
      whatsGoing: 'क्या हो रहा है?', typeChip: 'प्रकार', tellTeam: 'टीम को बताइए…', sentBar: 'भेज दिया गया। जवाब “आपकी रिपोर्ट” में दिखेंगे।', backType: 'प्रकार चुनने पर वापस जाएँ',
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

  /**
   * Where the button sits is the developer's choice (data-position), not the reporter's:
   * bottom-right (default) | bottom-left | top-right | top-left | bottom-center
   * | left-tab | right-tab (a tab on the side edge) | none (no button; call Heresay.open()).
   * The older right, left and center still work. An explicit data-style or data-button wins.
   */
  var POSITION = attr('position').toLowerCase().trim();
  var POS = ({
    left: ['l', 'b'], 'bottom-left': ['l', 'b'], 'top-right': ['r', 't'], 'top-left': ['l', 't'],
    center: ['c', 'b'], 'bottom-center': ['c', 'b'], 'left-tab': ['l', 'b'], 'right-tab': ['r', 'b'],
  })[POSITION] || ['r', 'b'];
  var STYLE = pick('style', ['pill', 'icon', 'tab'], POSITION === 'left-tab' || POSITION === 'right-tab' ? 'tab' : 'pill');
  if (STYLE === 'tab' && POS[0] === 'c') POS = ['r', 'b'];
  var LEFT = POS[0] === 'l';
  var OFFSET = (function () {
    var m = /^(\d{1,4})(?:\s*,\s*(\d{1,4}))?$/.exec(attr('offset'));
    var clamp = function (n) { return Math.min(400, +n); };
    return m ? [clamp(m[1]), clamp(m[2] != null ? m[2] : m[1])] : [20, 20];
  })();
  var BUTTON = pick('button', ['always', 'none', 'desktop', 'scroll'], POSITION === 'none' ? 'none' : 'always');
  var SIZE = pick('size', ['regular', 'small', 'large'], 'regular');
  var LABEL = words(attr('label'), 40) || S.report;
  var HIDE_ON = attr('hide-on').split(',').map(function (p) { return p.trim().replace(/\/+$/, ''); })
    .filter(function (p) { return p.charAt(0) === '/'; });
  var LAYOUT = pick('layout', ['composer', 'steps', 'bar'], 'composer');
  var PANEL = pick('panel', ['corner', 'sheet', 'center', 'beside'], '');
  var WIDTH = ({ narrow: 320, wide: 460 })[attr('width').toLowerCase()] || 360;
  var BACKDROP = pick('backdrop', ['dim', 'clear', 'blur'], 'dim');
  var PREFS_ROW = pick('preferences', ['show', 'hide'], 'show') === 'show';
  // data-placeholder, if set, replaces the line that follows the type.
  var PLACEHOLDER = words(attr('placeholder'), 120);
  var THANKS = words(attr('thanks'), 160);

  var TYPES = ['broken', 'confusing', 'improvement', 'idea'].map(function (id) {
    return { id: id, label: S.types[id][0], ph: S.types[id][1] };
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
  /** What the reporter has seen of a report: its status, and the version a fix ships in once known. */
  function mark(r) { return r.status + (r.fix_version ? '@' + r.fix_version : ''); }
  function markSeen() {
    var s = {};
    state.reports.forEach(function (r) { s[r.id] = mark(r); });
    save('fbsdk.seen.' + KEY, JSON.stringify(s));
  }
  function unseen() {
    var s = seen();
    return state.reports.filter(function (r) { return r.status !== 'open' && r.status !== 'withdrawn' && s[r.id] !== mark(r); }).length;
  }
  /** a < b for versions like 1.4, 1.10.2, 2.0 (build suffixes ignored). Unknown: false. */
  function older(a, b) {
    var x = String(a || '').split(/[\s(+-]/)[0].split('.'), y = String(b || '').split(/[\s(+-]/)[0].split('.');
    if (!x[0] || !y[0] || x.concat(y).some(function (n) { return !/^\d+$/.test(n); })) return false;
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (+x[i] || 0) - (+y[i] || 0);
      if (d) return d < 0;
    }
    return false;
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
    var r = { name: mine && p.name || null, email: mine && p.email || null };
    return r.name || r.email ? r : null;
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
      locale: navigator.language || null,
      timezone: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; } })(),
      theme: media('(prefers-color-scheme: dark)') ? 'dark' : 'light',
      device: deviceKind(),
      network: network(),
      screen: screen && screen.width ? screen.width + 'x' + screen.height + '@' + (Math.round((window.devicePixelRatio || 1) * 100) / 100) + 'x' : null,
      session_s: Math.round(((window.performance && performance.now()) || 0) / 1000),
      settings: [media('(prefers-reduced-motion: reduce)') && 'reduced motion', media('(prefers-contrast: more)') && 'more contrast',
        media('(forced-colors: active)') && 'forced colours', zoom()].filter(Boolean).join(', ') || null,
    };
  }

  function media(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
  /** 'phone, touch', 'tablet, touch', 'desktop, mouse': what the layout had to work on. */
  function deviceKind() {
    var ua = navigator.userAgent;
    var kind = /iPad|Tablet|Android(?!.*Mobi)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'tablet'
      : /Mobi|iPhone|Android/.test(ua) ? 'phone' : 'desktop';
    return kind + ', ' + (media('(pointer: coarse)') ? 'touch' : 'mouse');
  }
  /** How the connection looked to the browser: '4g', '3g, data saver', 'offline'. Not every browser says. */
  function network() {
    if (navigator.onLine === false) return 'offline';
    var c = navigator.connection;
    if (!c || !c.effectiveType) return null;
    return c.effectiveType + (c.saveData ? ', data saver' : '');
  }
  /** Page zoom, when the browser shows it: a zoomed page reflows like a narrow one. */
  function zoom() {
    var z = window.visualViewport && window.visualViewport.scale;
    return z && Math.abs(z - 1) > 0.05 ? 'zoomed ' + Math.round(z * 100) + '%' : null;
  }

  // ---- the trail -------------------------------------------------------------------------

  /**
   * What happened in the app before a report: pages, clicks, requests that failed, errors. Kept
   * on this device only, in memory and this tab's sessionStorage (the newest 50, for 5 minutes),
   * and sent with every report; the reporter is not shown it, and the developer controls it (data-trail,
   * data-heresay-private). Never what anyone typed, never request
   * or response bodies or headers, never query strings. Nothing is recorded inside the widget.
   */
  var TRAIL_PARTS = { pages: 'page', clicks: 'click', requests: 'request', errors: 'error' };
  var TRAIL = (function () {
    var v = attr('trail').toLowerCase(), on = {};
    if (PREVIEW || /^(off|none|false|no)$/.test(v)) return on;
    var want = v && v !== 'on' ? v.split(/[\s,]+/) : Object.keys(TRAIL_PARTS);
    want.forEach(function (w) { if (TRAIL_PARTS[w]) on[TRAIL_PARTS[w]] = true; });
    if (on.error) on.warn = true;
    if (on.page || on.request || on.error) on.state = true;
    return on;
  })();
  var TRAIL_MAX = 50, TRAIL_AGE = 5 * 60000;
  // Pages visited and when someone last typed, for data-nudge ("offering help"). Here because the
  // page watcher below records the first page before that part of the script runs.
  // Also when they last clicked or pressed a key, and when the page last changed, to tell what
  // they sent from what the app sent by itself.
  var visits = [], typedAt = 0, actedAt = 0, pageAt = 0;
  // data-nudge, read here because the request watchers below serve both. See "offering help".
  var NUDGE_SIGNALS = ['clicks', 'errors', 'requests', 'stalled', 'circles', 'refused'];
  var NUDGE = (function () {
    var v = attr('nudge').toLowerCase(), on = {};
    if (PREVIEW || !v || /^(off|none|false|no)$/.test(v)) return on;
    (v === 'on' ? NUDGE_SIGNALS : v.split(/[\s,]+/)).forEach(function (w) {
      if (NUDGE_SIGNALS.indexOf(w) >= 0) on[w] = true;
    });
    return on;
  })();
  var trail = [];

  /** The same blanking the server does (trail.ts), so it never leaves the device in the first place. */
  function scrub(v, max) {
    var tail = function (q) { var m = /(:\d+){1,2}$/.exec(q); return m ? m[0] : ''; };
    v = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim()
      .split(location.origin).join('')
      .replace(/(https?:\/\/[^\s?#"'`)]*)\?([^\s#"'`)]*)/g, function (_, u, q) { return u + tail(q); })
      .replace(/(^|\s)(\/[^\s?#]*)\?([^\s#)]*)/g, function (_, sp, u, q) { return sp + u + tail(q); })
      .replace(/[^\s@"'<>()]+@[^\s@"'<>()]+\.[A-Za-z]{2,}/g, '[email]')
      .replace(/\bBearer\s+\S+/gi, 'Bearer [token]')
      .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[token]')
      .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, '[token]')
      .replace(/\d[\d -]{6,}\d/g, function (m) { return m.replace(/\D/g, '').length >= 7 ? '[number]' : m; });
    return v ? v.slice(0, max) : null;
  }

  var noting = false;
  /** `part` is the data-trail part that allows it, when that isn't the kind's own. */
  function note(kind, text, detail, part) {
    if (!(part ? TRAIL[part] : TRAIL[kind]) || noting) return;
    noting = true;
    try {
      text = scrub(text, 200);
      if (!text) return;
      var now = Date.now(), last = trail[trail.length - 1];
      keep();
      if (last && last.kind === kind && last.text === text) { last.n++; last.at = now; return last; }
      var e = { kind: kind, at: now, text: text, detail: detail ? scrub(detail, 600) : null, n: 1 };
      trail.push(e);
      if (trail.length > TRAIL_MAX) trail.shift();
      return e;
    } catch (x) { /* never break the app over a record */ } finally { noting = false; }
  }

  // The trail outlives a reload or a new page in this tab: kept in sessionStorage, which only this
  // tab can read and the browser clears when it closes. So a page that froze or went blank and was
  // reloaded still has what happened before it, and so does a site whose pages are separate loads.
  var TRAIL_KEY = 'fbsdk.trail.' + KEY, keepTimer = null;
  function keep() {
    if (PREVIEW || keepTimer) return;
    keepTimer = setTimeout(keepNow, 300);
  }
  function keepNow() {
    clearTimeout(keepTimer); keepTimer = null;
    try { sessionStorage.setItem(TRAIL_KEY, JSON.stringify(recentTrail())); } catch (e) { /* full or blocked */ }
  }
  if (!PREVIEW && Object.keys(TRAIL).length) {
    try {
      var kept = JSON.parse(sessionStorage.getItem(TRAIL_KEY) || '[]'), cut = Date.now() - TRAIL_AGE;
      trail = (Array.isArray(kept) ? kept : []).filter(function (e) {
        return e && typeof e.text === 'string' && TRAIL[e.kind] && e.at >= cut && e.at <= Date.now();
      }).slice(-TRAIL_MAX);
    } catch (e) { trail = []; }
    var nav = window.performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (trail.length && nav && nav.type === 'reload') note('state', 'The page was reloaded');
    window.addEventListener('pagehide', keepNow);
  }

  /** The first visit after the app's version changed: what broke often broke with the update. */
  function versionSeen(v) {
    if (!v || PREVIEW) return;
    var k = 'fbsdk.version.' + KEY, seen = load(k);
    if (seen && seen !== v) note('state', 'First visit since the app updated from ' + seen + ' to ' + v);
    save(k, v);
  }
  function recentTrail() {
    var cut = Date.now() - TRAIL_AGE;
    return trail.filter(function (e) { return e.at >= cut; });
  }
  /** What goes with the report: ages in seconds before now. */
  function trailToSend() {
    var now = Date.now();
    var t = recentTrail().map(function (e) {
      return { kind: e.kind, ago: Math.round((now - e.at) / 1000), text: e.text, detail: e.detail, n: e.n };
    });
    return t.length ? t : null;
  }

  /** The page's path and hash, or another site's origin and path. Never the query string. */
  function shortUrl(u) {
    try {
      var x = new URL(u, location.href);
      return (x.origin === location.origin ? '' : x.origin) + x.pathname;
    } catch (e) { return String(u).split(/[?#]/)[0]; }
  }
  // data-api may be relative ('/v1'), so both sides are made absolute before comparing.
  var API_ABS = (function () { try { return new URL(API, location.href).href; } catch (e) { return API; } })();
  function ours(u) { try { return new URL(u, location.href).href.indexOf(API_ABS) === 0; } catch (e) { return false; } }
  function frames(err) {
    var s = err && err.stack ? String(err.stack) : '';
    var f = s.split('\n').filter(function (l) { return /^\s*at\s|@/.test(l); }).slice(0, 3)
      .map(function (l) { return l.trim(); });
    return f.length ? f.join('\n') : null;
  }
  /** One console argument as a short line. Objects show their first few plain values, not everything. */
  function brief(a) {
    try {
      if (a instanceof Error) return a.name + ': ' + a.message;
      if (a == null || typeof a !== 'object') return String(a);
      if (Array.isArray(a)) return '[' + a.length + ' items]';
      return '{' + Object.keys(a).slice(0, 5).map(function (k) {
        var x = a[k];
        return k + ': ' + (typeof x === 'string' ? JSON.stringify(x.slice(0, 40)) : x == null || typeof x !== 'object' ? String(x) : '…');
      }).join(', ') + '}';
    } catch (e) { return '?'; }
  }

  // Pages: any router changes the address through history, so watch that.
  var lastWhere = null;
  function titled(w) {
    var t = (document.title || '').replace(/\s+/g, ' ').trim();
    return w + (t ? ' "' + (t.length > 60 ? t.slice(0, 59) + '…' : t) + '"' : '');
  }
  function onPage(first) {
    var w = location.pathname + location.hash;
    if (w === lastWhere) return;
    lastWhere = w;
    pageAt = Date.now();
    visited(w);
    if (first === true) { note('page', titled(w)); return; }
    // Single-page apps set the title just after the address: the entry goes in now, in order,
    // and gets the title a moment later.
    var e = note('page', w);
    if (e) setTimeout(function () { var t = scrub(titled(w), 200); if (t) e.text = t; }, 150);
  }
  if (TRAIL.page || NUDGE.circles) {
    onPage(true);
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      if (typeof orig !== 'function') return;
      history[m] = function () {
        var r = orig.apply(this, arguments);
        try { onPage(); } catch (e) { /* ignore */ }
        return r;
      };
    });
    window.addEventListener('popstate', onPage);
    window.addEventListener('hashchange', onPage);
  }

  // Clicks: what was clicked, by its label. Never a field's value.
  var CLICKABLE = 'a,button,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=option]';
  /** `bare` leaves out where it is. */
  function clicked(t, bare) {
    var hit = t.closest && t.closest(CLICKABLE), n = hit || t;
    if (!n.tagName) return null;
    var tag = n.tagName.toLowerCase(), type = (n.getAttribute('type') || '').toLowerCase();
    var isButton = tag === 'button' || (tag === 'input' && /^(button|submit|reset)$/.test(type));
    var field = !isButton && /^(input|textarea|select)$/.test(tag) || n.isContentEditable;
    var what = n.getAttribute('role') || (isButton ? 'button' : tag === 'a' ? 'link'
      : tag === 'input' && /^(checkbox|radio)$/.test(type) ? type : field ? 'field' : tag);
    if (n.closest('[data-heresay-private]')) return what;
    // Text only from controls. A click on a paragraph says "p", not what the paragraph says.
    var name = n.getAttribute('aria-label')
      || (field ? (n.labels && n.labels[0] && n.labels[0].textContent) || n.getAttribute('placeholder') || n.getAttribute('name')
        : !hit ? '' : tag === 'input' ? n.value : n.textContent)
      || n.getAttribute('title') || n.getAttribute('alt') || '';
    name = name.replace(/\s+/g, ' ').trim();
    if (name.length > 40) name = name.slice(0, 39) + '…';
    return what + (name ? ' "' + name + '"' : '') + (bare ? '' : where(n));
  }

  /** The dialog, form, menu or region a control is in, by its name: ' in dialog "Edit profile"'. */
  var AREAS = 'dialog,[role=dialog],[role=alertdialog],[role=menu],[role=tabpanel],form,nav,[role=navigation],[role=search],aside,section[aria-label],section[aria-labelledby],[role=region]';
  function where(n) {
    var a = n.parentElement && n.parentElement.closest(AREAS);
    if (!a || a.closest('[data-heresay-private]')) return '';
    var tag = a.tagName.toLowerCase(), role = a.getAttribute('role');
    var kind = role === 'alertdialog' ? 'dialog' : role === 'navigation' || tag === 'nav' ? 'navigation'
      : role === 'tabpanel' ? 'tab' : role === 'search' ? 'search' : role || (tag === 'aside' ? 'sidebar' : tag === 'section' ? 'section' : tag);
    var by = a.getAttribute('aria-labelledby');
    var label = a.getAttribute('aria-label')
      || (by && by.split(/\s+/).map(function (id) { var x = document.getElementById(id); return x ? x.textContent : ''; }).join(' '))
      || ((a.querySelector('h1,h2,h3,legend') || {}).textContent) || '';
    label = label.replace(/\s+/g, ' ').trim();
    if (label.length > 30) label = label.slice(0, 29) + '…';
    return ' in ' + kind + (label ? ' "' + label + '"' : '');
  }
  if (TRAIL.click) {
    document.addEventListener('click', function (e) {
      if (!host || e.target === host || host.contains(e.target)) return;
      note('click', clicked(e.target));
    }, true);
  }

  // Forms: sent, and the fields the browser refused, by their label and why. Never their value.
  var WHY = { valueMissing: 'is required', typeMismatch: 'is not in the right format', patternMismatch: 'does not match the format asked for',
    tooShort: 'is too short', tooLong: 'is too long', rangeUnderflow: 'is too low', rangeOverflow: 'is too high',
    stepMismatch: 'is not an allowed value', badInput: 'could not be read' };
  if (TRAIL.click) {
    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (!f || !f.tagName || host.contains(f)) return;
      var name = f.closest('[data-heresay-private]') ? '' : (f.getAttribute('aria-label') || f.getAttribute('name') || ((f.querySelector('h1,h2,h3,legend') || {}).textContent) || '');
      name = name.replace(/\s+/g, ' ').trim().slice(0, 40);
      note('click', 'form' + (name ? ' "' + name + '"' : '') + ' sent');
    }, true);
    document.addEventListener('invalid', function (e) {
      var t = e.target;
      if (!t || !t.validity || host.contains(t)) return;
      var why = Object.keys(WHY).filter(function (k) { return t.validity[k]; })[0];
      note('warn', clicked(t, true) + ' ' + (WHY[why] || 'was refused'), null, 'click');
    }, true);
  }

  // Requests: the ones that failed, and the ones so slow someone would notice, by method, path,
  // status and how long they took.
  /** ' in 2.4 s', past a second; quicker than that, the time says nothing. */
  function took(t0) { var ms = Date.now() - t0; return ms >= 1000 ? ' in ' + (Math.round(ms / 100) / 10) + ' s' : ''; }
  /** A request that worked but took 3 s or more: a warning, since nothing failed. */
  function slow(method, url, status, t0) {
    if (Date.now() - t0 >= 3000) note('warn', 'Slow request: ' + method + ' ' + shortUrl(url) + ' → ' + status + took(t0), null, 'request');
  }
  if ((TRAIL.request || NUDGE.requests || NUDGE.stalled || NUDGE.circles) && window.fetch) {
    var ofetch = window.fetch;
    window.fetch = function (input, init) {
      var p = ofetch.apply(window, arguments);
      try {
        var url = typeof input === 'string' ? input : input && (input.url || String(input));
        if (url && !ours(url)) {
          var method = String(init && init.method || input && input.method || 'GET').toUpperCase();
          var t0 = Date.now(), mine = byHand();
          p.then(function (res) {
            if (!res.ok && res.type !== 'opaque') { note('request', method + ' ' + shortUrl(url) + ' → ' + res.status + took(t0)); requestFailed(res.status); }
            else { slow(method, url, res.status, t0); if (mine && method !== 'GET' && method !== 'HEAD') sentSomething(); }
          }, function (err) {
            if (err && err.name === 'AbortError') return;
            note('request', method + ' ' + shortUrl(url) + ' → failed (' + (navigator.onLine === false ? 'offline' : 'network error') + ')' + took(t0));
            requestFailed(0);
          });
        }
      } catch (e) { /* ignore */ }
      return p;
    };
  }
  if ((TRAIL.request || NUDGE.requests || NUDGE.stalled || NUDGE.circles) && window.XMLHttpRequest) {
    var XP = XMLHttpRequest.prototype, xopen = XP.open, xsend = XP.send;
    XP.open = function (m, u) {
      try { this.__heresay = { m: String(m || 'GET').toUpperCase(), u: String(u) }; } catch (e) { /* ignore */ }
      return xopen.apply(this, arguments);
    };
    XP.send = function () {
      var x = this, r = x.__heresay;
      try {
        if (r && !ours(r.u)) {
          var aborted = false, t0 = Date.now(), mine = byHand();
          x.addEventListener('abort', function () { aborted = true; });
          x.addEventListener('loadend', function () {
            if (x.status >= 400) { note('request', r.m + ' ' + shortUrl(r.u) + ' → ' + x.status + took(t0)); requestFailed(x.status); }
            else if (x.status === 0 && !aborted) { note('request', r.m + ' ' + shortUrl(r.u) + ' → failed (network error)' + took(t0)); requestFailed(0); }
            else if (x.status) { slow(r.m, r.u, x.status, t0); if (mine && r.m !== 'GET' && r.m !== 'HEAD') sentSomething(); }
          });
        }
      } catch (e) { /* ignore */ }
      return xsend.apply(this, arguments);
    };
  }

  // Errors: uncaught ones, failed promises, files that did not load, console.error and .warn.
  if (TRAIL.error) {
    window.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t !== window && t.tagName) {
        var src = t.currentSrc || t.src || t.href;
        if (src && !ours(src)) note('error', 'Could not load ' + t.tagName.toLowerCase() + ' ' + shortUrl(src));
        return;
      }
      var err = e.error;
      note('error', err instanceof Error ? err.name + ': ' + err.message : e.message || 'Script error',
        frames(err) || (e.filename ? shortUrl(e.filename) + ':' + e.lineno + ':' + e.colno : null));
    }, true);
    window.addEventListener('unhandledrejection', function (e) {
      var why = e.reason;
      note('error', 'Unhandled promise rejection: ' + brief(why), frames(why));
    });
    [['error', 'error'], ['warn', 'warn']].forEach(function (c) {
      var orig = console[c[0]];
      if (typeof orig !== 'function') return;
      console[c[0]] = function () {
        try {
          var args = Array.prototype.slice.call(arguments);
          var msg = args.map(brief).join(' ');
          if (!/^\[(heresay|feedback)\]/.test(msg)) {
            note(c[1], msg, frames(args.filter(function (a) { return a instanceof Error; })[0]));
          }
        } catch (e) { /* ignore */ }
        return orig.apply(console, arguments);
      };
    });
  }
  if (TRAIL.error) {
    // Something the page's own security policy blocked: often why a script or an embed is missing.
    document.addEventListener('securitypolicyviolation', function (e) {
      note('error', 'Blocked by the Content Security Policy (' + (e.effectiveDirective || e.violatedDirective) + '): ' +
        (/^https?:/.test(e.blockedURI) ? shortUrl(e.blockedURI) : e.blockedURI || 'inline'));
    });
    // The page stopped answering: a long task of a second or more.
    try {
      new PerformanceObserver(function (l) {
        l.getEntries().forEach(function (t) {
          if (t.duration >= 1000) note('warn', 'The page froze for ' + (Math.round(t.duration / 100) / 10) + ' s');
        });
      }).observe({ type: 'longtask', buffered: true });
    } catch (e) { /* not in this browser */ }
    // What the app told the person: alerts, as screen readers announce them. Checked at most every
    // 300 ms, only when the page changes.
    var shown = typeof WeakMap === 'function' ? new WeakMap() : null, alertTimer = null;
    var checkAlerts = function () {
      alertTimer = null;
      document.querySelectorAll('[role=alert],[role=alertdialog],[aria-live=assertive]').forEach(function (a) {
        if (host.contains(a) || a.closest('[data-heresay-private]')) return;
        var t = (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim();
        if (shown.get(a) === t) return;
        shown.set(a, t);
        if (t) note('warn', 'The app showed: "' + (t.length > 120 ? t.slice(0, 119) + '…' : t) + '"');
      });
    };
    if (shown && window.MutationObserver) {
      new MutationObserver(function () { if (!alertTimer) alertTimer = setTimeout(checkAlerts, 300); })
        .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
  }
  if (TRAIL.state) {
    window.addEventListener('offline', function () { note('state', 'Went offline'); });
    window.addEventListener('online', function () { note('state', 'Back online'); });
    // Leaving the tab and coming back: a session can expire, a socket drop, while they are away.
    var hiddenAt = 0;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      var s = hiddenAt ? Math.round((Date.now() - hiddenAt) / 1000) : 0;
      hiddenAt = 0;
      if (s >= 5) note('state', 'Came back to the tab after ' + (s >= 60 ? Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) + ' min' : s + ' s'));
    });
  }

  // ---- offering help ---------------------------------------------------------------------

  /**
   * data-nudge: when someone seems stuck, a small note by the button asks whether they want to
   * tell the team. Off unless the host turns it on: it is the host's page it appears on. Watched
   * here on the device and never sent anywhere; it only offers the form, with the trail.
   *
   *   clicks    the same button or link pressed 3 times in 10 s, and the page did not change
   *   errors    an uncaught error or failed promise within 5 s of a click
   *   requests  2 requests failing (5xx or no answer) within 30 s, while online
   *
   * And when someone seems unsure rather than blocked ("Stuck on something?", opening as Confusing):
   *
   *   stalled   typed in a field, then 45 s with no more typing and nothing sent, while still
   *             on the page and moving or scrolling (not away). Search boxes don't count.
   *   circles   6 page changes in a minute among at most 3 pages, one of them seen 3 times,
   *             with nothing sent
   *   refused   the same field refused 3 times in 2 minutes (the browser's check, or the app
   *             setting aria-invalid)
   *
   * At most once per tab. "Not now" only closes it.
   */
  var DEAD_WAIT = 1500, DEAD_SPAN = 10000, DEAD_COUNT = 3;
  var lastPress = 0;

  // Clicks that did nothing: no change to the page and no new address within 1.5 s. Buttons and
  // links only; fields, checkboxes and sliders change without touching the page.
  var PRESSABLE = 'a[href],button,input[type=button],input[type=submit],input[type=reset],[role=button],[role=link],[role=menuitem],[role=tab],summary';
  var presses = [], pending = 0, pageWatch = null;
  function pageChanged() {
    var now = Date.now();
    presses.forEach(function (p) { if (now - p.at <= DEAD_WAIT) p.changed = true; });
  }
  function judge(p) {
    if (--pending === 0 && pageWatch) { pageWatch.disconnect(); pageWatch = null; }
    if (p.changed || location.href !== p.href) return;
    p.dead = true;
    var cut = Date.now() - DEAD_SPAN;
    presses = presses.filter(function (q) { return q.at >= cut; });
    var same = presses.filter(function (q) { return q.dead && q.el === p.el; });
    if (same.length >= DEAD_COUNT) { presses = []; trouble('clicks'); }
  }
  if (NUDGE.clicks || NUDGE.errors) {
    // pointerdown, not click: a disabled button gets no click, and it is the classic one to press again.
    document.addEventListener('pointerdown', function (e) {
      if (!e.isPrimary || e.button > 0 || !host || host.contains(e.target) || e.target === host) return;
      lastPress = Date.now();
      if (!NUDGE.clicks || !e.target.closest) return;
      var c = e.target.closest(PRESSABLE);
      if (!c || c.closest('[data-feedback-sdk]')) return;
      // A new tab, a download, an email: the page stays as it was, and that is fine.
      if (c.tagName === 'A' && (/^(mailto|tel|sms):/i.test(c.getAttribute('href')) || c.hasAttribute('download')
        || (c.target && c.target !== '_self'))) return;
      var p = { el: c, at: lastPress, href: location.href, changed: false, dead: false };
      presses.push(p);
      if (!pageWatch && window.MutationObserver) {
        pageWatch = new MutationObserver(pageChanged);
        pageWatch.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      }
      pending++;
      setTimeout(function () { judge(p); }, DEAD_WAIT);
    }, true);
  }

  // Errors right after a click. Not from browser extensions, not the browser's ResizeObserver
  // notice, not cross-origin "Script error." with nothing to go on.
  function appError(msg, where) {
    if (!lastPress || Date.now() - lastPress > 5000) return false;
    if (/ResizeObserver loop/.test(msg || '')) return false;
    if (/^(chrome|moz|safari(-web)?)-extension:/.test(where || '')) return false;
    if (where && script.src && where.indexOf(script.src.split(/[?#]/)[0]) === 0) return false;
    return true;
  }
  if (NUDGE.errors) {
    window.addEventListener('error', function (e) {
      if (e.target && e.target !== window) return; // a file that did not load
      if (!e.filename && !e.error) return;
      if (appError(e.message, e.filename)) trouble('errors');
    }, true);
    window.addEventListener('unhandledrejection', function (e) {
      var r = e.reason, stack = r && r.stack ? String(r.stack) : '';
      if (/(chrome|moz|safari(-web)?)-extension:/.test(stack)) return;
      if (appError(r && r.message, '')) trouble('errors');
    });
  }

  // Requests failing in a row: the server, or the way to it. A 4xx is usually the app answering.
  var fails = [];
  function requestFailed(status) {
    if (!NUDGE.requests || navigator.onLine === false || (status && status < 500)) return;
    var now = Date.now();
    fails = fails.filter(function (t) { return now - t < 30000; }).concat(now);
    if (fails.length >= 2) { fails = []; trouble('requests'); }
  }
  function trouble(why) { if (NUDGE[why]) offerHelp(/^(stalled|circles|refused)$/.test(why) ? 'stuck' : 'broken'); }

  // Unsure, not blocked. Anything they sent (a form, a request that changes something) means they
  // got there, so it starts these over.
  var sentAt = 0;
  function sentSomething() { sentAt = Date.now(); visits = []; typedAt = 0; }
  document.addEventListener('submit', function (e) { if (!host.contains(e.target)) sentSomething(); }, true);
  // A request is theirs if it started within 2 s of a click or key press, with no page change in
  // between. Apps send requests by themselves too: polling, analytics, and loading the new page's
  // data after a page change (Firestore, for one, POSTs to listen). Those must not start "circles"
  // over, or it would never be reached.
  function acted(e) { if (!host.contains(e.target)) actedAt = Date.now(); }
  document.addEventListener('pointerdown', acted, true);
  document.addEventListener('keydown', acted, true);
  function byHand() { return Date.now() - actedAt < 2000 && pageAt <= actedAt; }

  // Going in circles: a few pages, over and over, inside a minute.
  function visited(where) {
    if (!NUDGE.circles) return;
    var now = Date.now();
    visits = visits.filter(function (v) { return now - v.at < 60000; }).concat({ at: now, where: where });
    if (visits.length < 6) return;
    var count = {};
    visits.forEach(function (v) { count[v.where] = (count[v.where] || 0) + 1; });
    var pages = Object.keys(count);
    if (pages.length <= 3 && pages.some(function (k) { return count[k] >= 3; })) { visits = []; trouble('circles'); }
  }

  // Typing that stopped: 45 s after the last keystroke, still here (moved or scrolled in the last
  // 15 s), on the same page, and nothing sent.
  var typedWhere = null, hereAt = 0, stallTimer = null;
  var SEARCH = 'input[type=search],[role=search] input,[role=searchbox],[role=combobox]';
  if (NUDGE.stalled) {
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.closest || host.contains(t) || t === host) return;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) return;
      if (t.matches(SEARCH) || /search/i.test((t.name || '') + ' ' + (t.id || '') + ' ' + (t.getAttribute('placeholder') || ''))) return;
      typedAt = Date.now();
      typedWhere = location.pathname + location.hash;
      if (!stallTimer) stallTimer = setInterval(checkStall, 5000);
    }, true);
    ['pointermove', 'scroll', 'wheel', 'touchmove'].forEach(function (ev) {
      window.addEventListener(ev, function () { hereAt = Date.now(); }, { passive: true, capture: true });
    });
  }
  function checkStall() {
    var now = Date.now();
    if (!typedAt || typedWhere !== location.pathname + location.hash) { clearInterval(stallTimer); stallTimer = null; typedAt = 0; return; }
    if (now - typedAt < 45000 || now - hereAt > 15000 || document.visibilityState === 'hidden') return;
    clearInterval(stallTimer); stallTimer = null; typedAt = 0;
    trouble('stalled');
  }

  // The same field refused again and again: the browser's own check, or the app marking it
  // aria-invalid.
  var refusals = typeof WeakMap === 'function' ? new WeakMap() : null;
  function refused(t) {
    if (!NUDGE.refused || !refusals || !t || host.contains(t)) return;
    var now = Date.now();
    var r = (refusals.get(t) || []).filter(function (at) { return now - at < 120000; }).concat(now);
    refusals.set(t, r);
    if (r.length >= 3) { refusals.set(t, []); trouble('refused'); }
  }
  if (NUDGE.refused) {
    document.addEventListener('invalid', function (e) { refused(e.target); }, true);
    if (window.MutationObserver) {
      new MutationObserver(function (ms) {
        ms.forEach(function (m) { if (m.target.getAttribute && m.target.getAttribute('aria-invalid') === 'true') refused(m.target); });
      }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['aria-invalid'] });
    }
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
      body: JSON.stringify({ key: KEY, device_id: deviceId(), sdk: 'web', type: type, text: text, context: context(), reporter: reporter(), trail: trailToSend() }),
    }).then(body);
  }

  function withdrawReport(id, reason) {
    if (PREVIEW) return Promise.resolve({ report: Object.assign({}, state.reports.filter(function (x) { return x.id === id; })[0], { status: 'withdrawn', withdrawn_reason: reason || null }) });
    return fetch(API + '/reports/withdraw', {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ key: KEY, device_id: deviceId(), report_id: id, reason: reason || null }),
    }).then(body);
  }

  /**
   * A device with no reports has nothing to hear back about, so loading the app need not ask
   * the server more than once a day (that call is also what tells the dashboard the SDK is live).
   * A device with reports asks on every load, as before.
   */
  var MINE_KEY = 'fbsdk.mine.' + KEY;
  function rememberMine() { save(MINE_KEY, JSON.stringify({ at: Date.now(), n: state.reports.length })); }
  function mineIsEmptyAndFresh() {
    try {
      var m = JSON.parse(load(MINE_KEY) || 'null');
      return !!m && m.n === 0 && Date.now() - m.at < 24 * 3600 * 1000;
    } catch (e) { return false; }
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
      rememberMine();
      renderBadge();
      renderList();
    }).catch(function () { /* offline or blocked: the button still works */ });
  }

  // ---- ui --------------------------------------------------------------------------------

  var DARK = '--fb-bg:#16181d;--fb-fg:#eceef1;--fb-mute:#9aa1ad;--fb-line:#2c313a;--fb-acc:#2dd4bf;--fb-acc-fg:#0b1f1d;--fb-bad:#f2b8b5;--fb-mark:#2dd4bf;--fb-soft:#22262d;--fb-on:#343a45;--fb-ph:#7d8591;--fb-ring:rgba(255,255,255,.1)';
  var THEME = pick('theme', ['auto', 'light', 'dark'], 'auto');
  var FAB_H = { small: 40, regular: 48, large: 58 }[SIZE];

  var CSS = [
    ':host{all:initial;--fb-bg:#fff;--fb-fg:#15171c;--fb-mute:#5b6472;--fb-line:#e3e6ea;--fb-acc:#0f766e;--fb-acc-fg:#fff;--fb-bad:#b42318;--fb-mark:#0b5e57;--fb-eye:#fff;--fb-soft:#f4f5f6;--fb-on:#fff;--fb-pick:var(--fb-acc);--fb-ph:#78818e;--fb-ring:rgba(16,24,40,.06);--fb-dot:#14b8a6;',
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
    '.fab.sz-small{padding:6px 10px;font-size:12.5px}.fab.sz-small svg{width:17px;height:17px}',
    '.fab.sz-large{padding:12px 18px;font-size:16px}.fab.sz-large svg{width:27px;height:27px}',
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
    'background:var(--fb-bg);border:1px solid var(--fb-line);border-radius:16px;box-shadow:0 12px 40px rgba(16,24,40,.22);animation:fb-in .25s ease-out}',
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
    '.intro .foot{margin-top:12px;padding:8px 0 0;border-top:1px solid var(--fb-line);text-align:left}',
    '@keyframes fb-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '@media (prefers-reduced-motion:reduce){.intro{animation:none}}',
    // offering help: the introduction's bubble; with no button to point at, it sits in its place
    '.intro.free:after{display:none}.intro.free.b{bottom:var(--fb-y)}.intro.free.t{top:var(--fb-y)}',
    '.mark{display:inline-flex;color:var(--fb-mark)}.mark svg{display:block}.eye{fill:var(--fb-eye)}',
    '.dot{width:8px;height:8px;border-radius:50%;background:var(--fb-acc)}',

    // the panel
    '.scrim{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:flex-end;padding:var(--fb-pad,16px)}',
    '.scrim.l{justify-content:flex-start}.scrim.c{justify-content:center}.scrim.t{align-items:flex-start}.scrim.side{align-items:center}',
    '.scrim.center{align-items:center;justify-content:center;padding:16px}.scrim.center.dim{background:rgba(0,0,0,.55)}',
    '.scrim.sheet{padding:0;align-items:stretch}',
    '.panel{animation:fb-rise .2s ease-out}.scrim.t .panel{animation-name:fb-drop}.scrim.center .panel,.scrim.side .panel{animation-name:fb-fade}',
    '@keyframes fb-rise{from{opacity:0;transform:translateY(8px)}}@keyframes fb-drop{from{opacity:0;transform:translateY(-8px)}}',
    '.scrim.clear{background:none}',
    '.scrim.anch{padding:0!important;display:block}.scrim.anch>.panel,.scrim.anch>.barbox{position:fixed;left:0;top:0}',
    '.scrim.bar.center{pointer-events:auto;background:rgba(0,0,0,.55)}.scrim.bar.center.clear{background:none}',
    '.scrim.bar.center.blur{background:rgba(0,0,0,.18);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}',
    '.scrim.blur{background:rgba(0,0,0,.18);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}',
    '.panel{width:min(var(--fb-w),100%);max-height:min(600px,calc(100vh - 32px));display:flex;flex-direction:column;overflow:hidden;background:var(--fb-bg);',
    'border-radius:16px;box-shadow:0 12px 40px rgba(16,24,40,.16),0 0 0 1px var(--fb-ring)}',
    '.sheet .panel{max-height:none;height:100%;border-radius:0}',
    '.grab{display:none;flex:none;height:22px}.grab i{display:block;width:40px;height:5px;border-radius:3px;background:var(--fb-line);margin:10px auto 0}',
    '@media (max-width:599px){.scrim.corner{padding:0!important;align-items:flex-end}.scrim.corner .panel{width:100%;max-height:92%;border-radius:22px 22px 0 0;animation-name:fb-sheet}.scrim.corner .grab{display:block}.scrim.sheet .panel{width:100%}}',
    '@keyframes fb-sheet{from{transform:translateY(40px)}}',
    '.view{display:flex;flex-direction:column;min-height:0;animation:fb-fade .16s}@keyframes fb-fade{from{opacity:0}}',
    '.hd{display:flex;align-items:center;flex:none;gap:8px;padding:14px 12px 8px 18px;min-height:56px}.hd.back{padding-left:8px}',
    '.hd h2{margin:0;font-size:16px;font-weight:650}.hd .mark svg{width:24px;height:24px}.sp{flex:1}',
    '.ib{flex:none;width:32px;height:32px;border:0;padding:0;border-radius:10px;display:grid;place-items:center;background:none;color:var(--fb-mute);cursor:pointer}',
    '.ib:hover,.quiet:hover{background:var(--fb-soft)}',
    '.quiet{display:flex;align-items:center;gap:6px;border:0;background:none;font-size:13px;font-weight:550;color:var(--fb-mute);padding:6px 9px;border-radius:9px;cursor:pointer}',
    '.ic{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;display:block}',
    '.udot{width:7px;height:7px;border-radius:50%;background:var(--fb-dot);flex:none}',
    'form.pad{padding:4px 18px;min-height:0;overflow-y:auto}',
    '.seg{display:flex;gap:2px;padding:3px;background:var(--fb-soft);border-radius:12px;margin-bottom:12px;overflow-x:auto;scrollbar-width:none}.seg::-webkit-scrollbar{display:none}',
    '.seg button{flex:1 0 auto;white-space:nowrap;border:0;background:none;cursor:pointer;font-size:13px;font-weight:550;color:var(--fb-mute);padding:8px 9px;border-radius:9px}',
    '.seg button[aria-checked=true]{background:var(--fb-on);color:var(--fb-pick);font-weight:650;box-shadow:0 1px 3px rgba(16,24,40,.14)}',
    '@media (max-width:440px){.seg button{padding:8px 6px;font-size:12.5px}}',
    'textarea{display:block;width:100%;min-height:112px;resize:none;border:1px solid var(--fb-line);border-radius:12px;padding:12px 14px;font-size:15px;line-height:1.45;background:none}',
    'textarea::placeholder,input::placeholder{color:var(--fb-ph);opacity:1}',
    'textarea:focus,input:focus{outline:0;border-color:var(--fb-acc);box-shadow:0 0 0 3px rgba(15,118,110,.14);box-shadow:0 0 0 3px color-mix(in srgb,var(--fb-acc) 16%,transparent)}',
    '.panel:focus{outline:0}',
    'button:focus:not(:focus-visible){outline:0}',
    'button:focus-visible,a:focus-visible{outline:2px solid var(--fb-acc);outline-offset:2px}',
    '.seg button:focus-visible{outline-offset:-2px}',
    '.send{display:grid;place-items:center;width:100%;height:46px;margin-top:12px;border:0;border-radius:12px;background:var(--fb-acc);color:var(--fb-acc-fg);font-weight:600;font-size:15px;cursor:pointer}',
    '.send:disabled{background:var(--fb-soft);color:var(--fb-ph);cursor:not-allowed}',
    '.send.busy{display:flex;align-items:center;justify-content:center;gap:7px;background:var(--fb-acc);color:var(--fb-acc-fg);cursor:default}',
    '.send .mark{color:var(--fb-acc-fg)}.send .mark svg{width:20px;height:20px}.send .eye{fill:var(--fb-acc)}',
    '.send.sm{display:inline-block;width:auto;height:auto;margin:0;padding:8px 14px;font-size:13px;border-radius:10px}',
    // The loader: the mark's eyes look left, look right, blink (brand/svg/loaders/heresay-loader-glance.svg, faster).
    '.glance svg *{transform-box:view-box}.glance .eyes{animation:fb-look 1.6s ease-in-out infinite}.glance .e{animation:fb-blink 1.6s infinite}',
    '@keyframes fb-look{0%,10%{transform:none}25%,40%{transform:translate(-9px,1px)}55%,70%{transform:translate(9px,-1px)}85%,100%{transform:none}}',
    '@keyframes fb-blink{0%,88%,96%,100%{transform:none}92%{transform:scaleY(.1)}}',
    '.err{color:var(--fb-bad);font-size:13px;margin-top:8px}.err:empty{display:none}',
    '.foot{flex:none;text-align:center;font-size:12px;color:var(--fb-mute);padding:12px 18px 14px}',
    '.foot a{color:inherit;text-decoration:none;font-weight:600}.foot a:hover{text-decoration:underline}',
    // sent
    '.sent{align-items:center;text-align:center;padding:10px 28px 6px}',
    '.chk{width:68px;height:68px;border-radius:50%;background:var(--fb-acc);display:grid;place-items:center;animation:fb-pop .35s cubic-bezier(.2,1.3,.4,1) both}',
    '.chk svg{width:36px;height:36px;fill:none;stroke:var(--fb-acc-fg);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}',
    '.chk path{stroke-dasharray:30;stroke-dashoffset:30;animation:fb-draw .3s .22s forwards}',
    '@keyframes fb-pop{from{transform:scale(.6);opacity:0}}@keyframes fb-draw{to{stroke-dashoffset:0}}',
    '.sent p{margin:18px 0 0;font-size:17px;font-weight:550;max-width:250px}',
    '.sent p.thanks{margin-top:8px;font-size:14px;font-weight:400;color:var(--fb-mute)}',
    '.sent .send{margin:20px 0 0}',
    // your reports
    '.cards{display:grid;gap:10px;padding:6px 18px;overflow-y:auto;min-height:0;align-content:start}',
    '.card{border:1px solid var(--fb-line);border-radius:14px;padding:13px 14px}',
    '.top{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--fb-mute);margin-bottom:6px}.top b{color:var(--fb-fg)}.top .udot{margin-left:auto}',
    '.card .t{margin:0;font-size:14px;white-space:pre-wrap;word-break:break-word}',
    '.chip{display:inline-flex;align-items:center;gap:5px;margin-top:10px;font-size:12px;font-weight:600;padding:4px 9px 4px 7px;border-radius:999px;background:var(--fb-soft);color:var(--fb-mute)}',
    '.chip .ic{width:13px;height:13px}.chip.fx{background:rgba(15,118,110,.1);background:color-mix(in srgb,var(--fb-acc) 12%,transparent);color:var(--fb-pick)}',
    '.n2{margin:8px 0 0;font-size:13px;color:var(--fb-mute)}.n2 b{color:var(--fb-fg)}',
    '.empty{color:var(--fb-mute);padding:12px 2px}',
    '.take-back{margin-top:8px}.take-back input{width:100%;height:36px;padding:0 10px;border:1px solid var(--fb-line);border-radius:10px;background:none;margin:4px 0}',
    '.take-back .row{margin-top:4px}',
    '.link{border:0;background:none;padding:0;cursor:pointer;color:var(--fb-mute);text-decoration:underline;font-size:12px}',
    '.row{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px}',
    '.small{font-size:12px;color:var(--fb-mute);margin:0}',
    '.prefs{flex:none;margin:8px 18px 0;border-top:1px solid var(--fb-line)}',
    '.prefs>button{display:flex;align-items:center;width:100%;border:0;background:none;cursor:pointer;padding:12px 2px;font-size:13px;font-weight:550;color:var(--fb-mute)}',
    '.prefs>button .ic{width:15px;height:15px;margin-left:auto;transition:transform .2s}.prefs>button[aria-expanded=true] .ic{transform:rotate(180deg)}',
    '.prefs>.signed{padding:12px 2px;font-size:13px;font-weight:550;color:var(--fb-mute)}',
    '.pb{padding-bottom:4px}',
    '.pb label{display:block;font-size:12px;color:var(--fb-mute);margin:0 0 4px 2px}',
    '.pb input{display:block;width:100%;height:40px;border:1px solid var(--fb-line);border-radius:10px;padding:0 12px;margin-bottom:10px;background:none}',
    '.pb .err{margin:-4px 0 8px}.pb .small{margin:-4px 0 8px 2px}',
    // layout: steps (what's going on? rows, then the text)
    '.ibd{position:relative}.ibd .udot{position:absolute;top:3px;right:3px;width:9px;height:9px;box-shadow:0 0 0 2px var(--fb-bg)}',
    '.hd h2.q{font-size:17px}',
    '.rows{list-style:none;margin:0;padding:4px 18px 2px;display:grid;gap:10px;overflow-y:auto;min-height:0}',
    '.pick{display:flex;align-items:center;gap:14px;width:100%;padding:9px 14px 9px 9px;border:1px solid var(--fb-line);border-radius:16px;background:none;cursor:pointer;font-size:16px;font-weight:600;text-align:left}',
    '@media (hover:hover){.pick:hover{background:var(--fb-soft)}}',
    '.pick .tile{flex:none;width:42px;height:42px;border-radius:12px;background:var(--fb-soft);display:grid;place-items:center}',
    '.pick .tile .ic{width:22px;height:22px}.pick .nm{flex:1;min-width:0}.pick .chev{color:var(--fb-mute);display:flex}.pick .chev .ic{width:18px;height:18px}',
    '.tpill{display:inline-flex;align-items:center;gap:6px;padding:6px 12px 6px 9px;border-radius:999px;background:var(--fb-soft);font-size:13px;font-weight:650}.tpill .ic{width:16px;height:16px}',
    'form.big textarea{min-height:132px}',
    // layout: bar (a compact composer beside the button; a docked bar on phones)
    '.scrim.bar{background:none;pointer-events:none;inset:0 0 var(--fb-kb,0px) 0}.scrim.bar>*{pointer-events:auto}',
    '.barbox{position:relative;width:min(var(--fb-w),100%);background:var(--fb-bg);border-radius:22px;padding:8px 8px 4px;box-shadow:0 12px 40px rgba(16,24,40,.18),0 0 0 1px var(--fb-ring);animation:fb-rise .2s ease-out}',
    '.barbox:focus{outline:0}.scrim.t .barbox{animation-name:fb-drop}',
    '.bin{display:flex;align-items:flex-end;gap:8px;margin:0}',
    '.tchip{display:flex;align-items:center;gap:6px;flex:none;max-width:52%;height:40px;padding:0 9px 0 12px;border:0;border-radius:14px;background:var(--fb-soft);font-size:14px;font-weight:650;cursor:pointer;white-space:nowrap}',
    '.tchip span{overflow:hidden;text-overflow:ellipsis}.tchip .ic{width:16px;height:16px;flex:none}.tchip .caret{color:var(--fb-mute)}',
    '.bin textarea{flex:1;min-width:0;height:40px;min-height:40px;max-height:120px;border:0;border-radius:0;padding:9px 2px;font-size:15px;line-height:22px;overflow-y:auto}',
    '.bin textarea:focus{box-shadow:none;border:0}',
    '.bsend{flex:none;display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:50%;background:var(--fb-acc);color:var(--fb-acc-fg);cursor:pointer}',
    '.bsend:disabled{background:var(--fb-soft);color:var(--fb-ph);cursor:not-allowed}.bsend.busy{cursor:default}.bsend .ic{width:20px;height:20px;stroke-width:2.2}',
    '.bsend .mark{color:var(--fb-acc-fg)}.bsend .mark svg{width:22px;height:22px}.bsend .eye{fill:var(--fb-acc)}',
    '.bmeta{display:flex;align-items:center;gap:4px;padding:2px 0 0}.bmeta .ib{width:32px;height:32px}.bmeta .foot2{font-size:12px;color:var(--fb-mute);padding-right:4px}',
    '.bmeta .foot2 a{color:inherit;text-decoration:none;font-weight:600}.bmeta .foot2 a:hover{text-decoration:underline}',
    '.barbox .err{margin:2px 4px 0}',
    '.bmenu{position:absolute;left:0;bottom:calc(100% + 8px);min-width:210px;max-width:100%;padding:6px;background:var(--fb-bg);border-radius:18px;box-shadow:0 12px 40px rgba(16,24,40,.18),0 0 0 1px var(--fb-ring);animation:fb-fade .12s}',
    '.scrim.t .bmenu{bottom:auto;top:calc(100% + 8px)}',
    '.bmenu button{display:flex;align-items:center;gap:12px;width:100%;border:0;background:none;padding:10px 12px;border-radius:12px;font-size:15px;font-weight:550;text-align:left;cursor:pointer}',
    '@media (hover:hover){.bmenu button:hover{background:var(--fb-soft)}}',
    '.bmenu button:focus-visible{outline:0;background:var(--fb-soft);box-shadow:inset 0 0 0 2px var(--fb-acc)}.bmenu button[aria-checked=true]{font-weight:700}.bmenu .ic{width:20px;height:20px}',
    '.bsent{display:flex;align-items:center;gap:12px;padding:6px 6px 6px 8px}.bsent .chk{width:36px;height:36px;flex:none}.bsent .chk svg{width:20px;height:20px}',
    '.bsent p{flex:1;margin:0;font-size:14px;font-weight:550;min-width:0}.bsent .send.sm{flex:none}',
    '@media (max-width:599px){.scrim.bar{padding:0!important;align-items:flex-end}.scrim.bar .barbox{width:100%;border-radius:22px 22px 0 0;padding-bottom:calc(6px + env(safe-area-inset-bottom));animation-name:fb-sheet}.scrim.t.bar .bmenu{top:auto;bottom:calc(100% + 8px)}}',
    '@media (prefers-reduced-motion:reduce){.panel,.barbox,.bmenu,.view,.chk,.chk path,.glance .eyes,.glance .e,.intro{animation:none!important}.chk path{stroke-dashoffset:0}.prefs>button .ic{transition:none}}',
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

  var MARK_BODY = 'M174 100L177 105L180 110L181 116L180 121L178 126L174 131L169 134L164 137L159 139L154 141L149 143L146 146L143 149L141 154L139 159L137 164L134 169L131 174L126 178L121 180L116 181L110 180L105 177L100 174L95 170L91 167L87 164L83 163L79 162L74 162L69 163L63 164L57 164L51 164L46 162L41 159L38 154L36 149L36 143L36 137L37 131L38 126L38 121L37 117L36 113L33 109L30 105L26 100L23 95L20 90L19 84L20 79L22 74L26 69L31 66L36 63L41 61L46 59L51 57L54 54L57 51L59 46L61 41L63 36L66 31L69 26L74 22L79 20L84 19L90 20L95 23L100 26L105 30L109 33L113 36L117 37L121 38L126 38L131 37L137 36L143 36L149 36L154 38L159 41L162 46L164 51L164 57L164 63L163 69L162 74L162 79L163 83L164 87L167 91L170 95Z';
  var MARK_EYE = 'M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z';
  var EYE_A = 'translate(80 106) rotate(-24) scale(1.25)', EYE_B = 'translate(124 101) rotate(-24) scale(1.25)';

  /** The Heresay mark, compact: a soft wave with quote-mark eyes. Drawn from a constant string.
   *  `glance` makes it the loader: the eyes look left, look right, blink. */
  function markEl(glance) {
    var s = document.createElement('span');
    s.className = glance ? 'mark glance' : 'mark';
    s.innerHTML = '<svg viewBox="0 0 200 200" width="22" height="22" aria-hidden="true"><path d="' + MARK_BODY + '" fill="currentColor"/><g class="eyes">' +
      '<g class="e" style="transform-origin:80px 106px"><path class="eye" d="' + MARK_EYE + '" transform="' + EYE_A + '"/></g>' +
      '<g class="e" style="transform-origin:124px 101px"><path class="eye" d="' + MARK_EYE + '" transform="' + EYE_B + '"/></g></g></svg>';
    return s;
  }

  /**
   * `data-heresay-mark` on any element of the host page (an empty span inside the app's own
   * button): filled with the Heresay mark, 1em square, hidden from screen readers. Coloured with
   * the accent (data-accent, unless data-mark="heresay"), or with the text colour when the
   * attribute is "currentColor". The eyes are real holes (a mask), so it sits on any background.
   * Elements added later are filled too. Nothing without the attribute is touched.
   */
  var markSeq = 0;
  function fillMark(n) {
    if (n.getAttribute('data-heresay-filled') != null) return;
    n.setAttribute('data-heresay-filled', '');
    var id = 'heresay-m' + (++markSeq), acc = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(attr('accent')) && pick('mark', ['accent', 'heresay'], 'accent') === 'accent' ? attr('accent') : '#0b5e57';
    var col = (n.getAttribute('data-heresay-mark') || '').trim().toLowerCase() === 'currentcolor' ? 'currentColor' : acc;
    n.setAttribute('aria-hidden', 'true');
    n.style.display = 'inline-flex'; n.style.width = '1em'; n.style.height = '1em'; n.style.verticalAlign = '-0.125em'; n.style.color = col;
    n.innerHTML = '<svg viewBox="0 0 200 200" width="1em" height="1em" aria-hidden="true" focusable="false" style="display:block"><mask id="' + id + '"><rect width="200" height="200" fill="#fff"/>' +
      '<path d="' + MARK_EYE + '" transform="' + EYE_A + '" fill="#000"/><path d="' + MARK_EYE + '" transform="' + EYE_B + '" fill="#000"/></mask>' +
      '<path d="' + MARK_BODY + '" fill="currentColor" mask="url(#' + id + ')"/></svg>';
  }
  function fillMarks(root) {
    if (root.nodeType !== 1) return;
    if (root.hasAttribute('data-heresay-mark')) fillMark(root);
    var all = root.querySelectorAll ? root.querySelectorAll('[data-heresay-mark]') : [];
    for (var k = 0; k < all.length; k++) fillMark(all[k]);
  }
  function watchMarks() {
    fillMarks(document.documentElement);
    if (window.MutationObserver) new MutationObserver(function (ms) {
      for (var a = 0; a < ms.length; a++) for (var b = 0; b < ms[a].addedNodes.length; b++) fillMarks(ms[a].addedNodes[b]);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  watchMarks();

  var PLACE = POS.join(' ') + (STYLE === 'tab' ? ' side' : '');
  var fabDot = el('span', { class: 'dot', hidden: '' });
  var fab = el('button', {
    class: ['fab', PLACE, 'st-' + STYLE, 'sz-' + SIZE, 'sh-' + pick('shadow', ['soft', 'none', 'strong'], 'soft'),
      pick('fill', ['neutral', 'accent'], 'neutral') === 'accent' ? 'fill' : '', BUTTON === 'desktop' ? 'desktop' : ''].join(' '),
    type: 'button', 'aria-haspopup': 'dialog', title: S.reportAria + ' · ' + S.powered,
    onclick: function () { if (scrim) close(); else open(); },
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
    if (off && nudgeEl) { nudgeEl.remove(); nudgeEl = null; }
  }
  /** Can the reporter see the button right now? The introduction points at it. */
  function fabShowing() {
    return BUTTON !== 'none' && fab.isConnected && !fab.hasAttribute('hidden') && getComputedStyle(fab).display !== 'none';
  }
  // Single-page apps change the path without reloading; check cheaply, only when paths are listed.
  if (HIDE_ON.length) setInterval(function () { if (location.pathname !== lastPath) placeFab(); }, 500);

  var scrim = null, view = 'new', listBox = null, lastFocus = null, hdDot = null, hdMine = null;
  // Whether "Your name and email" is expanded. Only openPreferences() or the reporter opens it.
  var prefsOpen = false;

  function renderBadge() {
    var n = unseen();
    if (n) fabDot.removeAttribute('hidden'); else fabDot.setAttribute('hidden', '');
    fab.setAttribute('aria-label', n ? fmt(S.update, { n: n }) : S.reportAria);
    if (hdDot) { hdDot.hidden = !n; if (hdMine) hdMine.setAttribute('aria-label', n ? fmt(S.mineAria, { n: n }) : S.mine); }
  }
  renderBadge();

  /**
   * Where the panel sits follows the button: the same corner or edge, with room left for the button
   * so it never covers it, and the same offset. With no button (none, data-button="none") it takes
   * the corner the position names, bottom-right by default.
   */
  function panelPad() {
    var shown = fabShowing(), tab = shown && STYLE === 'tab';
    var gap = shown && !tab ? FAB_H + 8 : 0;
    var x = Math.max(12, OFFSET[0]), y = Math.max(12, OFFSET[1]);
    var side = tab ? 48 : POS[0] === 'c' ? 12 : x;
    var top = POS[1] === 't' && !tab ? y + gap : 12, bottom = POS[1] === 'b' && !tab ? y + gap : 12;
    return top + 'px ' + (POS[0] === 'r' ? side : 12) + 'px ' + bottom + 'px ' + (POS[0] === 'l' ? side : 12) + 'px';
  }

  function open(which, o) {
    if (dead) return;
    if (scrim) { if (which) { view = which; renderPanel(); } return; }
    if (bubble) { bubble.remove(); bubble = null; }
    if (nudgeEl) { nudgeEl.remove(); nudgeEl = null; }
    o = o || {};
    anchor = o.corner ? null : detect(o.anchor);
    cornerOpen = !!o.corner;
    lastFocus = anchor && anchor.el ? anchor.el : document.activeElement;
    view = which || (unseen() ? 'mine' : 'new');
    scrim = el('div', { class: surface(), onclick: function (e) {
      if (e.target !== scrim || Date.now() - menuClosedAt < 600) return;
      if (!barUp() || scrim.classList.contains('center')) close();
    } });
    scrim.style.setProperty('--fb-pad', panelPad());
    scrim.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    root.appendChild(scrim);
    window.addEventListener('scroll', queue, true);
    window.addEventListener('resize', queue);
    if (LAYOUT === 'bar' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', keyboard);
      window.visualViewport.addEventListener('scroll', keyboard);
      keyboard();
    }
    renderPanel();
    refresh();
  }

  /** The bar is a small non-modal composer; Your reports (and everything else) is the panel. */
  function barUp() { return LAYOUT === 'bar' && view !== 'mine'; }
  function surface() {
    var m = opensAs();
    if (barUp()) return 'scrim bar ' + (m === 'anchor' ? 'anch' : m === 'dock' ? 'c' : m === 'center' ? 'center ' + BACKDROP : PLACE);
    var cls = LAYOUT === 'bar' ? '' : PANEL === 'center' ? 'center' : PANEL === 'sheet' ? PLACE + ' sheet' : '';
    if (!cls) cls = m === 'anchor' ? 'anch' : m === 'center' ? 'center' : PLACE + ' corner';
    return 'scrim ' + cls + ' ' + (cls === 'anch' ? 'clear' : BACKDROP);
  }

  // ---- where the panel opens ---------------------------------------------------------------
  // Beside the floating button. From the app's own trigger (the element just clicked, a
  // [data-heresay-open] element, or open({ anchor })): a centred window with the page dimmed (the bar
  // docks at the bottom centre), or next to the trigger with data-panel="beside". Centred when code
  // opened it with no click and there is no button. A bottom sheet on phones.
  // data-panel sheet, center and corner always win.
  var recent = null;       // the last trusted pointer or key target: { el, rect, t }
  var anchor = null;       // the trigger of the open panel: { el, rect }
  var cornerOpen = false;  // opened from the nudge: the corner it sits in
  var closedBy = null;     // an outside click just closed the panel: { el, t }
  var menuClosedAt = 0;
  var INTERACTIVE = 'a,button,[role=button],[role=menuitem],[data-heresay-open]';

  function rectOf(n) {
    var r = n.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }
  function pathOf(e) { return e.composedPath ? e.composedPath() : [e.target]; }
  function markTrigger(e) {
    if (!e.isTrusted) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    var p = pathOf(e);
    if (p.indexOf(host) >= 0) { recent = null; return; }
    var t = p[0];
    if (!t || t.nodeType !== 1) t = e.target;
    if (!t || !t.closest) return;
    t = t.closest(INTERACTIVE) || t;
    if (t === document.body || t === document.documentElement) { recent = null; return; }
    recent = { el: t, rect: rectOf(t), t: Date.now() };
  }
  function anchorFrom(a) {
    if (!a) return null;
    if (a.nodeType === 1) return a === host ? null : { el: a, rect: rectOf(a) };
    var l = +(a.left != null ? a.left : a.x), t = +(a.top != null ? a.top : a.y);
    var w = a.width != null ? +a.width : +a.right - l, h = a.height != null ? +a.height : +a.bottom - t;
    if (!isFinite(l + t + w + h)) return null;
    return { el: null, rect: { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h } };
  }
  function detect(explicit) {
    var a = anchorFrom(explicit);
    if (a) return a;
    return recent && Date.now() - recent.t < 1000 ? { el: recent.el, rect: recent.rect } : null;
  }
  /** After an outside click closed the panel on this trigger, the click that follows must not reopen it. */
  function toggledOff(el) {
    var t = el || (recent && recent.el);
    return !!(closedBy && closedBy.el && t === closedBy.el && Date.now() - closedBy.t < 700);
  }
  function opensAs() {
    if (media('(max-width:599px)')) return 'corner';
    if (anchor && PANEL !== 'corner') return PANEL === 'beside' ? 'anchor' : LAYOUT === 'bar' ? 'dock' : 'center';
    return cornerOpen || fabShowing() ? 'corner' : 'center';
  }
  function rectNow() {
    if (anchor.el && anchor.el.isConnected) {
      var r = rectOf(anchor.el);
      if (r.width || r.height) anchor.rect = r;
    }
    return anchor.rect;
  }
  var ro = null, raf = 0;
  function queue() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; place(); }); }
  /** Put the panel beside the trigger, away from the nearest screen edge, fully on screen. */
  function place() {
    if (!scrim || !anchor || !scrim.classList.contains('anch')) return;
    var box = scrim.firstElementChild;
    if (!box) return;
    var vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight, M = 12, G = 10;
    var w = Math.min(WIDTH, vw - 2 * M);
    box.style.width = w + 'px';
    box.style.maxHeight = Math.min(600, vh - 2 * M) + 'px';
    var h = box.offsetHeight, r = rectNow();
    var room = { right: vw - r.right, left: r.left, below: vh - r.bottom, above: r.top };
    var away = { left: 'right', right: 'left', top: 'below', bottom: 'above' };
    var edges = { left: r.left, right: vw - r.right, top: r.top, bottom: vh - r.bottom };
    var near = Object.keys(edges).sort(function (a, b) { return edges[a] - edges[b]; })[0];
    var sides = [away[near]].concat(['right', 'left', 'below', 'above'].filter(function (s) { return s !== away[near]; })
      .sort(function (a, b) { return room[b] - room[a]; }));
    var fits = function (s) { return room[s] >= ((s === 'right' || s === 'left') ? w : h) + G + M; };
    var side = sides.filter(fits)[0] || sides.slice().sort(function (a, b) { return room[b] - room[a]; })[0];
    var x, y;
    if (side === 'right' || side === 'left') {
      x = side === 'right' ? r.right + G : r.left - G - w;
      y = r.top + r.height / 2 > vh / 2 ? r.bottom - h : r.top;
    } else {
      y = side === 'below' ? r.bottom + G : r.top - G - h;
      x = r.left + r.width / 2 < vw / 2 ? r.left : r.right - w;
    }
    x = Math.max(M, Math.min(x, vw - M - w));
    y = Math.max(M, Math.min(y, vh - M - h));
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    scrim.classList.toggle('t', y + h / 2 < vh / 2);
    if (typeof ResizeObserver === 'function') {
      if (!ro) ro = new ResizeObserver(queue);
      ro.disconnect();
      ro.observe(box);
    }
  }

  ['pointerdown', 'click', 'keydown'].forEach(function (t) { document.addEventListener(t, markTrigger, true); });
  // A press outside the panel closes it (the bar's type menu first). The draft and type are kept.
  // Presses inside Heresay's own shadow DOM never count; its dimmed backdrop closes through its own click.
  document.addEventListener('pointerdown', function (e) {
    if (!scrim || !e.isTrusted) return;
    var path = pathOf(e), mine = path.indexOf(host) >= 0;
    if (barMenuClose) {
      var inMenu = path.some(function (n) { return n && n.classList && (n.classList.contains('bmenu') || n.classList.contains('tchip')); });
      if (!inMenu && barMenuClose()) { menuClosedAt = Date.now(); return; }
    }
    if (mine) return;
    closedBy = { el: recent && recent.el, t: Date.now() };
    close('outside');
  }, true);
  // Any element with data-heresay-open opens the panel from itself; the value may be a type.
  document.addEventListener('click', function (e) {
    var p = pathOf(e);
    if (p.indexOf(host) >= 0) return;
    var t = null;
    for (var i = 0; i < p.length && !t; i++) if (p[i] && p[i].nodeType === 1 && p[i].hasAttribute('data-heresay-open')) t = p[i];
    if (!t) return;
    if (t.tagName === 'A' && (!t.hasAttribute('href') || t.getAttribute('href') === '#')) e.preventDefault();
    if (scrim) { close(); return; }
    if (toggledOff(t)) return;
    window.Heresay.open({ type: (t.getAttribute('data-heresay-open') || '').toLowerCase().trim(), anchor: t });
  }, true);
  /** On a phone the bar docks above the keyboard: lift it by what the keyboard covers. */
  function keyboard() {
    if (!scrim) return;
    var v = window.visualViewport;
    scrim.style.setProperty('--fb-kb', Math.max(0, Math.round(window.innerHeight - v.height - v.offsetTop)) + 'px');
  }

  function close(how) {
    if (!scrim) return;
    if (view === 'mine') markSeen();
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', keyboard);
      window.visualViewport.removeEventListener('scroll', keyboard);
    }
    scrim.remove();
    scrim = null;
    window.removeEventListener('scroll', queue, true);
    window.removeEventListener('resize', queue);
    if (ro) ro.disconnect();
    anchor = null;
    barMenuClose = null;
    listBox = null; hdDot = null; hdMine = null;
    state.justSent = false;
    prefsOpen = false;
    // Only an unsent message is kept. A type picked with nothing written is dropped, so the next
    // report never opens with last time's choice already selected.
    if (!String(state.draft || '').trim()) { state.type = null; state.draft = ''; }
    renderBadge();
    if (how !== 'outside' && lastFocus && lastFocus.focus && lastFocus.isConnected !== false) lastFocus.focus();
  }

  var CLOSE_ICON = 'M6 6l12 12M18 6L6 18';
  /** A small line icon. The path is always one of the constants in this file. */
  function icon(d) {
    var s = document.createElement('span');
    s.style.display = 'contents';
    s.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (d.charAt(0) === '<' ? d : '<path d="' + d + '"/>') + '</svg>';
    return s.firstChild;
  }
  function closeBtn() {
    return el('button', { class: 'ib', type: 'button', 'aria-label': S.close, onclick: close }, [icon(CLOSE_ICON)]);
  }
  /** One line, on every view: who reads it, and the outside tool. Not configurable. */
  function foot(short) {
    return el('div', { class: 'foot' }, [
      short ? null : document.createTextNode(S.sentTo + ' · '),
      el('a', { href: HERESAY_URL, target: '_blank', rel: 'noopener', text: S.powered }),
    ]);
  }

  function renderPanel() {
    if (view === 'sent' && !state.justSent) view = 'new';
    scrim.textContent = '';
    scrim.className = surface();
    barMenuClose = null;
    hdDot = hdMine = null;
    if (barUp()) { renderBar(); place(); return; }
    var body, first, picking = LAYOUT === 'steps' && view === 'new' && !state.type;
    if (view === 'sent') body = sentView();
    else if (view === 'mine') body = listView();
    else body = LAYOUT === 'steps' ? stepsView() : formView();
    var panel = el('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': S.dialog, tabindex: '-1' }, [
      el('div', { class: 'grab', 'aria-hidden': 'true' }, [el('i')]), body, foot(picking),
    ]);
    scrim.appendChild(panel);
    place();
    renderBadge();
    first = panel.querySelector(view === 'sent' ? '.send' : view === 'mine' ? '.ib' : state.type ? 'textarea' : picking ? '.pick' : '[role=radio]');
    // On touch, a focused pill or row would look picked before anyone tapped it: focus the dialog itself.
    if (first && (first.getAttribute('role') === 'radio' || first.classList.contains('pick')) && media('(pointer: coarse)')) first = panel;
    if (first) first.focus();
  }

  /** A report goes: the same for every layout. `busy` and `idle` change the send control. */
  function submit(text, err, busy, idle) {
    err.textContent = '';
    busy();
    var type = state.type;
    send(type, text.value.trim()).then(function (b) {
      state.type = null;
      state.draft = '';
      state.reports = [b.report].concat(state.reports);
      rememberMine();
      state.justSent = true;
      view = 'sent';
      renderPanel();
      listeners.forEach(function (fn) { try { fn({ id: b.report && b.report.id, type: type }); } catch (x) { console.error(x); } });
    }).catch(function (x) {
      err.textContent = x.message || S.cantSend;
      idle();
    });
  }
  function typeOf(id) { return OFFERED.filter(function (x) { return x.id === id; })[0]; }

  function formView() {
    var err = el('div', { class: 'err', role: 'alert' });
    var text = el('textarea', {
      'aria-label': S.reportLabel, maxlength: '2000', rows: '4',
      oninput: function () { state.draft = text.value; sync(); },
    });
    text.value = state.draft;
    var sendBtn = el('button', { class: 'send', type: 'submit', text: S.send });
    function sync() {
      var t = typeOf(state.type);
      text.placeholder = PLACEHOLDER || (t ? t.ph : S.phNone);
      sendBtn.disabled = !(state.type && text.value.trim());
    }
    function choose(i, focusText) {
      state.type = OFFERED[i].id;
      pills.forEach(function (b, j) { b.setAttribute('aria-checked', String(j === i)); b.tabIndex = j === i ? 0 : -1; });
      sync();
      pills[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (focusText) text.focus();
    }
    var picked = OFFERED.map(function (t) { return t.id; }).indexOf(state.type);
    var pills = OFFERED.map(function (t, i) {
      return el('button', {
        type: 'button', role: 'radio', 'aria-checked': String(i === picked), tabindex: i === (picked < 0 ? 0 : picked) ? '0' : '-1',
        'data-type': t.id, text: t.label,
        onclick: function () { choose(i, true); },
      });
    });
    var seg = el('div', {
      class: 'seg', role: 'radiogroup', 'aria-label': S.kindAria,
      onkeydown: function (e) {
        var i = pills.indexOf(root.activeElement), n = pills.length, k = e.key;
        if (i < 0) return;
        var to = k === 'ArrowRight' || k === 'ArrowDown' ? (i + 1) % n : k === 'ArrowLeft' || k === 'ArrowUp' ? (i + n - 1) % n : -1;
        if (to < 0) return;
        e.preventDefault();
        pills[to].focus();
        choose(to);
      },
    }, pills);
    sync();
    return el('div', { class: 'view' }, [
      el('div', { class: 'hd' }, [
        markEl(), el('h2', { text: S.report }), el('span', { class: 'sp' }),
        mineBtn(), closeBtn(),
      ]),
      el('form', {
        class: 'pad', novalidate: '',
        onsubmit: function (e) {
          e.preventDefault();
          if (sendBtn.disabled) return;
          submit(text, err, function () {
            sendBtn.disabled = true;
            sendBtn.className = 'send busy';
            sendBtn.replaceChildren(markEl(true), document.createTextNode(S.sending));
          }, function () {
            sendBtn.className = 'send';
            sendBtn.textContent = S.send;
            sync();
          });
        },
      }, [seg, text, sendBtn, err]),
    ]);
  }

  // ---- the layouts -----------------------------------------------------------------------

  var TYPE_ICON = {
    broken: '<path d="M12 4 21.2 19.5H2.8z"/><path d="M12 10v4M12 17h.01"/>',
    confusing: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.6a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1 1-1.1 1.8M12 17h.01"/>',
    improvement: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    idea: '<path d="M9.6 18h4.8M10.2 21h3.6"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.2 1.1 2.2h5c0-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
  };
  function typeIcon(id) { return icon(TYPE_ICON[id] || TYPE_ICON.idea); }

  /** The "Your reports" icon (a clock) with a dot when something has an update. Steps and bar. */
  function mineIcon() {
    hdDot = el('i', { class: 'udot', hidden: '' });
    hdMine = el('button', { class: 'ib ibd', type: 'button', 'aria-label': S.mine, title: S.mine,
      onclick: function () { view = 'mine'; renderPanel(); } }, [icon(DONE_ICON.open), hdDot]);
    return hdMine;
  }

  /** Steps: first "What's going on?" with a row for each type, then the text box for the one picked. */
  function stepsView() {
    if (!state.type) {
      return el('div', { class: 'view' }, [
        el('div', { class: 'hd' }, [markEl(), el('h2', { class: 'q', text: S.whatsGoing }), el('span', { class: 'sp' }), mineIcon(), closeBtn()]),
        el('ul', { class: 'rows', role: 'list', 'aria-label': S.kindAria }, OFFERED.map(function (t) {
          return el('li', {}, [el('button', {
            class: 'pick', type: 'button', 'data-type': t.id,
            onclick: function () { state.type = t.id; renderPanel(); },
          }, [
            el('span', { class: 'tile' }, [typeIcon(t.id)]), el('span', { class: 'nm', text: t.label }),
            el('span', { class: 'chev', 'aria-hidden': 'true' }, [icon('M9 6l6 6-6 6')]),
          ])]);
        })),
      ]);
    }
    var t = typeOf(state.type);
    var err = el('div', { class: 'err', role: 'alert' });
    var text = el('textarea', {
      'aria-label': S.reportLabel, maxlength: '2000', rows: '4',
      placeholder: PLACEHOLDER || t.ph,
      oninput: function () { state.draft = text.value; sync(); },
    });
    text.value = state.draft;
    var sendBtn = el('button', { class: 'send', type: 'submit', text: S.send });
    function sync() { sendBtn.disabled = !text.value.trim(); }
    sync();
    return el('div', { class: 'view' }, [
      el('div', { class: 'hd back' }, [
        el('button', { class: 'ib', type: 'button', 'aria-label': S.backType, title: S.backType, onclick: function () { state.type = null; renderPanel(); } }, [icon('M15 5l-7 7 7 7')]),
        el('span', { class: 'tpill' }, [typeIcon(t.id), document.createTextNode(t.label)]),
        el('span', { class: 'sp' }), mineIcon(), closeBtn(),
      ]),
      el('form', {
        class: 'pad big', novalidate: '',
        onsubmit: function (e) {
          e.preventDefault();
          if (sendBtn.disabled) return;
          submit(text, err, function () {
            sendBtn.disabled = true;
            sendBtn.className = 'send busy';
            sendBtn.replaceChildren(markEl(true), document.createTextNode(S.sending));
          }, function () {
            sendBtn.className = 'send';
            sendBtn.textContent = S.send;
            sync();
          });
        },
      }, [text, sendBtn, err]),
    ]);
  }

  // Closes the bar's type menu and says whether it was open; set while the bar is showing.
  var barMenuClose = null;

  /** Bar: one compact composer. [Type v] [text.....] (send), then Your reports, Powered by, close. */
  function renderBar() {
    var box, focus;
    var wrap = function (kids) {
      return el('div', { class: 'barbox', role: 'dialog', 'aria-modal': 'false', 'aria-label': S.dialog, tabindex: '-1' }, kids);
    };
    if (view === 'sent') {
      box = wrap([el('div', { class: 'bsent', role: 'status' }, [
        el('div', { class: 'chk', 'aria-hidden': 'true' }, [icon('M5 12.5l4.5 4.5L19 7.5')]),
        el('p', { text: THANKS || S.sentBar }),
        el('button', { class: 'send sm', type: 'button', text: S.done, onclick: close }),
      ])]);
      scrim.appendChild(box);
      focus = box.querySelector('.send');
    } else {
      var err = el('div', { class: 'err', role: 'alert' });
      var text = el('textarea', {
        'aria-label': S.reportLabel, maxlength: '2000', rows: '1',
        oninput: function () { state.draft = text.value; grow(); sync(); },
        onkeydown: function (e) {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : go(); }
        },
      });
      text.value = state.draft;
      var go = function () { form.dispatchEvent(new Event('submit', { cancelable: true })); };
      var sendBtn = el('button', { class: 'bsend', type: 'submit', 'aria-label': S.send, title: S.send }, [icon('M12 19V5M5 12l7-7 7 7')]);
      var chip = el('button', { class: 'tchip', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
      var menu = el('div', { class: 'bmenu', role: 'menu', 'aria-label': S.kindAria, hidden: '' });
      var items = OFFERED.map(function (t) {
        return el('button', { type: 'button', role: 'menuitemradio', tabindex: '-1', 'data-type': t.id, 'aria-checked': 'false' },
          [typeIcon(t.id), document.createTextNode(t.label)]);
      });
      items.forEach(function (b, i) { b.addEventListener('click', function () { choose(i); }); menu.appendChild(b); });
      var grow = function () {
        text.style.height = 'auto';
        text.style.height = Math.min(text.scrollHeight, 120) + 'px';
      };
      var sync = function () {
        var t = typeOf(state.type);
        text.placeholder = PLACEHOLDER || (t ? t.ph : S.tellTeam);
        sendBtn.disabled = !(state.type && text.value.trim());
        chip.textContent = '';
        if (t) chip.appendChild(typeIcon(t.id));
        chip.appendChild(el('span', { text: t ? t.label : S.typeChip }));
        chip.appendChild(el('span', { class: 'caret' }, [icon('M6 9l6 6 6-6')]));
        chip.setAttribute('aria-label', S.kindAria + (t ? ': ' + t.label : ''));
        items.forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-type') === state.type)); });
      };
      var shut = function (back) {
        if (menu.hidden) return false;
        menu.hidden = true; chip.setAttribute('aria-expanded', 'false');
        if (back) chip.focus();
        return true;
      };
      var show = function (last) {
        menu.hidden = false; chip.setAttribute('aria-expanded', 'true');
        var at = Math.max(0, OFFERED.map(function (t) { return t.id; }).indexOf(state.type));
        items[last ? items.length - 1 : at].focus();
      };
      barMenuClose = shut;
      var choose = function (i) {
        state.type = OFFERED[i].id;
        shut(false); sync(); text.focus();
      };
      chip.addEventListener('click', function () { if (menu.hidden) show(); else shut(true); });
      chip.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); show(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); show(true); }
      });
      menu.addEventListener('keydown', function (e) {
        var i = items.indexOf(root.activeElement), n = items.length, k = e.key;
        if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(true); }
        else if (k === 'Tab') shut(false);
        else if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End') {
          e.preventDefault();
          items[k === 'Home' ? 0 : k === 'End' ? n - 1 : k === 'ArrowDown' ? (i + 1) % n : (i + n - 1) % n].focus();
        }
      });
      var form = el('form', {
        class: 'bin', novalidate: '',
        onsubmit: function (e) {
          e.preventDefault();
          if (sendBtn.disabled) return;
          submit(text, err, function () {
            sendBtn.disabled = true; sendBtn.classList.add('busy'); text.readOnly = true;
            sendBtn.replaceChildren(markEl(true));
            sendBtn.setAttribute('aria-label', S.sending);
          }, function () {
            sendBtn.classList.remove('busy'); text.readOnly = false;
            sendBtn.replaceChildren(icon('M12 19V5M5 12l7-7 7 7'));
            sendBtn.setAttribute('aria-label', S.send);
            sync();
          });
        },
      }, [chip, text, sendBtn]);
      box = wrap([menu, form, err, el('div', { class: 'bmeta' }, [
        mineIcon(), el('span', { class: 'sp' }),
        el('span', { class: 'foot2' }, [el('a', { href: HERESAY_URL, target: '_blank', rel: 'noopener', text: S.powered })]),
        closeBtn(),
      ])]);
      scrim.appendChild(box);
      sync(); grow();
      // On touch, a focused chip would look pressed before anyone tapped it: focus the bar itself.
      focus = state.type ? text : media('(pointer: coarse)') ? box : chip;
    }
    renderBadge();
    if (focus) focus.focus();
  }

  /** The quiet "Your reports" button in the header, with a dot when something has an update. */
  function mineBtn() {
    hdDot = el('i', { class: 'udot', hidden: '' });
    hdMine = el('button', { class: 'quiet', type: 'button', onclick: function () { view = 'mine'; renderPanel(); } },
      [document.createTextNode(S.mine), hdDot]);
    return hdMine;
  }

  function sentView() {
    return el('div', { class: 'view' }, [
      el('div', { class: 'hd' }, [el('span', { class: 'sp' }), closeBtn()]),
      el('div', { class: 'view sent', role: 'status' }, [
        el('div', { class: 'chk', 'aria-hidden': 'true' }, [icon('M5 12.5l4.5 4.5L19 7.5')]),
        el('p', { text: S.sentMsg }),
        THANKS ? el('p', { class: 'thanks', text: THANKS }) : null,
        el('button', { class: 'send', type: 'button', text: S.done, onclick: close }),
      ]),
    ]);
  }

  function listView() {
    listBox = el('div', { class: 'cards' });
    renderList();
    return el('div', { class: 'view' }, [
      el('div', { class: 'hd back' }, [
        el('button', { class: 'ib', type: 'button', 'aria-label': S.back, onclick: function () { markSeen(); view = 'new'; renderPanel(); } }, [icon('M15 5l-7 7 7 7')]),
        el('h2', { text: S.mine }), el('span', { class: 'sp' }), closeBtn(),
      ]),
      listBox,
      PREFS_ROW ? prefsRow() : null,
    ]);
  }

  /**
   * "Your name and email": two optional fields, kept on this device and sent with each report.
   * Signed in (the app called identify), it only says who, and asks for nothing.
   */
  function prefsRow() {
    if (identified()) {
      return el('div', { class: 'prefs' }, [el('div', { class: 'signed', text: fmt(S.signedAs, { who: state.userLabel || state.userEmail || S.yourAccount }) })]);
    }
    var p = prefs();
    var name = el('input', { id: 'fb-name', type: 'text', maxlength: '80', autocomplete: 'name' });
    var email = el('input', { id: 'fb-email', type: 'email', maxlength: '200', autocomplete: 'email' });
    var status = el('p', { class: 'small', role: 'status' });
    var err = el('div', { class: 'err', role: 'alert' });
    name.value = p.name || ''; email.value = p.email || '';
    function keep() {
      var em = email.value.trim(), ok = !em || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
      err.textContent = ok ? '' : S.badEmail;
      if (!ok) { status.textContent = ''; return; }
      var q = prefs();
      savePrefs({ name: name.value.trim(), email: em, note: q.note });
      status.textContent = S.saved;
    }
    name.addEventListener('change', keep);
    email.addEventListener('change', keep);
    var box = el('div', { class: 'pb', id: 'fb-pb', hidden: '' }, [
      el('label', { for: 'fb-name', text: S.nameOpt }), name,
      el('label', { for: 'fb-email', text: S.emailOpt }), email, err, status,
    ]);
    var btn = el('button', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'fb-pb' }, [
      document.createTextNode(S.nameEmail), icon('M6 9l6 6 6-6'),
    ]);
    function setOpen(o, focus) {
      prefsOpen = o;
      btn.setAttribute('aria-expanded', String(o));
      if (o) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
      if (o && focus) name.focus();
    }
    btn.addEventListener('click', function () { setOpen(!prefsOpen, true); });
    setOpen(prefsOpen, false);
    return el('div', { class: 'prefs' }, [btn, box]);
  }

  var DONE_ICON = { open: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', fixed: 'M5 12.5l4.5 4.5L19 7.5', declined: 'M7 7l10 10M17 7L7 17', withdrawn: 'M7 12h10' };
  /** "Today", "Yesterday", or the date, in the reporter's language. */
  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
    try {
      if (days >= 0 && days <= 1) {
        var w = new Intl.RelativeTimeFormat(LANG, { numeric: 'auto' }).format(-days, 'day');
        return w.charAt(0).toLocaleUpperCase(LANG) + w.slice(1);
      }
    } catch (e) { /* older browser: the date */ }
    return d.toLocaleDateString(LANG);
  }

  function renderList() {
    if (!listBox) return;
    listBox.textContent = '';
    if (!state.reports.length) {
      listBox.appendChild(el('div', { class: 'empty', text: S.none }));
      return;
    }
    var s = seen();
    state.reports.forEach(function (r) {
      var label = (TYPES.filter(function (t) { return t.id === r.type; })[0] || {}).label || r.type;
      var fresh = r.status !== 'open' && r.status !== 'withdrawn' && s[r.id] !== mark(r);
      var d = DONE_ICON[r.status === 'accepted' ? 'open' : r.status];
      listBox.appendChild(el('article', { class: 'card' }, [
        el('div', { class: 'top' }, [
          el('b', { text: label }), el('span', { text: '·' }), el('span', { text: when(r.created_at) }),
          fresh ? el('i', { class: 'udot', role: 'img', 'aria-label': S.fresh }) : null,
        ]),
        el('p', { class: 't', text: r.text }),
        el('span', { class: 'chip' + (r.status === 'fixed' ? ' fx' : '') }, [d ? icon(d) : null, document.createTextNode(S.status[r.status] || r.status)]),
        r.status === 'declined' && r.decline_reason
          ? el('p', { class: 'n2' }, [el('b', { text: S.why }), document.createTextNode(r.decline_reason)]) : null,
        r.status === 'fixed' && r.fix_note ? el('p', { class: 'n2', text: r.fix_note }) : null,
        r.status === 'fixed' && r.fix_version
          ? el('p', { class: 'n2', text: fmt(S.fixedIn, { v: r.fix_version }) + (older(state.version, r.fix_version) ? ' ' + fmt(S.updateTo, { v: r.fix_version }) : '') }) : null,
        r.status === 'withdrawn' && r.withdrawn_reason ? el('p', { class: 'n2', text: S.yourWhy + r.withdrawn_reason }) : null,
        r.status === 'open' ? takeBack(r) : null,
      ]));
    });
  }


  /** "Take back": a report they sent and the team hasn't accepted. Kept as withdrawn, not deleted. */
  function takeBack(r) {
    var box = el('div', { class: 'take-back' });
    function ask() {
      box.textContent = '';
      var why = el('input', { type: 'text', maxlength: '500', placeholder: S.takeBackWhy, 'aria-label': S.takeBackWhy });
      var err = el('div', { class: 'err', role: 'alert' });
      box.appendChild(el('p', { class: 'small', text: S.takeBackAsk }));
      box.appendChild(why);
      box.appendChild(el('div', { class: 'row' }, [
        el('button', { class: 'link', type: 'button', text: S.keep, onclick: idle }),
        el('button', { class: 'send sm', type: 'button', text: S.takeBackYes, onclick: function () {
          withdrawReport(r.id, why.value.trim()).then(function (b) {
            state.reports = state.reports.map(function (x) { return x.id === r.id ? b.report : x; });
            markSeen();
            renderList();
          }).catch(function (x) { err.textContent = x.message || S.cantSend; });
        } }),
      ]));
      box.appendChild(err);
      why.focus();
    }
    function idle() {
      box.textContent = '';
      box.appendChild(el('button', { class: 'link', type: 'button', text: S.takeBack, onclick: ask }));
    }
    idle();
    return box;
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
    bubble = el('div', { class: 'intro ' + PLACE + ' st-' + STYLE, role: 'dialog', 'aria-label': S.introAria }, [
      el('b', { text: words(o.title, 80) || S.introTitle }),
      el('p', { text: words(o.body, 280) || S.introBody }),
      el('div', { class: 'row' }, [el('span'), el('button', { class: 'send sm', type: 'button', text: S.got, onclick: done })]),
      foot(),
    ]);
    bubble.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(); });
    root.appendChild(bubble);
    return true;
  }

  // ---- offering help: the note -----------------------------------------------------------

  // Someone seems stuck (data-nudge), or the app says so (nudge()). A note by the button, which
  // takes no focus and goes by itself after 15 s unless it is being read. "Tell the team" opens
  // the form as Broken, with the trail. At most once per tab; "Not now" only closes it.
  var NUDGE_TAB = 'fbsdk.nudged.' + KEY;
  var nudgeEl = null;
  /** True if this tab was already offered help; otherwise marks it. */
  function offeredInTab() {
    try {
      if (PREVIEW) throw 0;
      if (sessionStorage.getItem(NUDGE_TAB)) return true;
      sessionStorage.setItem(NUDGE_TAB, '1');
    } catch (e) {
      if (mem[NUDGE_TAB]) return true;
      mem[NUDGE_TAB] = '1';
    }
    return false;
  }
  /** `kind`: 'broken' (something failed; opens as Broken) or 'stuck' (they seem unsure; Confusing). */
  function offerHelp(kind) {
    var stuck = kind === 'stuck';
    if (dead || scrim || bubble || nudgeEl || !host.isConnected || hiddenHere() || document.visibilityState === 'hidden') return false;
    if (offeredInTab()) return false;
    var timer = null;
    var done = function () {
      clearTimeout(timer);
      if (nudgeEl) { nudgeEl.remove(); nudgeEl = null; }
    };
    var later = function () { clearTimeout(timer); timer = setTimeout(done, 15000); };
    var stay = function () { clearTimeout(timer); };
    nudgeEl = el('div', {
      class: 'intro nudge ' + PLACE + ' st-' + STYLE + (fabShowing() ? '' : ' free'),
      role: 'status', 'aria-label': S.nudgeAria,
      onpointerenter: stay, onpointerleave: later, onfocusin: stay, onfocusout: later,
      onkeydown: function (e) { if (e.key === 'Escape') done(); },
    }, [
      el('b', { text: stuck ? S.nudgeStuckTitle : S.nudgeTitle }),
      el('p', { text: stuck ? S.nudgeStuckBody : S.nudgeBody }),
      el('div', { class: 'row' }, [
        el('button', { class: 'link', type: 'button', text: S.nudgeNo, onclick: function () { done(); } }),
        el('button', { class: 'send sm', type: 'button', text: S.nudgeYes, onclick: function () {
          done();
          var as = stuck ? 'confusing' : 'broken';
          if (!state.type && OFFERED.some(function (t) { return t.id === as; })) state.type = as;
          open('new', { corner: true });
        } }),
      ]),
      foot(),
    ]);
    root.appendChild(nudgeEl);
    later();
    return true;
  }

  function mount() {
    if (dead) return;
    versionSeen(state.version);
    if (!host.isConnected) document.body.appendChild(host);
    placeFab();
    if (!mineIsEmptyAndFresh()) refresh();
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
      if (scrim && view === 'mine') renderPanel();
    },
    setVersion: function (v) { state.version = v != null ? String(v) : null; versionSeen(state.version); },
    setScreen: function (s) {
      state.screen = s != null ? String(s) : null;
      if (state.screen) { note('page', state.screen); visited('screen:' + state.screen); }
    },
    /** Open the report form. { type, text } fill it in; the reporter still reviews and sends. */
    open: function (o) {
      o = o || {};
      if (!o.anchor && toggledOff()) return;
      if (OFFERED.some(function (t) { return t.id === o.type; })) state.type = o.type;
      if (o.text != null) state.draft = String(o.text).slice(0, 2000);
      open('new', { anchor: o.anchor });
    },
    openPreferences: function () { if (PREFS_ROW) { prefsOpen = true; open('mine'); } },
    /** Show the one-time introduction now. False if it was already shown on this device. */
    introduce: function (o) { return introduce(o); },
    /** The app saw trouble itself (an error screen, a retry that failed): offer to report it.
     *  { stuck: true } for someone who seems unsure ("Stuck on something?", opens as Confusing).
     *  Works without data-nudge; the same limits apply. False if it did not show. */
    nudge: function (o) { return offerHelp(o && o.stuck ? 'stuck' : 'broken'); },
    /** on('sent', fn): fn({ id, type }) after each report is sent. Returns a function that stops it. */
    on: function (event, fn) {
      if (event !== 'sent' || typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    close: function () { close(); },
  };
})();
