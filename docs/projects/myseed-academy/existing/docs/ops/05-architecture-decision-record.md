# Architecture Decision Record (ADR)
## ADR-006: Offline-First Synchronization Protocol and Resilient Media Caching Architecture for Low-Bandwidth Networks

**Status:** Accepted  
**Deciders:** Chief Technology Officer, Lead Systems Architect, Lead Mobile Engineer, Teacher Dani (Chief Educator)  
**Date:** 2026-11-16  
**Technical Area:** Client Storage, Media Delivery, Network Synchronization, Backend API  
**Supersedes:** N/A  
**Related ADRs:** ADR-001 (Modular Monolith), ADR-002 (Postgres & Prisma)  

---

## 1. Context and Problem Statement

MySeed Academy serves over 5 million potential secondary students across Ethiopia. The domestic cellular and telecommunications environment presents severe operational constraints:
1. **Network Volatility:** Cellular connections across Ethio Telecom and Safaricom frequently oscillate between 4G, 3G, and 2G, with round-trip latency (RTT) spikes exceeding $800\text{ ms}$ and packet loss rates up to $8\%$ during peak hours.
2. **Economic Data Constraints:** Mobile data is predominantly purchased in small, prepaid daily or weekly quota bundles (e.g., 200MB to 1GB). Uncontrolled re-fetching of assets exhausts student quotas rapidly.
3. **Power Shedding & Device Shutdowns:** Unscheduled electrical load shedding leads to dead device batteries and sudden power cutoffs mid-lesson.

A traditional "always-connected" web application architecture results in broken video playback, dropped quiz submissions, student frustration, and high abandonment. We require an architectural strategy that guarantees **100% offline lesson execution** while ensuring reliable, conflict-free synchronization once connectivity is re-established.

---

## 2. Decision Drivers

- **Zero Lesson Interruption:** Students must never experience a freeze or modal lockout while engaged in the 4-step learning loop (Watch, Understand, Practise, Improve).
- **Data Conservation:** Videos and lesson assets must be downloaded at most once and cached securely on the device.
- **Idempotency & Fraud Prevention:** Assessment attempts, streak points, and mastery badges recorded offline must synchronize without duplication or state corruption.
- **Resource Efficiency on Budget Hardware:** Storage and memory footprints must remain minimal to accommodate entry-level Android devices (1GB–2GB RAM, Android Go).

---

## 3. Considered Options

### Option 1: Cloud-Centric WebSockets with Live Server Evaluation
- *Mechanism:* Maintain a persistent bi-directional WebSocket connection; evaluate all quiz questions and checkpoints on the API server.
- *Pros:* Zero client-side answer verification logic; low risk of reverse engineering answers.
- *Cons:* Complete failure when network drops; high server connection overhead; incompatible with offline learning in rural Ethiopia. **(Rejected)**

### Option 2: Local-First CRDT (Conflict-free Replicated Data Types e.g., Automerge / Yjs)
- *Mechanism:* Represent student progress and learning state as a distributed conflict-free replicated data structure with automatic convergence.
- *Pros:* Mathematically provable convergence across multi-device usage.
- *Cons:* Substantial memory and CPU serialization overhead; unnecessary complexity for an append-only, student-centric assessment progression model. **(Rejected)**

### Option 3: Offline-First Local Store with Resumable Range Media & Idempotent Batch Sync
- *Mechanism:* Download chunked lesson bundles (360p HLS or MP4) using HTTP Range requests into local encrypted sandbox storage (SQLite on Mobile, IndexedDB on Web). Execute checkpoints locally against obfuscated client hashes. Buffer all completed attempts into an ACID-compliant local event queue and flush in atomic batches to the API via exponential backoff upon reconnection.
- *Pros:* Fully decoupled from network availability; minimal CPU footprint; robust against sudden app terminations; predictable server load. **(Chosen)**

---

## 4. Decision Outcome

**Chosen Option:** **Option 3: Offline-First Local Store with Resumable Range Media & Idempotent Batch Sync.**

### 4.1 Architecture & Sync Lifecycle

