# Product Brief
## MySeed Academy: The Mobile STEM Learning Companion for Ethiopia

**Product Name:** MySeed Academy (Mobile App & Web Platform)  
**Company:** MySeed EdTech PLC (Addis Ababa, Ethiopia)  
**Document Identifier:** MYSEED-PB-2026-V2  
**Target Audience:** Ethiopian Students Grades 5–12, Parents, Educators, and Sponsors  
**Version:** 2.4  
**Date:** 2026-11-16  
**Product Leadership:** Co-Founders (Teacher Dani & Executive Team)  

---

## 1. Executive Summary

MySeed Academy is an Ethiopian educational technology platform designed to transform secondary STEM education across Ethiopia. Co-founded by **Teacher Dani**—one of Ethiopia's prominent physics educators and digital content creators—and a team of seasoned technology and business leaders, MySeed solves the chronic educational divide between elite private academies and under-resourced public schools.

By delivering curriculum-aligned, bilingual (English and Amharic) video lectures, interactive problem-solving checkpoints, and adaptive practice directly to students' smartphones, MySeed brings high-quality tutoring within reach for every learner. Access is priced at a radically affordable **399 ETB per month**—underwriting an all-inclusive learning companion that functions seamlessly over low-bandwidth mobile networks and in completely offline environments.

```
                     THE MYSEED RHYTHM
  ┌──────────┐     ┌─────────────┐     ┌────────────┐     ┌───────────┐
  │  WATCH   │ ──> │ UNDERSTAND  │ ──> │  PRACTISE  │ ──> │  IMPROVE  │
  │ Video    │     │ Guided      │     │ In-Video   │     │ Adaptive  │
  │ Lessons  │     │ Reading     │     │ Questions  │     │ Analytics │
  └──────────┘     └─────────────┘     └────────────┘     └───────────┘
```

---

## 2. Problem Statement & Market Reality

### 2.1 The Educational Landscape in Ethiopia
1. **Severe Student-to-Teacher Ratios:** In government schools across Addis Ababa, Oromia, Amhara, and regional states, classroom sizes routinely reach 60 to 80 students per teacher, preventing personalized attention.
2. **STEM Subject Intimidation & Exam Attrition:** Physics, mathematics, and chemistry suffer from the highest failure rates in national matriculation exams (Grade 8 regional, Grade 10, and Grade 12 national examinations), largely due to abstract, rote-memorization instruction lacking practical demonstrations.
3. **Prohibitive Cost of Private Tutoring:** Private after-school tutoring in urban centers costs between 2,500 and 6,000 ETB per month per subject—completely out of reach for over 90% of Ethiopian households.
4. **Digital Infrastructure Bottlenecks:** While smartphone penetration has expanded rapidly through affordable Transsion devices (Tecno, Infinix, itel), cellular data costs on Ethio Telecom and Safaricom remain a significant constraint, and intermittent power makes uninterrupted online streaming impossible.

### 2.2 The MySeed Opportunity
Over 5 million Ethiopian youth are currently enrolled in Grades 5 through 12. Providing an offline-first, teacher-led mobile application with micro-data consumption transforms any inexpensive smartphone into an interactive classroom.

---

## 3. Product Vision & Value Proposition

### 3.1 Vision Statement
*"To make high-quality, engaging, and practical STEM education accessible, affordable, modern, and inspiring for every student in Ethiopia, regardless of location or economic background."*

### 3.2 Value Proposition Pillars

| Pillar | How MySeed Delivers |
| :--- | :--- |
| **Teacher-Led Pedagogy** | Rooted in Teacher Dani's proven teaching style: breaking complex physics and math into everyday analogies, visual experiments, and engaging micro-lectures. |
| **100% Curriculum Alignment** | Strictly mapped to the Federal Democratic Republic of Ethiopia Ministry of Education national curriculum for Grades 5 through 12. |
| **Bilingual Parity** | Content, formulas, subtitles, and explanatory hints delivered with full parity in English and Amharic, respecting the bilingual transition from primary to secondary school. |
| **Extreme Data Efficiency** | High-efficiency 360p HLS video streams ($<1.8\text{ MB/minute}$) and single-tap offline bundle downloads allow complete lessons to be reviewed without data. |
| **Radical Affordability** | 399 ETB / month subscription (or community sponsorship), powered by frictionless local mobile money (Telebirr, Chapa, CBE Birr). |

---

## 4. Target Personas

### Persona A: The Matriculation Candidate
- **Name:** Abebech Tsegaye (Age 17, Grade 12)
- **Location:** Hawassa, Sidama Region
- **Device:** Shared Tecno Spark 7 (Android 11 Go, 2GB RAM)
- **Pain Point:** Anxious about the Grade 12 national physics and chemistry exam; school lacks laboratory apparatus; cannot afford private weekend prep classes.
- **MySeed Journey:** Abebech downloads Grade 12 physics modules while on school WiFi or late-night data bundles; solves practice questions offline; watches Teacher Dani's breakdown of previous national exam questions.

### Persona B: The Foundation Explorer
- **Name:** Dawit Haile (Age 13, Grade 7)
- **Location:** Goro / Bole, Addis Ababa
- **Device:** Mother's Samsung Galaxy A12 (Android 12, 3GB RAM)
- **Pain Point:** Struggles with the transition from Amharic-language elementary science to English-language secondary mathematics; loses focus during passive textbook reading.
- **MySeed Journey:** Watches short, 8-minute interactive video lessons in Amharic with English terminology side-by-side; tackles in-video pause challenges; builds a 14-day study streak.

