# Tugon MVP — architecture decisions

**Status:** Recommended for implementation. See [TODO](./TODO.md) for dependency order and gates. This plan does not authorize a deploy or make a claim about an existing Coolify environment.

## 1. One deployment, three portal boundaries

Use one **Next.js App Router** app with separate `/resident`, `/barangay`, and `/tanod` layouts and feature modules. Keep Administration at `/barangay/admin`; it is a role-restricted staff workspace, not a fourth identity system. Each portal retains its own shell, install metadata and experience. Start from the prototype's Next 16 / React 19 / TypeScript / Tailwind 4 stack; pin supported patched versions and preserve visual behavior with screenshots before upgrading.

```text
apps/web/      Next.js app, portal feature modules, shared UI/i18n, server code, browser tests
supabase/      CLI local config, ordered SQL migrations, SQL tests, synthetic fixtures
ops/           Pinned deploy definitions, mail templates, scheduled jobs, runbooks
prototype/     Read-only design and workflow reference; not a production workspace
.plan/mvp/     Decisions, parity matrix, ordered work and verification
```

One app keeps route links, role enforcement, localization, tokens, install assets and releases coherent. The alternatives—three Next.js apps in a workspace, three auth cookie domains, or a separate backend API—add cross-app contracts and deployment burden without a pilot requirement. Reconsider workspaces/separate images only when independent ownership, release cadence, isolation or capacity warrants it; keep portal-specific modules from importing one another's internals now. One session per browser context; use distinct Playwright contexts or browser profiles for three simultaneous roles, not a production persona switch. Keep `prototype/` dependencies and files out of the product image.

The pilot serves one barangay, with settings (name, service hours, contacts, active teams and locations) in data—not hardcoded demo constants. Multi-barangay tenancy, native apps, public case maps, payment, and background offline sync are outside this MVP.

## 2. Request path and authorization

- Use Next Server Components and scoped data readers for protected pages, client components for interactions, Server Actions for forms, and Route Handlers for authenticated media/downloads and provider callbacks. Validate all inputs; derive identity from a verified Supabase session, not a user ID, role cookie, page URL, or client metadata. Use `@supabase/ssr` with request-specific clients and Next 16 Proxy for cookie refresh; the Proxy is not the authorization boundary. Do not trust `getSession()` on the server. For privileged operations, recheck current membership and applicable assurance level regardless of what the UI shows.
- Supabase Auth subject IDs link to server-controlled membership, `active` status, team and roster accounts. Resident access is ownership-only; intake and supervisors have only the areas/actions in the [prototype access policy](../../prototype/src/lib/policy.ts), handlers are case/team-scoped (Peace & Order only for Lupon), and tanods get their own schedules and assigned field work. Admin settings and aggregate reports must not imply access to case content. Explicitly document any accepted deviation from prototype de facto access.
- PostgreSQL is the record of truth. Use ordered SQL migrations and generated DB types. Apply deny-first grants/RLS on exposed tables, authenticated storage policies, and separate private PII/internal notes from resident-facing projections. Reporting and search have the same visibility boundary as their source data. If using views, review invoker/owner semantics and grants rather than assuming views inherit RLS.
- Mutations that change state (claim, assign, resolve, incident fanout, Lupon closure) lock or conditionally update rows and commit state, audit and outbox entries together. Where direct table writes would bypass invariants, revoke that DML and expose narrowly granted transition RPCs. Any necessary `SECURITY DEFINER` function gets a minimal owner/grants, empty `search_path`, qualified names, no public execute, and explicit checks of verified actor, membership, `aal` and row state. Never use a service-role key as the default data client. Privileged Auth provisioning and bounded jobs use separate server-only credentials/access paths.

### Identity flows

| Portal | Production flow | Enforced gates |
| --- | --- | --- |
| Resident | Supabase email OTP for signup/sign-in; use Resend SMTP and a six-digit code template on both first-time and returning mail flows. Invite-only by default; when enabled, public enrollment checks Turnstile hostname and action before asking the private Auth gateway to create the user or send a code. | Verified mailbox, active profile and row ownership. Safe allowlisted return route. |
| Staff and admin | Invite-only enrollment, verified work email (Resend), password/reset, and app authenticator (TOTP). Administrators manage staff; supervisors and administrators manage tanods. | Active role/team membership plus `aal2` on protected pages, reads, writes, media and permitted subscriptions. Staff/admin role never comes from signup metadata. |
| Tanod | Pre-provision a mobile identity; Supabase Phone Auth verifies possession during sign-in. A signed Supabase Send SMS Hook can pass the exact Supabase-generated code to Semaphore's OTP route. | Active officer record keyed by Auth user, normalized `+63` phone, no public officer enrollment, bounded attempts/resends and scoped assigned-case access. |

Phone OTP is a staging gate, not assumed working because notifications use Semaphore. Pin and prove the GoTrue HTTP hook version and config; test delivery, rejection, replay protection and preservation of leading zeroes. If it fails, agree an approved Supabase-supported SMS provider such as Twilio for **auth only**; keep Semaphore for ordinary notifications. Do not hand-roll OTP verification or silently switch to email. Verify signed hook requests on the raw body, enforce timestamps/replay controls, and never record OTPs or raw provider responses. For sign-in flows use non-enumerating errors and rate limits at Auth/gateway, plus CAPTCHA where supported; throttling only Next.js pages does not protect public Auth endpoints. Recheck memberships on protected requests so an existing token cannot retain deactivated privileges; revoke sessions on offboarding or account deletion.

