import Foundation

/// Every piece of text Heresay shows, in each language it speaks. The same words as the web SDK
/// (`public/sdk.js`), where the two say the same thing.
enum W: String, CaseIterable {
    case report, reportA11y, reportA11yUpdate, menuItem
    case introTitle, introBody, introBodyMenu, gotIt
    case yourReports, yourReportsA11yUpdate, back, close, cancel, done, send, sending, sendHelp, sentTo
    case whatIsIt, whatHappened, placeholder, brokenAsk, confusingAsk, improvementAsk, ideaAsk
    case broken, confusing, improvement, idea
    case sentLine
    case none, why, statusOpen, statusAccepted, statusFixed, statusDeclined, statusWithdrawn
    case takeBack, takeBackAsk, takeBackWhy, takeBackYes, keep, yourWhy
    case signedInAs, yourAccount, seesReply, sees, nameAndEmail, name, email, optional, emailHint, emailBad
    case nudgeTitle, nudgeBody, nudgeCrashTitle, nudgeCrashBody, nudgeStuckTitle, nudgeStuckBody, nudgeYes, nudgeNo
    case fixedIn, updateTo
    case powered
    case whatsGoingOn, typeChip, tellTeam, sentShort, pickType
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
        .introTitle: "Spotted something off?", .introBody: "Tell the team here.", .introBodyMenu: "Tell the team here, or any time from Help › Report a Problem…", .yourReports: "Your reports", .yourReportsA11yUpdate: "Your reports, you have an update", .back: "Back", .sentTo: "Sent to this app’s team", .whatHappened: "What happened?", .placeholder: "What’s on your mind?", .brokenAsk: "What went wrong?", .confusingAsk: "What were you trying to do?", .improvementAsk: "What would make it better?", .ideaAsk: "What would you like?", .sentLine: "Sent. You’ll see the reply under Your reports.", .nameAndEmail: "Your name and email",
        .report: "Report", .reportA11y: "Report a problem", .reportA11yUpdate: "Report a problem. You have an update.",
        .menuItem: "Report a Problem…",
        .gotIt: "Got it",
        .close: "Close", .cancel: "Cancel", .done: "Done", .send: "Send", .sending: "Sending…", .sendHelp: "Send (⌘↩)",
        .whatIsIt: "What is it?",
        .broken: "Broken",
        .confusing: "Confusing",
        .improvement: "Could be better",
        .idea: "Idea",
        .none: "Nothing sent from this device yet.", .why: "Why: ",
        .statusOpen: "Waiting for the developer", .statusAccepted: "Accepted, being worked on", .statusFixed: "Fixed", .statusDeclined: "Declined",
        .statusWithdrawn: "You took this back", .takeBack: "Take back", .takeBackAsk: "Take this back? It isn’t deleted: the team sees you withdrew it.", .takeBackWhy: "Why? (optional)", .takeBackYes: "Take it back", .keep: "Keep it", .yourWhy: "Your reason: ",
        .signedInAs: "Signed in as {who}", .yourAccount: "your account",
        .seesReply: "The team sees this with each report, and can reply to you.", .sees: "The team sees this with each report.",
        .name: "Name", .email: "Email", .optional: "Optional",
        .emailHint: "Only if you’re happy for the team to reply to you.",
        .emailBad: "That email doesn’t look right, so it won’t be sent.",
        .nudgeTitle: "Something not working?", .nudgeBody: "Tell the team what happened. A real person reads it.",
        .nudgeCrashTitle: "The app closed unexpectedly", .nudgeCrashBody: "Tell the team what you were doing when it closed. A real person reads it.",
        .nudgeStuckTitle: "Stuck on something?", .nudgeStuckBody: "If something here isn’t clear, tell the team. A real person reads it.",
        .nudgeYes: "Tell the team", .nudgeNo: "Not now",
        .fixedIn: "Fixed in version {v}.", .updateTo: "Update to {v} to get it.",
        .whatsGoingOn: "What’s going on?", .typeChip: "Type", .tellTeam: "Tell the team…", .sentShort: "Sent. Replies show under Your reports.", .pickType: "Choose what it is",
        .powered: "Powered by Heresay",
    ]

    static let fr: [W: String] = [
        .introTitle: "Quelque chose cloche ?", .introBody: "Dites-le à l’équipe ici.", .introBodyMenu: "Dites-le à l’équipe ici, ou à tout moment depuis Aide › Signaler un problème…", .yourReports: "Vos signalements", .yourReportsA11yUpdate: "Vos signalements, il y a du nouveau", .back: "Retour", .sentTo: "Envoyé à l’équipe de cette app", .whatHappened: "Que s’est-il passé ?", .placeholder: "Qu’avez-vous en tête ?", .brokenAsk: "Qu’est-ce qui n’a pas marché ?", .confusingAsk: "Qu’essayiez-vous de faire ?", .improvementAsk: "Qu’est-ce qui l’améliorerait ?", .ideaAsk: "Qu’aimeriez-vous ?", .sentLine: "Envoyé. Vous verrez la réponse dans Vos signalements.", .nameAndEmail: "Votre nom et e-mail",
        .report: "Signaler", .reportA11y: "Signaler un problème", .reportA11yUpdate: "Signaler un problème. Vous avez du nouveau.",
        .menuItem: "Signaler un problème…",
        .gotIt: "Compris",
        .close: "Fermer", .cancel: "Annuler", .done: "OK", .send: "Envoyer", .sending: "Envoi…", .sendHelp: "Envoyer (⌘↩)",
        .whatIsIt: "De quoi s’agit-il ?",
        .broken: "Cassé",
        .confusing: "Déroutant",
        .improvement: "Pourrait être mieux",
        .idea: "Idée",
        .none: "Aucun signalement envoyé depuis cet appareil.", .why: "Pourquoi : ",
        .statusOpen: "En attente de l’équipe", .statusAccepted: "Accepté, en cours", .statusFixed: "Corrigé", .statusDeclined: "Refusé",
        .statusWithdrawn: "Vous l’avez retiré", .takeBack: "Retirer", .takeBackAsk: "Retirer ce signalement ? Il n’est pas supprimé : l’équipe voit que vous l’avez retiré.", .takeBackWhy: "Pourquoi ? (facultatif)", .takeBackYes: "Le retirer", .keep: "Le garder", .yourWhy: "Votre raison : ",
        .signedInAs: "Connecté en tant que {who}", .yourAccount: "votre compte",
        .seesReply: "L’équipe le voit avec chaque signalement et peut vous répondre.", .sees: "L’équipe le voit avec chaque signalement.",
        .name: "Nom", .email: "E-mail", .optional: "Facultatif",
        .emailHint: "Seulement si vous acceptez que l’équipe vous réponde.",
        .emailBad: "Cette adresse e-mail ne semble pas correcte, elle ne sera donc pas envoyée.",
        .nudgeTitle: "Quelque chose ne marche pas ?", .nudgeBody: "Dites à l’équipe ce qui s’est passé. Une vraie personne le lit.",
        .nudgeCrashTitle: "L’app s’est fermée sans prévenir", .nudgeCrashBody: "Dites à l’équipe ce que vous faisiez à ce moment. Une vraie personne le lit.",
        .nudgeStuckTitle: "Bloqué quelque part ?", .nudgeStuckBody: "Si quelque chose n’est pas clair ici, dites-le à l’équipe. Une vraie personne le lit.",
        .nudgeYes: "Signaler", .nudgeNo: "Pas maintenant",
        .fixedIn: "Corrigé dans la version {v}.", .updateTo: "Passez à la {v} pour en profiter.",
        .whatsGoingOn: "Que se passe-t-il ?", .typeChip: "Type", .tellTeam: "Dites-le à l’équipe…", .sentShort: "Envoyé. Les réponses sont dans Vos signalements.", .pickType: "Choisissez de quoi il s’agit",
        .powered: "Propulsé par Heresay",
    ]

    static let ta: [W: String] = [
        .introTitle: "ஏதாவது சரியில்லையா?", .introBody: "குழுவிடம் இங்கே சொல்லுங்கள்.", .introBodyMenu: "குழுவிடம் இங்கே சொல்லுங்கள், அல்லது எப்போது வேண்டுமானாலும் Help › சிக்கலைத் தெரிவி… மூலம்.", .yourReports: "உங்கள் புகார்கள்", .yourReportsA11yUpdate: "உங்கள் புகார்கள், புதுப்பிப்பு உள்ளது", .back: "பின்", .sentTo: "இந்த ஆப்பின் குழுவுக்கு அனுப்பப்படும்", .whatHappened: "என்ன நடந்தது?", .placeholder: "உங்கள் மனதில் என்ன இருக்கிறது?", .brokenAsk: "என்ன தவறு நடந்தது?", .confusingAsk: "நீங்கள் என்ன செய்ய முயன்றீர்கள்?", .improvementAsk: "எது இதைச் சிறப்பாக்கும்?", .ideaAsk: "நீங்கள் என்ன விரும்புகிறீர்கள்?", .sentLine: "அனுப்பப்பட்டது. பதிலை “உங்கள் புகார்கள்” பகுதியில் பார்க்கலாம்.", .nameAndEmail: "உங்கள் பெயர் மற்றும் மின்னஞ்சல்",
        .report: "தெரிவி", .reportA11y: "சிக்கலைத் தெரிவிக்கவும்", .reportA11yUpdate: "சிக்கலைத் தெரிவிக்கவும். உங்களுக்குப் புதிய தகவல் உள்ளது.",
        .menuItem: "சிக்கலைத் தெரிவி…",
        .gotIt: "சரி",
        .close: "மூடு", .cancel: "ரத்து செய்", .done: "முடிந்தது", .send: "அனுப்பு", .sending: "அனுப்புகிறது…", .sendHelp: "அனுப்பு (⌘↩)",
        .whatIsIt: "இது என்ன வகை?",
        .broken: "வேலை செய்யவில்லை",
        .confusing: "குழப்பமாக உள்ளது",
        .improvement: "இன்னும் சிறப்பாக்கலாம்",
        .idea: "யோசனை",
        .none: "இந்தச் சாதனத்திலிருந்து இன்னும் எதுவும் அனுப்பப்படவில்லை.", .why: "காரணம்: ",
        .statusOpen: "டெவலப்பருக்காகக் காத்திருக்கிறது", .statusAccepted: "ஏற்கப்பட்டது, வேலை நடக்கிறது", .statusFixed: "சரிசெய்யப்பட்டது", .statusDeclined: "நிராகரிக்கப்பட்டது",
        .statusWithdrawn: "நீங்கள் திரும்பப் பெற்றீர்கள்", .takeBack: "திரும்பப் பெறு", .takeBackAsk: "இதைத் திரும்பப் பெறவா? இது நீக்கப்படாது: நீங்கள் திரும்பப் பெற்றதைக் குழு பார்க்கும்.", .takeBackWhy: "ஏன்? (விருப்பத்தேர்வு)", .takeBackYes: "திரும்பப் பெறு", .keep: "வைத்திரு", .yourWhy: "உங்கள் காரணம்: ",
        .signedInAs: "{who} ஆக உள்நுழைந்துள்ளீர்கள்", .yourAccount: "உங்கள் கணக்கு",
        .seesReply: "ஒவ்வொரு புகாருடனும் குழு இதைப் பார்க்கும், உங்களுக்குப் பதிலும் அனுப்பலாம்.", .sees: "ஒவ்வொரு புகாருடனும் குழு இதைப் பார்க்கும்.",
        .name: "பெயர்", .email: "மின்னஞ்சல்", .optional: "விருப்பத்தேர்வு",
        .emailHint: "குழு உங்களுக்குப் பதில் அனுப்பலாம் என்றால் மட்டும்.",
        .emailBad: "இந்த மின்னஞ்சல் சரியாகத் தெரியவில்லை, எனவே அனுப்பப்படாது.",
        .nudgeTitle: "ஏதாவது வேலை செய்யவில்லையா?", .nudgeBody: "என்ன நடந்தது என்று குழுவிடம் சொல்லுங்கள். ஒருவர் அதைப் படிப்பார்.",
        .nudgeCrashTitle: "ஆப் எதிர்பாராமல் மூடப்பட்டது", .nudgeCrashBody: "அப்போது நீங்கள் என்ன செய்துகொண்டிருந்தீர்கள் என்று குழுவிடம் சொல்லுங்கள். ஒருவர் அதைப் படிப்பார்.",
        .nudgeStuckTitle: "எங்காவது சிக்கிக்கொண்டீர்களா?", .nudgeStuckBody: "இங்கே ஏதாவது புரியவில்லை என்றால், குழுவிடம் சொல்லுங்கள். ஒருவர் அதைப் படிப்பார்.",
        .nudgeYes: "குழுவிடம் சொல்", .nudgeNo: "இப்போது வேண்டாம்",
        .fixedIn: "பதிப்பு {v} இல் சரிசெய்யப்பட்டது.", .updateTo: "இதைப் பெற {v} க்குப் புதுப்பிக்கவும்.",
        .whatsGoingOn: "என்ன நடக்கிறது?", .typeChip: "வகை", .tellTeam: "குழுவிடம் சொல்லுங்கள்…", .sentShort: "அனுப்பப்பட்டது. பதில்கள் “உங்கள் புகார்கள்” பகுதியில் தெரியும்.", .pickType: "இது என்ன வகை எனத் தேர்ந்தெடுக்கவும்",
        .powered: "Heresay மூலம் இயங்குகிறது",
    ]

    static let hi: [W: String] = [
        .introTitle: "कुछ गड़बड़ दिखी?", .introBody: "टीम को यहीं बताएँ।", .introBodyMenu: "टीम को यहीं बताएँ, या कभी भी Help › समस्या की रिपोर्ट करें… से।", .yourReports: "आपकी रिपोर्ट", .yourReportsA11yUpdate: "आपकी रिपोर्ट, नई जानकारी है", .back: "वापस", .sentTo: "इस ऐप की टीम को भेजा जाता है", .whatHappened: "क्या हुआ?", .placeholder: "आपके मन में क्या है?", .brokenAsk: "क्या गड़बड़ हुई?", .confusingAsk: "आप क्या करना चाह रहे थे?", .improvementAsk: "इसे क्या बेहतर बनाएगा?", .ideaAsk: "आप क्या चाहेंगे?", .sentLine: "भेज दिया गया। जवाब आप “आपकी रिपोर्ट” में देखेंगे।", .nameAndEmail: "आपका नाम और ईमेल",
        .report: "रिपोर्ट करें", .reportA11y: "समस्या की रिपोर्ट करें", .reportA11yUpdate: "समस्या की रिपोर्ट करें। आपके लिए नई जानकारी है।",
        .menuItem: "समस्या की रिपोर्ट करें…",
        .gotIt: "ठीक है",
        .close: "बंद करें", .cancel: "रद्द करें", .done: "हो गया", .send: "भेजें", .sending: "भेजा जा रहा है…", .sendHelp: "भेजें (⌘↩)",
        .whatIsIt: "यह क्या है?",
        .broken: "टूटा हुआ",
        .confusing: "उलझन भरा",
        .improvement: "बेहतर हो सकता है",
        .idea: "सुझाव",
        .none: "इस डिवाइस से अभी तक कुछ नहीं भेजा गया।", .why: "वजह: ",
        .statusOpen: "डेवलपर का इंतज़ार", .statusAccepted: "स्वीकार, इस पर काम चल रहा है", .statusFixed: "ठीक हो गया", .statusDeclined: "अस्वीकार",
        .statusWithdrawn: "आपने इसे वापस ले लिया", .takeBack: "वापस लें", .takeBackAsk: "इसे वापस लें? यह हटाया नहीं जाएगा: टीम देखेगी कि आपने इसे वापस लिया।", .takeBackWhy: "क्यों? (वैकल्पिक)", .takeBackYes: "वापस लें", .keep: "रहने दें", .yourWhy: "आपकी वजह: ",
        .signedInAs: "{who} के रूप में साइन इन", .yourAccount: "आपका खाता",
        .seesReply: "टीम हर रिपोर्ट के साथ इसे देखती है, और आपको जवाब दे सकती है।", .sees: "टीम हर रिपोर्ट के साथ इसे देखती है।",
        .name: "नाम", .email: "ईमेल", .optional: "वैकल्पिक",
        .emailHint: "सिर्फ़ तब, जब आप चाहते हैं कि टीम आपको जवाब दे।",
        .emailBad: "यह ईमेल सही नहीं लग रहा, इसलिए भेजा नहीं जाएगा।",
        .nudgeTitle: "कुछ काम नहीं कर रहा?", .nudgeBody: "टीम को बताइए क्या हुआ। इसे कोई इंसान पढ़ता है।",
        .nudgeCrashTitle: "ऐप अचानक बंद हो गया", .nudgeCrashBody: "टीम को बताइए कि उस समय आप क्या कर रहे थे। इसे कोई इंसान पढ़ता है।",
        .nudgeStuckTitle: "कहीं अटक गए?", .nudgeStuckBody: "अगर यहाँ कुछ साफ़ नहीं है, तो टीम को बताइए। इसे कोई इंसान पढ़ता है।",
        .nudgeYes: "टीम को बताएँ", .nudgeNo: "अभी नहीं",
        .fixedIn: "वर्शन {v} में ठीक किया गया।", .updateTo: "इसे पाने के लिए {v} पर अपडेट करें।",
        .whatsGoingOn: "क्या चल रहा है?", .typeChip: "प्रकार", .tellTeam: "टीम को बताएँ…", .sentShort: "भेज दिया गया। जवाब “आपकी रिपोर्ट” में दिखेंगे।", .pickType: "चुनें कि यह क्या है",
        .powered: "Heresay द्वारा संचालित",
    ]
}

extension ReportType {
    func label(_ w: Words) -> String { w[W(rawValue: rawValue)!] }
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
        case .withdrawn: w[.statusWithdrawn]
        }
    }
}
