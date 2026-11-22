# API versions and deprecation rules

For developers who connect to MySeed Verify, and for the team that changes the API. These rules decide when a change can ship, and how much notice integrations get.

## Versions

- **The version is in the path.** Every address starts with `/v1/`. A breaking change ships only in a new path (`/v2/`), never in `/v1/`.
- **The contract is the source of truth.** It is `contracts/openapi.v1.json`, also served at `/v1/openapi.json`, and `info.version` names its revision. The SDKs are built from the same file: `@myseed-verify/server`, `@myseed-verify/web` and `@myseed-verify/react-native`.
- **Webhook events carry their own version.** Each event has `"version": "1"`. A breaking change to an event ships as a new event version, sent only to endpoints that ask for it.

## What is not a breaking change

These ship in `/v1/` at any time, and integrations must accept them:

- a new endpoint, or a new optional field in a request
- a new field in a response or a webhook event, such as `environment` in November 2026
- a new reason code in `feedback.code`, or a new `feedback.message` text
- a new value in an enum that the API sends, where the contract marks it as open
- a new bank or wallet, or a new webhook event type
- a lower rate limit for one key that is abusing the API

Receivers must therefore ignore fields they do not know, and they must treat an unknown reason code by its `feedback.action`.

## What is a breaking change

- removing an endpoint, a field or an enum value
- renaming any of those
- changing a field's type or meaning
- making an optional request field required
- tightening validation so that a request that worked now fails
- changing how amounts, idempotency or signatures work

## Deprecation

When an operation will be removed, or will change in a breaking way in the next version:

1. **Announce it.** The changelog says what changes, what to use instead, and the sunset date.
2. **List it in `apps/api/src/deprecations.ts`.** From then on, every answer to that operation, errors included, carries these headers:
   - `Deprecation: @<unix time>` (RFC 9745)
   - `Sunset: <date>` (RFC 8594)
   - `Link: <guide>; rel="deprecation"`

   The SDKs pass these headers through, so integrations see them in their logs.
3. **Give at least six months between the notice and the sunset.** The API refuses to start with a shorter one (`MIN_NOTICE_DAYS`).
4. **Contact the organizations still calling it.** Their admins are told by email and in the console, from the API log, at three months and at one month before the sunset.
5. **Keep a version running.** A `/v1/` operation keeps working for at least twelve months after `/v2/` offers its replacement.

The SDKs follow the same rules: a breaking change to an SDK means a new major version, and the old major version gets security fixes for twelve months.

## Changelog

Every change that integrations can notice is listed on the public changelog with its date. This includes new fields, new endpoints, deprecations and sunsets. The changelog is edited in the platform admin under **Website**.
