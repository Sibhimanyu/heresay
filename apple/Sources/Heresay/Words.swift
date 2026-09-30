import Foundation

/// Every piece of text Heresay shows, in each language it speaks. The same words as the web SDK
/// (`public/sdk.js`), where the two say the same thing.
enum W: String, CaseIterable {
    case report, reportA11y, reportA11yUpdate, menuItem
    case introTitle, introBody, reachMenu, reachClick, reachTap, reachUse, tryIt, gotIt
    case tabReport, tabMine, tabPrefs
    case sendFeedback, straightToApp, straightToTeam, close, cancel, done, send, sending, sendHelp
    case attachedPrefs, attached, whatIsIt, whatHappened, placeholder
    case broken, brokenHint, brokenAsk, confusing, confusingHint, confusingAsk
    case improvement, improvementHint, improvementAsk, idea, ideaHint, ideaAsk
    case sentTitle, sentBody, sendAnother, seeReports
    case none, why, statusOpen, statusAccepted, statusFixed, statusDeclined
    case you, signedInAs, yourAccount, seesReply, sees, name, email, optional, aboutYou
    case emailHint, emailBad, yourSetup, setupPrompt, setupLabel, setupFooter, clearAll
    case powered
}

struct Words: Sendable {
    let lang: String

    /// The app's own language by default, so Heresay speaks like the app around it.
    init(_ preferred: String?) {
        let tries = preferred.map { [$0] } ?? (Bundle.main.preferredLocalizations + Locale.preferredLanguages)
        lang = tries.lazy.map { String($0.lowercased().prefix(2)) }.first { Words.tables[$0] != nil } ?? "en"
    }

