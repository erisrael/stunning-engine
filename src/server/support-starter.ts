import { get, nowIso, run, uid } from "./db";
import { getMeta, setMeta } from "./settings";

// Starter answers for the help menu (Telegram bot, support app, help center), so every topic button opens real
// answers before asking the customer to write. English and Amharic, each tagged with its language (lang:en,
// lang:am) so a customer sees their own. Added once; edited, unpublished or deleted in Customer support > Help
// articles like any other, and never added again after that.
type Starter = { category: string; en: [string, string]; am: [string, string]; keywords: string };

const STARTERS: Starter[] = [
  // Payments
  {
    category: "Payments",
    keywords: "pay payment how chapa telebirr bank methods",
    en: ["How can I pay for a subscription?", "You can pay in the app in three ways:\n\n1. Chapa: pay with your bank card or mobile money. The subscription starts as soon as Chapa confirms the payment.\n2. Telebirr: pay from your Telebirr account. It starts as soon as Telebirr confirms it.\n3. Bank transfer: pay to our bank account and upload the receipt in the app. Our finance team checks the receipt, then the subscription starts.\n\nKeep the receipt or the confirmation message until your subscription shows as active."],
    am: ["ለደንበኝነት እንዴት መክፈል እችላለሁ?", "በመተግበሪያው ውስጥ በሦስት መንገዶች መክፈል ይችላሉ፦\n\n1. ቻፓ፦ በባንክ ካርድ ወይም በሞባይል ገንዘብ ይክፈሉ። ቻፓ ክፍያውን እንዳረጋገጠ ደንበኝነቱ ይጀምራል።\n2. ቴሌብር፦ ከቴሌብር ሂሳብዎ ይክፈሉ። ቴሌብር እንዳረጋገጠ ይጀምራል።\n3. የባንክ ዝውውር፦ ወደ ባንክ ሂሳባችን ከፍለው ደረሰኙን በመተግበሪያው ይጫኑ። የፋይናንስ ቡድናችን ደረሰኙን ካረጋገጠ በኋላ ደንበኝነቱ ይጀምራል።\n\nደንበኝነትዎ «ንቁ» እስኪሆን ድረስ ደረሰኙን ወይም የማረጋገጫ መልዕክቱን ያስቀምጡ።"],
  },
  {
    category: "Payments",
    keywords: "paid not active pending review receipt bank waiting",
    en: ["I paid but my subscription is not active", "If you paid by bank transfer, your receipt is waiting for our finance team to check it (shown as Pending review). This is done by hand in working hours.\n\nIf you paid with Chapa or Telebirr, the payment may still be confirming. Close the app fully and open it again.\n\nStill not active? Press \"Still need help\" and send us:\n- the phone number of the account\n- the payment reference or a photo of the receipt\n- the date you paid\n\nWe find the payment and activate it."],
    am: ["ከፍያለሁ ግን ደንበኝነቴ አልጀመረም", "በባንክ ዝውውር ከከፈሉ፣ ደረሰኝዎ በፋይናንስ ቡድናችን እስኪረጋገጥ ይጠብቃል («በግምገማ ላይ» ይላል)። ይህ በሥራ ሰዓት በሰው ይሠራል።\n\nበቻፓ ወይም በቴሌብር ከከፈሉ፣ ክፍያው ገና እየተረጋገጠ ሊሆን ይችላል። መተግበሪያውን ሙሉ በሙሉ ዘግተው እንደገና ይክፈቱ።\n\nአሁንም ካልጀመረ «አሁንም እርዳታ ይፈልጋሉ?» የሚለውን ተጭነው ይላኩልን፦\n- የመለያው ስልክ ቁጥር\n- የክፍያ ማጣቀሻ ቁጥር ወይም የደረሰኙ ፎቶ\n- የከፈሉበት ቀን\n\nክፍያውን አግኝተን እናስጀምራለን።"],
  },
  {
    category: "Payments",
    keywords: "failed payment money taken deducted twice refund",
    en: ["My payment failed or money was taken twice", "A failed payment usually returns to your account on its own; your bank or mobile money provider decides how long that takes.\n\nIf money left your account but the subscription did not start, or you were charged twice, press \"Still need help\" and send the payment reference and the phone number of the account. We check it with the payment provider and sort it out with you."],
    am: ["ክፍያዬ አልተሳካም ወይም ሁለት ጊዜ ተቆርጧል", "ያልተሳካ ክፍያ በአብዛኛው በራሱ ወደ ሂሳብዎ ይመለሳል፤ ምን ያህል ጊዜ እንደሚወስድ ባንክዎ ወይም የሞባይል ገንዘብ አቅራቢዎ ይወስናል።\n\nገንዘብ ከሂሳብዎ ወጥቶ ደንበኝነቱ ካልጀመረ ወይም ሁለት ጊዜ ከተቆረጠ፣ «አሁንም እርዳታ ይፈልጋሉ?» ተጭነው የክፍያ ማጣቀሻውን እና የመለያውን ስልክ ቁጥር ይላኩ። ከክፍያ አቅራቢው ጋር አጣርተን እንፈታዋለን።"],
  },
  // Plans
  {
    category: "Plans",
    keywords: "plan plans price subscription choose grade",
    en: ["Which subscription plan should I choose?", "Every plan opens the lessons, notes and quizzes of your grade. The plans differ in how long they last; the longer plans cost less per month. You see each plan and its price in the app under Subscription.\n\nOne subscription is for one student. For more than one child, each student needs their own."],
    am: ["የትኛውን የደንበኝነት ዕቅድ ልምረጥ?", "እያንዳንዱ ዕቅድ የክፍልዎን ትምህርቶች፣ ማስታወሻዎች እና ፈተናዎች ይከፍታል። ዕቅዶቹ የሚለያዩት በሚቆዩበት ጊዜ ነው፤ ረጅም ዕቅዶች በወር ሲሰላ ርካሽ ናቸው። እያንዳንዱን ዕቅድ እና ዋጋውን በመተግበሪያው «ደንበኝነት» ውስጥ ያገኛሉ።\n\nአንድ ደንበኝነት ለአንድ ተማሪ ነው። ከአንድ በላይ ልጅ ካለዎት እያንዳንዱ ተማሪ የራሱ ያስፈልገዋል።"],
  },
  {
    category: "Plans",
    keywords: "expired renew grace end subscription",
    en: ["My subscription ended. How do I renew?", "When a subscription ends, the app shows it as expired (or in a short grace period first). Open Subscription in the app, choose a plan and pay the same way as before. Your progress stays; it continues when you renew."],
    am: ["ደንበኝነቴ አልቋል። እንዴት ላድሰው?", "ደንበኝነት ሲያልቅ መተግበሪያው «ጊዜው ያለፈበት» ይላል (አንዳንዴ መጀመሪያ አጭር የእፎይታ ጊዜ አለ)። በመተግበሪያው «ደንበኝነት» ይክፈቱ፣ ዕቅድ ይምረጡ እና እንደበፊቱ ይክፈሉ። ያደረጉት እድገት ይቀመጣል፤ ሲያድሱ ይቀጥላል።"],
  },
  {
    category: "Plans",
    keywords: "change grade wrong grade move",
    en: ["I chose the wrong grade", "Press \"Still need help\" and tell us the student's name, the phone number of the account and the right grade. We move the account to the right grade; a paid subscription stays."],
    am: ["የተሳሳተ ክፍል መርጫለሁ", "«አሁንም እርዳታ ይፈልጋሉ?» ተጭነው የተማሪውን ስም፣ የመለያውን ስልክ ቁጥር እና ትክክለኛውን ክፍል ይንገሩን። መለያውን ወደ ትክክለኛው ክፍል እናዛውራለን፤ የተከፈለበት ደንበኝነት ይቀጥላል።"],
  },
  // Account
  {
    category: "Account",
    keywords: "sign in login cannot log in password forgot",
    en: ["I cannot sign in", "Check that you use the phone number (or email) you registered with, and that the app is the latest version from the Play Store or App Store.\n\nIf it still does not let you in, press \"Still need help\" and send the phone number of the account. We check the account and help you back in. Never send us your password."],
    am: ["መግባት አልቻልኩም", "የተመዘገቡበትን ስልክ ቁጥር (ወይም ኢሜይል) መጠቀምዎን እና መተግበሪያው ከፕሌይ ስቶር ወይም ከአፕ ስቶር የቅርብ ጊዜው መሆኑን ያረጋግጡ።\n\nአሁንም ካላስገባዎት «አሁንም እርዳታ ይፈልጋሉ?» ተጭነው የመለያውን ስልክ ቁጥር ይላኩ። መለያውን አጣርተን እንዲገቡ እንረዳዎታለን። የይለፍ ቃልዎን በፍጹም አይላኩልን።"],
  },
  {
    category: "Account",
    keywords: "parent child link student account add",
    en: ["How do I link my child's account?", "A parent account can follow one or more students. In the app, open the parent profile and add the student with the details the app asks for.\n\nIf the student does not appear, press \"Still need help\" and send the parent's and the student's phone numbers; we link them for you."],
    am: ["የልጄን መለያ እንዴት ላገናኘው?", "የወላጅ መለያ አንድ ወይም ከዚያ በላይ ተማሪዎችን መከታተል ይችላል። በመተግበሪያው የወላጅ መገለጫን ከፍተው መተግበሪያው የሚጠይቀውን መረጃ በመሙላት ተማሪውን ይጨምሩ።\n\nተማሪው ካልታየ «አሁንም እርዳታ ይፈልጋሉ?» ተጭነው የወላጁን እና የተማሪውን ስልክ ቁጥሮች ይላኩ፤ እኛ እናገናኛለን።"],
  },
  {
    category: "Account",
    keywords: "change phone number name profile update",
    en: ["How do I change my phone number or name?", "Some details can be changed in the app's profile. A phone number is how we find your account, so to change it, press \"Still need help\" and send the old and the new number; we change it after checking it is your account."],
    am: ["ስልክ ቁጥሬን ወይም ስሜን እንዴት እቀይራለሁ?", "አንዳንድ መረጃዎች በመተግበሪያው መገለጫ ውስጥ ይቀየራሉ። መለያዎን የምናገኘው በስልክ ቁጥር ስለሆነ፣ ለመቀየር «አሁንም እርዳታ ይፈልጋሉ?» ተጭነው የድሮውንና የአዲሱን ቁጥር ይላኩ፤ መለያው የእርስዎ መሆኑን አረጋግጠን እንቀይራለን።"],
  },
  // App help
  {
    category: "App help",
    keywords: "video not playing loading buffering lesson",
    en: ["Videos do not play or keep loading", "1. Check your internet: videos need a steady connection. Wi-Fi or a stronger mobile signal helps.\n2. Close the app fully and open it again.\n3. Update the app from the Play Store or App Store.\n4. Free some space on the phone.\n\nIf one lesson never plays while others do, press \"Still need help\" and tell us the grade, subject and lesson name."],
    am: ["ቪዲዮዎች አይጫወቱም ወይም ይቆማሉ", "1. ኢንተርኔትዎን ያረጋግጡ፦ ቪዲዮዎች የተረጋጋ ግንኙነት ይፈልጋሉ። ዋይፋይ ወይም ጠንካራ የሞባይል ኔትወርክ ይረዳል።\n2. መተግበሪያውን ሙሉ በሙሉ ዘግተው እንደገና ይክፈቱ።\n3. መተግበሪያውን ከፕሌይ ስቶር ወይም ከአፕ ስቶር ያዘምኑ።\n4. በስልኩ ላይ ቦታ ያስለቅቁ።\n\nአንድ ትምህርት ብቻ ሌሎቹ እየተጫወቱ ካልተጫወተ «አሁንም እርዳታ ይፈልጋሉ?» ተጭነው ክፍሉን፣ የትምህርት ዓይነቱን እና የትምህርቱን ስም ይንገሩን።"],
  },
  {
    category: "App help",
    keywords: "what is in the app lessons notes quizzes flashcards national exam",
    en: ["What is in the app?", "For your grade the app has:\n- video lessons, unit by unit\n- notes (many as PDF) to read alongside\n- quizzes at the end of units, with your score\n- flashcards for quick revision\n- national exam practice for the exam grades\n\nSome lessons are free to watch before you subscribe."],
    am: ["በመተግበሪያው ውስጥ ምን አለ?", "ለክፍልዎ መተግበሪያው፦\n- በየምዕራፉ የቪዲዮ ትምህርቶች\n- አብረው የሚነበቡ ማስታወሻዎች (ብዙዎቹ በፒዲኤፍ)\n- በምዕራፍ መጨረሻ ፈተናዎች ከውጤትዎ ጋር\n- ለፈጣን ክለሳ ፍላሽካርዶች\n- ለብሔራዊ ፈተና ክፍሎች የብሔራዊ ፈተና ልምምድ\n\nአንዳንድ ትምህርቶችን ከመመዝገብዎ በፊት በነጻ ማየት ይችላሉ።"],
  },
  {
    category: "App help",
    keywords: "app crash closes slow update not working",
    en: ["The app closes or does not open", "1. Update the app to the latest version.\n2. Restart the phone.\n3. Check the phone has free space and a recent system update.\n4. If it still closes, uninstall and install it again; your account and progress stay with your phone number.\n\nStill happening? Press \"Still need help\" and tell us the phone model and what you pressed before it closed."],
    am: ["መተግበሪያው ይዘጋል ወይም አይከፈትም", "1. መተግበሪያውን ወደ የቅርብ ጊዜው ስሪት ያዘምኑ።\n2. ስልኩን አጥፍተው ያብሩ።\n3. ስልኩ ባዶ ቦታ እንዳለው እና የሲስተም ማሻሻያ እንዳለው ያረጋግጡ።\n4. አሁንም ከተዘጋ አጥፍተው እንደገና ይጫኑት፤ መለያዎ እና እድገትዎ በስልክ ቁጥርዎ ይቀመጣሉ።\n\nአሁንም ከቀጠለ «አሁንም እርዳታ ይፈልጋሉ?» ተጭነው የስልኩን ዓይነት እና ከመዘጋቱ በፊት የተጫኑትን ይንገሩን።"],
  },
  // FAQ
  {
    category: "FAQ",
    keywords: "how long approval receipt check time",
    en: ["How long does a bank receipt check take?", "Our finance team checks bank receipts by hand during working hours, in the order they arrive. You get the subscription as soon as it is approved. If it has been longer than a working day, press \"Still need help\" with the phone number of the account."],
    am: ["የባንክ ደረሰኝ ማረጋገጥ ምን ያህል ጊዜ ይወስዳል?", "የፋይናንስ ቡድናችን የባንክ ደረሰኞችን በሥራ ሰዓት በደረሱበት ቅደም ተከተል በሰው ያረጋግጣል። እንደጸደቀ ደንበኝነቱን ያገኛሉ። ከአንድ የሥራ ቀን በላይ ከሆነ በመለያው ስልክ ቁጥር «አሁንም እርዳታ ይፈልጋሉ?» ይጫኑ።"],
  },
  {
    category: "FAQ",
    keywords: "two phones devices share account",
    en: ["Can I use my account on two phones?", "Your account is for one student. You can sign in on a new phone with the same phone number; if the app asks to sign out of the old one, that keeps your account safe."],
    am: ["መለያዬን በሁለት ስልኮች መጠቀም እችላለሁ?", "መለያዎ ለአንድ ተማሪ ነው። በተመሳሳይ ስልክ ቁጥር በአዲስ ስልክ መግባት ይችላሉ፤ መተግበሪያው ከድሮው እንዲወጡ ከጠየቀ ይህ መለያዎን ለመጠበቅ ነው።"],
  },
  {
    category: "FAQ",
    keywords: "contact support hours working time reach",
    en: ["When can I reach support?", "You can write to us here at any time. Our team answers during working hours; outside them your message waits in line and we answer when we open. You can also ask us to call you back from the menu (Call us)."],
    am: ["ድጋፍን መቼ ማግኘት እችላለሁ?", "በማንኛውም ጊዜ እዚህ ሊጽፉልን ይችላሉ። ቡድናችን በሥራ ሰዓት ይመልሳል፤ ከሥራ ሰዓት ውጭ መልዕክትዎ በተራ ይጠብቃል፣ ስንከፍት እንመልሳለን። ከማውጫው («ይደውሉልን») መልሰን እንድንደውልልዎ መጠየቅም ይችላሉ።"],
  },
];

export async function ensureStarterHelp() {
  if (await getMeta("help.starter.v1")) return;
  // Workspaces that already wrote their own answers keep only those.
  const own = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_articles"))?.n ?? 0);
  await setMeta("help.starter.v1", nowIso());
  if (own > 5) return;
  const now = nowIso();
  for (const s of STARTERS)
    for (const lang of ["en", "am"] as const) {
      const [title, body] = s[lang];
      if (await get("SELECT id FROM sup_articles WHERE title = ?", title)) continue;
      await run(
        "INSERT INTO sup_articles (id, title, body, category, keywords, published, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 'article', ?, ?)",
        uid("art_"),
        title,
        body,
        s.category,
        `${s.keywords} lang:${lang} starter`,
        now,
        now,
      );
    }
}

// An article's language from its keywords: en, am, or null (any).
export const articleLang = (keywords: string | null | undefined) => (/\blang:am\b/.test(keywords ?? "") ? "am" : /\blang:en\b/.test(keywords ?? "") ? "en" : null);
