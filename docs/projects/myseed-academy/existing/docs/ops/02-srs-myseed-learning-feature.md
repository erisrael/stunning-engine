# System Requirements Specification (SRS)
## Feature Specification: Interactive Video Practice & Offline Mastery Loop ("Smart Learning Loop")

**Project:** MySeed Academy Core Learning Engine  
**Feature Codename:** `FEATURE-LEARNING-LOOP`  
**Document Identifier:** MYSEED-SRS-FEAT-002  
**Standard:** ISO/IEC/IEEE 29148:2018 / IEEE Std 830-1998  
**Status:** Approved / Ready for Sprint Execution  
**Target Release:** v2.4.0  
**Pedagogical Lead:** Teacher Dani (Co-Founder & Chief Educator)  
**Engineering Lead:** Lead Systems Architect  

---

## 1. Feature Overview & Pedagogical Basis

### 1.1 Purpose
This specification governs the engineering, client-side execution, and backend synchronization of the **Smart Learning Loop**—MySeed Academy's core learning feature. Designed to translate Teacher Dani's high-engagement Ethiopian classroom methodology into digital software, the feature operationalizes the four-stage learning rhythm:

$$\text{Learn} = \text{Watch (Micro-Lectures)} \longrightarrow \text{Understand (Guided Notes)} \longrightarrow \text{Practise (In-Video Checkpoints)} \longrightarrow \text{Improve (Adaptive Quizzes \& Streaks)}$$

### 1.2 Target Audience & Context
Ethiopian students in Grades 5 through 12 studying physics, mathematics, chemistry, and biology. The vast majority access content via Android smartphones with prepaid Ethio Telecom or Safaricom mobile data bundles. Power shedding and connectivity outages are frequent; therefore, the learning loop must be 100% functional both online and offline.

---

## 2. System Architecture & Information Flow

### 2.1 Learning Loop Sequence

```text
sequenceDiagram
    autonumber
    actor Student as Ethiopian Student (Android App / Web)
    participant Client as Local Client (Cache & SQLite/IndexedDB)
    participant Edge as Edge CDN (HLS Video & Static Assets)
    participant API as MySeed Core API (services/api)
    participant DB as PostgreSQL 16 (or Memory Fallback)

    Student->>Client: Open Lesson ("Grade 10 Physics: Kinematics")
    Client->>Client: Check Local Storage for Cached Assets
    alt Assets Cached Locally
        Client->>Student: Instantly Load Video & Interactive Questions
    else Assets Not Cached (Online Mode)
        Client->>Edge: Stream 360p HLS Chunks (Low Data Rate)
        Client->>API: Fetch Interactive Checkpoints JSON
        API->>DB: Query Lesson & Questions by ID
        DB-->>API: Question Data with Bilingual Hints
        API-->>Client: Payload with Cryptographic Checksum
    end

    loop In-Video Practice
        Client->>Student: Video Reaches Timestamp (e.g. 02:45)
        Client->>Student: Video Automatically Pauses -> Render Checkpoint
        Student->>Client: Select Answer & Request Hint (Amharic / English)
        Client->>Client: Evaluate Answer Locally (Zero Network Roundtrip)
        Client->>Student: Instant Pedagogical Feedback (Teacher Dani Voice/Text)
    end

    Student->>Client: Complete Lesson & End-of-Module Quiz
    Client->>Client: Write Attempt to Local Offline Queue (Status: PENDING_SYNC)
    
    alt Network Available
        Client->>API: POST /api/learning/sync-attempts (Batch Sync)
        API->>DB: Persist Progress & Calculate Mastery Level
        API-->>Client: Sync Acknowledged + Updated Streak & Badges
    else Network Offline
        Client-->>Student: Confirm Local Completion; Badge Stored Locally
        Note over Client: Enqueue for Background Sync on Reconnection
    end
```

---

## 3. Specific Functional Requirements

### 3.1 Adaptive Video Player & Media Delivery