    subscript(_ k: W) -> String { Words.tables[lang]?[k] ?? Words.tables["en"]![k]! }
    func callAsFunction(_ k: W, _ args: [String: String] = [:]) -> String {
        args.reduce(self[k]) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) }
    }

    static let languages = ["en", "fr", "ta", "hi"]

    static let tables: [String: [W: String]] = ["en": en, "fr": fr, "ta": ta, "hi": hi]

    static let en: [W: String] = [
        .report: "Report", .reportA11y: "Report a problem", .reportA11yUpdate: "Report a problem. You have an update.",
        .menuItem: "Report a Problem…",
        .introTitle: "Help make this app better",
        .introBody: "{reach} to share an idea or tell the team what you’d change. A real person reads every report, and you’ll see what happens to yours.",
        .reachMenu: "Choose Help › Report a Problem… (⌥⌘R) any time", .reachClick: "Click {label} any time",
        .reachTap: "Tap {label} in the corner any time", .reachUse: "Use {label} any time",
        .tryIt: "Try it", .gotIt: "Got it",
        .tabReport: "Report", .tabMine: "Your reports", .tabPrefs: "Preferences",
        .sendFeedback: "Send feedback", .straightToApp: "Straight to the {app} team", .straightToTeam: "Straight to the team behind this app",
        .close: "Close", .cancel: "Cancel", .done: "Done", .send: "Send", .sending: "Sending…", .sendHelp: "Send (⌘↩)",
        .attachedPrefs: "Sent with this screen, the app version and your preferences.",
        .attached: "Sent with this screen and the app version.",
        .whatIsIt: "What is it?", .whatHappened: "What happened?", .placeholder: "What happened, or what would you change?",
        .broken: "Broken", .brokenHint: "Something doesn’t work", .brokenAsk: "What did you do, and what went wrong?",
        .confusing: "Confusing", .confusingHint: "I couldn’t tell how", .confusingAsk: "What were you trying to do?",
        .improvement: "Could be better", .improvementHint: "It works, and could be better", .improvementAsk: "What would make it better?",
        .idea: "Idea", .ideaHint: "Something that isn’t there yet", .ideaAsk: "What would you like it to do?",
        .sentTitle: "Sent. Thank you.",
        .sentBody: "A person on the team reads every report. You’ll see what happens to it under Your reports.",
        .sendAnother: "Send another", .seeReports: "See your reports",
        .none: "Nothing sent from this device yet.", .why: "Why: ",
        .statusOpen: "Waiting for the developer", .statusAccepted: "Accepted, being worked on", .statusFixed: "Fixed", .statusDeclined: "Declined",
        .you: "You", .signedInAs: "Signed in as {who}", .yourAccount: "your account",
        .seesReply: "The team sees this with each report, and can reply to you.", .sees: "The team sees this with each report.",
        .name: "Name", .email: "Email", .optional: "Optional", .aboutYou: "About you",
        .emailHint: "Only if you’re happy for the team to reply to you.",
        .emailBad: "That email doesn’t look right, so it won’t be sent.",
        .yourSetup: "Your setup", .setupPrompt: "For example: I use VoiceOver, or I’m usually on slow Wi-Fi.",
        .setupLabel: "About your setup",
        .setupFooter: "Sent with every report, so you only have to say it once. Kept on this device.",
        .clearAll: "Clear all", .powered: "Powered by Heresay",
    ]

    static let fr: [W: String] = [
        .report: "Signaler", .reportA11y: "Signaler un problème", .reportA11yUpdate: "Signaler un problème. Vous avez du nouveau.",
        .menuItem: "Signaler un problème…",
        .introTitle: "Aidez à améliorer cette app",
        .introBody: "{reach} pour partager une idée ou dire à l’équipe ce que vous changeriez. Une vraie personne lit chaque signalement, et vous verrez ce qu’il devient.",
        .reachMenu: "Choisissez Aide › Signaler un problème… (⌥⌘R) à tout moment", .reachClick: "Cliquez sur {label} à tout moment",
        .reachTap: "Touchez {label} dans le coin à tout moment", .reachUse: "Utilisez {label} à tout moment",
        .tryIt: "Essayer", .gotIt: "Compris",
        .tabReport: "Signaler", .tabMine: "Vos signalements", .tabPrefs: "Préférences",
        .sendFeedback: "Envoyer un retour", .straightToApp: "Directement à l’équipe {app}", .straightToTeam: "Directement à l’équipe de cette app",
        .close: "Fermer", .cancel: "Annuler", .done: "OK", .send: "Envoyer", .sending: "Envoi…", .sendHelp: "Envoyer (⌘↩)",
        .attachedPrefs: "Envoyé avec cet écran, la version de l’app et vos préférences.",
        .attached: "Envoyé avec cet écran et la version de l’app.",
        .whatIsIt: "De quoi s’agit-il ?", .whatHappened: "Que s’est-il passé ?", .placeholder: "Que s’est-il passé, ou que changeriez-vous ?",
        .broken: "Cassé", .brokenHint: "Quelque chose ne marche pas", .brokenAsk: "Qu’avez-vous fait, et qu’est-ce qui n’a pas marché ?",
        .confusing: "Déroutant", .confusingHint: "Je ne voyais pas comment faire", .confusingAsk: "Qu’essayiez-vous de faire ?",
        .improvement: "Pourrait être mieux", .improvementHint: "Ça marche, mais ça pourrait être mieux", .improvementAsk: "Qu’est-ce qui l’améliorerait ?",
        .idea: "Idée", .ideaHint: "Quelque chose qui n’existe pas encore", .ideaAsk: "Que voudriez-vous qu’elle fasse ?",
        .sentTitle: "Envoyé. Merci.",
        .sentBody: "Une personne de l’équipe lit chaque signalement. Vous verrez ce qu’il devient dans Vos signalements.",
        .sendAnother: "En envoyer un autre", .seeReports: "Voir vos signalements",
        .none: "Aucun signalement envoyé depuis cet appareil.", .why: "Pourquoi : ",
        .statusOpen: "En attente de l’équipe", .statusAccepted: "Accepté, en cours", .statusFixed: "Corrigé", .statusDeclined: "Refusé",
        .you: "Vous", .signedInAs: "Connecté en tant que {who}", .yourAccount: "votre compte",
        .seesReply: "L’équipe le voit avec chaque signalement et peut vous répondre.", .sees: "L’équipe le voit avec chaque signalement.",
        .name: "Nom", .email: "E-mail", .optional: "Facultatif", .aboutYou: "À propos de vous",
        .emailHint: "Seulement si vous acceptez que l’équipe vous réponde.",
        .emailBad: "Cette adresse e-mail ne semble pas correcte, elle ne sera donc pas envoyée.",
        .yourSetup: "Votre configuration", .setupPrompt: "Par exemple : j’utilise VoiceOver, ou mon Wi-Fi est souvent lent.",
        .setupLabel: "Votre configuration",
        .setupFooter: "Envoyé avec chaque signalement, pour ne le dire qu’une fois. Conservé sur cet appareil.",
        .clearAll: "Tout effacer", .powered: "Propulsé par Heresay",
    ]

    static let ta: [W: String] = [
        .report: "தெரிவி", .reportA11y: "சிக்கலைத் தெரிவிக்கவும்", .reportA11yUpdate: "சிக்கலைத் தெரிவிக்கவும். உங்களுக்குப் புதிய தகவல் உள்ளது.",
        .menuItem: "சிக்கலைத் தெரிவி…",
        .introTitle: "இந்த ஆப்பை இன்னும் சிறப்பாக்க உதவுங்கள்",
        .introBody: "ஒரு யோசனையைப் பகிர அல்லது நீங்கள் எதை மாற்ற விரும்புகிறீர்கள் என்று குழுவிடம் சொல்ல, {reach}. ஒவ்வொரு கருத்தையும் ஒருவர் படிக்கிறார்; உங்களுடையதற்கு என்ன ஆனது என்பதைப் பார்க்கலாம்.",
        .reachMenu: "எப்போது வேண்டுமானாலும் Help › சிக்கலைத் தெரிவி… (⌥⌘R) என்பதைத் தேர்ந்தெடுங்கள்",
        .reachClick: "எப்போது வேண்டுமானாலும் {label} ஐக் கிளிக் செய்யுங்கள்",
        .reachTap: "எப்போது வேண்டுமானாலும் மூலையில் உள்ள {label} ஐத் தட்டுங்கள்",
        .reachUse: "எப்போது வேண்டுமானாலும் {label} ஐப் பயன்படுத்துங்கள்",
        .tryIt: "முயன்று பாருங்கள்", .gotIt: "சரி",
        .tabReport: "தெரிவி", .tabMine: "உங்கள் புகார்கள்", .tabPrefs: "விருப்பங்கள்",
        .sendFeedback: "கருத்து அனுப்பு", .straightToApp: "நேராக {app} குழுவுக்கு", .straightToTeam: "நேராக இந்த ஆப்பின் குழுவுக்கு",
        .close: "மூடு", .cancel: "ரத்துசெய்", .done: "முடிந்தது", .send: "அனுப்பு", .sending: "அனுப்புகிறது…", .sendHelp: "அனுப்பு (⌘↩)",
        .attachedPrefs: "இந்தத் திரை, ஆப் பதிப்பு மற்றும் உங்கள் விருப்பங்களுடன் அனுப்பப்படும்.",
        .attached: "இந்தத் திரை மற்றும் ஆப் பதிப்புடன் அனுப்பப்படும்.",
        .whatIsIt: "இது என்ன வகை?", .whatHappened: "என்ன நடந்தது?", .placeholder: "என்ன நடந்தது, அல்லது எதை மாற்ற விரும்புகிறீர்கள்?",
        .broken: "வேலை செய்யவில்லை", .brokenHint: "ஏதோ ஒன்று சரியாக இயங்கவில்லை", .brokenAsk: "நீங்கள் என்ன செய்தீர்கள், என்ன தவறாகப் போனது?",
        .confusing: "குழப்பமாக உள்ளது", .confusingHint: "எப்படிச் செய்வது என்று புரியவில்லை", .confusingAsk: "நீங்கள் என்ன செய்ய முயன்றீர்கள்?",
        .improvement: "இன்னும் சிறப்பாக்கலாம்", .improvementHint: "வேலை செய்கிறது, ஆனால் மேம்படுத்தலாம்", .improvementAsk: "எது இதைச் சிறப்பாக்கும்?",
        .idea: "யோசனை", .ideaHint: "இன்னும் இல்லாத ஒன்று", .ideaAsk: "இது என்ன செய்ய வேண்டும் என்று விரும்புகிறீர்கள்?",
        .sentTitle: "அனுப்பப்பட்டது. நன்றி.",
        .sentBody: "குழுவில் ஒருவர் ஒவ்வொரு புகாரையும் படிக்கிறார். அதற்கு என்ன ஆனது என்பதை “உங்கள் புகார்கள்” பகுதியில் பார்க்கலாம்.",
        .sendAnother: "இன்னொன்று அனுப்பு", .seeReports: "உங்கள் புகார்களைப் பார்",
        .none: "இந்தச் சாதனத்திலிருந்து இன்னும் எதுவும் அனுப்பப்படவில்லை.", .why: "காரணம்: ",
        .statusOpen: "டெவலப்பருக்காகக் காத்திருக்கிறது", .statusAccepted: "ஏற்கப்பட்டது, வேலை நடக்கிறது", .statusFixed: "சரிசெய்யப்பட்டது", .statusDeclined: "நிராகரிக்கப்பட்டது",
        .you: "நீங்கள்", .signedInAs: "{who} ஆக உள்நுழைந்துள்ளீர்கள்", .yourAccount: "உங்கள் கணக்கு",
        .seesReply: "ஒவ்வொரு புகாருடனும் குழு இதைப் பார்க்கும், உங்களுக்குப் பதிலும் அனுப்பலாம்.", .sees: "ஒவ்வொரு புகாருடனும் குழு இதைப் பார்க்கும்.",
        .name: "பெயர்", .email: "மின்னஞ்சல்", .optional: "விருப்பத்தேர்வு", .aboutYou: "உங்களைப் பற்றி",
        .emailHint: "குழு உங்களுக்குப் பதில் அனுப்பலாம் என்றால் மட்டும்.",
        .emailBad: "இந்த மின்னஞ்சல் சரியாகத் தெரியவில்லை, எனவே அனுப்பப்படாது.",
        .yourSetup: "உங்கள் அமைப்பு", .setupPrompt: "உதாரணமாக: நான் VoiceOver பயன்படுத்துகிறேன், அல்லது என் Wi-Fi பெரும்பாலும் மெதுவாக இருக்கும்.",
        .setupLabel: "உங்கள் அமைப்பு பற்றி",
        .setupFooter: "ஒவ்வொரு புகாருடனும் அனுப்பப்படும், எனவே ஒருமுறை சொன்னால் போதும். இந்தச் சாதனத்தில் வைக்கப்படும்.",
        .clearAll: "அனைத்தையும் அழி", .powered: "Heresay மூலம் இயங்குகிறது",
    ]

    static let hi: [W: String] = [
        .report: "रिपोर्ट करें", .reportA11y: "समस्या की रिपोर्ट करें", .reportA11yUpdate: "समस्या की रिपोर्ट करें। आपके लिए नई जानकारी है।",
        .menuItem: "समस्या की रिपोर्ट करें…",
        .introTitle: "इस ऐप को और बेहतर बनाने में मदद करें",
        .introBody: "कोई आइडिया बताने या टीम को यह बताने के लिए कि आप क्या बदलना चाहेंगे, {reach}। हर रिपोर्ट कोई इंसान पढ़ता है, और आपकी रिपोर्ट का क्या हुआ, यह आप देखेंगे।",
        .reachMenu: "कभी भी Help › समस्या की रिपोर्ट करें… (⌥⌘R) चुनें", .reachClick: "कभी भी {label} पर क्लिक करें",
        .reachTap: "कभी भी कोने में {label} पर टैप करें", .reachUse: "कभी भी {label} का इस्तेमाल करें",
        .tryIt: "आज़माएँ", .gotIt: "ठीक है",
        .tabReport: "रिपोर्ट", .tabMine: "आपकी रिपोर्ट", .tabPrefs: "प्राथमिकताएँ",
        .sendFeedback: "फ़ीडबैक भेजें", .straightToApp: "सीधे {app} टीम को", .straightToTeam: "सीधे इस ऐप की टीम को",
        .close: "बंद करें", .cancel: "रद्द करें", .done: "हो गया", .send: "भेजें", .sending: "भेजा जा रहा है…", .sendHelp: "भेजें (⌘↩)",
        .attachedPrefs: "इस स्क्रीन, ऐप के वर्शन और आपकी प्राथमिकताओं के साथ भेजा जाता है।",
        .attached: "इस स्क्रीन और ऐप के वर्शन के साथ भेजा जाता है।",
        .whatIsIt: "यह क्या है?", .whatHappened: "क्या हुआ?", .placeholder: "क्या हुआ, या आप क्या बदलना चाहेंगे?",
        .broken: "टूटा हुआ", .brokenHint: "कुछ काम नहीं कर रहा", .brokenAsk: "आपने क्या किया, और क्या गड़बड़ हुई?",
        .confusing: "उलझन भरा", .confusingHint: "समझ नहीं आया कि कैसे करें", .confusingAsk: "आप क्या करना चाह रहे थे?",
        .improvement: "बेहतर हो सकता है", .improvementHint: "काम करता है, पर बेहतर हो सकता है", .improvementAsk: "इसे क्या बेहतर बनाएगा?",
        .idea: "सुझाव", .ideaHint: "कुछ ऐसा जो अभी नहीं है", .ideaAsk: "आप इससे क्या करवाना चाहेंगे?",
        .sentTitle: "भेज दिया गया। धन्यवाद।",
        .sentBody: "टीम का कोई व्यक्ति हर रिपोर्ट पढ़ता है। इसका क्या हुआ, यह आप “आपकी रिपोर्ट” में देखेंगे।",
        .sendAnother: "एक और भेजें", .seeReports: "अपनी रिपोर्ट देखें",
        .none: "इस डिवाइस से अभी तक कुछ नहीं भेजा गया।", .why: "वजह: ",
        .statusOpen: "डेवलपर का इंतज़ार", .statusAccepted: "स्वीकार, इस पर काम चल रहा है", .statusFixed: "ठीक हो गया", .statusDeclined: "अस्वीकार",
        .you: "आप", .signedInAs: "{who} के रूप में साइन इन", .yourAccount: "आपका खाता",
        .seesReply: "टीम हर रिपोर्ट के साथ इसे देखती है, और आपको जवाब दे सकती है।", .sees: "टीम हर रिपोर्ट के साथ इसे देखती है।",
        .name: "नाम", .email: "ईमेल", .optional: "वैकल्पिक", .aboutYou: "आपके बारे में",
        .emailHint: "सिर्फ़ तब, जब आप चाहते हैं कि टीम आपको जवाब दे।",
        .emailBad: "यह ईमेल सही नहीं लग रहा, इसलिए भेजा नहीं जाएगा।",
        .yourSetup: "आपका सेटअप", .setupPrompt: "जैसे: VoiceOver के साथ इस्तेमाल, या अक्सर धीमा Wi-Fi।",
        .setupLabel: "आपके सेटअप के बारे में",
        .setupFooter: "हर रिपोर्ट के साथ भेजा जाता है, ताकि एक ही बार बताना पड़े। इसी डिवाइस पर रखा जाता है।",
        .clearAll: "सब हटाएँ", .powered: "Heresay द्वारा संचालित",
    ]
}

extension ReportType {
    func label(_ w: Words) -> String { w[W(rawValue: rawValue)!] }
    func hint(_ w: Words) -> String { w[W(rawValue: rawValue + "Hint")!] }
    /// A nudge that fits the kind of report, once it's picked.
    func placeholder(_ w: Words) -> String { w[W(rawValue: rawValue + "Ask")!] }
}

extension ReportStatus {
    func label(_ w: Words) -> String {
        switch self {
        case .open: w[.statusOpen]
        case .accepted: w[.statusAccepted]
        case .fixed: w[.statusFixed]
        case .declined: w[.statusDeclined]
        }
    }
}