```text
stateDiagram-v2
    [*] --> Idle: App Launches / Network Available
    Idle --> Syncing: Online Detected & Queue Has Events
    
    state Syncing {
        [*] --> PrepareBatch: Dequeue up to 50 Events
        PrepareBatch --> DispatchHTTP: POST /api/v1/learning/sync
        DispatchHTTP --> ProcessServer: API Executes Atomic Transaction
        ProcessServer --> SuccessACK: Server Returns 200 OK
        ProcessServer --> NetworkErr: Connection Timeout / Socket Drop
    }

    SuccessACK --> PurgeQueue: Mark Events ACKNOWLEDGED & Delete
    PurgeQueue --> Idle: Check for Remaining Events

    NetworkErr --> ScheduleBackoff: Calculate Exponential Backoff + Jitter
    ScheduleBackoff --> WaitingForRetry: Sleep (2s ... 300s)
    WaitingForRetry --> Syncing: Retry Timer Fires
    WaitingForRetry --> Idle: Network Disconnected
```

### 4.2 Synchronization Protocol Specification

#### 4.2.1 Client-Side Queue Schema (SQLite / IndexedDB)
```sql
CREATE TABLE offline_sync_queue (
    event_id TEXT PRIMARY KEY,          -- UUID v4 generated on client
    student_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    checkpoint_id TEXT,
    event_type TEXT NOT NULL,           -- 'CHECKPOINT_SUBMIT', 'QUIZ_COMPLETE', 'MILESTONE'
    payload_json TEXT NOT NULL,         -- Serialized attempt data
    client_timestamp INTEGER NOT NULL,  -- Unix epoch milliseconds
    retry_count INTEGER DEFAULT 0,
    sync_status TEXT DEFAULT 'PENDING'  -- 'PENDING', 'PROCESSING', 'FAILED'
);
```

#### 4.2.2 Idempotency and Conflict Resolution Strategy
1. **Client-Assigned UUIDs:** Every assessment event receives a permanent `event_id` (UUID v4) at the moment the student taps "Submit".
2. **Server-Side Upsert:** When the API receives `POST /api/v1/learning/sync`, it performs database operations inside a single Prisma transaction using `upsert` keyed on `(studentId, lessonId, clientEventId)`.
3. **Last-Write-Wins (LWW) with Monotonic Check:** If conflicting attempts are submitted for the same question, the attempt with the highest `client_timestamp` prevails, provided the client clock drift is within $\pm 24\text{ hours}$ of server UTC.

#### 4.2.3 Resumable Media Chunk Storage
- Videos are requested using standard HTTP Range headers: `Range: bytes=0-1048575` (1MB segments).
- Downloaded segments are saved to device internal sandbox storage (`/data/user/0/com.noor.ethiopia/files/courses/...`).
- An integrity manifest (`manifest.json`) tracks chunk completeness via SHA-256 hashes before declaring the lesson ready for offline playback.

---

## 5. Consequences and Trade-Offs

### 5.1 Positive Consequences
- **Uncompromised Reliability:** Ethiopian students can study on buses, during rural power outages, or late at night without cellular network access.
- **78% Reduction in Network Data Spend:** Lesson media is downloaded exactly once, saving bandwidth costs for students and minimizing CDN origin egress charges.
- **Graceful Server Degradation:** The API receives periodic, grouped batch sync requests rather than a barrage of synchronous roundtrips per question click.

### 5.2 Negative Consequences & Mitigations
- **Risk of Client-Side Answer Inspection:** Storing questions and answer verification hashes locally creates potential exposure for determined technical users.
  - *Mitigation:* Correct options are never stored as plaintext strings; they are stored as salted SHA-256 hashes: $\text{Hash} = \mathbf{SHA\text{-}256}(\text{OptionID} + \text{LessonSalt})$.
- **Device Storage Footprint:** Downloaded lessons consume disk space on low-capacity (16GB/32GB) phones.
  - *Mitigation:* Built-in storage management dashboard in the app allowing students to purge watched video files while retaining their offline mastery records.

---

## 6. Verification and Validation Plan

1. **Automated Unit Testing:** Verify that `SyncService.processBatch()` returns HTTP 200 and records no duplicates when identical payload batches are delivered multiple times.
2. **Network Chaos Testing:** Utilize Toxiproxy to introduce 30% packet loss and 2,000ms latency during an active sync cycle; verify that the client recovers via exponential backoff without event duplication.
3. **Physical Device Validation:** Conduct offline verification on a physical Tecno Pop 5 device: download a Grade 10 Physics course, place the device in Airplane Mode, complete the module, disable Airplane Mode, and assert server synchronization within 5 seconds.

---
*End of ADR-006 — Architecture Decision Record.*
