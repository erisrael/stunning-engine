# MASTER IMPLEMENTATION PROMPT
# MySeed Financial Monitoring, Customer Support, Unified Chat, IVR & Contact Center Overhaul

## 1. PROJECT OBJECTIVE

Perform a comprehensive investigation, correction, enhancement, and implementation of the existing MySeed platform, specifically covering:

1. Chapa financial transaction monitoring and reporting.
2. Noor CMS financial and operational data integration.
3. Unified customer support and Telegram Mini App.
4. Customer support content management system.
5. Enterprise-grade internal chat and communication.
6. Browser-based voice calling through Telegram Mini App.
7. Full IVR (Interactive Voice Response) system.
8. Intelligent call queue and agent distribution.
9. Call recording, retention, playback, and management.
10. Customer support escalation and departmental request management.
11. Developer team communication and approval workflows.
12. Comprehensive administration, permissions, configuration, and analytics.

This is an enhancement and completion of the existing platform, not a greenfield replacement.

**CRITICAL IMPLEMENTATION RULE:**

Inspect the existing codebase, database, APIs, integrations, authentication, authorization, chat infrastructure, Telegram bot, and frontend before making changes.

Reuse and extend existing functionality wherever appropriate. Do not introduce duplicate systems, duplicate tables, competing communication services, or unnecessary infrastructure.

Do not create fake functionality, simulated data, decorative buttons, or frontend-only implementations.

Every feature must have its actual backend implementation, database persistence, permissions, validation, error handling, and frontend integration.

---

# PART A — FINANCIAL DATA COLLECTION AND MONITORING

## 2. CRITICAL BUG: INCOMPLETE CHAPA TRANSACTION FETCHING

### 2.1 Problem

The existing Chapa integration does not retrieve all transactions that should be available within the selected date range.

For example:

- The last three days contain 89 successful transactions.
- The dashboard displays only 39.
- Approximately 50 successful transactions are missing from the displayed results.

This is a serious financial data integrity issue.

The same general problem exists in the Noor CMS integration, where not all available records and data fields are being collected and made available for filtering.

Do not treat this as a pagination-only UI issue. Investigate the entire data collection pipeline.

### 2.2 Required investigation

Inspect:

- Chapa API integration and authentication.
- Transaction list endpoints.
- API pagination mechanisms.
- Cursor-based pagination, if supported.
- Page size and maximum result limits.
- Date-range filtering and timezone conversion.
- Transaction status mapping.
- API response parsing.
- Database synchronization.
- Database query conditions.
- Cached data and stale cache invalidation.
- Background synchronization jobs.
- Duplicate transaction handling.
- Failed and partially completed synchronization jobs.
- Frontend pagination and table rendering.
- Dashboard summary aggregation.
- API rate limits and retry behavior.

Determine precisely where the missing transactions disappear.

### 2.3 Implement complete transaction fetching

Build a reliable Chapa transaction synchronization mechanism.

Requirements:

1. Fetch every available transaction within the requested date range.
2. Follow every pagination cursor or page until the API confirms there are no more results.
3. Never assume the first page represents the complete dataset.
4. Never silently stop fetching after a fixed number of pages.
5. Handle API pagination metadata correctly.
6. Use appropriate page sizes within provider limits.
7. Implement retry mechanisms for temporary failures.
8. Implement exponential backoff for rate limiting.
9. Persist synchronization progress.
10. Resume interrupted synchronization jobs.
11. Prevent duplicate records using stable transaction identifiers.
12. Update existing records when their status or metadata changes.
13. Preserve historical transaction records.
14. Record the last successful synchronization time.
15. Log failed requests and synchronization errors.
16. Provide a manual full synchronization option for authorized administrators.
17. Provide incremental synchronization for normal operation.

### 2.4 Transaction reconciliation

Implement a reconciliation mechanism that compares:

- Transactions returned by Chapa.
- Transactions stored in the MySeed database.
- Transactions displayed in the dashboard.
- Transaction totals grouped by status.

Display:

- Total provider transactions.
- Total locally synchronized transactions.
- Successful transactions.
- Pending transactions.
- Failed transactions.
- Reversed or refunded transactions, where supported.
- Missing local records.
- Duplicate detection.
- Last synchronization time.
- Synchronization status.

If the provider API does not expose a complete historical transaction listing or restricts access, clearly communicate the limitation rather than falsely reporting synchronization success.

### 2.5 Chapa date filters

Implement the following filters:

| Filter | Behavior |
|---|---|
| All Time | Retrieve all accessible historical transactions |
| Today | Current local calendar day |
| Yesterday | Previous calendar day |
| Last 3 Days | Previous three calendar days |
| Last 7 Days | Previous seven calendar days |
| Last 14 Days | Previous fourteen calendar days |
| Last 30 Days | Previous thirty calendar days |
| This Week | Current calendar week |
| Last Week | Previous calendar week |
| This Month | Current calendar month |
| Last Month | Previous calendar month |
| This Year | Current calendar year |
| Custom Range | User-defined start and end dates |

Include:

- Start date.
- End date.
- Start time.
- End time where supported.
- Transaction status.
- Payment method.
- Currency.
- Customer.
- Transaction reference.
- Search.

All filters must work together.

Changing the date filter must update the transaction table, summary cards, charts, export data, and pagination consistently.

Do not use hardcoded transaction counts.

### 2.6 Chapa transaction interface

Rebuild the financial monitoring interface with a professional financial operations dashboard.

Summary cards:

- Total Transactions.
- Successful Transactions.
- Total Successful Amount.
- Pending Transactions.
- Failed Transactions.
- Refunded Transactions.
- Average Transaction Value.
- Success Rate.

Transaction table columns:

- Transaction ID.
- Transaction Reference.
- Customer Name.
- Customer Email.
- Customer Phone.
- Amount.
- Currency.
- Payment Method.
- Transaction Status.
- Created At.
- Updated At.
- Verified At.
- Callback Status.
- Source.
- Actions.

Only display fields actually provided by Chapa or derived through documented internal mappings.

Additional features:

- Transaction detail drawer.
- Complete transaction metadata.
- Payment verification.
- Provider response details.
- Webhook history.
- Related customer information.
- Export CSV and Excel.
- Server-side sorting.
- Server-side filtering.
- Server-side pagination.
- Column visibility management.
- Saved filter presets.
- Refresh and synchronization controls.
- Empty, loading, error, and partial-sync states.

---

## 3. NOOR CMS DATA INTEGRATION

### 3.1 Problem

The Noor CMS integration also does not fully collect or expose all available records.

The current filtering mechanism appears to work with an incomplete selection of fields and records.

Correct the entire integration pipeline.

### 3.2 Complete data collection

Inspect the Noor CMS APIs, database structures, response schemas, available endpoints, and existing integration logic.

Identify every accessible record type and every available field.

Do not assume that Noor CMS only provides financial transactions.

Implement a comprehensive data discovery and synchronization process.

Collect all supported data categories, including applicable:

- Transactions.
- Orders.
- Customers.
- Users.
- Subscriptions.
- Payments.
- Invoices.
- Products.
- Services.
- Categories.
- Academic content.
- Enrollments.
- Attendance.
- Agents.
- Organizations.
- Departments.
- Financial records.
- Refunds.
- Payment methods.
- Other CMS entities exposed by the actual API.

The list is not permission to invent nonexistent entities. Discover the actual Noor CMS schema and integrate all accessible relevant resources.

### 3.3 Dynamic field discovery

This is particularly important.

Build a dynamic field registry that identifies the available Noor CMS fields.

For every supported entity, collect:

- Field name.
- Display label.
- Data type.
- Description, if available.
- Whether the field is filterable.
- Whether it is searchable.
- Whether it is sortable.
- Whether it is exportable.
- Whether it is nullable.
- Whether it is a relationship.
- Whether it is sensitive or permission-restricted.

Support:

- String.
- Integer.
- Decimal.
- Boolean.
- Date.
- DateTime.
- Enum.
- JSON.
- Relationship.
- Currency.
- Status.

All discovered fields should become available for appropriate filtering and column customization.

Do not force the frontend to use a manually maintained, incomplete list of fields.

Use a configurable field registry with safe mappings and allowlisted query construction. Never execute arbitrary SQL based on user-provided column names.

### 3.4 Noor CMS filtering

Implement:

- All Time.
- Today.
- Yesterday.
- Last 3 Days.
- Last 7 Days.
- Last 14 Days.
- Last 30 Days.
- This Week.
- Last Week.
- This Month.
- Last Month.
- This Year.
- Custom Date Range.

Also support:

- Entity type.
- Record status.
- Customer.
- User.
- Organization.
- Department.
- Payment method.
- Amount range.
- Currency.
- Created date.
- Updated date.
- Related record.
- All discovered filterable fields.

Include an advanced filter builder:

- Add condition.
- Remove condition.
- AND / OR logical grouping.
- Field selection.
- Operator selection.
- Value input based on field type.
- Save filter.
- Load saved filter.
- Reset filters.

### 3.5 Noor CMS table customization

Allow authorized users to:

- Show and hide columns.
- Rearrange columns.
- Resize columns.
- Sort columns.
- Pin important columns.
- Save column configurations.
- Create personal table views.
- Export filtered records.
- View complete record details.
- Inspect related records.

Ensure all records are fetched through proper pagination.

### 3.6 Synchronization architecture

Implement a reliable synchronization pipeline for both Chapa and Noor CMS.

Each integration should have:

- Initial historical synchronization.
- Incremental synchronization.
- Manual synchronization.
- Scheduled synchronization.
- Retry queue.
- Failed synchronization logs.
- Duplicate detection.
- Record update detection.
- Last successful sync.
- Sync duration.
- Records discovered.
- Records inserted.
- Records updated.
- Records skipped.
- Records failed.

Use provider webhooks when available, but do not depend exclusively on webhooks for completeness.

Use periodic reconciliation to detect missed updates and records.

The integration must be idempotent.

---

# PART B — CUSTOMER SUPPORT PLATFORM REBUILD

