# myseed.com.et content inventory

Every piece of public content on the current website, https://myseed.com.et, captured on 10 October 2026. Use it to bring the real MySeed story into the new site through the admin console.

The current site is a single-page app with seven public routes: `/`, `/about`, `/products`, `/gallery`, `/sponsor`, `/contact` and `/article`. `robots.txt` blocks `/admin`, `/sign-in` and `/sign-up`. There is no sitemap. Text is quoted exactly as published.

Images were downloaded to `docs/content/myseed-com-et-assets/` in the repository. Upload them in **Admin, Media library** and add English and Amharic alt text.

## Before you migrate: the two sites tell different stories

The new site was seeded with placeholder content. Several placeholders contradict how myseed.com.et describes the company. Replace or remove them first:

| Topic | myseed.com.et (real) | New site placeholder | Where to fix it in the admin |
| --- | --- | --- | --- |
| What MySeed is | MySeed EdTech PLC, an education technology company. The product is a **mobile learning app** for Grades 5 to 12. | A school program with offline solar labs and teacher training in 300+ schools. | Interface copy in `apps/web/lib/i18n/en.ts` and `am.ts` (homepage, about, schools), plus Articles and FAQs |
| Founder story | Co-founded by **Teacher Dani**, a well-known Ethiopian physics teacher and content creator (TikTok), with technology, business and education professionals. | Started in 2019 as a weekend robotics club. | `about.story` and `about.timeline` in the interface dictionaries; Team page |
| Giving | **Sponsor a student: 399 ETB per month** for one student's app access. Pay with Chapa or bank transfer. | General fundraising campaigns with scholarships and devices. | Fundraising, Campaigns |
| Impact numbers | None published. | 300+ schools, about 48,000 students, 9 regions. | Remove or replace the impact stats (`SEED_IMPACT_STATS`) and the homepage Impact sections in **Pages** |
| Contact | hello@myseedacademy.com and info@myseed.com.et. Office: Goro, Fresh Corner Goro branch building, 3rd floor. | hello@ and legal@ addresses on myseedacademy.org, Bole Road address. | Footer address and legal pages in the interface dictionaries; Integrations (WhatsApp and Telegram) |
| Apps | App Store and Google Play links (below). | No app links. | Add to the homepage hero or CTA, and the footer |

Sections of the new homepage that have no real equivalent yet (*Impact map*, *School solutions*, *Inside a lesson*, *Languages*) can be archived in **Admin, Pages** without deleting them. Make a draft, archive the sections, preview it, then apply it to the main site.

## Site-wide

**Brand line:** myseed ACADEMY
**Tagline (footer):** A learning companion for Ethiopian students in Grades 5–12. Watch, understand, practise, and grow from wherever you are.
**Sign-off:** A small lesson can change a student's future.
**Copyright:** © 2026 MySeed EdTech PLC. Built for Ethiopian students. Powered by education and technology.

**Navigation:** Home · About Us · Our Products · Sponsor Students · Gallery · Article · Contact Us · iOS · Android

**Apps**
- App Store: https://apps.apple.com/us/app/myseed/id6760313572
- Google Play: https://play.google.com/store/apps/details?id=com.noor.ethiopia

**Social**
- TikTok: https://www.tiktok.com/@myseed_academy
- Facebook: https://www.facebook.com/share/1KTG8mUy4c/
- YouTube: https://youtube.com/@myseed-school
- Instagram: https://www.instagram.com/myseed_academy
- Telegram: https://t.me/MySeed_Academy (set as the support username in **Integrations, Telegram**: `MySeed_Academy`)
- Website: https://www.myseed.com.et

**Email:** hello@myseedacademy.com (students, parents and partners) and info@myseed.com.et
**Office:** Goro, Fresh Corner Goro branch BLDG, 3rd floor, MySeed Academy (Addis Ababa)

## SEO metadata per page

Add these in **Admin, SEO, Page metadata** to keep the titles and descriptions that already rank.

