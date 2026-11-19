# Call center and phone menu (IVR): setup guide

For Admin and support leads. It covers turning calls on, building the phone menu, setting up queues and agents, what callers hear while they wait, and how to check that it works. Every setting named here is in the app; nothing needs a phone line or a paid service.

How calls work: customers call from the browser (the Telegram support app or the website widget). The call goes through the phone menu, joins a queue, and rings agents who are signed in to Customer support. Audio is browser-to-browser, relayed by a TURN server when the networks need it. A phone-line (SIP) connection is not built.

---

## 1. Before you start

| Check | Where | Why |
|---|---|---|
| Customer support is on | Admin › Customer support › Setup: *Customer support on* | Off hides the desk and the call buttons say support is unavailable |
| Calls are on for the app | Admin › Integrations hub › the app (or the Telegram bot) › Channels: *Calls* | Each connected app or bot can have calls on or off |
| Customers can call | Customer support › Setup: *Customers can call* | The master switch. Off: Telegram and the widget tell customers calls are off; chat keeps working |
| TURN relay is set | Admin › Settings › Calls (TURN) | Without it, calls between some mobile networks connect with no sound. The health check fails in production if calls are on and no relay is set |
| Agents exist | Customer support › Agents | Only agents (and leads) receive calls |
| The Telegram support app is set | Admin › Integrations hub › the bot › Mini App | Telegram bots cannot carry voice; the *Call support now* button opens the support app inside Telegram |

---

## 2. Switches that decide what the caller meets

All in **Customer support › Setup**.