## 4. CUSTOMER SUPPORT SYSTEM OVERVIEW

Rebuild the existing MySeed Customer Support environment into a complete customer communications and contact center platform.

It must support two connected environments:

**Internal Operations Interface**
- Customer support management.
- Agent workspace.
- Team chat.
- Incoming and outgoing calls.
- IVR configuration.
- Call queue management.
- Call recordings.
- Customer records.
- Escalations.
- Department requests.
- Analytics.
- Content management.

**Customer-Facing Telegram Mini App**
- Customer conversations.
- Incoming calls.
- Outgoing call requests where enabled.
- Answer and decline controls.
- Conversation history.
- Support information.
- Service categories.
- Help articles.
- Ticket/request tracking.
- Notifications.
- User-friendly mobile interface.

The two environments must communicate through the same authenticated backend and communication infrastructure.

---

## 5. REBUILD THE TELEGRAM BOT

Inspect and rebuild the existing Telegram bot and Mini App integration.

Do not simply replace the bot's welcome message.

Create a complete, functional Telegram customer support experience.

### 5.1 Telegram bot capabilities

Implement:

- Welcome message.
- Language selection.
- Main navigation.
- Start support conversation.
- Continue existing conversation.
- View support history.
- Submit support request.
- Track request status.
- View help articles.
- Search FAQs.
- Contact customer support.
- Incoming call notifications.
- Call answer/decline.
- Call status notifications.
- Agent availability messages.
- Queue position notifications.
- Estimated wait information when reliable.
- Transfer to another support category.
- Close conversation.
- Reopen conversation when permitted.

Support Amharic and English content, with architecture that allows additional languages.

### 5.2 Content manager

Build a fully functional Customer Support Content Manager.

Administrators should be able to manage all Telegram bot and Mini App content without editing source code.

Create default content during installation or migration.

Default content should include:

**Welcome**

"Welcome to MySeed Support. How can we help you today?"

**Main menu**

- Start a Conversation.
- My Support Requests.
- Previous Conversations.
- Frequently Asked Questions.
- Account and Subscription Help.
- Payment Assistance.
- Technical Support.
- Contact Support.

**Default categories**

- Account and Login.
- Learning and Educational Content.
- Subscription.
- Payments and Billing.
- Technical Problems.
- School and Enrollment.
- Other Inquiries.

### 5.3 Content management capabilities

Manage:

- Welcome messages.
- Bot commands.
- Menu labels.
- Button labels.
- Menu hierarchy.
- FAQ entries.
- Support categories.
- Automated responses.
- Offline messages.
- Queue messages.
- Call notifications.
- Language translations.
- Support policies.
- Terms and privacy notices.
- Escalation messages.
- Closing messages.

Each content element must support:

- Create.
- Edit.
- Delete.
- Enable.
- Disable.
- Preview.
- Reorder.
- Publish.
- Draft.
- Translation.
- Version history.

Implement content publishing and preview functionality.

Changes made in the CMS should reflect in the Telegram bot and Mini App without requiring a code deployment.

---

# PART C — UNIFIED INTERNAL CHAT SYSTEM

## 6. REBUILD CUSTOMER SUPPORT CHAT

The customer support chat interface must follow the existing MySeed Team Chat experience.

Do not build an unrelated or inferior messaging interface.

Inspect the existing Team Chat implementation and reuse its established design language, components, interaction patterns, and proven communication functionality.

Customer Support chat should provide the same core messaging capabilities as Team Chat, adapted to external customer conversations.

### 6.1 Chat layout

Use a professional three-column layout on desktop:

**Left column — Conversations**
- All conversations.
- My conversations.
- Unassigned.
- Assigned to me.
- Waiting in queue.
- Active.
- Pending.
- Resolved.
- Archived.
- Escalated.
- Search.
- Filters.

**Middle column — Conversation**
- Message history.
- Customer profile summary.
- Message composer.
- Attachments.
- Voice messages.
- File uploads.
- Message reactions.
- Reply to message.
- Edit own messages where supported.
- Delete according to permissions.
- Forward message.
- Message status.
- Typing indicators.
- Read receipts.
- Delivery indicators.

**Right column — Customer information**
- Customer identity.
- Telegram ID.
- Account information.
- Contact details.
- Subscription.
- Payment history.
- Previous support conversations.
- Assigned agent.
- Priority.
- Internal notes.
- Tags.
- Related requests.

On mobile, use a responsive navigation and conversation layout with accessible back navigation and contextual panels.

### 6.2 Complete messaging capabilities

Implement:

- Real-time messaging.
- Text messages.
- Images.
- Documents.
- PDFs.
- Audio.
- Voice messages.
- Video attachments.
- File previews.
- Message replies.
- Message forwarding.
- Reactions.
- Editing.
- Deletion.
- Search.
- Message history.
- Conversation history.
- Unread counts.
- Typing indicators.
- Read receipts.
- Message delivery status.
- Online/offline presence.
- Agent availability.
- Conversation assignment.
- Conversation transfer.
- Internal notes.
- Customer-visible messages.
- Private agent notes.
- Conversation tagging.
- Conversation priority.
- Conversation resolution.
- Conversation reopening.