- **REQ-FEAT-VID-001 (Adaptive Bitrate Streaming):**
  The player shall stream video lessons using HLS (`.m3u8`) with adaptive streams optimized for Ethiopian cellular networks:
  - Low (Bandwidth: 250 Kbps, 360p @ 24fps) — *Default for mobile cellular*
  - Medium (Bandwidth: 600 Kbps, 480p @ 30fps)
  - High (Bandwidth: 1500 Kbps, 720p @ 30fps) — *Default for WiFi*
- **REQ-FEAT-VID-002 (Offline Lesson Download):**
  The user shall be able to download entire lesson bundles (video stream, reading notes, and quiz assets) for 100% offline access. The bundle size for a standard 12-minute lesson shall not exceed $22\text{ MB}$ at 360p.
- **REQ-FEAT-VID-003 (Resumable Download Engine):**
  If a download is interrupted by network dropouts or device sleep, the client shall resume downloading from the exact byte offset using HTTP Range requests (`bytes=bytes_downloaded-`).

---

### 3.2 In-Video Checkpoint Engine

- **REQ-FEAT-CHK-001 (Automated Pause Checkpoints):**
  The video player shall monitor playback timestamps. Upon encountering a configured checkpoint timestamp $\pm 200\text{ms}$, the player shall:
  1. Pause video playback.
  2. Disable the scrubbing timeline.
  3. Overlay the bilingual interactive question modal with animated transition.
- **REQ-FEAT-CHK-002 (Local Immediate Evaluation):**
  All checkpoint evaluations shall execute client-side without awaiting a network response. The question payload delivered with the lesson metadata shall include obfuscated answer hashes to prevent cheating while ensuring instantaneous grading.
- **REQ-FEAT-CHK-003 (Stepwise Bilingual Hints):**
  Each question shall provide up to three graded hints available in the student's selected language (Amharic or English):
  - *Hint 1 (Conceptual):* Clarifies the physical/mathematical principle.
  - *Hint 2 (Formulaic):* Identifies the applicable formula (rendered in KaTeX).
  - *Hint 3 (Walkthrough):* Outlines the calculation steps without giving the final option letter.
- **REQ-FEAT-CHK-004 (Teacher Dani Pedagogical Audio Clip):**
  When an incorrect option is chosen twice, the system shall offer a 15-second audio micro-explanation recorded by Teacher Dani breaking down the common misconception.

---

### 3.3 Post-Lesson Assessment & Mastery Scoring

- **REQ-FEAT-MST-001 (Mastery Score Formula):**
  The system shall compute the lesson mastery index $M \in [0, 100]$ using the weighted algorithm:
  $$M = 0.30 \cdot V_{\text{completion}} + 0.35 \cdot C_{\text{accuracy}} + 0.35 \cdot Q_{\text{final}}$$
  where:
  - $V_{\text{completion}} \in [0, 100]$ is the percentage of distinct video segments watched.
  - $C_{\text{accuracy}} \in [0, 100]$ is the first-attempt accuracy score on in-video checkpoints.
  - $Q_{\text{final}} \in [0, 100]$ is the post-lesson assessment percentage.
- **REQ-FEAT-MST-002 (Curriculum Mastery Progression):**
  A student shall be awarded a "Mastered" badge on a topic only when $M \ge 80\%$. If $M < 60\%$, the system shall automatically recommend a specific remedial revision snippet.

---

### 3.4 Offline Data Synchronization Protocol

- **REQ-FEAT-SYNC-001 (Local Event Queue):**
  All student activities (timestamp intervals watched, checkpoint submissions, question answers, quiz timestamps) shall be written immediately to a local client-side queue (SQLite on Mobile, IndexedDB on Web).
- **REQ-FEAT-SYNC-002 (Sync State Machine):**
  Every queue entry shall follow the deterministic lifecycle:
  `CREATED` $\to$ `QUEUED` $\to$ `SYNCING` $\to$ (`ACKNOWLEDGED` | `RETRY_SCHEDULED`).
- **REQ-FEAT-SYNC-003 (Exponential Backoff):**
  When attempting synchronization over an unstable connection, retries shall follow truncated exponential backoff with full jitter:
  $$t_{\text{wait}} = \min(t_{\text{max}},\, t_{\text{base}} \cdot 2^{\text{attempt}}) \pm \text{jitter}$$
  where $t_{\text{base}} = 2\text{ s}$ and $t_{\text{max}} = 300\text{ s}$.