| Switch | Recommended | What it does |
|---|---|---|
| Customers can call | On | Master switch for calls from Telegram and the widget |
| Check for an online agent first | On | When the customer presses *Call support now*, the app checks for a signed-in agent. With none, the customer is told at once ("No agent is online right now…") and offered *Call me back*, instead of waiting in an empty line. With an agent, the customer gets *Call now*, and when all agents are busy, the expected wait |
| Tell callers the expected wait | On | The phone menu says the caller's place in line and about how long until an agent is free |
| Usual call length for the wait estimate | 240 seconds | Used for the estimate until a queue has ten answered calls in the last 30 days; after that the real median wait and call length are used. Set it to your average call length |
| A call rings for | 45 seconds | How long a call rings before it is missed (a queue's own longest wait overrides this for queued calls) |
| Ring the whole queue after | 15 seconds | A call offered to one agent rings every free agent of the queue after this |
| Then also ring (overflow queue) | A backup queue, or nobody | After twice the time above, the overflow queue rings too |
| Only agents checked in at work | Your choice | When on, an agent must be checked in (Attendance) to get calls |
| Record calls | On, with the notice | The customer must agree before a recorded call starts |
| Hours | "Monday to Friday, 8:30 to 17:30" | Said to customers when nobody is online |
| Away message | Short and kind | Shown when a call cannot be taken |

---

## 3. Queues and how calls are shared out

**Customer support › Queues and replies › Call settings**, one queue at a time.

1. **Hours** — the days and times the queue takes calls (Addis Ababa time). Outside them the caller is told the line is closed and offered a call-back.
2. **Size** — the most callers waiting. When full, the overflow queue is tried, then a call-back is offered.
3. **Longest wait** — how long a caller waits before moving once to the overflow queue (then missed, with a message on their conversation).
4. **Routing** — how calls are shared out:

| Routing | Use it when |
|---|---|
| Least busy agent | Default. Evens out the work |
| Round robin | Agents should get calls strictly in turn |
| Longest idle agent | Fairness by rest time; good for busy lines |
| Skill-based | The queue needs a skill (Amharic, payments, technical). Set agents' skills under Agent skills |
| Agent priority | Senior agents first, juniors as overflow; agents are offered in the order listed |
| Manual | Every agent of the queue rings; a lead assigns conversations |

How a call is offered: first to the conversation's own agent (or the agent the phone menu chose); after *Ring the whole queue after*, to every free agent of the queue; then to the overflow queue. One live call per caller and per agent: an agent on a call is not rung again. **Wrap-up** seconds keep an agent out of the rotation after a call so they can write notes.

5. **Priority rules** — move callers up the line: signed in through the app, a topic, a tag, the conversation's priority, or a repeat caller in the last 24 hours. Each rule adds a boost; equal boosts keep their arrival order.
6. **Announcement and music** — what the caller hears while waiting (see section 5).
7. **Call-back offer** — waiting callers can ask to be called back at a chosen time instead of holding.
8. **Service level** — the target answer time used in reports (for example 80% within 30 seconds).

Suggested starting setup for Myseed:

| Queue | Hours | Routing | Overflow | Notes |
|---|---|---|---|---|
| General support | Mon–Fri 8:30–17:30, Sat 9:00–13:00 | Least busy | Payments | Size 15, longest wait 5 minutes |
| Payments | Same | Skill-based (payments) | General support | Priority: topic "payment" +10 |
| Technical (app problems) | Mon–Fri 8:30–17:30 | Skill-based (technical) | General support | Wrap-up 60 s |

---

## 4. Building the phone menu

**Customer support › Phone menu**. Build on the canvas, connect each node's outputs, run a **Test call**, then **Publish** (a numbered version) and switch it on. Earlier versions can be restored. An **emergency announcement** (Flow settings) plays before everything, for outages.

The node kinds:

| Node | What it does |
|---|---|
| Welcome message | Greets, then goes on |
| Language selection | English or Amharic for the rest of the call |
| Audio playback / Text-to-speech | Plays a recording, or speaks a text |
| Menu | Numbered choices; wrong or no key repeats up to the retry limit |
| Keypad input | Collects digits (an account number) into a named value |
| Business hours check / Holiday check | Branches on opening hours and public holidays |
| Customer identification | Knows signed-in callers, or by a phone number typed |
| Payment verification routing | Looks up the caller's recent Chapa payments: paid, failed or none |
| Condition | Branches on language, topic, tag, open conversation or request |
| Queue entry / Department routing / Agent routing / Transfer | Where the caller goes; each has a "full" or "unavailable" output |
| Voicemail / Call-back request | When nobody can take the call |
| Repeat menu / End call | Back to the last menu, or goodbye |

**Recommended flow** (each step is one node):

```
Emergency announcement (only when set)
  → Welcome ("Welcome to Myseed support.")
  → Language: 1 English · 2 አማርኛ
  → Business hours check
       closed → Text-to-speech (hours) → Call-back request → End
       open   → Holiday check
                  holiday → same as closed
                  open    → Menu
  → Menu:
       1 Payments and subscriptions → Customer identification → Payment verification routing
            paid    → TTS "Your payment is confirmed…" → Menu (repeat) or Queue: Payments
            failed  → Queue: Payments (priority)
            none    → Queue: Payments
       2 App or video problems → Queue: Technical
       3 Something else        → Queue: General support
       0 Repeat the menu       → Repeat menu
       no key / wrong key ×3   → Queue: General support
  → Every queue's "full" output → Call-back request → End
```

Keep menus to four choices or fewer, put the most common reason first, and always give a way to reach a person.

---

## 5. What callers hear while they wait

While a call waits in a queue, the caller's screen shows their place in line and the expected wait, and the phone menu speaks (or plays the uploaded recording) every *repeat* seconds:

> "Thank you for calling Myseed. All our agents are helping other customers. You are number 3 in line. The expected wait is about 4 minutes."

- **Place in line** counts callers ahead in the same queue, by priority and arrival.
- **Expected wait**: with ten or more answered calls in the queue over 30 days, the larger of the median wait and (callers ahead × median call length ÷ agents online). With less history, (callers ahead − free agents) × *Usual call length* ÷ agents online, shown as approximate. With nobody online, no estimate is given and the caller is offered a call-back.
- Soft hold music plays between announcements, unless the queue turns music off.
- Turn the spoken estimate off with *Tell callers the expected wait*.

**Waiting message (Customer support › Setup › Waiting message for callers)** — suggested texts:

| Language | Text |
|---|---|
| English | Thank you for calling Myseed. All our agents are helping other customers. Please stay on the line; your call matters to us. |
| Amharic (have a native speaker check) | ማይሲድን ስለደወሉ እናመሰግናለን። ሁሉም ወኪሎቻችን ሌሎች ደንበኞችን እያገለገሉ ነው። እባክዎ በመስመር ላይ ይቆዩ። |

Use a calm voice recording (MP3 or OGG, up to 4 MB) if you have one; spoken text is the fallback.

---

## 6. Calls from Telegram, step by step

1. The customer opens the bot and presses **Call support now**.
2. With *Check for an online agent first* on, the bot answers in their language:
   - **Nobody online**: "No agent is online right now. We answer calls Monday to Friday, 8:30 to 17:30. Ask us to call you back, or write your question here." with **Call me back** and **Main menu**.
   - **Agents online but busy**: "All agents are busy. About 4 minutes wait; you will hear your place in line." with **Call now**.
   - **An agent free**: "An agent is free now." with **Call now**.
3. **Call now** opens the support app inside Telegram, which asks for the microphone, runs the phone menu, and joins the queue.
4. If the agent cannot connect in 25 seconds (network), the customer is offered a call-back.
5. Agents can also call a Telegram customer: the bot sends a notice with a button that opens the support app to answer.

---

## 7. Agents

- Agents receive calls only while signed in to **Customer support** (and checked in, if that switch is on). Keep the desk open in a tab; allow notifications and the microphone.
- Set each agent's **skills** (Agent skills) and queue membership.
- After a call: set the **outcome**, notes and tags in Call records; wrap-up time is protected.
- Hold, transfer to another agent, and invite a colleague into the call are in the call bar.

---

## 8. Test before going live

1. Sign in as an agent on one device and open Customer support.
2. On a phone, open the Telegram bot and press *Call support now*: you should see *An agent is free now*.
3. Call, go through the menu, and answer on the agent device. Check both directions of sound, on Wi-Fi and on mobile data.
4. Sign the agent out and press *Call support now* again: you should get *No agent is online right now* and *Call me back*.
5. With two test callers and one agent, check that the second caller hears "number 2 in line" and an expected wait.
6. Outside the queue's hours, check that the caller is told the line is closed and offered a call-back.
7. Check Customer support › Live queues during the tests, and Call records afterwards (recording, outcome).

---

## 9. Daily running

| Who | What |
|---|---|
| Support lead, morning | Live queues: agents online, callers waiting; call-backs due today |
| Support lead, weekly | Monitor › calls by queue, phone menu use (where callers drop off), service level |
| Admin, monthly | Recording retention, call record export, phone menu version review |
| During an outage | Set the emergency announcement in the phone menu; remove it after |

Common problems:

| Symptom | Likely cause | Fix |
|---|---|---|
| Customers always hear "No agent is online" | Agents are not signed in to the desk, or must be checked in | Open Customer support; check *Only agents checked in at work* |
| Call connects with no sound | No TURN relay, or a network blocking it | Set TURN (section 1); try Wi-Fi |
| No *Call support now* button in Telegram | Calls off for the bot, *Customers can call* off, or the Mini App is not set | Section 1 |
| No wait estimate | Nobody online, or *Tell callers the expected wait* off | Section 2 |
| Estimate looks wrong | *Usual call length* far from reality | Set it to your average call length |