Use the existing communication infrastructure where appropriate.

Do not implement fake real-time behavior using periodic full-page refreshes.

Use an appropriate real-time transport such as WebSockets or the existing messaging transport.

### 6.3 Right-click context menu

Implement a proper contextual menu when an agent right-clicks a message.

On mobile, provide an equivalent long-press action menu.

Actions:

- Reply.
- Forward.
- Copy.
- React.
- Save.
- View details.
- Report.
- Delete, if authorized.

### 6.4 Forwarding to configured targets

The forwarding action must open a target selector.

Targets must be configurable by administrators.

Possible targets:

- Individual support agents.
- Customer Support Head.
- Developer Team.
- Developer Team Head.
- Finance Department.
- Finance Head.
- Other enabled departments.
- Authorized individual employees.

Allow administrators to configure:

- Available forwarding destinations.
- Department visibility.
- Specific eligible members.
- Whether agents can forward to a department.
- Whether forwarding requires approval.
- Whether original attachments are included.
- Whether the forwarded message includes customer details.
- Whether the original customer conversation is linked.

Forwarding must create an auditable internal message or request.

Never expose private customer conversations to unauthorized departments.

---

# PART D — CUSTOMER SUPPORT REQUEST MANAGEMENT

## 7. INTERNAL DEPARTMENT REQUESTS

Create a dedicated page named:

**Customer Support Requests**

This feature allows customer support agents to request assistance from internal teams without leaving the support workspace.

### 7.1 Request destinations

Allow administrators to enable requests for:

- Developer Team.
- Developer Team Head.
- Finance Department.
- Finance Head.
- Customer Support Head.
- Administration.
- Other configured departments.

Administrators can enable requests for an entire department or specific members.

### 7.2 Request creation

Customer support agents should be able to create requests with:

- Request title.
- Request type.
- Destination department.
- Destination member.
- Priority.
- Description.
- Related customer.
- Related conversation.
- Related transaction.
- Attachments.
- Screenshots.
- Error details.
- Requested action.
- Due date, where appropriate.

Request types:

- Technical Issue.
- Bug Report.
- Payment Verification.
- Refund Assistance.
- Account Issue.
- Subscription Issue.
- Feature Request.
- Customer Escalation.
- Other.

### 7.3 Request workflow

Implement these statuses:

1. Draft.
2. Submitted.
3. Received.
4. Acknowledged.
5. In Progress.
6. Waiting for Information.
7. Pending Approval.
8. Approved.
9. Rejected.
10. Resolved.
11. Closed.

Each request should have:

- Unique reference.
- Request creator.
- Assigned department.
- Assigned member.
- Creation time.
- Last update.
- Status history.
- Internal discussion.
- Attachments.
- Approval history.
- Resolution notes.

The receiving department should see its requests in its own workspace.

The originating support agent must be able to track progress and receive updates.

### 7.4 Developer team approval workflow

Build a proper Developer Team request and approval workflow.

The Developer Team Head must be able to:

- Receive requests.
- Assign developers.
- Review details.
- Add comments.
- Request additional information.
- Approve.
- Reject with a reason.
- Escalate.
- Submit for further approval.
- Mark work in progress.
- Mark resolved.
- Return the result to Customer Support.

Support configurable approval chains, including submission to a designated administrator or higher approver.

Prevent unauthorized self-approval where separation of duties is required. Allow explicitly configured approval exceptions with an audit record.

---

# PART E — VOICE CALLING SYSTEM

## 8. FULL BROWSER-BASED CALLING

Implement a proper voice communication system connecting customer support agents with customers using the Telegram Mini App.

Calling must work inside the Telegram Web App environment where browser and device capabilities permit it.

The system must support incoming and outgoing calls.

### 8.1 Call initiation

Customer support agents should be able to initiate a call from:

- Active customer conversation.
- Customer profile.
- Support request.
- Call center workspace.
- Assigned customer record.

Before initiating a call:

1. Check customer availability.
2. Check whether the Telegram Mini App session is active or whether a push/notification mechanism can reach the customer.
3. Check agent calling permissions.
4. Check whether the agent is available.
5. Check the organization's call configuration.
6. Create a call session.
7. Send an incoming call event to the customer's Mini App.

### 8.2 Customer incoming call interface

The customer should see a professional incoming-call screen.

Display:

- MySeed Support identity.
- Calling agent or department.
- Incoming call indication.
- Accept button.
- Decline button.
- Call timeout information.
- Appropriate audio/visual notifications.

The customer must be able to answer or decline.

Do not automatically connect the call without customer acceptance.

### 8.3 Call connection

Use a production-appropriate WebRTC architecture.

Recommended architecture:

- WebRTC for media communication.
- A signaling service for call negotiation.
- STUN/TURN infrastructure for NAT traversal.
- An SFU such as LiveKit when group calling, recording, or scalable media routing requires it.
- Authenticated short-lived call tokens.
- Server-authoritative call state.

Inspect existing infrastructure before selecting or introducing a media server.

