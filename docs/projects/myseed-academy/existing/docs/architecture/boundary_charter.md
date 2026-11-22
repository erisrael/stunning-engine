# System Boundary Charter: MySeed Academy Official Website vs Support Mini-App

**Document Status:** Approved Architecture Standard  
**Last Updated:** 2026-10-08  
**Scope:** MySeed Ecosystem Architecture  

---

## 1. Executive Summary

This charter establishes the definitive non-overlapping functional boundaries between:
1. **The MySeed Academy Official Website (`My-Seed-Academy`)**: The public-facing institutional, educational, content-driven, and donor engagement platform.
2. **The MySeed Customer Support Mini-App**: The separate agent-facing ticketing, live chat queuing, and customer care workspace.

To prevent duplicated engineering, contradictory workflows, and operational chaos, the Academy Website **shall not** implement internal support agent dispatching or live customer care management queues.

---

## 2. Functional Boundary Matrix

| Capability | In Scope (MySeed Academy Official Website) | Strictly Out of Scope (Handled by Support Mini-App) |
| :--- | :--- | :--- |
| **Visitor Inquiries & FAQs** | • Institutional Knowledge Base and categorized FAQs.; • Hybrid AI Chatbot with verified instant Q&A answers. | • Human customer care ticket dispatching.; • Real-time human support agent back-and-forth chat queues. |
| **Live Human Support Escalation** | • Controlled handoff links redirecting visitors to official **WhatsApp** and **Telegram** channels with pre-filled context messages. | • Internal ticket assignment, agent routing algorithms, SLA tracking. |
| **School & Institutional Solutions** | • "Request a Demo" structured intake form.; • Partnership proposal intake. | • School LMS classroom management, student grading dashboards. |
| **Donations & Giving** | • Transparent fundraising campaigns, donation checkouts, receipt downloads, and financial audit logs. | • User-bound wallet balances or banking account transfers. |
| **Newsletter & Updates** | • 100% account-free email subscriptions with cryptographically signed 1-click unsubscribe links. | • Customer transactional push notifications. |
| **Administrative Access** | • Content management (CMS), SEO inspector, search analytics, and encrypted integration vault. | • Customer care agent performance dashboards, helpdesk queues. |

---

## 3. Communication & Handoff Protocols

When a visitor requires personalized human assistance:
1. The visitor may search the **Multilingual Knowledge Base** or converse with the **Hybrid AI Chatbot**.
2. If the AI Chatbot encounters a query outside verified educational scope or with low confidence, it triggers a **Graceful Escalation Action**.
3. The UI presents direct action cards:
   - **WhatsApp Support:** `https://wa.me/<PHONE>?text=<URL_ENCODED_CONTEXT>`
   - **Telegram Support:** `https://t.me/<HANDLE>?start=<TOKEN>`
4. Zero support tickets or agent notifications are persisted in the Academy website database.
