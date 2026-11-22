# Incident Postmortem
## INC-2026-10-18: Telebirr Payment Webhook Congestion & Database Pool Starvation

**Incident Reference:** INC-2026-10-18-SEV1  
**Severity:** SEV-1 (Critical Outage)  
**Date of Incident:** October 18, 2026  
**Incident Duration:** 42 Minutes (18:42 EAT – 19:24 EAT / 15:42 UTC – 16:24 UTC)  
**Incident Commander:** Lead Site Reliability Engineer  
**Lead Investigator:** Principal Backend Architect  
**Review Status:** Final / Blameless Postmortem Completed  

---

## 1. Executive Summary

On Sunday evening, October 18, 2026, at 18:30 EAT, Teacher Dani published a high-engagement educational video on TikTok and Telegram announcing the launch of the **Grade 12 National Physics Exam Revision Camp**, offering subsidized 399 ETB monthly student sponsorships. Within 15 minutes, concurrent visitor traffic surged from a baseline of $\approx 350$ to over $8,400$ concurrent users.

Between 18:42 EAT and 19:24 EAT, the platform experienced a cascading database connection pool exhaustion on `services/api`. A surge of approximately $1,600$ concurrent Telebirr and Chapa payment webhooks overwhelmed the synchronous webhook handler. Long-running external verification calls nested inside database transactions held PostgreSQL connection slots open for up to $15\text{ seconds}$ each. This saturated the default 20-connection pool, caused database timeouts, triggered the in-memory fallback unexpectedly under heavy write pressure, and resulted in 1,420 students experiencing delayed course enrollments. 

Zero financial transactions were lost. Full reconciliation completed at 19:55 EAT after deploying connection pooling and queue decoupling fixes.

---

## 2. Customer and Business Impact

| Metric | Measured Impact |
| :--- | :--- |
| **Duration of Service Degradation** | 42 minutes |
| **Affected Student Cohort** | 1,420 Grade 12 students with delayed course unlocking |
| **Duplicate Payment Attempts** | 89 duplicate checkouts (fully refunded within 24 hours) |
| **API Error Rate** | Peak 504 Gateway Timeout rate of $38.4\%$ between 18:50 and 19:12 EAT |
| **Permanent Financial Loss** | \$0.00 / 0.00 ETB (all bank transfers and Telebirr logs reconciled) |
| **Public Portal Availability** | Public website (`apps/web`) remained at 100% availability due to Next.js ISR edge caching |

---

## 3. Incident Timeline (All Times in EAT / UTC+3)

- **18:30 EAT:** Teacher Dani posts Grade 12 exam review video across TikTok, YouTube, and Telegram.
- **18:38 EAT:** Traffic to `myseed.com.et/sponsor` and `/learning` increases by $1,800\%$. Edge CDN handles initial asset spikes smoothly.
- **18:42 EAT [ALERT]:** PagerDuty fires SEV-2 alert: `API p95 latency > 3,500ms`.
- **18:45 EAT:** Chapa payment gateway begins firing webhook notifications for completed 399 ETB Telebirr checkouts at $\approx 65\text{ webhooks/sec}$.
- **18:48 EAT [ESCALATION TO SEV-1]:** API logs emit `PrismaClientKnownRequestError: Timed out fetching a connection from the pool (limit: 20)`. API switches into in-memory fallback mode.
- **18:52 EAT:** In-memory fallback prevents crashes, but newly processed transactions are held in memory and do not write to PostgreSQL. Students report on Telegram that payment was deducted from Telebirr but courses remain locked.
- **18:55 EAT:** SRE on-call declares SEV-1 incident. Incident Command Bridge opened on Telegram voice channel.
- **19:02 EAT:** Lead Architect identifies the bottleneck: `POST /api/webhooks/chapa` was executing a synchronous outbound HTTP call to Chapa's `/transaction/verify` endpoint *while holding an open PostgreSQL transaction lock* on the `Campaign` and `User` tables.
- **19:08 EAT:** Team implements immediate operational mitigation: temporarily throttles non-essential public endpoints and increases PostgreSQL connection pool size (`connection_limit=75`).
- **19:15 EAT:** Hotfix patch deployed: decoupled webhook acceptance from downstream verification. Webhook endpoint returns HTTP 200 immediately upon HMAC signature validation and pushes the payload into an in-memory batch processing buffer.
- **19:24 EAT [INCIDENT RESOLVED]:** Database connection pool utilization stabilizes at $24\%$. API latency drops to $85\text{ms}$. Liveness and readiness endpoints report `database: "postgres"`.
- **19:55 EAT:** Background reconciliation script processes all 1,420 pending enrollments. Welcome SMS and course activation confirmations delivered to all students.