Do not implement media transport through ordinary WebSockets.

WebSockets may be used for signaling and call state, not as a replacement for WebRTC audio transport.

### 8.4 Call lifecycle

Implement:

- Initiated.
- Ringing.
- Accepted.
- Connecting.
- Connected.
- On Hold.
- Transferring.
- Completed.
- Declined.
- Missed.
- Failed.
- Cancelled.

Maintain an accurate server-side call state machine.

Handle:

Customer disconnecting.

Agent disconnecting.

Browser refresh.

Telegram Mini App closing.

Network interruptions.

Device permission denial.

Microphone unavailable.

Connection timeout.

TURN fallback.

Unexpected call termination.

8.5 Call controls

During calls provide:

Mute/unmute.

Speaker/audio device selection where supported.

Connection quality indicator.

Call duration.

Hold/resume.

End call.

Transfer call.

Add authorized participant if enabled.

Recording indicator.

Network reconnection state.

8.6 Incoming calls while the Mini App is closed

Do not assume a Telegram Mini App can reliably receive background WebRTC calls while closed.

Implement a fallback strategy:

Telegram bot incoming-call notification.

Reopen Mini App action.

Call invitation expiration.

Missed-call notification.

Callback request.

Queue retention where applicable.

The customer must enter or reopen the Mini App to establish the browser-based call unless a separately supported calling channel is implemented.

PART F — IVR SYSTEM

9. FULL INTERACTIVE VOICE RESPONSE ENGINE

Build a dedicated IVR management module.

This must be a real configurable call-routing engine, not a static menu.

9.1 IVR builder

Create a visual IVR flow builder.

Allow administrators to create call flows using configurable nodes.

Supported nodes:

Welcome Message.

Language Selection.

Audio Playback.

Text-to-Speech.

DTMF Input.

Menu Selection.

Department Routing.

Queue Entry.

Agent Routing.

Business Hours Check.

Holiday Check.

Conditional Branch.

Customer Identification.

Payment Verification Routing.

Repeat Menu.

Transfer.

Voicemail.

Callback Request.

End Call.

Support:

Drag-and-drop node placement.

Node configuration.

Connection management.

Branch conditions.

Flow validation.

Preview.

Draft.

Publish.

Version history.

Activate/deactivate.

Test execution.

9.2 Example default IVR flow

Welcome

"Welcome to MySeed Customer Support."

Language selection

Press 1 for Amharic.

Press 2 for English.

Main menu

Press 1 for Account and Login Assistance.

Press 2 for Learning and Subscription Assistance.

Press 3 for Payment and Billing Assistance.

Press 4 for Technical Support.

Press 5 to speak with a customer support agent.

Press 0 to speak with an operator.

9.3 Advanced IVR

Support:

Configurable timeout.

Invalid input handling.

Repeat menu.

Maximum retry count.

Conditional routing.

Department availability.

Business hours.

Holiday schedules.

Emergency announcements.

Queue overflow.

Callback requests.

Voicemail fallback.

Allow different IVR flows for different organizations, products, languages, and service categories where applicable.

9.4 Voice channel compatibility

The IVR must support the actual configured voice channels.

For Telegram browser calls, implement an in-call interactive menu using DTMF-like controls or on-screen menu selections.

For PSTN/SIP calls, integrate an appropriate telephony provider or SIP infrastructure if enabled.

Do not pretend that Telegram WebRTC calls are ordinary telephone network calls.

Design the IVR engine to support multiple channel adapters.

PART G — INTELLIGENT CALL QUEUE SYSTEM

10. QUEUE MANAGEMENT

Create a dedicated Call Queue module.

Administrators should be able to create multiple queues.

Examples:

General Support.

Payment Support.

Technical Support.

Subscription Support.

Account Support.

Priority Support.

10.1 Queue configuration

Each queue must support:

Queue name.

Description.

Department.

Assigned agents.

Active hours.

Maximum queue size.

Priority rules.

Maximum wait time.

Overflow destination.

Queue announcements.

Music/audio configuration.

Callback option.

Auto-assignment.

Manual assignment.

Enabled/disabled state.

10.2 Routing strategies

Support:

Round Robin.

Least Busy Agent.

Longest Idle Agent.

Skill-Based Routing.

Priority-Based Routing.

Manual Assignment.

Allow administrators to define routing rules and fallback behavior.

10.3 Queue dashboard

Display:

Calls waiting.

Active calls.

Agents available.

Agents busy.

Average waiting time.

Longest waiting call.

Average handling time.

Abandoned calls.

Missed calls.

Calls completed.

Queue service level.

10.4 Customer queue experience

When waiting, customers should receive:

Queue position where reliable.

Estimated waiting time when sufficient historical data exists.

Waiting audio or messages.

Option to request a callback.

Option to cancel.

Option to change support category.

Queue position and wait estimates must be updated from actual queue state.

10.5 Queue distribution logic

Build a reliable backend queue manager.

Requirements:

Atomic assignment.

Concurrency protection.

No duplicate agent assignment.

No duplicate active call sessions.

Agent availability validation.

