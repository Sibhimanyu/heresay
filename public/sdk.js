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
      attachedPrefs: 'This page, the app version, device details and your preferences are attached.',
      attached: 'This page, the app version and device details are attached.',
      types: {
        broken: ['Broken', 'Something does not work'],
        confusing: ['Confusing', 'I could not tell how to do something'],
        improvement: ['Could be better', 'It works, but it could be better'],
        idea: ['Idea', 'Something that does not exist yet'],
      },
      status: { open: 'Waiting for the developer', accepted: 'Accepted, being worked on', fixed: 'Fixed', declined: 'Declined', withdrawn: 'You took this back' },
      takeBack: 'Take back', takeBackAsk: 'Take this back? It isn’t deleted: the team sees you withdrew it.', takeBackWhy: 'Why? (optional)', takeBackYes: 'Take it back', keep: 'Keep it', yourWhy: 'Your reason: ',
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
      attachTrail: 'Attach what happened',
      trailHint: 'Recent pages, clicks and errors in this app. Never what you typed.',
      seeTrail: 'See it', alsoSent: 'Also sent: ',
      trail: { page: ['page', 'pages'], click: ['click', 'clicks'], request: ['failed request', 'failed requests'], error: ['error', 'errors'], warn: ['warning', 'warnings'], state: ['device event', 'device events'] },
      nudgeStuckTitle: 'Stuck on something?', nudgeStuckBody: 'If something here isn’t clear, tell the team. A real person reads it.', nudgeAria: 'Offer to report a problem', nudgeTitle: 'Something not working?', nudgeBody: 'Tell the team what happened. A real person reads it.', nudgeYes: 'Tell the team', nudgeNo: 'Not now',
      fixedIn: 'Fixed in version {v}.', updateTo: 'Update to {v} to get it.',
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
      attachedPrefs: 'Cette page, la version de l’app, les détails de l’appareil et vos préférences sont joints.',
      attached: 'Cette page, la version de l’app et les détails de l’appareil sont joints.',
      types: {
        broken: ['Cassé', 'Quelque chose ne marche pas'],
        confusing: ['Déroutant', 'Je ne voyais pas comment faire'],
        improvement: ['Pourrait être mieux', 'Ça marche, mais ça pourrait être mieux'],
        idea: ['Idée', 'Quelque chose qui n’existe pas encore'],
      },
      status: { open: 'En attente de l’équipe', accepted: 'Accepté, en cours', fixed: 'Corrigé', declined: 'Refusé', withdrawn: 'Vous l’avez retiré' },
      takeBack: 'Retirer', takeBackAsk: 'Retirer ce signalement ? Il n’est pas supprimé : l’équipe voit que vous l’avez retiré.', takeBackWhy: 'Pourquoi ? (facultatif)', takeBackYes: 'Le retirer', keep: 'Le garder', yourWhy: 'Votre raison : ',
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
      attachTrail: 'Joindre ce qui s’est passé',
      trailHint: 'Pages, clics et erreurs récents dans cette app. Jamais ce que vous avez saisi.',
      seeTrail: 'Voir', alsoSent: 'Aussi envoyé : ',
      trail: { page: ['page', 'pages'], click: ['clic', 'clics'], request: ['requête échouée', 'requêtes échouées'], error: ['erreur', 'erreurs'], warn: ['avertissement', 'avertissements'], state: ['événement de l’appareil', 'événements de l’appareil'] },
      nudgeStuckTitle: 'Bloqué quelque part ?', nudgeStuckBody: 'Si quelque chose n’est pas clair ici, dites-le à l’équipe. Une vraie personne le lit.', nudgeAria: 'Proposition de signaler un problème', nudgeTitle: 'Quelque chose ne marche pas ?', nudgeBody: 'Dites à l’équipe ce qui s’est passé. Une vraie personne le lit.', nudgeYes: 'Signaler', nudgeNo: 'Pas maintenant',
      fixedIn: 'Corrigé dans la version {v}.', updateTo: 'Passez à la {v} pour en profiter.',
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
      attachedPrefs: 'இந்தப் பக்கம், ஆப் பதிப்பு, சாதன விவரங்கள் மற்றும் உங்கள் விருப்பங்கள் இணைக்கப்படும்.',
      attached: 'இந்தப் பக்கம், ஆப் பதிப்பு மற்றும் சாதன விவரங்கள் இணைக்கப்படும்.',
      types: {
        broken: ['வேலை செய்யவில்லை', 'ஏதோ ஒன்று சரியாக இயங்கவில்லை'],
        confusing: ['குழப்பமாக உள்ளது', 'எப்படிச் செய்வது என்று புரியவில்லை'],
        improvement: ['இன்னும் சிறப்பாக்கலாம்', 'வேலை செய்கிறது, ஆனால் மேம்படுத்தலாம்'],
        idea: ['யோசனை', 'இன்னும் இல்லாத ஒன்று'],
      },
      status: { open: 'டெவலப்பருக்காகக் காத்திருக்கிறது', accepted: 'ஏற்கப்பட்டது, வேலை நடக்கிறது', fixed: 'சரிசெய்யப்பட்டது', declined: 'நிராகரிக்கப்பட்டது', withdrawn: 'நீங்கள் திரும்பப் பெற்றீர்கள்' },
      takeBack: 'திரும்பப் பெறு', takeBackAsk: 'இதைத் திரும்பப் பெறவா? இது நீக்கப்படாது: நீங்கள் திரும்பப் பெற்றதைக் குழு பார்க்கும்.', takeBackWhy: 'ஏன்? (விருப்பத்தேர்வு)', takeBackYes: 'திரும்பப் பெறு', keep: 'வைத்திரு', yourWhy: 'உங்கள் காரணம்: ',
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
      attachTrail: 'என்ன நடந்தது என்பதையும் இணை',
      trailHint: 'இந்த ஆப்பில் சமீபத்திய பக்கங்கள், கிளிக்குகள், பிழைகள். நீங்கள் தட்டச்சு செய்தது ஒருபோதும் இல்லை.',
      seeTrail: 'பார்', alsoSent: 'இவையும் அனுப்பப்படும்: ',
      trail: { page: ['பக்கம்', 'பக்கங்கள்'], click: ['கிளிக்', 'கிளிக்குகள்'], request: ['தோல்வியடைந்த கோரிக்கை', 'தோல்வியடைந்த கோரிக்கைகள்'], error: ['பிழை', 'பிழைகள்'], warn: ['எச்சரிக்கை', 'எச்சரிக்கைகள்'], state: ['சாதன நிகழ்வு', 'சாதன நிகழ்வுகள்'] },
      nudgeStuckTitle: 'எங்காவது சிக்கிக்கொண்டீர்களா?', nudgeStuckBody: 'இங்கே ஏதாவது புரியவில்லை என்றால், குழுவிடம் சொல்லுங்கள். ஒருவர் அதைப் படிப்பார்.', nudgeAria: 'சிக்கலைத் தெரிவிக்க ஒரு அழைப்பு', nudgeTitle: 'ஏதாவது வேலை செய்யவில்லையா?', nudgeBody: 'என்ன நடந்தது என்று குழுவிடம் சொல்லுங்கள். ஒருவர் அதைப் படிப்பார்.', nudgeYes: 'குழுவிடம் சொல்', nudgeNo: 'இப்போது வேண்டாம்',
      fixedIn: 'பதிப்பு {v} இல் சரிசெய்யப்பட்டது.', updateTo: 'இதைப் பெற {v} க்குப் புதுப்பிக்கவும்.',
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
      attachedPrefs: 'यह पेज, ऐप का वर्शन, डिवाइस की जानकारी और आपकी प्राथमिकताएँ साथ भेजी जाती हैं।',
      attached: 'यह पेज, ऐप का वर्शन और डिवाइस की जानकारी साथ भेजी जाती है।',
      types: {
        broken: ['टूटा हुआ', 'कुछ काम नहीं कर रहा'],
        confusing: ['उलझन भरा', 'समझ नहीं आया कि कैसे करें'],
        improvement: ['बेहतर हो सकता है', 'काम करता है, पर बेहतर हो सकता है'],
        idea: ['सुझाव', 'कुछ ऐसा जो अभी नहीं है'],
      },
      status: { open: 'डेवलपर का इंतज़ार', accepted: 'स्वीकार, इस पर काम चल रहा है', fixed: 'ठीक हो गया', declined: 'अस्वीकार', withdrawn: 'आपने इसे वापस ले लिया' },
      takeBack: 'वापस लें', takeBackAsk: 'इसे वापस लें? यह हटाया नहीं जाएगा: टीम देखेगी कि आपने इसे वापस लिया।', takeBackWhy: 'क्यों? (वैकल्पिक)', takeBackYes: 'वापस लें', keep: 'रहने दें', yourWhy: 'आपकी वजह: ',
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
      attachTrail: 'क्या हुआ, वह भी भेजें',
      trailHint: 'इस ऐप में हाल के पेज, क्लिक और त्रुटियाँ। आपने जो टाइप किया, वह कभी नहीं।',
      seeTrail: 'देखें', alsoSent: 'यह भी भेजा जाता है: ',
      trail: { page: ['पेज', 'पेज'], click: ['क्लिक', 'क्लिक'], request: ['विफल अनुरोध', 'विफल अनुरोध'], error: ['त्रुटि', 'त्रुटियाँ'], warn: ['चेतावनी', 'चेतावनियाँ'], state: ['डिवाइस घटना', 'डिवाइस घटनाएँ'] },
      nudgeStuckTitle: 'कहीं अटक गए?', nudgeStuckBody: 'अगर यहाँ कुछ साफ़ नहीं है, तो टीम को बताइए। इसे कोई इंसान पढ़ता है।', nudgeAria: 'समस्या बताने का सुझाव', nudgeTitle: 'कुछ काम नहीं कर रहा?', nudgeBody: 'टीम को बताइए क्या हुआ। इसे कोई इंसान पढ़ता है।', nudgeYes: 'टीम को बताएँ', nudgeNo: 'अभी नहीं',
      fixedIn: 'वर्शन {v} में ठीक किया गया।', updateTo: 'इसे पाने के लिए {v} पर अपडेट करें।',
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
    // The reporter's say over the trail: all of it off, or some kinds left out.
    trailOff: false,
    trailSkip: {},
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
   * and sent only with a report, only if the reporter leaves "Attach what happened" on. Never what anyone typed, never request
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
  var visits = [], typedAt = 0;
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
  /** What goes with the report: the kinds the reporter kept, ages in seconds before now. */
  function trailToSend() {
    if (state.trailOff) return null;
    var now = Date.now();
    var t = recentTrail().filter(function (e) { return !state.trailSkip[e.kind]; }).map(function (e) {
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
          var t0 = Date.now();
          p.then(function (res) {
            if (!res.ok && res.type !== 'opaque') { note('request', method + ' ' + shortUrl(url) + ' → ' + res.status + took(t0)); requestFailed(res.status); }
            else { slow(method, url, res.status, t0); if (method !== 'GET' && method !== 'HEAD') sentSomething(); }
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
          var aborted = false, t0 = Date.now();
          x.addEventListener('abort', function () { aborted = true; });
          x.addEventListener('loadend', function () {
            if (x.status >= 400) { note('request', r.m + ' ' + shortUrl(r.u) + ' → ' + x.status + took(t0)); requestFailed(x.status); }
            else if (x.status === 0 && !aborted) { note('request', r.m + ' ' + shortUrl(r.u) + ' → failed (network error)' + took(t0)); requestFailed(0); }
            else if (x.status) { slow(r.m, r.u, x.status, t0); if (r.m !== 'GET' && r.m !== 'HEAD') sentSomething(); }
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
   * At most once per tab, and not for 7 days after "Not now".
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

  // Unsure, not blocked. Anything sent (a form, a request that changes something) means they
  // got there, so it starts these over.
  var sentAt = 0;
  function sentSomething() { sentAt = Date.now(); visits = []; typedAt = 0; }
  document.addEventListener('submit', function (e) { if (!host.contains(e.target)) sentSomething(); }, true);

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
    // offering help: the introduction's bubble; with no button to point at, it sits in its place
    '.intro.free:after{display:none}.intro.free.b{bottom:var(--fb-y)}.intro.free.t{top:var(--fb-y)}',
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
    '.send.busy{opacity:1;display:inline-flex;align-items:center;gap:7px}.send .mark{color:var(--fb-acc-fg)}.send .mark svg{width:20px;height:20px}.send .eye{fill:var(--fb-acc)}',
    // The loader: the mark's eyes look left, look right, blink (brand/svg/loaders/heresay-loader-glance.svg, faster).
    '.glance svg *{transform-box:view-box}.glance .eyes{animation:fb-look 1.6s ease-in-out infinite}.glance .e{animation:fb-blink 1.6s infinite}',
    '@keyframes fb-look{0%,10%{transform:none}25%,40%{transform:translate(-9px,1px)}55%,70%{transform:translate(9px,-1px)}85%,100%{transform:none}}',
    '@keyframes fb-blink{0%,88%,96%,100%{transform:none}92%{transform:scaleY(.1)}}',
    '@media (prefers-reduced-motion:reduce){.glance .eyes,.glance .e{animation:none}}',
    '.err{color:var(--fb-bad);font-size:13px;margin-top:8px}',
    // the trail
    '.trail{margin-top:10px}',
    '.switch{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600}',
    '.switch input{appearance:none;-webkit-appearance:none;margin:0;flex:none;width:30px;height:18px;border-radius:999px;background:var(--fb-line);position:relative;cursor:pointer;transition:background .15s}',
    '.switch input:after{content:"";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s}',
    '.switch input:checked{background:var(--fb-acc)}.switch input:checked:after{left:14px}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}',
    '.chip{border:1px solid var(--fb-line);background:none;border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer;color:var(--fb-mute);text-decoration:line-through}',
    '.chip[aria-pressed=true]{border-color:var(--fb-acc);color:var(--fb-fg);text-decoration:none}',
    '.trail.off .chips,.trail.off details{display:none}',
    '.trail summary{cursor:pointer;font-size:12px;color:var(--fb-mute)}',
    '.trail details .small{margin:6px 0}',
    '.tlist{list-style:none;margin:0;padding:0;max-height:140px;overflow:auto;font-size:12px}',
    '.tlist li{display:flex;gap:8px;padding:2px 0;word-break:break-word}.tlist li.skip{opacity:.4;text-decoration:line-through}',
    '.tlist .ago{flex:none;color:var(--fb-mute);font-variant-numeric:tabular-nums}',
    '@media (prefers-reduced-motion:reduce){.switch input,.switch input:after{transition:none}}',
    '.thanks{padding:10px 12px;margin:0 0 8px;border-radius:10px;background:var(--fb-line)}',
    '.item{border-top:1px solid var(--fb-line);padding:10px 0}',
    '.item:first-child{border-top:0}',
    '.take-back{margin-top:6px}.take-back input{width:100%;padding:7px 9px;border:1px solid var(--fb-line);border-radius:8px;background:none;margin:4px 0}',
    '.take-back .row{margin-top:4px;justify-content:flex-end}',
    '.status{font-size:12px;font-weight:600}',
    '.status.fixed,.status.accepted{color:var(--fb-fg)}',
    '.reason{margin-top:4px;padding:8px;border-radius:8px;background:var(--fb-line);font-size:13px}',
    '.text{margin:2px 0;white-space:pre-wrap;word-break:break-word}',
    '.empty{color:var(--fb-mute);padding:12px 0}',
    // Always shown: people should be able to tell this is an outside tool, and who reads it.
    '.by{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px;padding-top:10px;',
    'border-top:1px solid var(--fb-line);font-size:11.5px;color:var(--fb-mute)}',
    '.by a{display:inline-flex;align-items:center;gap:4px;margin-left:auto;color:inherit;text-decoration:none;font-weight:600;white-space:nowrap}',
    '.by a:hover{text-decoration:underline}.by .mark svg{width:16px;height:16px}',
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

  /** The Heresay mark, compact: a soft wave with quote-mark eyes. Drawn from a constant string.
   *  `glance` makes it the loader: the eyes look left, look right, blink. */
  function markEl(glance) {
    var s = document.createElement('span');
    s.className = glance ? 'mark glance' : 'mark';
    s.innerHTML = '<svg viewBox="0 0 200 200" width="22" height="22" aria-hidden="true"><path d="M174 100L177 105L180 110L181 116L180 121L178 126L174 131L169 134L164 137L159 139L154 141L149 143L146 146L143 149L141 154L139 159L137 164L134 169L131 174L126 178L121 180L116 181L110 180L105 177L100 174L95 170L91 167L87 164L83 163L79 162L74 162L69 163L63 164L57 164L51 164L46 162L41 159L38 154L36 149L36 143L36 137L37 131L38 126L38 121L37 117L36 113L33 109L30 105L26 100L23 95L20 90L19 84L20 79L22 74L26 69L31 66L36 63L41 61L46 59L51 57L54 54L57 51L59 46L61 41L63 36L66 31L69 26L74 22L79 20L84 19L90 20L95 23L100 26L105 30L109 33L113 36L117 37L121 38L126 38L131 37L137 36L143 36L149 36L154 38L159 41L162 46L164 51L164 57L164 63L163 69L162 74L162 79L163 83L164 87L167 91L170 95Z" fill="currentColor"/><g class="eyes"><g class="e" style="transform-origin:80px 106px"><path class="eye" d="M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z" transform="translate(80 106) rotate(-24) scale(1.25)"/></g><g class="e" style="transform-origin:124px 101px"><path class="eye" d="M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z" transform="translate(124 101) rotate(-24) scale(1.25)"/></g></g></svg>';
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
    if (off && nudgeEl) { nudgeEl.remove(); nudgeEl = null; }
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
    if (nudgeEl) { nudgeEl.remove(); nudgeEl = null; }
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
        sendBtn.className = 'send busy';
        sendBtn.replaceChildren(markEl(true), document.createTextNode(S.sending));
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
          sendBtn.className = 'send';
          sendBtn.textContent = S.send;
        });
      },
    }, [
      el('fieldset', {}, [el('legend', { text: S.what })].concat(types)),
      text,
      trailView(),
      el('div', { class: 'row' }, [
        el('span', { class: 'small', text: reporter() ? S.attachedPrefs : S.attached }),
        sendBtn,
      ]),
      err,
    ]);
    return form;
  }

  /**
   * "Attach what happened": the reporter sees what the trail holds, can look at every line of it,
   * and can switch it off or leave a part out. Nothing shows when there is nothing to attach.
   */
  function trailView() {
    var ev = recentTrail();
    if (!ev.length) return null;
    var count = {};
    ev.forEach(function (e) { count[e.kind] = (count[e.kind] || 0) + e.n; });
    var box = el('div', { class: 'trail' + (state.trailOff ? ' off' : '') });
    var on = el('input', { type: 'checkbox', role: 'switch', onchange: function () {
      state.trailOff = !on.checked;
      box.className = 'trail' + (state.trailOff ? ' off' : '');
    } });
    on.checked = !state.trailOff;
    var chips = ['page', 'click', 'request', 'error', 'warn', 'state'].filter(function (k) { return count[k]; }).map(function (k) {
      var n = count[k];
      var b = el('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(!state.trailSkip[k]),
        text: n + ' ' + S.trail[k][n === 1 ? 0 : 1],
        onclick: function () {
          state.trailSkip[k] = !state.trailSkip[k];
          b.setAttribute('aria-pressed', String(!state.trailSkip[k]));
          list.querySelectorAll('[data-k="' + k + '"]').forEach(function (li) { li.classList.toggle('skip', !!state.trailSkip[k]); });
        },
      });
      return b;
    });
    var now = Date.now();
    var list = el('ol', { class: 'tlist' }, ev.map(function (e) {
      var secs = Math.round((now - e.at) / 1000);
      return el('li', { 'data-k': e.kind, class: state.trailSkip[e.kind] ? 'skip' : '' }, [
        el('span', { class: 'ago', text: '-' + Math.floor(secs / 60) + ':' + ('0' + secs % 60).slice(-2) }),
        el('span', { text: e.text + (e.n > 1 ? ' ×' + e.n : '') }),
      ]);
    }));
    box.appendChild(el('label', { class: 'switch' }, [on, el('span', { text: S.attachTrail })]));
    box.appendChild(el('div', { class: 'chips' }, chips));
    var c = context();
    var device = [c.device, c.screen, c.theme, c.locale, c.timezone, c.network, c.settings].filter(Boolean).join(' · ');
    box.appendChild(el('details', {}, [el('summary', { text: S.seeTrail }), el('p', { class: 'small', text: S.trailHint }), list,
      device ? el('p', { class: 'small', text: S.alsoSent + device }) : null]));
    return box;
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
      var fresh = r.status !== 'open' && r.status !== 'withdrawn' && s[r.id] !== mark(r);
      listBox.appendChild(el('div', { class: 'item' }, [
        el('div', { class: 'status ' + r.status, text: (fresh ? '● ' : '') + (S.status[r.status] || r.status) }),
        el('div', { class: 'text', text: r.text }),
        el('div', { class: 'small', text: label + ' · ' + new Date(r.created_at).toLocaleDateString(LANG) }),
        r.status === 'declined' && r.decline_reason
          ? el('div', { class: 'reason', text: S.why + r.decline_reason }) : null,
        r.status === 'fixed' && r.fix_note
          ? el('div', { class: 'reason', text: r.fix_note }) : null,
        r.status === 'fixed' && r.fix_version
          ? el('div', { class: 'small', text: fmt(S.fixedIn, { v: r.fix_version }) + (older(state.version, r.fix_version) ? ' ' + fmt(S.updateTo, { v: r.fix_version }) : '') }) : null,
        r.status === 'withdrawn' && r.withdrawn_reason ? el('div', { class: 'small', text: S.yourWhy + r.withdrawn_reason }) : null,
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
        el('button', { class: 'send', type: 'button', text: S.takeBackYes, onclick: function () {
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

  // ---- offering help: the note -----------------------------------------------------------

  // Someone seems stuck (data-nudge), or the app says so (nudge()). A note by the button, which
  // takes no focus and goes by itself after 15 s unless it is being read. "Tell the team" opens
  // the form as Broken, with the trail. At most once per tab; "Not now" quiets it for 7 days.
  var NUDGE_NO = 'fbsdk.nudge.no.' + KEY, NUDGE_TAB = 'fbsdk.nudged.' + KEY, NUDGE_REST = 7 * 864e5;
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
    if (Date.now() - (+load(NUDGE_NO) || 0) < NUDGE_REST) return false;
    if (offeredInTab()) return false;
    var timer = null;
    var done = function (no) {
      clearTimeout(timer);
      if (no) save(NUDGE_NO, String(Date.now()));
      if (nudgeEl) { nudgeEl.remove(); nudgeEl = null; }
    };
    var later = function () { clearTimeout(timer); timer = setTimeout(function () { done(false); }, 15000); };
    var stay = function () { clearTimeout(timer); };
    nudgeEl = el('div', {
      class: 'intro nudge ' + PLACE + ' st-' + STYLE + (fabShowing() ? '' : ' free'),
      role: 'status', 'aria-label': S.nudgeAria,
      onpointerenter: stay, onpointerleave: later, onfocusin: stay, onfocusout: later,
      onkeydown: function (e) { if (e.key === 'Escape') done(true); },
    }, [
      el('b', { text: stuck ? S.nudgeStuckTitle : S.nudgeTitle }),
      el('p', { text: stuck ? S.nudgeStuckBody : S.nudgeBody }),
      el('div', { class: 'row' }, [
        el('button', { class: 'link', type: 'button', text: S.nudgeNo, onclick: function () { done(true); } }),
        el('button', { class: 'send', type: 'button', text: S.nudgeYes, onclick: function () {
          done(false);
          var as = stuck ? 'confusing' : 'broken';
          if (!state.type && OFFERED.some(function (t) { return t.id === as; })) state.type = as;
          open('new');
        } }),
      ]),
      byline(false),
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
    setVersion: function (v) { state.version = v != null ? String(v) : null; versionSeen(state.version); },
    setScreen: function (s) {
      state.screen = s != null ? String(s) : null;
      if (state.screen) { note('page', state.screen); visited('screen:' + state.screen); }
    },
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
    close: close,
  };
})();
