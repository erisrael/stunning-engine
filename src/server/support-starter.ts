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
  await ensureStarterHelpV1();
  await ensureStarterHelpV2();
}
async function ensureStarterHelpV1() {
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

// The second set (v2): more answers, and every starter answer in a section of its topic, so the bot shows
// Payments > Paying / Problems / Refunds before the answers.
const SECTIONS: Record<string, string> = {
  "How can I pay for a subscription?": "Paying",
  "I paid but my subscription is not active": "Problems",
  "My payment failed or money was taken twice": "Problems",
  "Which subscription plan should I choose?": "Choosing a plan",
  "My subscription ended. How do I renew?": "Renewing",
  "I chose the wrong grade": "Changes",
  "I cannot sign in": "Signing in",
  "How do I link my child's account?": "Profile and family",
  "How do I change my phone number or name?": "Profile and family",
  "Videos do not play or keep loading": "Lessons and videos",
  "What is in the app?": "Lessons and videos",
  "The app closes or does not open": "App problems",
  "How long does a bank receipt check take?": "General",
  "Can I use my account on two phones?": "General",
  "When can I reach support?": "General",
};
const AM_TITLE: Record<string, string> = {
  "ለደንበኝነት እንዴት መክፈል እችላለሁ?": "Paying",
  "ከፍያለሁ ግን ደንበኝነቴ አልጀመረም": "Problems",
  "ክፍያዬ አልተሳካም ወይም ሁለት ጊዜ ተቆርጧል": "Problems",
  "የትኛውን የደንበኝነት ዕቅድ ልምረጥ?": "Choosing a plan",
  "ደንበኝነቴ አልቋል። እንዴት ላድሰው?": "Renewing",
  "የተሳሳተ ክፍል መርጫለሁ": "Changes",
  "መግባት አልቻልኩም": "Signing in",
  "የልጄን መለያ እንዴት ላገናኘው?": "Profile and family",
  "ስልክ ቁጥሬን ወይም ስሜን እንዴት እቀይራለሁ?": "Profile and family",
  "ቪዲዮዎች አይጫወቱም ወይም ይቆማሉ": "Lessons and videos",
  "በመተግበሪያው ውስጥ ምን አለ?": "Lessons and videos",
  "መተግበሪያው ይዘጋል ወይም አይከፈትም": "App problems",
  "የባንክ ደረሰኝ ማረጋገጥ ምን ያህል ጊዜ ይወስዳል?": "General",
  "መለያዬን በሁለት ስልኮች መጠቀም እችላለሁ?": "General",
  "ድጋፍን መቼ ማግኘት እችላለሁ?": "General",
};
// Section names in Amharic, for the bot's buttons.
export const SECTION_AM: Record<string, string> = {
  Paying: "ክፍያ መፈጸም",
  Problems: "ችግሮች",
  Refunds: "ተመላሽ ክፍያ",
  "Choosing a plan": "ዕቅድ መምረጥ",
  Renewing: "ማደስ",
  Changes: "ለውጦች",
  "Signing in": "መግባት",
  "Profile and family": "መገለጫ እና ቤተሰብ",
  "Privacy and safety": "ግላዊነት እና ደህንነት",
  "Lessons and videos": "ትምህርቶች እና ቪዲዮዎች",
  "Quizzes and notes": "ፈተናዎች እና ማስታወሻዎች",
  "App problems": "የመተግበሪያ ችግሮች",
  General: "አጠቃላይ",
  "About MySeed": "ስለ ማይሲድ",
};
type Starter2 = Starter & { section: string };
const MORE: Starter2[] = [
  {
    category: "Payments",
    section: "Paying",
    keywords: "telebirr pay steps how",
    en: ["How do I pay with Telebirr?", "1. In the app, open Subscription and choose your plan.\n2. Choose Telebirr as the payment method.\n3. Confirm the payment in Telebirr with your PIN.\n4. Go back to the app: the subscription starts once Telebirr confirms it.\n\nKeep the Telebirr confirmation SMS until the subscription shows as active."],
    am: ["በቴሌብር እንዴት እከፍላለሁ?", "1. በመተግበሪያው «ደንበኝነት» ከፍተው ዕቅድዎን ይምረጡ።\n2. የክፍያ ዘዴ ቴሌብርን ይምረጡ።\n3. ክፍያውን በቴሌብር በፒንዎ ያረጋግጡ።\n4. ወደ መተግበሪያው ይመለሱ፦ ቴሌብር እንዳረጋገጠ ደንበኝነቱ ይጀምራል።\n\nደንበኝነቱ «ንቁ» እስኪሆን የቴሌብር ማረጋገጫ መልዕክቱን ያስቀምጡ።"],
  },
  {
    category: "Payments",
    section: "Paying",
    keywords: "bank transfer receipt upload photo steps",
    en: ["How do I pay by bank transfer?", "1. In the app, open Subscription, choose your plan and choose bank transfer.\n2. Pay the amount shown to the bank account the app shows.\n3. Take a clear photo or screenshot of the receipt: the amount, date and reference must be readable.\n4. Upload it in the app.\n\nOur finance team checks the receipt and starts the subscription. A blurry or cut receipt has to be sent again, so check the photo before you send it."],
    am: ["በባንክ ዝውውር እንዴት እከፍላለሁ?", "1. በመተግበሪያው «ደንበኝነት» ከፍተው ዕቅድዎን ይምረጡና የባንክ ዝውውርን ይምረጡ።\n2. የሚታየውን መጠን መተግበሪያው ወደሚያሳየው የባንክ ሂሳብ ይክፈሉ።\n3. የደረሰኙን ግልጽ ፎቶ ወይም ስክሪንሾት ያንሱ፦ መጠኑ፣ ቀኑ እና ማጣቀሻው መነበብ አለባቸው።\n4. በመተግበሪያው ውስጥ ይጫኑት።\n\nየፋይናንስ ቡድናችን ደረሰኙን አረጋግጦ ደንበኝነቱን ያስጀምራል። የደበዘዘ ወይም የተቆረጠ ደረሰኝ እንደገና መላክ ስለሚኖርበት ከመላክዎ በፊት ፎቶውን ያረጋግጡ።"],
  },
  {
    category: "Payments",
    section: "Problems",
    keywords: "receipt rejected declined unclear wrong amount",
    en: ["My bank receipt was not accepted", "A receipt is sent back when it cannot be read, the amount does not match the plan, or it was already used for another payment. Send a new, clear photo of the original receipt from the app. If you think it was a mistake, press \"Still need help\" with the phone number of the account and the receipt."],
    am: ["የባንክ ደረሰኜ ተቀባይነት አላገኘም", "ደረሰኝ የሚመለሰው መነበብ ሳይችል፣ መጠኑ ከዕቅዱ ጋር ሳይስማማ፣ ወይም ቀደም ሲል ለሌላ ክፍያ ጥቅም ላይ ውሎ ሲሆን ነው። የዋናውን ደረሰኝ አዲስና ግልጽ ፎቶ ከመተግበሪያው ይላኩ። ስህተት ነው ብለው ካሰቡ በመለያው ስልክ ቁጥር እና በደረሰኙ «አሁንም እርዳታ ይፈልጋሉ?» ይጫኑ።"],
  },
  {
    category: "Payments",
    section: "Refunds",
    keywords: "refund money back cancel",
    en: ["Can I get a refund?", "Press \"Still need help\" and tell us why you are asking for a refund, with the phone number of the account and the payment reference. Our finance team looks at each request and replies to you here."],
    am: ["ገንዘቤ ሊመለስልኝ ይችላል?", "«አሁንም እርዳታ ይፈልጋሉ?» ተጭነው ተመላሽ ክፍያ የሚጠይቁበትን ምክንያት ከመለያው ስልክ ቁጥር እና ከክፍያ ማጣቀሻው ጋር ይንገሩን። የፋይናንስ ቡድናችን እያንዳንዱን ጥያቄ አይቶ እዚህ ይመልስልዎታል።"],
  },
  {
    category: "Plans",
    section: "Renewing",
    keywords: "grace period expired pending meaning status",
    en: ["What do the subscription states mean?", "Active: you can use everything for your grade.\nGrace: the subscription has ended but you can still study for a short time; renew to keep going.\nExpired: renew to open the lessons again.\nPending review: we are checking your bank receipt.\nSuspended: press \"Still need help\" and we tell you why."],
    am: ["የደንበኝነት ሁኔታዎች ምን ማለት ናቸው?", "ንቁ፦ ለክፍልዎ ያለውን ሁሉ መጠቀም ይችላሉ።\nየእፎይታ ጊዜ፦ ደንበኝነቱ አልቋል ግን ለአጭር ጊዜ መማር ይችላሉ፤ ለመቀጠል ያድሱ።\nጊዜው ያለፈበት፦ ትምህርቶቹን እንደገና ለመክፈት ያድሱ።\nበግምገማ ላይ፦ የባንክ ደረሰኝዎን እያረጋገጥን ነው።\nየታገደ፦ «አሁንም እርዳታ ይፈልጋሉ?» ይጫኑ፣ ምክንያቱን እንነግርዎታለን።"],
  },
  {
    category: "Plans",
    section: "Choosing a plan",
    keywords: "children siblings two students family",
    en: ["I have more than one child", "Each child needs their own student account and subscription, because lessons and progress follow the student's grade. A parent account can follow all of them."],
    am: ["ከአንድ በላይ ልጅ አለኝ", "ትምህርቶቹና እድገቱ የተማሪውን ክፍል ስለሚከተሉ እያንዳንዱ ልጅ የራሱ የተማሪ መለያ እና ደንበኝነት ያስፈልገዋል። አንድ የወላጅ መለያ ሁሉንም መከታተል ይችላል።"],
  },
  {
    category: "Account",
    section: "Signing in",
    keywords: "new phone lost phone sign in again",
    en: ["I changed or lost my phone", "Install the app on the new phone and sign in with the same phone number (or email) you registered with. Your subscription and progress stay with your account. If you no longer have that phone number, press \"Still need help\" and we help you move the account."],
    am: ["ስልኬን ቀይሬያለሁ ወይም ጠፍቶብኛል", "መተግበሪያውን በአዲሱ ስልክ ጭነው በተመዘገቡበት ተመሳሳይ ስልክ ቁጥር (ወይም ኢሜይል) ይግቡ። ደንበኝነትዎና እድገትዎ ከመለያዎ ጋር ይቀራሉ። ያንን ስልክ ቁጥር ከእንግዲህ ከሌለዎት «አሁንም እርዳታ ይፈልጋሉ?» ይጫኑ፣ መለያውን እንዲያዛውሩ እንረዳዎታለን።"],
  },
  {
    category: "Account",
    section: "Privacy and safety",
    keywords: "delete account remove data privacy",
    en: ["How do I delete my account?", "Press \"Still need help\" and ask us to delete the account, from the phone number it is registered with. We confirm it is you, then delete it. A deleted account and its progress cannot be brought back."],
    am: ["መለያዬን እንዴት እሰርዛለሁ?", "መለያው በተመዘገበበት ስልክ ቁጥር «አሁንም እርዳታ ይፈልጋሉ?» ተጭነው እንድንሰርዘው ይጠይቁን። እርስዎ መሆንዎን አረጋግጠን እንሰርዘዋለን። የተሰረዘ መለያ እና እድገቱ ተመልሰው አይመጡም።"],
  },
  {
    category: "Account",
    section: "Privacy and safety",
    keywords: "scam password code share safe",
    en: ["Keeping your account safe", "We never ask for your password or the code we send you by SMS. Do not share them with anyone, including people who say they are from MySeed. If someone asks, tell us here."],
    am: ["መለያዎን ደህንነቱ የተጠበቀ ማድረግ", "የይለፍ ቃልዎን ወይም በኤስኤምኤስ የምንልክልዎትን ኮድ በፍጹም አንጠይቅም። ከማይሲድ ነን ለሚሉትም ጭምር ለማንም አያጋሩ። የሚጠይቅዎት ካለ እዚህ ይንገሩን።"],
  },
  {
    category: "App help",
    section: "Lessons and videos",
    keywords: "free preview lesson try before",
    en: ["Can I try lessons before paying?", "Yes. Some lessons in each subject are marked as free previews: open them without a subscription to see how the lessons work."],
    am: ["ከመክፈሌ በፊት ትምህርቶችን መሞከር እችላለሁ?", "አዎ። በእያንዳንዱ የትምህርት ዓይነት አንዳንድ ትምህርቶች «ነጻ ቅድመ እይታ» ተብለው ተለይተዋል፦ ትምህርቶቹ እንዴት እንደሚሰሩ ለማየት ያለ ደንበኝነት ይክፈቷቸው።"],
  },
  {
    category: "App help",
    section: "Quizzes and notes",
    keywords: "quiz score result retake answers",
    en: ["How do quizzes work?", "Each unit has a quiz with a time limit. Choose one answer for each question; when you finish you see your score and which answers were right. You can take a quiz again to improve."],
    am: ["ፈተናዎች እንዴት ይሰራሉ?", "እያንዳንዱ ምዕራፍ የጊዜ ገደብ ያለው ፈተና አለው። ለእያንዳንዱ ጥያቄ አንድ መልስ ይምረጡ፤ ሲጨርሱ ውጤትዎን እና የትኞቹ መልሶች ትክክል እንደነበሩ ያያሉ። ለማሻሻል ፈተናውን እንደገና መውሰድ ይችላሉ።"],
  },
  {
    category: "App help",
    section: "Quizzes and notes",
    keywords: "notes pdf open download read",
    en: ["Notes or PDFs do not open", "Notes need an internet connection to open the first time. If a PDF does not open, update the app and try again on Wi-Fi. If one note still does not open, press \"Still need help\" and tell us the grade, subject and lesson."],
    am: ["ማስታወሻዎች ወይም ፒዲኤፎች አይከፈቱም", "ማስታወሻዎች ለመጀመሪያ ጊዜ ለመክፈት ኢንተርኔት ያስፈልጋቸዋል። ፒዲኤፍ ካልተከፈተ መተግበሪያውን አዘምነው በዋይፋይ እንደገና ይሞክሩ። አንድ ማስታወሻ አሁንም ካልተከፈተ «አሁንም እርዳታ ይፈልጋሉ?» ተጭነው ክፍሉን፣ የትምህርት ዓይነቱን እና ትምህርቱን ይንገሩን።"],
  },
  {
    category: "App help",
    section: "App problems",
    keywords: "data usage mobile data internet cost",
    en: ["The app uses a lot of mobile data", "Videos use the most data. Watch on Wi-Fi when you can, and close videos you are not watching. Notes and quizzes use little data."],
    am: ["መተግበሪያው ብዙ የሞባይል ዳታ ይጠቀማል", "ብዙ ዳታ የሚጠቀሙት ቪዲዮዎች ናቸው። በሚችሉበት ጊዜ በዋይፋይ ይመልከቱ፣ የማይመለከቷቸውን ቪዲዮዎች ይዝጉ። ማስታወሻዎችና ፈተናዎች ትንሽ ዳታ ይጠቀማሉ።"],
  },
  {
    category: "FAQ",
    section: "About MySeed",
    keywords: "grades curriculum which grades",
    en: ["Which grades does MySeed cover?", "MySeed has lessons for grades 5 to 12, following the school curriculum, with Natural and Social streams for grades 11 and 12, and national exam practice for the exam grades."],
    am: ["ማይሲድ የትኞቹን ክፍሎች ይሸፍናል?", "ማይሲድ ከ5ኛ እስከ 12ኛ ክፍል ድረስ የትምህርት ሥርዓቱን የሚከተሉ ትምህርቶች አሉት፤ ለ11ኛ እና ለ12ኛ ክፍል የተፈጥሮ እና የማኅበራዊ ሳይንስ ዘርፎች፣ ለብሔራዊ ፈተና ክፍሎችም የብሔራዊ ፈተና ልምምድ አለው።"],
  },
  {
    category: "FAQ",
    section: "About MySeed",
    keywords: "offline without internet download",
    en: ["Can I study without internet?", "Lessons and videos need an internet connection. Use Wi-Fi where you can to save mobile data."],
    am: ["ያለ ኢንተርኔት መማር እችላለሁ?", "ትምህርቶቹና ቪዲዮዎቹ የኢንተርኔት ግንኙነት ያስፈልጋቸዋል። የሞባይል ዳታ ለመቆጠብ በሚችሉበት ቦታ ዋይፋይ ይጠቀሙ።"],
  },
];

// Adds the second set once: the new answers, and a section on the starter answers that have none.
async function ensureStarterHelpV2() {
  if (await getMeta("help.starter.v2")) return;
  await setMeta("help.starter.v2", nowIso());
  const now = nowIso();
  for (const s of MORE)
    for (const lang of ["en", "am"] as const) {
      const [title, body] = s[lang];
      if (await get("SELECT id FROM sup_articles WHERE title = ?", title)) continue;
      await run("INSERT INTO sup_articles (id, title, body, category, keywords, published, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 'article', ?, ?)", uid("art_"), title, body, s.category, `${s.keywords} lang:${lang} section:${s.section.replace(/ /g, "_")} starter`, now, now);
    }
  for (const [title, section] of [...Object.entries(SECTIONS), ...Object.entries(AM_TITLE)])
    await run("UPDATE sup_articles SET keywords = keywords || ? WHERE title = ? AND keywords LIKE '%starter%' AND keywords NOT LIKE '%section:%'", ` section:${section.replace(/ /g, "_")}`, title);
}

// An article's section from its keywords (section:Profile_and_family), or null.
export const articleSection = (keywords: string | null | undefined) => (keywords ?? "").match(/\bsection:([\w-]+)/)?.[1]?.replace(/_/g, " ") ?? null;

// An article's language from its keywords: en, am, or null (any).
export const articleLang = (keywords: string | null | undefined) => (/\blang:am\b/.test(keywords ?? "") ? "am" : /\blang:en\b/.test(keywords ?? "") ? "en" : null);