Queue timeout.

Queue recovery after service restart.

Priority handling.

Overflow.

Callback scheduling.

Queue event logs.

PART H — CALL RECORDING AND CALL HISTORY

11. DEDICATED CALL RECORDS SECTION

Create a separate navigation item:

Call Records

This section must be available to the Customer Support Head and any administrators or managers explicitly authorized to access recordings.

Agents should be able to access their own call records according to their assigned permissions.

11.1 Call record information

Store:

Call ID.

Customer ID.

Customer name.

Agent ID.

Agent name.

Department.

Queue.

Call direction.

Call start time.

Call end time.

Duration.

Wait duration.

Call status.

Call category.

Related conversation.

Related support request.

Recording status.

Recording reference.

Call outcome.

Notes.

Tags.

11.2 Recording capabilities

When recording is enabled:

Start recording through the approved media infrastructure.

Show a recording indicator.

Notify participants where required.

Store the recording securely.

Associate the recording with the call record.

Preserve recording metadata.

Allow authorized playback.

Allow authorized downloads.

Record access and download events.

Recording must respect applicable consent, privacy, and data protection requirements.

Never silently record a customer call.

If recording is disabled or consent is unavailable, store call metadata without an audio recording.

11.3 Recording management

Build:

Recording list.

Audio player.

Playback speed controls.

Duration.

Recording date.

Search.

Filters.

Agent filters.

Department filters.

Customer filters.

Queue filters.

Call status filters.

Date range.

Duration range.

Recording availability.

Download permissions.

Retention settings.

11.4 Recording retention

Implement configurable retention policies.

Support:

Retain indefinitely when permitted.

Retain for a configured number of days.

Automatic expiration.

Legal or administrative hold.

Manual deletion by authorized administrators.

Audit trail for deletion.

Do not permanently delete call records simply because their audio recording expires.

11.5 Agent call history

Each agent should have a personal call history containing their own permitted records.

Allow agents to:

View previous calls.

Add call notes.

Add call outcome.

Categorize calls.

Link calls to conversations.

Link calls to support requests.

Search their history.

Agents must not be able to access recordings belonging to other agents unless explicitly authorized.

PART I — CUSTOMER SUPPORT AGENT WORKSPACE

12. COMPLETE AGENT DESKTOP

Create a unified workspace for customer support agents.

The agent should not have to switch between unrelated modules to perform ordinary support work.

Main workspace

Include:

Agent status.

Assigned conversations.

Unassigned conversations.

Active queue.

Incoming calls.

Active calls.

Missed calls.

Customer search.

Customer profile.

Support request creation.

Internal chat.

Call history.

Notifications.

Knowledge base.

Agent availability

Statuses:

Available.

Busy.

On Call.

Away.

Break.

Offline.

Availability must influence queue assignment.

Conversation workflow

Customer initiates a conversation.

Conversation enters the appropriate queue.

An eligible agent receives the conversation.

Agent accepts or declines according to queue policy.

Agent reviews customer details.

Agent responds.

Agent can request assistance from another department.

Agent can initiate a voice call.

Agent can create an internal support request.

Agent resolves or escalates the conversation.

Conversation history is retained.

PART J — CUSTOMER SUPPORT HISTORY AND DATA RETENTION

13. FULL CONVERSATION HISTORY

Customer support chat history must be retained by default.

Do not automatically clear or truncate conversation history.

Store:

Conversation records.

Messages.

Attachments.

Message timestamps.

Sender identities.

Recipient identities.

Delivery states.

Read states.

Assignment history.

Internal notes.

Transfers.

Related calls.

Related requests.

Status changes.

Resolution details.

Retention rules

Conversations remain available unless an authorized administrator clears or deletes them.

Deletion must be permission-controlled.

Preserve audit records.

Support archived conversations.

Support restoration where appropriate.

Support legal retention holds.

Make retention configurable.

Do not confuse hiding, archiving, and permanent deletion.

Provide clear distinction between these actions.

PART K — ADMINISTRATION AND CONTENT CONFIGURATION

14. CUSTOMER SUPPORT ADMINISTRATION

Build a complete administration module.

14.1 Role and permission management

Support roles such as:

Customer Support Head.

Customer Support Supervisor.

Customer Support Agent.

Call Center Supervisor.

Finance Head.

Finance Staff.

Auditor.

Use configurable RBAC with granular permissions.

Permissions should cover:

View conversations.

Assign conversations.

Transfer conversations.

Delete messages.

Forward messages.

Initiate calls.

Receive calls.

Access call recordings.

Download recordings.

Configure IVR.

Configure queues.

Manage agents.

Manage content.

Manage requests.

Approve requests.

Access analytics.

Access customer information.

Export data.

Manage retention.

Manage integrations.

Support department-level access and explicit member-level permissions.

14.2 Configuration center

Provide dedicated settings for:

Telegram Bot.

Telegram Mini App.

Customer Support Content.

Chat.

Notifications.

Voice Calling.

WebRTC.

IVR.

Queue Management.

Call Recording.

Call Retention.

Business Hours.

Holidays.