---

## 4. Root Cause Analysis (RCA)

### 4.1 The 5 Whys Methodology

```
                                  THE 5 WHYS
 ┌────────────────────────────────────────────────────────────────────────┐
 │ 1. Why did students experience delayed course access?                  │
 │    Because their payment webhooks timed out before updating the DB.    │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 2. Why did the webhooks time out?                                      │
 │    Because the API exhausted its PostgreSQL database connection pool.  │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 3. Why was the database connection pool exhausted?                     │
 │    Because connections were held open for 10–15 seconds per request.   │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 4. Why were connections held open for 10–15 seconds?                   │
 │    Because an external HTTP call to Chapa was nested inside an open    │
 │    Prisma transaction holding a row-level lock on Campaign.            │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 5. Why was an external network call nested inside a database lock?     │
 │    Architectural flaw: lack of an asynchronous worker queue for        │
 │    third-party webhook ingestion and decoupled processing.             │
 └────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Architectural Defect Visual Breakdown

```text
flowchart LR
    subgraph Defective Architecture
        WH1[Webhook Arrives] --> TX1[BEGIN DB Transaction]
        TX1 --> LOCK[Row Lock: Campaign & User]
        LOCK --> EXT[HTTP Call to Chapa API: 5-15s Latency]
        EXT --> COMMIT[COMMIT DB Transaction]
        EXT -.->|Connection Pool Starved| DROP[All Other Requests Blocked]
    end

    subgraph Hardened Architecture
        WH2[Webhook Arrives] --> SIG[Verify HMAC Signature: <2ms]
        SIG --> ACK[Return HTTP 200 OK Immediately]
        SIG --> QUEUE[(Redis BullMQ Async Queue)]
        QUEUE --> WORKER[Background Worker Process]
        WORKER --> EXT2[HTTP Call to Chapa Verify]
        EXT2 --> TX2[BEGIN DB Transaction: <15ms]
        TX2 --> COMMIT2[COMMIT DB Transaction & Unlock Course]
    end
```

---

## 5. What Went Well, What Went Poorly, Where We Got Lucky

### 5.1 What Went Well
- **In-Memory Fallback Prevented Complete Crash:** Rather than crashing with unhandled exceptions, `services/api` switched to `MemoryClient`, allowing read queries to continue serving users without total system failure.
- **Edge CDN Resilience:** The public Next.js website (`apps/web`) handled thousands of concurrent viewers with zero downtime due to static asset caching and ISR.
- **Rapid Incident Triage:** The engineering team identified the exact code block causing connection starvation within 17 minutes of escalation.

### 5.2 What Went Poorly
- **Connection Leak in Database Transactions:** Nesting external HTTP calls inside an ACID transaction violated fundamental database hygiene principles.
- **Inadequate Telemetry on Pool Saturation:** Alerts fired on HTTP response latency rather than proactively warning when pool utilization reached $80\%$.
- **Lack of UI Feedback on Pending Payments:** The frontend checkout screen displayed a generic error rather than informing the student that their Telebirr payment was queued for processing.

### 5.3 Where We Got Lucky
- **Chapa Webhook Retry Protocol:** Chapa's webhook servers automatically queued and retried failed webhook attempts with exponential backoff, preventing permanent transaction drops.
- **Low Nighttime International Traffic:** The incident occurred when international Stripe traffic was low, isolating the issue predominantly to domestic Telebirr channels.

---

## 6. Corrective & Preventative Action Items

| Action ID | Priority | Description | Owner | Target Date | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ACT-001** | **P0** | Refactor webhook ingestion: verify HMAC, respond HTTP 200 immediately, and decouple processing via Redis queue. | Backend Lead | 2026-10-20 | **DONE** |
| **ACT-002** | **P0** | Deploy PgBouncer connection pooling container to manage up to 300 client connections safely. | DevOps / SRE | 2026-10-22 | **DONE** |
| **ACT-003** | **P1** | Add Prometheus alert rule for PostgreSQL pool saturation when utilization exceeds $75\%$ for $>2\text{ min}$. | SRE Lead | 2026-10-24 | **DONE** |
| **ACT-004** | **P1** | Implement client-side pending payment polling UI with animated status indicator on `/donate/success`. | Frontend Lead | 2026-10-27 | **DONE** |
| **ACT-005** | **P2** | Conduct automated load test simulating 2,500 concurrent Telebirr checkouts using k6 before next exam campaign. | QA Lead | 2026-11-05 | **DONE** |

---
*End of Incident Postmortem — INC-2026-10-18 Approved by Leadership.*