| Current path | New site path | Title | Meta description |
| --- | --- | --- | --- |
| `/` | `/` | Online Tutoring for Ethiopian Students · MySeed Academy | MySeed Academy helps Ethiopian students in Grades 5–12 learn with clear video lessons, interactive practice, quizzes, revision tools, and progress tracking—all in one mobile learning platform. |
| `/about` | `/about` | About MySeed EdTech · MySeed Academy | Discover how MySeed EdTech PLC and Teacher Dani are making quality education more accessible, affordable, modern, and engaging for students across Ethiopia. |
| `/products` | `/learning` | Learning App and Tutoring Platform · MySeed Academy | Explore MySeed Academy's mobile tutoring platform for Ethiopian Grades 5–12, featuring curriculum-focused videos, reading materials, practice questions, quizzes, revision, and progress reports. |
| `/gallery` | none yet | MySeed Learning App Gallery · MySeed Academy | See MySeed Academy in action through real app screens showcasing interactive lessons, Ethiopian curriculum courses, student progress tracking, parent reporting, and more. |
| `/sponsor` | `/donate` | Sponsor an Ethiopian Student · MySeed Academy | Sponsor an Ethiopian student's MySeed Academy learning access for 399 ETB per month. Support one or more learners securely by bank transfer or Chapa. |
| `/contact` | `/contact` | Contact MySeed Academy · MySeed Academy | Contact MySeed EdTech PLC in Addis Ababa for student support, school partnerships, sponsorship opportunities, media enquiries, or feedback about the MySeed learning platform. |
| `/article` | `/resources/articles/why-engaging-learning-matters` | Why Engaging Learning Matters · MySeed Academy | Learn why attention, active practice, clear teaching, and meaningful feedback can improve understanding and academic confidence for Ethiopian students. |

When the new site replaces the old one on the same domain, add these in **Admin, SEO, Redirects** so existing links and rankings carry over:

| From | To |
| --- | --- |
| `/products` | `/learning` |
| `/sponsor` | `/donate` |
| `/article` | `/resources/articles/why-engaging-learning-matters` |
| `/gallery` | `/learning` (until a gallery page exists) |

## Home (`/`)

**Hero**
- Heading: Your next breakthrough starts here.
- Text: MySeed brings clear teaching, engaging practice, and a sense of progress to one mobile learning companion — built for Ethiopian students in Grades 5–12.
- Buttons: Sponsor Students · Discover the idea

**The MySeed rhythm**
- Eyebrow: THE MYSEED RHYTHM
- Heading: Learn · practise · grow
- Subheading: Progress you can feel
- Text: From the first question to the next confident answer, MySeed is designed to make learning feel possible — and worth returning to.
- Tags: GRADES 5–12 · MOBILE-FIRST · MADE FOR ETHIOPIA

**The MySeed difference**
- Heading: Learning is a cycle, not a single sitting.
- Text: We bring together the formats students need to understand deeply and return with confidence.
- Link: Why we built MySeed (to About)
- Four steps:
  - **Watch:** Clear video lessons that make difficult subjects easier to enter.
  - **Understand:** Readable content gives students another way to meet the idea.
  - **Practise:** Questions and practice turn recognition into real understanding.
  - **Improve:** Quizzes, revision, and progress tracking make the next step visible.

**Learning starts with people**
- Heading: When teaching feels human, students keep going.
- Text: Teacher Dani's classroom approach sits at the heart of MySeed: make complex ideas simple, practical, and engaging enough to try again.
- Link: Meet Teacher Dani
- Image caption: Teaching that connects (`teacher-dani-classroom.png`)

**Inside the learning companion**
- Heading: See the app that makes progress tangible.
- Text: Real screens from MySeed — not a promise on a page, but a learning experience students can open and use.
- Link: View the full gallery

**A quick way to give**
- Heading: Put a month of learning within reach.
- Text: Each 399 ETB sponsorship gives one Ethiopian student a month of uninterrupted MySeed learning access.
- Options: 1 student, 399 ETB per month · 3 students, 1,197 ETB per month · 5 students, 1,995 ETB per month
- Link: Choose another number of students