## 3. Data and cross-portal updates

| Group | Records and invariants |
| --- | --- |
| Identity/config | Auth users, profiles, memberships, teams, barangay settings, DPO/retention, preferences and consent receipts; separate public configuration from private contacts. |
| Service reports | Stable UUIDs and unique public references; user/submission idempotency key; private reporter contact and coordinates; classifier suggestion/version separate from staff-confirmed labels; immutable status/history, restricted flag and ownership. |
| Field work | Officers, duty slots unique by officer/date/shift, assignment state and timestamps, and private field evidence. Offboarding revokes sessions, clears duty slots from the current Manila date, and cancels open assignments without changing completed records. Dispatch and roster mutations lock the active officer before writing. |
| Operations | Incidents/report links, protected Lupon cases/hearings/legal holds, audit events, per-recipient notices, leased delivery jobs and provider references. No personally identifying detail in general audit/transport logs. |
| Files | Private Storage buckets for intake, field and outcome evidence; objects have upload limits, metadata stripping, association, authorization and lifecycle state. Never publish an input photo merely because a case closed. |

Use one per-user authorized Supabase Realtime channel for invalidation; publish only event type or revision, not case rows, coordinates, contacts, or report snapshots. Resolve recipient eligibility at emission time; re-fetch through the ordinary authorized read path on each event, reconnect or invalidated session. Treat delivery as best-effort, never persistence. For sensitive evidence prefer authenticated `no-store` responses and scoped reads over long-lived bearer links. Verify Storage policies separately from row reads.

Port and version the prototype's deterministic classifier, priority and hotspot modules; compute suggestions in trusted code and keep humans in charge. Use indexed SQL queries for bounded windows and only then run analytical algorithms on eligible data. Do not ship full data to an unauthorized browser to compute an aggregate. Preserve the prototype's visible behavior, document any differences from [the thesis](../../docs/Thesis_Chapters_1-3_Reformatted%20%281%29.md), and use synthetic/de-identified data for evaluation. Thesis metrics are acceptance targets to measure, not performance already achieved.

**Prototype/thesis comparison in the implementation.** Classifier `tfidf-nb-1` uses the prototype's synthetic Taglish corpus, unigram/bigram TF-IDF and multinomial Naive Bayes; label probabilities and evidence are suggestions, not calibrated risk or dispatch decisions. Queue policy `priority-v1` keeps the thesis weights `0.5 urgency / 0.3 category / 0.2 aging`, capped at five hours; SLA breach is shown separately rather than silently changing the score. The transaction rejects an out-of-order claim without a reason. Insights run `dbscan-haversine-v1` and fixed-seed `kmeans-k3-v1` on server-side eligible pins; the map rounds published centers and hides individual noise pins and clusters smaller than three. Analysis prioritizes the 600 most recent eligible pins at high volume. The checked-in unit fixtures verify three Taglish categories, Manila-day buckets, two compact clusters plus one noise point, and queue aging. These are synthetic correctness checks, not measured field accuracy or a thesis reproduction.

The monthly rate is first staff actions within the current response target divided by first actions recorded before month end for non-duplicate/non-withdrawn reports received in that Manila month. It is calculated from current case records, not a frozen historical SLA snapshot. Monthly reports exclude restricted cases from service KPIs, suppress Lupon/purok counts of one or two, omit case/incident text and identify SMS only as provider-accepted.
Roster totals count scheduled officer-shift slots by their Manila start date. A night shift starting on the last day belongs to that month even if it ends the next morning. The report includes no officer identities and does not claim attendance.

## 4. Delivery, offline and lifecycle

Auth emails use Resend SMTP; optional report emails use Resend's server API. Non-auth SMS uses Semaphore's standard message endpoint, with limited neutral text, explicit resident/assisted consent, and opt-out enforcement when queued and at send time. Delivery failure never rolls back a report. Use a small Coolify-scheduled server job with atomic Postgres leases, deduplication by event/recipient/channel, bounded retries, and provider IDs for reconciliation; treat uncertain provider outcomes separately rather than retrying blindly. OTP delivery is synchronous with Auth and never enters the report delivery outbox.

Use HTTPS, separate manifest IDs and start URLs, and one same-origin offline worker that caches only explicitly listed static assets and a generic offline shell. No caching signed-in HTML, Next RSC payloads, case API data, photos or precise locations. Preserve retry during short disconnections with a stable submission key; never claim a submission succeeded offline. For durable draft resume use an explicit authenticated, expiry-bound draft, not unbounded browser storage of personal text/photos. Trusted logout clears UI state and subscriptions. Retention and account deletion are audited lifecycles, not a bulk reset; legal holds and restore reconciliation follow [Operations](./OPERATIONS.md).

## Implementation references

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), and [PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps).
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [MFA](https://supabase.com/docs/guides/auth/auth-mfa), [phone sign-in](https://supabase.com/docs/guides/auth/phone-login), and [Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook).
- [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), and [database test guidance](https://supabase.com/docs/guides/local-development/testing/overview).
- [Resend SMTP](https://resend.com/docs/send-with-smtp) and [Semaphore SMS/OTP API](https://semaphore.co/docs).
