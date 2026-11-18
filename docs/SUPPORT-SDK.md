# Customer support SDK and API

Customers of the Myseed App (or any other app or website) can reach the support team from inside the app. They can write a question, follow the answers, rate the help and call an agent from the browser. Their tickets go to the help desk in this workspace (sidebar: Customer support). There, the system gives each ticket to an available agent, tracks the response and resolution targets, records calls and lets leads monitor the agents.

## 1. Connect the app (Admin)

1. Admin, **Support setup**: switch customer support on and choose the support leads.
2. Customer support, **Queues and replies**: make at least one queue (for example "App and account" or "Lessons and content"), add its agents, keywords and targets.
3. Customer support, **Apps and SDK**, then **Connect an app**:
   - **Name**: for example "Myseed App".
   - **Allowed web addresses**: for example `https://app.myseed.et`. Browsers on other addresses are refused. Leave it empty while testing.
   - **First queue**: the queue a ticket goes to when no queue keyword matches.
   - **The app signs who the customer is**: recommended for signed-in customers (see 3).
   - Save. The app's **secret** is shown once. Keep it on the app's server only, never in the app or the web page.

## 2. Add the widget to a web app

```html
<script src="https://YOUR-WORKSPACE/support-sdk.js"></script>
<script>
  MyseedSupport.init({
    appKey: "pk_...",
    user: { id: "123", name: "Abebe Kebede", email: "abebe@example.com", phone: "+2519...", hash: "..." },
  });
</script>
```

| Option         | Meaning                                                                                      |
|----------------|----------------------------------------------------------------------------------------------|
| `appKey`       | The app's public key (Apps and SDK).                                                          |
| `user`         | The signed-in customer: `id` (your id for them), `name`, `email`, `phone`, `hash`, `meta`.   |
| `position`     | `"right"` (default) or `"left"`.                                                              |
| `color`        | The launcher button's colour.                                                                 |
| `label`        | Text beside the icon (default "Help"); `""` for the icon only.                                |
| `hideLauncher` | `true` to open it from your own button with `MyseedSupport.open()`.                           |
| `baseUrl`      | The workspace address, when the script is served from somewhere else.                         |

Methods:
- `MyseedSupport.open()`, `.close()`, `.toggle()`.
- `.identify(user)`: call it after the customer signs in.
- `.shutdown()`: call it after the customer signs out.

`meta` takes up to 20 short facts that agents see beside the ticket, for example `{ grade: "9", plan: "Premium", appVersion: "2.3.1" }`.

Visitors who are not signed in can use it without `user`. They are asked nothing, and their conversations stay on that browser.

## 3. Signing who the customer is

With "The app signs who the customer is" switched on, the app's **server** computes:

```
hash = HMAC-SHA256(key = app secret, message = user.id), as lowercase hex
```

Node.js: `crypto.createHmac("sha256", SECRET).update(String(user.id)).digest("hex")`

The app passes `hash` in `user`. Without a matching hash the widget refuses, so nobody can read another customer's conversations by changing an id.

## 4. Mobile apps (Android, iOS, Flutter, React Native)

There are two options:

1. **Open the widget in a web view**: `https://YOUR-WORKSPACE/support-widget?key=pk_...&id=123&name=Abebe&email=...&hash=...`. Allow the microphone in the web view for calls: on Android grant `RECORD_AUDIO` and `onPermissionRequest`; on iOS set `NSMicrophoneUsageDescription` and `allowsInlineMediaPlayback`.
2. **Use the API** below and build your own screens.

## 5. The API

All requests go to `https://YOUR-WORKSPACE/api/support/v1/...`. They send the header `X-App-Key: pk_...`. After `identify`, they also send `Authorization: Bearer <token>`. Bodies are JSON.