**For every kind of learner**
- Heading: Start small. Keep going.
- Text: A smartphone can become a classroom. A video can become a teacher. A little progress can become momentum.
- **For the curious:** Explore a new subject with a lesson that meets you where you are.
- **For the persistent:** Return to a tricky idea with revision, practice, and another explanation.
- **For the focused:** Use subject resources and quizzes to prepare with intention.
- **For the growing:** See learning progress and make the next step your own.

**Questions, answered** (add these in **Admin, FAQs**)
- Heading: A clearer way to begin.
- Text: No grand promises. Just thoughtful tools that help students learn better.

| Question | Answer |
| --- | --- |
| Who is MySeed for? | MySeed is designed for students from Grade 5 to Grade 12, including learners preparing for important national examinations. |
| What can a student do on MySeed? | Students can watch video lessons, read subject content, answer questions, practise, take quizzes, revise, and follow their learning progress. |
| Why is MySeed different? | It combines the clarity of teacher-led learning with the engagement of modern digital platforms, so students can stay curious and keep trying. |

**Closing**
- Eyebrow: THE NEXT LESSON IS YOURS
- Heading: Let's help your potential grow.
- App Store and Google Play buttons

## About (`/about`)

**Hero**
- Eyebrow: ABOUT MYSEED EDTECH PLC
- Heading: Reimagining education for a new generation.
- Text: MySeed is an Ethiopian education technology company with a bold mission: to make quality education accessible, affordable, modern, and engaging for every Ethiopian student.

**The founding idea**
- Heading: Great teaching should travel.
- At the centre of MySeed is Teacher Dani, one of Ethiopia's well-known physics educators and educational content creators. Through his teaching experience and ability to make complex subjects simple, practical, and enjoyable, he showed that education does not have to be boring to be effective.
- Together with a team of technology, business, and education professionals, he co-founded MySeed — a digital learning platform created to bring this approach to students across Ethiopia.
- Quote: "Students do want to learn — they simply want to learn differently."

**Mission, vision, objectives**
- Heading: A clear direction for better learning.
- Text: Three commitments keep MySeed focused on what matters most: helping more students learn with confidence.
- **Our mission:** Make quality education accessible, affordable, engaging, and effective. A smartphone can become a classroom. A video can become a teacher. A question can become an opportunity to improve.
- **Our vision:** Every student can reach modern, high-quality resources. A student in Addis Ababa and a student in a rural community should be able to reach the same quality of educational resources.
- **Our objectives:** Turn access into real progress.
  - Make learning engaging enough to return to.
  - Connect teaching, practice, revision, and progress.
  - Help students learn, improve, and achieve their goals.

**Meet Teacher Dani** (add Teacher Dani in **Admin, Team** with `teacher-dani-physics.png`)
- Heading: The idea began with a different way to teach.
- Caption: TEACHER DANI · LEARNING IN ACTION
- Teacher Dani is a prominent Ethiopian physics teacher and digital education content creator known for his engaging teaching style and educational presence, particularly on social media platforms such as TikTok.
- Rather than simply presenting information, he focuses on making students understand, participate, and enjoy the learning process. His connection with Ethiopian students demonstrated something important: engagement belongs in education.
- The goal is not to turn education into entertainment. The goal is to make education engaging enough that students actually want to learn.

**What guides us**
- Heading: Everything comes back to one question.
- **Teacher-led:** MySeed is rooted in real teaching experience, with Teacher Dani bringing practical understanding of students and classrooms.
- **Engagement-driven:** We design content to capture attention and encourage students to keep learning.
- **Built for Ethiopia:** Our content, learning experience, and product direction are built around the needs of Ethiopian students.
- **Focused on results:** Our measure of success is students who learn, improve, succeed, and achieve their academic goals.
- Closing line: Does this help the student learn better?

## Products (`/products`)