### Persona C: The Diaspora / Community Sponsor
- **Name:** Samuel Kebede (Age 34, Software Engineer)
- **Location:** Washington, D.C. / Addis Ababa
- **Device:** iPhone 15 Pro, MacBook Pro
- **Pain Point:** Wants to support educational advancement for cousins or underprivileged students in Ethiopia, but lacks a transparent, accountable mechanism.
- **MySeed Journey:** Visits `myseed.com.et/sponsor`; selects "Sponsor 5 Students" (1,995 ETB/month via Stripe or Chapa); receives automated monthly impact reports showing anonymous student study hours and mastery gains.

---

## 5. Core Feature Matrix & Capabilities

```text
mindmap
  root((MySeed Academy))
    Watch
      Adaptive HLS Streaming
      360p Low-Data Mode
      Resumable Downloads
      Teacher Dani Micro-Lectures
    Understand
      Bilingual Study Notes
      Interactive KaTeX Formulas
      Visual Science Diagrams
      Vocabulary Glossaries
    Practise
      In-Video Checkpoints
      Stepwise Amharic Hints
      National Exam Past Papers
      Instant Grading
    Improve
      Mastery Dashboard
      Daily Learning Streaks
      Parent SMS / Telegram Digest
      Topic Revision Engine
    Platform Ops
      Telebirr & Chapa Payments
      Offline SQLite Sync
      Low-Spec Android Optimization
      Encrypted Vault & RBAC
```

### 5.1 Learning Experience (Student App)
1. **Interactive Video Player:** HLS adaptive playback with automated pause checkpoints, scrubbing restrictions during first-time viewing, and subtitle toggle (English / Amharic).
2. **Bilingual Hint Engine:** Three tiers of hints per problem (Concept, Formula, Step-by-Step) preventing student abandonment without giving away the answer.
3. **National Examination Simulator:** Timed practice modules calibrated to past Grade 8, 10, and 12 Ethiopian national exam standards with step-by-step solution breakdowns.
4. **Offline Download Vault:** Secure local storage of video blobs and metadata, permitting full lesson completion with zero cellular connectivity.

### 5.2 Parent & Guardian Engagement
1. **Weekly Progress Digest:** Automated SMS and Telegram updates reporting total learning minutes, lessons mastered, and current streaks.
2. **Encouragement Prompts:** Nudges parents with actionable discussion prompts based on what their child learned this week.

### 5.3 Administrative Console & Teacher CMS
1. **Bilingual Resource Manager:** Structured authoring demanding both English and Amharic assets before publishing.
2. **Page Builder & Live Preview:** Multi-device preview iframe (320px to 1920px) verifying layout integrity across all nine supported platform locales.
3. **Finance & Sponsorship Ledger:** Real-time reconciliation of Chapa (ETB) and Stripe (USD) transactions, tracking active student seats and funding disbursements.

---

## 6. Success Metrics & Key Performance Indicators (KPIs)

### 6.1 North Star Metric
$$\mathbf{Weekly\ Active\ Learning\ Hours\ (WALH)} = \sum_{i=1}^{N} \left( \text{Watch Time}_i + \text{Practice Time}_i \right)$$
*Target: $> 4.5\text{ hours per active student per week}$.*

### 6.2 Supporting KPIs
- **D30 Retention:** $> 45\%$ of registered learners returning after 30 days.
- **In-Video Checkpoint Pass Rate:** $> 72\%$ first-attempt accuracy across STEM lessons.
- **Offline Sync Reliability:** $> 99.8\%$ of queued offline attempt batches successfully reconciled upon reconnection.
- **Payment Conversion Rate:** $> 88\%$ successful checkout completion on Telebirr/Chapa payment flows.
- **National Exam Performance Delta:** Students using MySeed for $\ge 3\text{ months}$ demonstrate an average $+22\%$ improvement on standardized mock assessments compared to baseline.

---

## 7. Go-To-Market & Growth Strategy

1. **Teacher Dani Social Organic Engine:** Leveraging Teacher Dani's high-traffic TikTok and YouTube following (@myseed_academy) to drive top-of-funnel student interest through viral STEM experiment videos.
2. **School Partnership Pilots:** Deploying classroom bundles and demo accounts to 25 target secondary schools in Addis Ababa, Hawassa, and Adama.
3. **Telebirr SuperApp Mini-App Integration:** Partnering with Ethio Telecom to feature MySeed inside the Telebirr application ecosystem, enabling one-tap subscription billing without card entry.
4. **Diaspora "Sponsor a Student" Drives:** Engaging Ethiopian diaspora communities in North America and Europe to fund batches of rural student accounts at 399 ETB / \$10 per month.

---

## 8. Risks, Assumptions, and Mitigation Matrix

| Risk | Impact | Likelihood | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Prolonged Internet Blackouts** | High | High | Offline-first architecture; lessons can be pre-downloaded and stored locally for up to 30 days without re-authenticating. |
| **High Mobile Data Costs** | High | High | Aggressive video compression (360p @ 250 Kbps); zero unnecessary network pings; audio-only fallback mode. |
| **Device Hardware Limitations** | Medium | High | Rigorous testing on 1GB RAM Android Go devices; lean bundle budgets ($<180\text{KB}$); CSS animations instead of heavy JS runtimes. |
| **Payment Gateway Downtime** | High | Medium | Dual gateway fallback (Chapa + direct bank transfer verification); automatic retry and manual verification queues in the admin console. |

---
*End of Product Brief — MySeed Academy Product Management.*