| Request                          | Body                                    | Answer                                            |
|----------------------------------|-----------------------------------------|---------------------------------------------------|
| `POST identify`                  | `{ id, name, email, phone, hash, meta }` | `{ token, customer, app, online, hours, ... }`    |
| `GET tickets`                    |                                         | the customer's conversations                      |
| `POST tickets`                   | `{ subject, message, priority }`        | `{ id }`                                          |
| `GET tickets/<id>/messages`      | `?since=<ISO time>`                     | `{ ticket, messages }`                            |
| `POST tickets/<id>/messages`     | `{ body }`                              |                                                   |
| `POST tickets/<id>/rating`       | `{ rating: 1-5, comment }`              | allowed once the ticket is solved                 |
| `GET articles?q=<words>`         |                                         | help articles matching the words, best first     |
| `GET articles/<id>`              |                                         | one article (title, body, category)               |
| `POST articles/<id>/vote`        | `{ helpful: true or false }`            |                                                   |
| `GET ice`                        |                                         | STUN and TURN servers for calls                   |
| `POST ivr`                       | `{ lang, topic }`                       | the first phone-menu screen, or `null` (no menu)  |
| `POST ivr/<session>`             | `{ key }`                               | the next screen (`"#timeout"` when nothing was pressed) |
| `POST ivr/<session>/leave`       |                                         | the caller hung up in the menu                    |
| `POST voicemail`                 | `{ sessionId, mime, data }`             | `{ ticketId, fileId }` (data is base64 audio)     |
| `POST calls`                     | `{ ticketId, offer, consent, ivrSession }` | `{ callId, ticketId }`                         |
| `GET calls/<id>`                 |                                         | `{ status, answer, agent, position, estimateSec, announcement, callbackOffer }` |
| `POST calls/<id>/end`            |                                         |                                                   |
| `POST callback`                  | `{ phone, ticketId, at }`               | `{ callId, ticketId }` (`at`: a time within two weeks) |
| `GET requests`                   |                                         | requests support raised for the customer: reference, title, plain type and status, linked conversation |
| `GET requests/<id or reference>` |                                         | one request: its plain status steps and, once finished, the outcome. Never the team's notes, people or approvals |
| `GET profile`                    |                                         | name, email, phone, where the name comes from, language, counts |
| `POST profile`                   | `{ name, lang }`                        | `lang` is `en` or `am` (the Telegram bot uses it too). Names from the app's own accounts cannot be changed here |
| `GET faq`                        |                                         | the most read published help articles             |

`identify` also returns `schedule` when business hours are set in Support, Configuration: the week (`days.mon` to `days.sun`, each `{ open, close }` or `null`), the coming `holidays`, `status` (`open`, `holiday`, `nextOpen`) and the `closedMessage`. A conversation started while support is closed is answered with that message at once.

How a call works:
0. When Admin has switched on a phone menu, `POST ivr` returns a screen: `say` (texts to speak or recordings to play), `ask` (choices or digits, and how long to wait), or `done` (where the caller goes). Send each key with `POST ivr/<session>`. When `done.action` is `queue` or `agent`, start the call with `ivrSession`. `voicemail` means record and send `POST voicemail`; `callback` means ask for a number and send `POST callback`. When `POST ivr` returns `null`, go straight to step 1.
1. The app makes a WebRTC offer with the microphone and waits for ICE gathering to finish.
2. It sends the offer as JSON (`RTCSessionDescription`).
3. It checks `GET calls/<id>` every one or two seconds until `status` is `answered`, then sets `answer` as the remote description.
4. While `status` is `ringing`, show `position` (the place in the queue), `estimateSec` (only when the queue has enough history; otherwise `null`), the queue's `announcement`, and a call-back offer when `callbackOffer` is true.
5. `missed` means no agent answered within the queue's longest wait. The ticket then says so, and an agent writes back.
6. A caller has one live call: starting a new one (after a refresh) ends the earlier one. A closed or full queue answers 409 with a message that offers a call-back.

When calls are recorded, the app must show the recording notice (`recordingNotice` from `identify`) and send `consent: true`.

Errors come back as `{ error }` with these codes:
- 400: something is missing.
- 403: wrong key, address or signature.
- 404: not found.
- 409: not possible now, for example support is switched off or nobody can take a call.

## 6. What happens in the desk