**Hero**
- Eyebrow: OUR PRODUCTS
- Heading: A learning experience, not just an app.
- Text: MySeed brings video, reading, interaction, practice, assessment, and progress together for students in Grades 5–12.
- App Store and Google Play buttons

**Inside the learning companion**
- Heading: One app. Many ways to understand.
- Text: Real screens from MySeed — not a promise on a page, but a learning experience students can open and use.

**What students can do**
- Heading: The learning loop keeps moving.
- Text: Different students need different ways in. MySeed keeps those doors connected.
1. **Video lessons:** Meet complex ideas through clear, teacher-led explanations.
2. **Subject resources:** Move through grade-based academic courses at your own pace.
3. **Questions & practice:** Turn understanding into confidence by answering and trying again.
4. **Progress reports:** See learning activity and make the next step visible.

**Closing**
- Eyebrow: PUT MYSEED IN YOUR POCKET
- Heading: Start with one lesson. Keep growing.

## Gallery (`/gallery`)

- Eyebrow: GALLERY / REAL SCREENS
- Heading: A closer look at the learning journey.
- Text: Tap any screen to open it. Each image shows a different way MySeed helps learning feel active and visible.

| Image file | Label | Title | Caption |
| --- | --- | --- | --- |
| `app-interactive-learning.png` | LEARN BY DOING | Interactive learning | A mobile learning space built to make every subject feel active, visual, and worth returning to. |
| `app-parent-reporting.png` | SEE THE JOURNEY | Parent reporting | Progress reports make a student's learning rhythm easier to understand and support. |
| `app-subject-courses.png` | BUILD YOUR SKILLS | Subject courses | Academic courses are organised by grade and subject, ready when a learner is. |
| `app-welcome-screen.png` | MADE FOR STUDENTS | A welcoming start | A focused, friendly entry point to the MySeed learning experience. |
| `app-ready-to-learn.png` | YOUR NEXT STEP | Ready to learn | The same learning companion, designed to feel familiar from the very first tap. |

## Sponsor (`/sponsor`)

Set this up as a campaign in **Admin, Campaigns**, for example "Sponsor a student", 399 ETB per student per month.

**Hero**
- Eyebrow: MAKE AN IMPACT
- Heading: Empower a student's journey.
- Text: Your sponsorship provides uninterrupted access to quality education for Ethiopian students. Choose how many minds you want to ignite today.

**Form**
- How many students? Every student supported is a life changed and a future brightened. (Stepper, 399 ETB each.)
- Your details: Full name (required), Email address, Phone number, Reason for sponsoring (optional)
- Payment method:
  - **Pay with Chapa:** Credit cards, Telebirr, CBE Birr. Connect it in **Admin, Integrations, Chapa**.
  - **Bank transfer:** Direct deposit or local ATM. "Please transfer exactly 399 ETB to one of the accounts below, then upload your receipt." The receipt accepts JPG, PNG or WebP up to 6 MB.
- Summary: 1 Student, 1 × 399 ETB, total monthly 399 ETB. Button: Sponsor for 399 ETB.
- Note: By sponsoring, you agree to our terms of support. Payments are processed securely.

**Published bank accounts** (all in the name MY SEED EDTECH PLC)

| Bank | Account number |
| --- | --- |
| Commercial Bank of Ethiopia | 1000791918301 |
| Bank of Abyssinia | 266700277 |
| Awash Bank | 013041808563700 |
| Dashen Bank | 0195110486011 |
| Cooperative Bank of Oromia | 1011700338377 |

The new site does not have a bank-transfer option with receipt upload yet. Until it does, the donate page message for bank transfers ("Contact us to give by bank transfer") can list these accounts.

## Contact (`/contact`)

