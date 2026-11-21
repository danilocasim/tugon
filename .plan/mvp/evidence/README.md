# Design and implementation evidence

Captured from the local Next.js prototype with synthetic accounts and case data only. Chromium at 390 × 844 CSS px (mobile/touch) for screenshots; A4 with print backgrounds for PDFs. The mobile captures had no horizontal overflow (`scrollWidth = 390`). Relative day labels and the on-duty badge reflect the prototype's data and Manila time at capture; match the same fixture and clock before doing pixel comparisons.

| Artifact | Fixture or scenario |
| --- | --- |
| [Resident home](./resident-home-390.webp) | Liza, Filipino, reply needed and active reports |
| [Staff duty roster](./staff-roster-390.webp) | Arnel, English, read-only daily coverage |
| [Staff officer directory](./staff-directory-390.webp) | Arnel, English, on-duty group and call actions |
| [Tanod schedule](./tanod-schedule-390.webp) | Joel, English, current and next night shift |
| [Lupon summons](./lupon-summons-a4.pdf) | Seeded mediation case with a scheduled hearing |
| [Monthly report](./monthly-report-a4.pdf) | Jessa, current month, synthetic aggregates |

All prototype screen families, and the deliberate removal of demo controls, are mapped in [Design parity](../DESIGN-PARITY.md). Acceptance of final forms and full production screenshot comparison are separate gates.

## Locally running implementation

All captures use the separate Supabase pilot stack and synthetic data. Roster and directory are cropped from the actual 390px staff page; the mobile fixed bottom bar is visible in the full-page captures.

| Artifact | Verified surface |
| --- | --- |
| [Resident home](./local-resident-home-390.png) | Neutral report picker, no horizontal overflow |
| [Staff roster](./local-staff-roster-390.png) | Day-first roster, day and night coverage cards |
| [Staff directory](./local-staff-directory-390.png) | Duty groups and an aligned Call action |
| [Tanod schedule](./local-tanod-schedule-390.png) | Overnight Manila shift, stacked shift times and active/next status |
| [Monthly report](./local-monthly-report-a4.pdf) | Chromium-generated A4 from the live local application, with app navigation hidden |
| [Lupon summons](./local-lupon-summons-a4.pdf), [settlement](./local-lupon-settlement-a4.pdf), [CFA](./local-lupon-cfa-a4.pdf) | Authorized Chromium A4 drafts with app chrome hidden; unrelated staff access denied |

The matching browser scenarios are in [`apps/web/tests/e2e`](../../../apps/web/tests/e2e/). The `local-` captures contain synthetic data, not the prototype's hardcoded accounts. Date labels and numbers are expected to differ.

## Mobile comparison against the prototype

Reviewed the four 390px reference and implementation pairs above. This is a structural comparison, not a pixel match: the prototype is signed in as a seeded resident and handler, while implementation captures use a guest resident and a supervisor over separate synthetic records.

| Surface | Matching behavior | Differences in the captures |
| --- | --- | --- |
| Resident home | White two-column report picker, colored category icons, tinted write-first link, and fixed primary report action. | The guest has no reply-needed banner, personal greeting, or request list. The signed-in reference includes all three. |
| Staff duty roster | Date strip and stacked day/night cards replace the weekly matrix at phone width. | The supervisor can edit shifts; the prototype capture is read-only. The local capture is cropped to the roster region. |
| Staff officer directory | Duty grouping, contact and shift details under each name, and a right-aligned, labeled Call action. | The captured supervisor can deactivate officers and the fixture has one officer, so the screenshot alone does not compare a populated off-duty group. |
| Tanod schedule | Date badges and status labels stay aligned, shift time sits under the shift label, and current/next status is explicit. | The implementation capture includes a page title and a double-shift day. The prototype capture omits the title and uses a single-shift fixture. |

The standalone Docker image passed 10 targeted Chromium scenarios against isolated Supabase. The public resident picker fit at 320px in both languages, with its sign-in link on one line. The resident account switch and report steps worked by keyboard. Staff opened the palette with `/`, typed into its focused search, and closed it with Escape. The staff and Tanod profile menus supported arrow keys and Enter for language selection. The Filipino roster date control updated a polite live region. Filipino staff and Tanod screens fit at 320, 390, and 768px. The same run verified the read-only handler view, desktop roster matrix, denied location fallback, retry without duplicate reports, offline fallback, and authorized printing.

### Additional role and screen comparisons

Captured 18 more screen pairs in Chromium at 390 × 844 CSS pixels and checked that each page fit at both 320 and 390px. Sheets show the prototype above the implementation, scaled equally. Identity, locale, record count, and case status can differ between these independent synthetic fixtures.

| Sheet | Screens from left to right | Review notes |
| --- | --- | --- |
| [Resident forms](./resident-forms-comparison.webp) | Sign-in, Account, report entry | The email-card and report-step hierarchy match. No demo email shortcut in the product. The report entry uses the resident's saved language. |
| [Resident records](./resident-records-comparison.webp) | Privacy, Requests, Updates | Public notice retains the warning and section order. The product uses short staging copy and a reviewed deletion request instead of demo deletion. Requests and Updates show legitimate empty states for a newly enrolled account. |
| [Staff entry and queues](./staff-entry-comparison.webp) | Sign-in, Intake inbox, Work queue | Replaced the demo persona chooser with real credentials and recovery. The queue preserves priority/actions and no longer fails when an in-progress request lacks recorded triage. |
| [Staff work](./staff-work-comparison.webp) | Case detail, Insights, Incidents | Matched card order, metric grid, and incident empty state. The reports differ by category/status; the product also had closed incident fixtures. |
| [Staff records](./staff-records-comparison.webp) | Monthly report, Lupon, Administration | The monthly preview and print action remain. Lupon is deliberately disabled; the existing A4 draft evidence validates authorized rendering separately. Administration uses wrapped mobile navigation and staff cards instead of clipping the prototype's table. |
| [Tanod field work](./tanod-field-comparison.webp) | Sign-in, Assignment detail, History | Removed the demo officer chooser. The assignment card and progress strip match; the captured assignment status and availability of a map differ by fixture. |

Remaining: matched fixtures for loaded resident details, receipt and service information; staff My cases, assisted intake, incident detail, and the enabled Lupon docket; physical Android/iOS PWA installation and screen reader testing; and formal product-owner acceptance.