- **Assignment**: a new ticket goes to its queue by keywords, else to the app's first queue. It is then given at once to an agent of that queue who is online in the desk and under their limit of open tickets. Admin can also require agents to be checked in at work. The queue decides between "least busy" and "in turn". If nobody is free, the ticket waits and is given out as soon as an agent comes online. Leads are told that it is waiting.
- **Targets**: each queue has a time to first answer and a time to solve. Urgent tickets get a quarter of that time and high-priority ones half. A missed target marks the ticket late and tells the agent and the leads.
- **Phone menu (IVR)**: Customer support › Phone menu. Leads build flows on a canvas from 19 kinds of node (welcome, language, menus, keypad input, hours and holiday checks, conditions, customer identification, payment check, queues, departments, agents, transfer, voicemail, call-back, end), test them on screen, publish numbered versions and switch one on. The spec's default flow (welcome, Amharic or English, the five topics and the operator) is there to start from.
- **Queues for calls**: each queue sets its open hours, how many callers may wait, the longest wait, an overflow queue, an announcement, hold music, a call-back offer, its routing (least busy, round robin, longest idle, skills, agent priority, manual), caller priority rules, wrap-up time and the service-level target. Customer support › Live queues shows waiting callers, agents and today's numbers.
- **Calls**: the call is offered first to the agent the queue picks (or the conversation's agent), then rings for every free agent of the queue. Agents on a call or wrapping up are not offered another. It is recorded in the agent's browser (both voices) when recording is on; the recording goes up in pieces during the call, so a closed tab loses seconds, not the call. Agents can also log phone calls made outside the app.
- **Call records**: a page of its own (sidebar › Call records). Admin, support leads and the managers Admin names see every call; agents see their own. Each record has the queue, wait and talk time, outcome, notes, tags, the related conversation and support request, the lifecycle and the recording (play at any speed; download for leads). Recordings are kept for the days Admin sets unless under legal hold, and every listen and download is logged.
- **Monitoring** (leads): each agent's status, open and solved tickets, replies, average first answer and solve time, calls and minutes, missed calls, customer rating and late tickets, plus the activity log and the recordings.
- **Recognition**: solved tickets count as finished work in the monthly score (on time when within the target). Ratings of 1 or 2 count as work sent back.

## 7. Email and Telegram

Customers who do not use the app can still reach support in two other ways.

**Email.** Admin chooses a mailbox in Support setup, for example `support@...`. It must already be a mailbox in the app (Email, Settings, Mailboxes).
- Mail sent to it opens a ticket. Mail that was already there before the mailbox was chosen is left alone.
- A customer's reply continues the same ticket. The app matches it by the `[#1234]` in the subject or by the email headers, and only when the reply comes from that ticket's customer.
- Agents' replies are sent from the support mailbox.

**Telegram.** Admin creates a bot with @BotFather and pastes its token in Support setup. The app then tells Telegram to send the bot's messages to it. This needs a public https address.
- Customers write to the bot. They get their ticket number, and agents' replies arrive in the same chat.
- **The support app (Mini App).** With the Mini App on, the bot's menu button opens the support app inside Telegram. It signs the customer in with Telegram's signed data (checked on the server; nothing the page claims is trusted). It has Home, Chats (active and history), Requests, Calls (calling, an incoming call, call history) and More (Notifications, FAQ, Profile, Language, Support information). Telegram's own Back and Main buttons, haptics and theme are used. Each agent reply in the chat carries an "Open conversation" button.
- **Deep links.** `/support-widget?tg=<bot>&page=<page>` (or Telegram's `startapp=<page>`) opens a page: `new`, `chats`, `requests`, `calls`, `faq`, `notifications`, `profile`, `language`, `info`, `t_<conversation id>`, `r_<request id>`, `a_<article id>`.

## 8. The knowledge base

Agents write help articles in Customer support, Knowledge base, and leads publish them.
- Customers search published articles in the widget, and see matching articles while typing a question.
- Each article has an "Ask our team instead" button, and reads and "did this help?" votes are counted.
- Agents link articles in their replies. Each article has a public page at `/help/<id>`.