- Eyebrow: CONTACT US
- Heading: Let's keep the conversation learning.
- Text: Have a question about MySeed, an idea for a partnership, or feedback from your learning journey? We'd love to hear from you.
- **Reach the team:** Good questions make better education. Email us at hello@myseedacademy.com, for students, parents, and partners. We're building from Ethiopia, for Ethiopia.
- Form: Your name, Email address, Your message, Send message
- **Find MySeed:** Stay close to the classroom. Office location: Goro, Fresh Corner Goro branch BLDG, 3rd floor, MySeed Academy
- **Connect with us online:** TikTok, Facebook, YouTube, Instagram, Telegram, Website, info@myseed.com.et

## Article (`/article`)

Add this as an article in **Admin, Articles**. Slug: `why-engaging-learning-matters`. The headings below become Heading blocks in the editor and the quote becomes a Quote block.

**Title:** Why engaging learning matters for Ethiopian students.
**Summary:** Students do want to learn. The question is whether the experience gives them a reason to keep going.

**Body**

Education is one of the most important things a student can receive. But access to a lesson is not the same as access to understanding.

For many Ethiopian students, the path through school includes long lectures, static textbooks, limited practice resources, and unequal access to experienced teachers. These are not small details. They shape whether a student feels capable of meeting a difficult subject.

### Attention is a doorway, not the destination.

Students already know what an engaging digital experience feels like. They move through TikTok, YouTube, Netflix, and other platforms that understand how to capture attention and make people want to continue. Education has often been asked to compete with that experience while remaining static.

MySeed asks a practical question: why can't learning be engaging? Not because education should become entertainment, but because attention gives understanding a chance to begin.

> "The goal is to make education engaging enough that students actually want to learn."

### Students want to learn differently.

Teacher Dani's work as an Ethiopian physics teacher and digital education creator made this visible. His approach is to make complex subjects simple, practical, and enjoyable — to make students understand, participate, and feel part of the learning process.

That insight became one of the foundations of MySeed. Some students learn by watching. Others need to read. Others learn through questions, repeated practice, revision, or the small confidence that comes from seeing their progress move forward.

### Built for the gap between potential and access.

Every year, students work toward important examinations without the same access to private tutoring, quality learning materials, practice, or personalised academic support. For some, tutoring is too expensive. For others, resources are not easily available where they live.

Technology cannot solve every challenge in education. It can, however, help quality educational resources reach more students. A smartphone can become a classroom. A video can become a teacher. A question can become an opportunity to improve.

### An invitation to try again.

MySeed is built around a simple learning cycle: watch, understand, read, practise, answer, test, improve. It is a reminder that a question is not a judgement. It is an invitation to try one more time.

Our ultimate measure is not the number of downloads. It is the number of students who learn, improve, succeed, and achieve their academic goals. We want students to stop saying, "I can't understand this," and start saying, "Let me try again."

A small lesson can change a student's future.

## Images

| File | Size | Alt text on the current site | Suggested use |
| --- | --- | --- | --- |
| `leaf-mark.png` | 196 × 168 | MySeed Academy leaf mark | Brand mark |
| `teacher-dani-classroom.png` | 320 × 180 | Teacher Dani teaching in front of a classroom chalkboard | Homepage "Learning starts with people" (low resolution, so ask for the original) |
| `teacher-dani-physics.png` | 453 × 677 | Teacher Dani teaching physics in a classroom | Team photo, About page |
| `app-interactive-learning.png` | 1080 × 1920 | MySeed interactive learning app screens | Hero visual, gallery |
| `app-parent-reporting.png` | 1080 × 1920 | MySeed parent reporting screen showing student progress | Gallery |
| `app-subject-courses.png` | 333 × 592 | MySeed subject courses organised by grade and topic | Programs page |
| `app-welcome-screen.png` | 333 × 592 | MySeed welcome screen | Gallery |
| `app-ready-to-learn.png` | 333 × 592 | Ready to learn | Gallery |

## Content the current site does not have

The new site expects some content that myseed.com.et does not provide. Decide whether to create it or archive the matching sections:
- Amharic versions of every text above. The new site requires English and Amharic for each item.
- Team members besides Teacher Dani.
- Partners and testimonials.
- Events and job openings.
- Privacy policy, terms and accessibility statement for MySeed EdTech PLC.
