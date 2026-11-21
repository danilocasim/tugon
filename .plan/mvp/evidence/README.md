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
