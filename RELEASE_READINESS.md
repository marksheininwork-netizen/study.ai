# Release readiness

## Scope and product state

This branch continues the existing Study AI project as the MindSpark Learning workspace: Study AI, QuizArena, FlashcardLab, MathBattle, EssayCoach, FocusRoom, Competition Academy, and Educational Games Portal. MathifyX is out of scope and was not changed.

The eight products, free guest access, local progress, legacy flashcard migration, merged backup imports, and local backup workflow remain available. Guest data stays on the current device unless the user exports it. EssayCoach uses transparent on-device writing signals and does not send draft text to an AI service. No live billing is enabled.

## Backend design

- A dedicated Cloudflare D1 database named `mindspark-learning-staging` is bound only to the Pages **preview** environment. It contains a single progress table and currently has zero user rows. No unrelated database was changed.
- The Pages Function stores one versioned JSON progress document per authenticated subject ID. It verifies Clerk RS256 session JWT signatures against the configured JWKS and validates issuer, authorized party, expiry, not-before, and subject. SQL statements are prepared and always scoped to that verified subject. Writes use optimistic version checks; conflicts return the latest server version. Same-origin checks apply to mutations.
- Clerk is the selected optional identity provider; no custom password authentication is used. Its public publishable key and server-side issuer/JWKS configuration are empty on staging, so account controls stay unconfigured and cloud routes fail closed. No secret/service-role key is in frontend code.
- The account prompt restricts cloud account setup to people aged 16 or older because Clerk's terms do not support processing under-16 end-user personal information without verifiable parental consent. Younger students can continue in full guest mode. MindSpark does not request a birth date or store student email addresses in D1.

Cloudflare's current published free limits are up to 10 D1 databases, 500 MB per database, 5 GB total storage, 5 million rows read per day, and 100,000 rows written per day; daily read/write caps reset at UTC midnight. Workers Free allows 100,000 requests/day and 10 ms CPU per invocation. Limits can change; review the official [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) before launch. Clerk currently lists up to 50,000 monthly retained users on its free plan; verify [current plan details](https://clerk.com/pricing).

## Verification

- GitHub Actions [run 39](https://github.com/marksheininwork-netizen/study.ai/actions/runs/42554420767) passed on code head `fb807d5038587ce6bf1cdea664b57651fd72aac5`, including static checks, existing browser regressions, and D1/JWT security contract tests. The token tests generate real RSA-signed test tokens; D1 tests exercise two subject IDs, forged/expired/anonymous denial, stale-write conflicts, and account-scoped deletion against a D1 test double. These are not live Clerk or deployed D1 two-user tests.
- Earlier automated axe-core checks passed WCAG 2.0/2.1/2.2 A/AA for all eight product views at desktop/mobile sizes and the account dialog after contrast and FocusRoom label fixes. A full assistive-technology audit remains outstanding.
- The existing HTTPS preview was exercised in a real browser at desktop and 390×844 mobile sizes: all eight tools rendered; task entry, quiz and competition feedback, MathBattle scoring, game streaks, EssayCoach feedback, timer countdown/pause/reset, reload persistence, flashcard creation/review, and merging a backup import worked. The preview preserves the eight-product dashboard and guest access.
- Live backup export now exposes a correctly named `mindspark-learning-backup.json` download link backed by a Blob URL, with an accessible fallback. The preview rendered that link, but the browser automation did not surface a completed download event. Treat deployed export as **not yet verified**; CI verifies export/import round-trip.
- D1 was queried directly after setup: `mindspark_progress` exists and has zero rows.
- Preview deployment `e0b45b22` succeeded on `fb807d5038587ce6bf1cdea664b57651fd72aac5`; the stable preview URL is below. The Cloudflare project reports production deployments disabled. A direct API check from this browser was blocked by its client policy, so deployed HTTP fail-closed status was not independently observed in that attempt; the account UI and function configuration show sync is unconfigured.

## Staging

HTTPS preview: https://codex-mindspark-learning-wor.mindspark-learning-staging.pages.dev/

Cloudflare Pages project `mindspark-learning-staging` is connected to the existing PR branch only. The preview D1 binding is present; production has no D1 binding or environment variables configured. The existing public Study AI site was not changed.

## Remaining blockers

1. **Provider setup and real account tests:** The owner must create/configure a Clerk app, review/accept its terms, and provide its public publishable key. Then configure preview-only `CLERK_ISSUER`, `CLERK_JWKS_URL`, and `MINDSPARK_APP_ORIGIN` values in Cloudflare Pages. Do not put a secret key in the frontend. Two authorized test inboxes are needed to exercise actual email-code sign-in, sign-out, guest migration, cross-device sync, conflict resolution, switching, and account isolation against live D1.
2. **Live backup download:** Confirm an actual browser download and restoration on the deployed preview. Current evidence confirms the accessible Blob download link but not a completed download event.
3. **Student review:** Complete independent privacy/legal review for the intended jurisdictions and appropriate guardian-consent approach before accounts are opened to minors; complete an assistive-technology audit. The 16+ gate follows Clerk's current terms and is not a full compliance determination.

Production deployments remain disabled; PR #2 remains draft and unmerged. No live billing or production Study AI change was made.