Departments.

Agent Groups.

Permissions.

Escalation Rules.

Data Retention.

Integrations.

All configurable functionality must have a working management interface.

PART L — CUSTOMER-FACING TELEGRAM MINI APP REDESIGN

15. COMPLETE CLIENT EXPERIENCE

Rebuild the customer-facing Telegram Mini App.

It must be visually consistent with the MySeed Operations platform while remaining optimized for customer use.

Use a modern Apple-inspired design standard:

Clear visual hierarchy.

Refined typography.

Consistent spacing.

Restrained colors.

Subtle borders.

Soft shadows.

Well-designed cards.

Smooth transitions.

Native-feeling mobile interactions.

Responsive layouts.

Accessible controls.

Clear loading states.

Do not copy Apple's proprietary interface. Use its usability and visual-quality principles.

15.1 Main pages

Implement:

Home.

Start Conversation.

Active Conversation.

Conversation History.

Support Requests.

Request Details.

Call Interface.

Incoming Call.

Active Call.

Call History.

FAQ and Help Center.

Notifications.

Customer Profile.

Language Settings.

Support Information.

15.2 Improve every button

Audit every existing button, menu, navigation item, and interaction.

For each one:

Define its purpose.

Implement the actual action.

Add permission checks where required.

Add loading state.

Add success feedback.

Add failure feedback.

Add confirmation for destructive actions.

Add disabled states when unavailable.

Add appropriate navigation.

Make it accessible.

Remove placeholder actions and nonfunctional controls.

15.3 Telegram integration

Use Telegram Web App capabilities appropriately:

Secure initialization data validation.

Telegram user identity.

Theme parameters.

Viewport management.

Back button.

Main button where appropriate.

Haptic feedback where supported.

Deep links.

Telegram notifications through the bot.

Never trust client-supplied Telegram identity without server-side verification.


PART M — DESIGN AND RESPONSIVENESS

16. APPLE-QUALITY MOBILE AND DESKTOP EXPERIENCE

The internal Operations UI and Telegram customer Mini App must share a coherent design system.

However, their layouts should be optimized for their different users and purposes.

Desktop operations UI

Professional sidebar.

Clear page hierarchy.

Data-rich dashboards.

Efficient tables.

Contextual side panels.

Multi-column chat.

Keyboard shortcuts.

Quick actions.

Responsive resizing.

Mobile operations UI

Bottom navigation where appropriate.

Slide-out contextual panels.

Touch-friendly buttons.

Full-screen conversations.

Bottom sheets.

Mobile-friendly tables.

Accessible forms.

Responsive call controls.

Visual standards

Light and dark themes.

Consistent typography.

Consistent spacing.

Consistent radii.

Consistent iconography.

Semantic color usage.

WCAG-conscious contrast.

Focus states.

Screen-reader labels.

Reduced-motion support.

Skeleton loaders.

Empty states.

Error states.

Offline states.

Use the existing MySeed design system where available.

Do not introduce conflicting design systems.

PART N — DATABASE AND BACKEND ARCHITECTURE

17. DATA MODEL AND PERSISTENCE

Inspect the existing schema before introducing new tables.

Extend existing entities where possible.

Create appropriate models or equivalent structures for:

Financial integrations

Integration.

IntegrationSyncJob.

IntegrationSyncCursor.

IntegrationSyncLog.

ExternalRecord.

Transaction.

TransactionReconciliation.

DynamicFieldDefinition.

SavedFilter.

Customer support

SupportCustomer.

SupportConversation.

SupportMessage.

MessageAttachment.

ConversationAssignment.

ConversationTransfer.

ConversationNote.

ConversationTag.

SupportCategory.

SupportContent.

SupportRequest.

SupportRequestComment.

SupportRequestApproval.

Communications

AgentPresence.

AgentGroup.

Department.

InternalMessage.

ForwardedMessage.

Notification.

Voice

CallSession.

CallParticipant.

CallEvent.

CallQueue.

QueueEntry.

QueueAssignment.

CallRecording.

CallNote.

CallOutcome.

CallbackRequest.

IVR

IVRFlow.

IVRNode.

IVRConnection.

IVRExecution.

IVRExecutionEvent.

IVRAudioAsset.

Administration

SupportRole.

SupportPermission.

SupportRolePermission.

AgentPermission.

RetentionPolicy.

AuditLog.

These are conceptual entities, not a requirement to create duplicate tables where the existing system already has equivalent models.

17.1 Backend requirements

Implement:

Strict validation.

Authentication.

Authorization.

Tenant isolation where applicable.

Database transactions.

Idempotency.

Pagination.

Rate limiting.

Structured logging.

Error handling.

Audit logging.

Background jobs.

Retry mechanisms.

Real-time event handling.

Database indexing.

Secure file storage.

API documentation.

17.2 Security

Implement:

Secure Telegram authentication.

Server-side authorization.

Secure WebSocket authentication.

Short-lived WebRTC tokens.

Private recording storage.

Signed download URLs.

File upload validation.

Malware scanning where infrastructure supports it.

Rate limiting.

