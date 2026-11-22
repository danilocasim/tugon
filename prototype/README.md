# Tugon — barangay service request prototype

A clickable, working prototype of three apps: a **Resident portal** (mobile-first PWA, Filipino and English), a **Barangay portal** (intake, queue, cases, tanods, incidents, Lupon docket, insights, monthly report, administration; English or Filipino), and a **Tanod app** (mobile-first PWA for field officers, Filipino first). All run against one live backend, so a report submitted on a phone appears in the barangay inbox within a second, and a tanod sent to a case sees it on their phone just as fast.

Barangay Sampaguita is fictional, and every report and account is demo data.

## Run it

```bash
npm install
npm run dev
```

| URL | What |
| --- | --- |
| `http://localhost:3000/` | Prototype hub and walkthrough |
| `/demo` | Phone (switch Resident / Tanod) and barangay desk side by side |
| `/resident` | Resident portal |
| `/barangay` | Barangay portal |
| `/tanod` | Tanod app |

**Demo sign-in.** Resident: `liza.ramos@example.com`, code `246810`. Staff: pick any persona, authenticator code `246810`. Switch staff roles from the account menu or ⌘K ("Prototype · view as"). Tanod: pick a tanod, SMS code `246810`; switch tanods from the prototype controls.

**Tanods.** Supervisors and administrators add tanods and edit the weekly day/night roster on `/barangay/tanods`. Handlers (for their team's cases), supervisors, and intake (for danger-flagged reports) send a tanod from a case's **Field team** card. The tanod accepts or declines, marks arrival, and files a field report with an optional photo; the case stays with its handler, who sees the report live. Closing a case calls off its open field assignments. Each portal has its own session cookie, so a resident, a desk staffer, and a tanod can be signed in side by side in one browser.

On narrow screens, the staff roster shows one date at a time with separate day and night shifts. Tap a date for coverage or **Edit shift** to change assignments if your role allows it. Wider layouts retain the weekly grid. The officer directory puts on-duty officers first and labels each tap-to-call action.

**SMS.** Residents add a mobile number and opt in on their account page; walk-in and phone reporters are asked for consent at intake. They get a short text on status changes, staff updates, and Lupon hearings; tanods get one for each new assignment. Texts are **simulated** by default and listed under Administration → SMS log. To send real texts through [Semaphore](https://semaphore.co), set `SMS_PROVIDER=semaphore` and `SEMAPHORE_API_KEY` (optionally `SEMAPHORE_SENDER`) on the server. That path is untested in this prototype.

**Incidents.** When many reports describe one problem (a flood by the market), intake or a supervisor starts an incident from an Insights hotspot or from a report with several neighbors. Linked reporters all get each incident update, and a supervisor closes the incident, which resolves its queued and in-progress cases together.

**Proof of resolution.** Recording an outcome can attach a photo, either a new upload or the tanod's field photo. The resident sees it under the outcome.

**Lupon (Katarungang Pambarangay).** Peace-and-order cases between residents can be filed with the Lupon from the case page. The docket at `/barangay/lupon` tracks the 15-day mediation and 15-day (once-extendable) conciliation periods, hearings, summons, settlements with the 10-day repudiation window, and certificates to file action. Summons, settlements and certificates print from the case. Timelines and wording follow RA 7160 and the usual KP forms, but **a barangay must confirm them against its own Lupon practice and current DILG templates**.

**Monthly report.** `/barangay/reports` prints the month's requests, response times, channels, puroks, tanod work, Lupon cases, incidents and hotspots for the Punong Barangay and the DILG (print or save as PDF).

**Data privacy (RA 10173).** Administrators set the Data Protection Officer and a retention period; running retention anonymizes closed cases older than it (Lupon cases are kept as legal records) and removes old SMS records. Residents can read the notice, download their data as JSON, and delete their account.

**Prototype controls** (the dashed yellow button) can reset all data, and in the resident portal can drop the connection on the next submit to demonstrate safe retries.

**On a phone on the same network:** `npm run dev -- -H 0.0.0.0`, then open `http://<your-computer-ip>:3000`. Browsers only allow device location, camera capture, and service workers on HTTPS or localhost, so use pin, landmark, and photo-library upload there.

**PWA install and offline page:** the service worker registers in production builds only — `npm run build && npm start`.

## What is real

| Thesis method | Where |
| --- | --- |
| TF-IDF (1–2 grams, min_df 2) + Multinomial Naive Bayes (α 1.0), category and urgency | `src/lib/classifier.ts`, corpus in `src/lib/corpus.ts` |
| Priority score 0.5·U/3 + 0.3·W/3 + 0.2·min(1, wait/300) with aging, plus overdue escalation | `src/lib/priority.ts` |
| Haversine distance, DBSCAN (ε 100 m, MinPts 4), K-Means (k=3), silhouette | `src/lib/geo.ts`, `src/lib/cases.ts` |

Roles are enforced on the server (`src/lib/policy.ts`, `src/server/actions.ts`, `incidents.ts`, `lupon.ts`, `privacy.ts`); each portal only receives what its user may see (`src/server/views.ts`). Changes stream to open screens over Server-Sent Events (`src/app/api/events`). Staff Filipino copy lives in `src/features/barangay/fil/`, keyed by the English text.

## Prototype shortcuts

- Data is one JSON file plus photos in the OS temp folder (`TUGON_DATA_DIR` overrides it). Delete the folder or use **Reset demo data** to reseed.
- Sessions are an httpOnly cookie holding a demo account id; sign-in codes and email are simulated.
- The basemap comes from OpenFreeMap. Purok boundaries and hotspots are drawn on top of real Muntinlupa streets for illustration.
- `postinstall` copies MapLibre's web worker into `public/maplibre/`.

## Layout

```
src/app/            routes: hub, demo, resident/*, barangay/*, tanod/*, api/*
src/features/       resident/, barangay/ and tanod/ screens
src/components/     ui/ (shadcn primitives), tugon/ (badges, map, marks)
src/lib/            domain model, algorithms, policy, formatting
src/server/         store, seed data, server actions, role-scoped views
public/             manifests, service worker, offline page, icons
```
