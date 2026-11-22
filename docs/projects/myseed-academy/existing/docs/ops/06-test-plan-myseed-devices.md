# Test Plan & Device Matrix
## Comprehensive Hardware, Network, and Accessibility Test Plan

**Project:** MySeed Academy Multi-Platform Learning Suite  
**Document Identifier:** MYSEED-TEST-PLAN-006  
**Version:** 2.4.0  
**Date:** 2026-11-16  
**QA Lead:** Head of Software Quality Engineering  
**Systems Under Test:** `apps/web`, `apps/admin`, `services/api`, Mobile App (`com.noor.ethiopia`)  

---

## 1. Objectives & Scope

This test plan defines the testing strategy, device certification criteria, network simulation scenarios, and quality gates for MySeed Academy. The overarching objective is to guarantee an effortless, bug-free learning experience across the full spectrum of mobile devices deployed throughout Ethiopia—ranging from \$45 ultra-budget smartphones to modern high-resolution tablets.

### Core Quality Goals
1. **Zero Out-of-Memory (OOM) Crashes:** 100% stability on 1GB RAM Android Go devices.
2. **Sub-2-Second Video Startup:** Video begins streaming or playing from cache in $\le 2.0\text{ seconds}$ on 3G connections.
3. **Bilingual Typography Fidelity:** Flawless rendering of Ethiopic (`Noto Sans Ethiopic`) and Latin characters without word collisions or layout breaks.
4. **Resilient Offline Sync:** Zero lost quiz attempts across simulated battery deaths and abrupt network drops.

---

## 2. Target Device Matrix & Classification

The Ethiopian device market is dominated by Transsion Holdings brands (Tecno, Infinix, itel) alongside Samsung entry-tier phones. Our hardware test bench categorizes target devices into three distinct tiers:

```
                                  DEVICE TEST BENCH
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │ TIER 1: ULTRA-BUDGET SMARTPHONES (Primary Student Base ~65%)                           │
 │ • Tecno Pop 5 / Pop 6      • itel A58 / A56         • Infinix Smart 6                  │
 │   OS: Android 10/11 Go       OS: Android 11 Go        OS: Android 11 Go                │
 │   RAM: 1GB / 2GB             RAM: 1GB                 RAM: 2GB                         │
 │   SoC: SC7731E Quad-Core     SoC: SC9832E             SoC: Unisoc SC9863A              │
 ├────────────────────────────────────────────────────────────────────────────────────────┤
 │ TIER 2: MID-RANGE SMARTPHONES (Secondary Student Base ~25%)                            │
 │ • Samsung Galaxy A03 / A12 / A14                    • Xiaomi Redmi 9A / 10C            │
 │   OS: Android 11–13                                   OS: Android 10–12                │
 │   RAM: 3GB / 4GB                                      RAM: 2GB / 3GB                   │
 ├────────────────────────────────────────────────────────────────────────────────────────┤
 │ TIER 3: TABLETS & URBAN SMARTPHONES (~10%)                                             │
 │ • Lenovo Tab M10 HD (10.1")                         • Apple iPhone 11 / 13 / SE        │
 │ • Samsung Galaxy Tab A8 (10.5")                       OS: iOS 16–17                    │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Hardware Specifications Breakdown

| Tier | Model Name | Screen Spec | CPU / RAM | Primary Browser / Engine | Market Segment |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Tecno Pop 5** | 6.1" 720x1560 (282 ppi) | 4-core 1.3GHz / **1GB RAM** | Chrome 98 / Phoenix Browser | Rural & regional government school learners |
| **Tier 1** | **itel A58** | 6.6" 720x1612 (267 ppi) | 4-core 1.4GHz / **1GB RAM** | Opera Mini / Chrome Mobile | Suburban budget learners |
| **Tier 1** | **Infinix Smart 6**| 6.6" 720x1600 (266 ppi) | 8-core 1.6GHz / **2GB RAM** | Chrome Mobile 105+ | Urban low-income learners |
| **Tier 2** | **Samsung Galaxy A12**| 6.5" 720x1600 (270 ppi) | 8-core 2.3GHz / **3GB RAM** | Samsung Internet / Chrome | Shared family device in Addis Ababa |
| **Tier 2** | **Redmi 10C** | 6.71" 720x1650 (268 ppi) | Snapdragon 680 / **4GB RAM** | Chrome Mobile / Mi Browser | Urban secondary student |
| **Tier 3** | **Lenovo Tab M10** | 10.1" 1280x800 (149 ppi) | MediaTek P22T / **2GB RAM** | Chrome Mobile / Android WebView| Classroom pilot labs |
| **Tier 3** | **Apple iPhone 12**| 6.1" 1170x2532 (460 ppi) | Apple A14 / **4GB RAM** | Safari iOS 16+ | Urban private school learners & donors |

---

## 3. Network Simulation Profiles

Testing must be executed under realistic telecommunications conditions simulated via hardware traffic shapers (NetEm / Toxiproxy / Charles Proxy):

| Profile Identifier | Description | Downlink | Uplink | Latency (RTT) | Packet Loss | Target Condition |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **NET-ETHIO-3G-STD** | Ethio Telecom Typical 3G | 1.5 Mbps | 384 Kbps | 250 ms | 0.5% | Standard daytime cellular usage |
| **NET-ETHIO-3G-PEAK**| Peak Congestion 3G | 250 Kbps | 64 Kbps | 650 ms | 4.0% | Peak hours (6 PM - 10 PM) in dense urban areas |
| **NET-SAFARICOM-4G** | Safaricom Ethiopia 4G | 8.0 Mbps | 2.0 Mbps | 60 ms | 0.1% | Regional cities & university corridors |
| **NET-EDGE-DROPOUT** | Intermittent 2G Flapping | 48 Kbps | 16 Kbps | 1200 ms | 12.0% | Deep rural transit / bus travel |
| **NET-AIRPLANE-MODE**| 100% Offline Partition | 0 Kbps | 0 Kbps | $\infty$ | 100% | Completely offline study mode |

---

## 4. Test Categories & Verification Protocols

### 4.1 Performance & Memory Footprint Testing
1. **Low-Memory Stress Test:**
   - On a physical Tecno Pop 5 (1GB RAM), launch the application alongside three background apps (WhatsApp, Facebook Lite, phone dialer).
   - Navigate through five consecutive Grade 10 Physics lessons, initiating in-video checkpoints.
   - *Pass Criteria:* Peak resident set size (RSS) memory must not exceed $95\text{ MB}$; zero process termination by the Android Low-Memory Killer (LMK).
2. **Thermal & Battery Benchmarking:**
   - Stream video continuously for 60 minutes over `NET-ETHIO-3G-STD`.
   - *Pass Criteria:* Battery consumption $\le 9\%$; device surface temperature remains $\le 39^\circ\text{C}$.

### 4.2 Accessibility & Localization Verification (WCAG 2.2 AA)
1. **Ethiopic Script Font Rendering:**
   - Verify that all complex Fidel characters (e.g., ቋ, ፘ, ፚ) render cleanly using `Noto Sans Ethiopic` without truncation or improper kerning at $100\%$, $125\%$, and $150\%$ system font scaling.
2. **Screen Reader Compatibility:**
   - Execute test scripts with Google TalkBack on Android; verify that all interactive inputs and buttons feature unambiguous accessible labels in both English and Amharic.
3. **Color Contrast & Touch Targets:**
   - Verify minimum contrast ratio $\ge 4.5:1$ for normal text and $\ge 3:1$ for UI controls in both Light and Dark themes.
   - Confirm all tap targets measure at least $44 \times 44\text{ CSS px}$.

---

## 5. Detailed Test Execution Matrix

| Test ID | Category | Target Hardware | Network Profile | Preconditions | Execution Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-MOB-001** | Video Streaming | Tecno Pop 5 (1GB) | NET-ETHIO-3G-STD | User authenticated; cache empty | 1. Open Lesson "Vectors" ;  2. Press Play ;  3. Monitor playback | Video starts within 2.0s; auto-selects 360p; zero audio/video desync | PASS |
| **TC-MOB-002** | In-Video Checkpoint | itel A58 (1GB) | NET-ETHIO-3G-PEAK | Playback at 02:40 | 1. Reach 02:45 checkpoint ;  2. Select option B ;  3. Tap "Submit" | Video pauses cleanly; modal appears in $<100\text{ms}$; instant feedback | PASS |
| **TC-MOB-003** | Bilingual Hints | Infinix Smart 6 | NET-AIRPLANE-MODE | Language set to Amharic | 1. Tap "ፍንጭ 1" (Hint 1) ;  2. Tap "ፍንጭ 2" (Hint 2) | KaTeX formula $\vec{a} = \frac{\Delta \vec{v}}{\Delta t}$ renders crisply in Amharic view | PASS |
| **TC-MOB-004** | Offline Sync Queue | Samsung Galaxy A03 | NET-AIRPLANE-MODE $\to$ 3G | 5 attempts completed offline | 1. Re-enable WiFi/Cellular ;  2. App detects connectivity | Background worker fires batch sync; API returns 200; local queue cleared | PASS |
| **TC-MOB-005** | Telebirr Payment | Tecno Spark 7 | NET-SAFARICOM-4G | User at `/donate` flow | 1. Select 399 ETB ;  2. Choose Telebirr ;  3. Complete checkout | Redirects to Chapa/Telebirr; returns to `/donate/success`; receipt sent | PASS |
| **TC-MOB-006** | Browser Diversity | Redmi 9A | NET-ETHIO-3G-STD | Phoenix Browser / Opera Mini | 1. Browse public catalog ;  2. Open interactive quiz | Layout remains intact; CSS flex/grid aligns; zero JavaScript syntax errors | PASS |
| **TC-MOB-007** | Memory Resilience | Tecno Pop 5 (1GB) | NET-ETHIO-3G-STD | 10 browser tabs open | 1. Open lesson ;  2. Scrub back and forth 10x | RAM stays $<95\text{MB}$; player releases unneeded buffers; no crash | PASS |

---

## 6. Defect Triage & Severity Criteria

- **Blocker (P0):** Any application crash on Tier 1 hardware, loss of student quiz data during sync, or complete failure of Telebirr/Chapa payment. *Resolution SLA: $\le 4\text{ hours}$.*
- **Critical (P1):** Video playback failure under 3G peak conditions, broken Amharic font rendering, or WCAG AA contrast failure on core navigation. *Resolution SLA: $\le 24\text{ hours}$.*
- **Major (P2):** Minor layout misalignment on specific aspect ratios (e.g., 20:9 on itel devices) that does not obscure content. *Resolution SLA: Next release sprint.*

---
*End of Test Plan — Certified for MySeed Academy Physical Device Bench.*