CSRF protection where applicable.

Input validation.

Audit trails.

Sensitive-data access controls.

Secure secret management.

PART O — ANALYTICS AND REPORTING

18. CUSTOMER SUPPORT ANALYTICS

Build a complete support analytics dashboard.

Conversation metrics

Total conversations.

New conversations.

Active conversations.

Resolved conversations.

Unresolved conversations.

Average first response time.

Average resolution time.

Customer satisfaction.

Reopened conversations.

Escalation rate.

Agent metrics

Conversations handled.

Calls handled.

Average handling time.

Average response time.

Resolution rate.

Missed calls.

Customer feedback.

Agent availability.

Queue participation.

Call center metrics

Total calls.

Incoming calls.

Outgoing calls.

Answered calls.

Missed calls.

Declined calls.

Abandoned calls.

Average waiting time.

Average call duration.

Queue service level.

Callback completion rate.

Financial support metrics

Payment inquiries.

Payment verification requests.

Failed transaction inquiries.

Refund requests.

Resolved payment issues.

Pending finance requests.

All analytics must be calculated from real persisted data.

Provide filters by:

Date.

Agent.

Department.

Queue.

Category.

Customer.

Status.

Support CSV and Excel exports where authorized.


# System Improvements and Feature Updates

### 1. Chapa Integration and Overview

- Add proper webhook key configuration and ensure Chapa settings follow the provider's official documentation.
- Improve the **Chapa Overview** page with a complete filtering mechanism consistent with the enriched filters used elsewhere in the system.
- Include date filters: Today, Yesterday, Last 7/14/30 Days, This Month, Last Month, This Year, All Time, and Custom Range.
- Add relevant transaction filters such as payment status, payment method, and transaction type.
- Ensure filtering uses actual backend data and updates overview statistics, charts, and transaction lists accordingly.
- Add searching and sorting where relevant.

### 2. Noor Legacy CMS – Scraped Archives & Storage Management

Improve the Scraped Archives and Storage Management module.

- Add a **Fetch Everything** operation that retrieves all available records and archives in one operation.
- Display useful statistics about fetched records, storage usage, snapshots, and processing status.
- Allow users to open each snapshot on a dedicated full-page detail view instead of using a modal.
- Include organized tabs for records, entities, schemas, logs, storage, and data quality.
- Add rich filtering, sorting, pagination, column management, searching, exporting, and snapshot comparison.

### 3. Noor Legacy CMS – Live Filters

Improve the date filtering mechanism across Noor Legacy CMS pages.

Include Today, Yesterday, Last 3/7/14/30 Days, This Week, Last Week, This Month, Last Month, This Year, All Time, and Custom Range.

Set **Today** as the default selection while allowing users to switch to any other range. Ensure filters work with actual backend data.

### 4. Noor CMS Admin Pages Migration

Migrate and properly implement all the following Noor CMS admin pages and their existing functionality:

- Users, Parents, Students, Grades
- Roles and Permissions
- Subject Templates, Academic Content, Academic Quizzes, Flashcards, National Exams
- Feedback, FAQs, Send SMS, Send Push Notification, Settings
- Subscription Plans, Subscriptions, Invoices, Mandates, Subscription History

Preserve existing functionality, backend connections, relationships, and data. Do not create empty pages or placeholder implementations.

### 5. External API Integration Console

Rebuild the entire **External API Integration Console** to match the system's UI, design language, and overall user experience.

- Review each integration individually using its official provider documentation.
- Update each integration's configuration, settings, supported features, and available operations according to the provider's actual capabilities.
- Provide properly organized configuration pages, connection status indicators, testing tools, and useful logs.
- Avoid generic or incomplete integration controls; expose the functionality actually supported by each provider.

For SMS and similar services:

- Provide message composition, recipient selection, and message previews.
- Show character count and SMS segment count before sending.
- Calculate and display the estimated sending cost before confirmation, using the provider's actual pricing and applicable message segments.
- Track delivery statuses, including delivered, pending, failed, and rejected messages where supported.
- Provide complete sending history with recipients, timestamps, delivery reports, costs, and failure reasons where available.
- Include usage summaries, account balance, and transaction history where supported.

### 6. Sidebar and Navigation Improvements

Clean up and reorganize the sidebars across the system.

- Group pages into logical categories with consistent icons and navigation labels.
- Improve active-page indicators and submenu organization.
- When the sidebar is expanded, show the relevant submenu items.
- When collapsed, hide submenu labels and items, displaying only the main navigation icons.
- Optionally provide a flyout submenu when a collapsed navigation item is clicked or hovered over.
- Ensure navigation works consistently across desktop, tablet, and mobile layouts.

### 7. General UI Improvements

Polish the overall interface across all affected modules.

Improve page layouts, tables, filters, forms, detail views, dropdowns, tabs, buttons, loading states, empty states, and responsive behavior. Maintain consistent styling across light and dark modes.

**Important:** First inspect the existing implementation and understand the current backend, integrations, and data structures. Preserve working functionality and existing data. Implement real, functional features rather than mock data, placeholders, or UI-only demonstrations.