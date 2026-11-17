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
- Cancel