- **REQ-FEAT-SYNC-004 (Batch Sync Endpoint):**
  The API shall expose `POST /api/v1/learning/sync` accepting batches of up to 50 attempt events in a single HTTP request, processing them within an ACID transaction.

---

## 4. Data Specifications & API Contracts

### 4.1 Schema Definition (Prisma Model Extensions)

```prisma
model StudentProgress {
  id              String         @id @default(uuid())
  studentId       String
  lessonId        String
  masteryScore    Float          @default(0.0)
  completed       Boolean        @default(false)
  lastPositionSec Int            @default(0)
  watchDurationSec Int           @default(0)
  attempts        QuizAttempt[]
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@unique([studentId, lessonId])
  @@index([studentId, completed])
}

model QuizAttempt {
  id                String           @id @default(uuid())
  progressId        String
  progress          StudentProgress  @relation(fields: [progressId], references: [id], onDelete: Cascade)
  checkpointId      String?
  selectedOptionId  String
  isCorrect         Boolean
  hintsUsedCount    Int              @default(0)
  timeSpentSec      Int
  clientTimestamp   DateTime
  syncedAt          DateTime         @default(now())

  @@index([progressId, clientTimestamp])
}
```

### 4.2 Zod Validation Schema (API Request)

```typescript
import { z } from 'zod';

export const SyncAttemptEventSchema = z.object({
  clientEventId: z.string().uuid(),
  lessonId: z.string().uuid(),
  checkpointId: z.string().uuid().optional(),
  selectedOptionId: z.string().min(1),
  isCorrect: z.boolean(),
  hintsUsedCount: z.number().int().min(0).max(3),
  timeSpentSec: z.number().int().min(0).max(3600),
  clientTimestamp: z.string().datetime(),
});

export const BatchSyncPayloadSchema = z.object({
  deviceId: z.string().min(6),
  offlineDurationMinutes: z.number().int().min(0),
  events: z.array(SyncAttemptEventSchema).min(1).max(50),
});
```

---

## 5. Non-Functional Requirements & Edge Cases

### 5.1 Device Resource Constraints (Transsion / Low-Spec Android)
- **CPU & GPU Throttling:** During video playback and UI rendering, CPU utilization on a Quad-core Cortex-A53 processor (Tecno Pop 5) shall not exceed $45\%$.
- **Heap Allocation:** Client-side application memory allocation shall remain $\le 95\text{ MB}$ at all times.
- **Battery Optimization:** In offline learning mode, continuous playback shall consume no more than $8\%$ battery capacity per hour on a 4,000 mAh battery.

### 5.2 Network Anomaly Handling
- **Packet Loss Simulation:** The system shall sustain 5% packet loss without stalling video playback via an aggressive 45-second forward chunk buffer.
- **Mid-Stream Connection Drop:** If network drops during online streaming, the player shall automatically switch to audio-only plus static slide frame mode, reducing bandwidth from 360 Kbps to 48 Kbps.

---

## 6. Acceptance Criteria & Test Validation

1. **Scenario 1: Full Offline Lesson Execution**
   - *Given* a student has downloaded Lesson 4 ("Newton's Third Law"),
   - *When* device is put into Airplane Mode,
   - *Then* the student can watch the video, complete 3 in-video checkpoints, review Amharic hints, and receive an instant mastery score of 85%.
2. **Scenario 2: Resumed Background Sync**
   - *Given* 12 queued offline attempts in local storage,
   - *When* network connectivity is restored (2G/3G handshake),
   - *Then* background worker triggers batch sync, server responds HTTP 200 with matching event IDs within 1.5 seconds, and local queue transitions to `ACKNOWLEDGED`.
3. **Scenario 3: Bilingual Hint Verification**
   - *Given* a student with Amharic interface preference,
   - *When* requesting Hint 2 on a Physics vector question,
   - *Then* the hint renders instantly in clean Ethiopic script (`Noto Sans Ethiopic`) with properly formatted KaTeX vector notation: $\vec{F}_{\text{net}} = m \cdot \vec{a}$.

---
*End of Feature SRS — Validated for MySeed Academy Learning Systems.*
