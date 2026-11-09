# Release readiness

## Scope and product state

This branch continues the existing Study AI project as MindSpark Learning: Study AI, QuizArena, FlashcardLab, MathBattle, EssayCoach, FocusRoom, Competition Academy, and Educational Games Portal. MathifyX is out of scope and was not changed.

Guest mode remains free, local-first, and available without login. Existing flashcard migration, progress tracking, local backup import/export, and merge-on-import behavior remain. EssayCoach evaluates text in the browser and does not send draft text to an AI service. No live billing is enabled.

## Cloud account configuration

- The optional identity provider is the **Clerk development instance** for MindSpark Learning. It is configured for email verification codes. Password sign-up, phone sign-up/sign-in, and username collection/sign-in are disabled to keep the flow passwordless and minimize account data. No Clerk secret key is present in frontend code.
- Cloudflare Pages preview variables contain the public Clerk issuer, JWKS URL, and exact allowed staging origin. The frontend contains only the public `pk_test_` publishable key. Production variables and D1 binding remain absent, and production deployments remain disabled.
- Cloud account creation requires the user to affirm age 16+. The guard blocks account setup without the checkbox, while guest access stays available. QA test personas used for this verification were synthetic Clerk test-mode identities; the configured Clerk test code does not send email. This age gate is a product safeguard, not a legal determination.
- MindSpark stores only the authenticated Clerk subject ID, version, and progress JSON in D1. Emails are handled by Clerk and are not stored in D1. Essay drafts are not part of synced data.

## D1 security and live account tests

The dedicated D1 database `mindspark-learning-staging` is bound only to the Pages preview as `MINDSPARK_DB`. A real sign-in initially exposed a binding-name mismatch: the Pages Function expected `DB`, so the server failed closed. The function and auth readiness checks now accept the configured `MINDSPARK_DB` binding, with backward-compatible `DB` support in tests.

Using two separate Clerk development test identities through the deployed staging UI:

- Email-code signup/sign-in succeeded for both test users; sign-out returned to guest mode.
- User A's existing guest progress migrated to a D1 row on first sign-in. Signing out and switching accounts preserved each user's private local account cache.
- User B started with an empty workspace, saved a unique QA task, and received a separate D1 row/version. User B did not see User A's cards, task, quiz history, or progress.
- Signing back into User A restored User A's migrated cards, task, and histories.
- A direct read-only D1 query showed exactly two distinct subject-scoped rows. User A's row did not contain User B's QA marker; User B's row did not contain User A's data. D1 payloads did not contain test email addresses.
- The browser reloaded the authenticated app and showed successful sync. Account A then signed in from a separate Chrome Incognito storage context; the D1-backed cards, task, and recent activity appeared there. This verifies cross-browser synchronization across isolated storage contexts. No physical iPhone account session was available.
- The deployed API could not be directly opened in this browser due to the browser client's network policy. Server-side authorization, forged/expired token denial, two-subject separation, CSRF denial, conflict handling, and owner-scoped deletion are covered by the automated function tests.

## Product, mobile, accessibility, and privacy verification

- GitHub Actions [run 49](https://github.com/marksheininwork-netizen/study.ai/actions/runs/42558849776) passed on head `748f46d6a309f538e154ba441bbc5b1e26e670e0`. It ran JavaScript/structure checks, sync contract tests, signed-JWT/D1 authorization tests, and the Playwright desktop/mobile regression suite.
- The suite includes a deterministic regression for the discovered MathBattle negative subtraction defect. In the deployed 390×844 mobile UI, a live challenge `5 − 7` accepted `−2` as correct.
- The deployed mobile dashboard and all eight product screens rendered at 390×844; the mobile navigation remained usable and the dashboard showed no visible horizontal overflow. Earlier desktop browser checks and CI continue to cover 1365×900.
- Product interactions covered study task persistence, quizzes and explanations, original contest questions, flashcard reveal/review and legacy migration, focus timer controls/history, game streaks, EssayCoach feedback, account switching, and progress reload.
- Automated axe-core scans previously passed WCAG 2.0/2.1/2.2 A/AA for all eight product views, account dialog, and supported test layouts. The live Clerk UI is the provider-hosted component; a full assistive-technology audit, including screen readers, remains outstanding.
- Privacy/data-minimization review confirmed that cloud sync excludes essay text, uses no student name/date-of-birth fields, and stores no email in D1. Independent privacy/legal assessment and jurisdiction-specific guardian-consent design are still required before serving minors. Accounts remain gated to 16+ pending those assessments.

## Backup verification

- The deployed preview's export control created the named `mindspark-learning-backup.json` Blob download. Chrome showed the downloaded JSON as complete (2,666 bytes).
- The downloaded file was selected in FlashcardLab's restore control in the same QA account context. That earlier same-account restore did not prove clean-profile recovery. The updated browser suite exports a fixture containing every supported field, imports it into a fresh guest context, and compares the complete state exactly.

## Staging and infrastructure

HTTPS preview: https://codex-mindspark-learning-wor.mindspark-learning-staging.pages.dev/

The Cloudflare Pages project `mindspark-learning-staging` is connected to the PR branch, and the stable preview alias above is served by the latest successful branch deployment. Its current preview variable names include the Clerk issuer/JWKS URL and allowed origin, but not `CLERK_SECRET_KEY`; account deletion therefore returns a safe 503 until the owner adds a Clerk development secret privately. Production deployments are disabled; production has no D1 binding or Clerk environment variables. The existing public Study AI site was not changed.

Supabase project creation remains blocked by the account's free project quota. No existing Supabase or D1 project was deleted, repurposed, or migrated. See current [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Clerk development environments](https://clerk.com/docs/guides/development/managing-environments), and [Clerk JavaScript quickstart](https://clerk.com/docs/js-frontend/getting-started/quickstart).

## Final release-readiness verification

### Continuation evidence — 2026-11-09

- GitHub Actions [run 56](https://github.com/marksheininwork-netizen/study.ai/actions/runs/42677351414) passed on PR head `905b99237829d2f22c4365a798f00073e895c449`. Its final `npm test` step completed successfully: structural and JavaScript checks, sync contracts, D1/JWT authorization, and the full Playwright desktop/mobile and axe regression suite.
- The browser suite now restores every exported field into an empty guest context and compares the full state exactly. It also verifies valid version 0/version 1 imports, repeat-import idempotence, safe partial merges, invalid/malformed/duplicate/future-version/over-limit rejection with exact state preservation, account deletion confirmation/cancel, session/data cleanup behavior, and focus trapping.
- Latest Cloudflare Pages preview deployment `d738a2b4-2d82-44b7-8af7-9d7e043cfe51` completed successfully for the PR head. Preview URL: https://codex-mindspark-learning-wor.mindspark-learning-staging.pages.dev/ . A read-only browser smoke pass opened all eight product routes, confirmed the empty guest state, checked Shift+Tab and Tab focus wrapping inside the account dialog, and confirmed Escape returns focus to its opener.
- Staging account deletion itself remains unverified because the connected preview environment has no `CLERK_SECRET_KEY`. Function-level tests mock Clerk's Backend API and verify same-subject session revocation and identity deletion, D1 tombstone behavior, stale-token rejection, partial-failure messaging/retry, and refusal to use a live `sk_live_` key. No Clerk identity was deleted during testing.
- No authorized physical iPhone or VoiceOver session was available; the checklist below remains for an authorized tester.

### Backups

- A completed staging export was downloaded in Chrome as `mindspark-learning-backup.json` (2,666 bytes). Its QA dataset contained 2 cards, 1 task, 3 quiz records, 1 academy record, 3 math records, 0 focus sessions, game best 1, essay check count 1, and card review stats 1/1.
- Backup version 1 and legacy version 0 are supported. A valid partial backup merges only the fields it contains: list records append by unique ID, repeated imports are idempotent, counters take the greater value, and omitted fields remain unchanged. Conflicting records with an existing ID keep the current local record.
- Malformed JSON, duplicate IDs within one backup, unsupported future versions/fields, invalid partial fields, and merges exceeding the 1,000-record list limit are rejected before mutation; browser checks assert the full pre-import state remains unchanged.
- The expanded Playwright suite exercises these cases in guest contexts. The latest CI evidence is recorded below after completion.

### Device, CI, and accessibility

- No authorized physical iPhone session was available. Do not treat the 390×844 viewport run or Chrome Incognito as physical iPhone/Safari verification.
- Earlier GitHub Actions [run 52](https://github.com/marksheininwork-netizen/study.ai/actions/runs/42622366716) passed on prior PR head `e3b1c458e5fd54e974843e6d3e8d0311727779b4`. The latest CI result for this continuation will be recorded after completion.
- Prior deployed browser checks covered the eight products at desktop and 390×844 mobile sizes; automated axe WCAG A/AA scans passed. The expanded browser suite checks dialog focus containment from its first control and focus restoration after Escape. Full VoiceOver remains outstanding.

## Current continuation evidence — 2026-11-09

- The latest code commit `61bf0a6182a6e233671b7f589b31efa04c5729f5` passed the complete `npm test` workflow in [run 66](https://github.com/marksheininwork-netizen/study.ai/actions/runs/42687086331), including Playwright desktop/mobile and axe. This commit adds recovery coverage for a Clerk sign-in component load failure: guest mode remains available and retry succeeds. Earlier complete runs 63 and 64 also passed. PR #2 is open, draft, and unmerged.
- GitHub Actions [run 58](https://github.com/marksheininwork-netizen/study.ai/actions/runs/42679369127) passed the D1 deletion authorization/session-revocation/idempotency tests. Intermediate runs 59–62 exposed test setup and styling issues; those were fixed before run 63.
- Cloudflare Pages preview deployment `05c7bd11-46d9-4054-af00-3b736c25037c` succeeded for head `61bf0a6182a6e233671b7f589b31efa04c5729f5` and carries the `MINDSPARK_DB` staging binding. Stable preview: https://codex-mindspark-learning-wor.mindspark-learning-staging.pages.dev/ . Preview variables include the Clerk issuer, JWKS URL, and allowed origin; `CLERK_SECRET_KEY` is absent. Production branch remains `main`; this is preview only.
- Automated checks cover all eight product routes at 1365×900 and 390×844, axe WCAG A/AA scans, mobile overflow, representative product interactions and persistence, complete/partial backup restore, malformed/duplicate/unsupported backup rejection, dialog keyboard containment, account-switch isolation, and guest-to-account migration. Browser regressions simulate a sync-write outage (device copy remains intact, visible error, successful retry) and Clerk sign-in component load failure (guest mode remains usable, successful retry). These are Playwright simulations, not real provider outages.
- D1/JWT tests mock Clerk and cover anonymous deletion denial, account-subject scoping, active-session revocation, repeat deletion after Clerk returns already deleted, and safe retry after session-revocation or identity-deletion failures. No real Clerk identity deletion was performed.
- No physical iPhone/Safari/Chrome session or manual VoiceOver review was performed.

### Safe staging account-deletion exercise (once the owner configures the secret)

1. In Cloudflare Pages **preview settings only**, set `CLERK_SECRET_KEY` to the MindSpark Clerk **development** `sk_test_` secret; never put it in browser code, GitHub files, a URL, or chat. Confirm production settings remain unchanged and trigger a preview redeploy.
2. Create a disposable QA identity through the staging app, affirm the existing 16+ gate, and add only a unique synthetic task marker. Confirm sync succeeds. Use the authorized staging D1 read-only path to verify the subject row and marker before deletion; do not copy tokens or personal data into logs.
3. Open account deletion and cancel the native confirmation. Confirm the identity remains signed in and the D1 marker remains.
4. Repeat, type `DELETE`, and confirm. Verify the app reports completion and returns to guest mode; the browser owner key and signed-in cache are cleared. Confirm D1 contains only the deletion tombstone for that random subject, the old session cannot read or write progress (410), and the identity/session no longer exists through Clerk's development console/API.
5. Record only pass/fail, deployment ID, timestamp, and redacted evidence. Do not test with a real learner account. If provider deletion partially fails, keep the tombstone, use the page's retry while the authorized session token remains valid, and verify completion before removing the test marker or changing settings.

This exercise has not run. The missing staging-only development secret is the blocker; automated mocks do not substitute for a live deletion test.

### Remaining human release checklist

- [ ] Authorized tester completes the physical iPhone Safari and Chrome steps below, including sign-in, sign-out, guest persistence, cross-device sync, and recovery from an offline period.
- [ ] Tester completes the VoiceOver checks below on iPhone and desktop and records OS/browser/assistive-technology versions.
- [ ] Owner configures the staging-only development secret and completes the disposable identity exercise above.
- [ ] Independent privacy/legal reviewer approves age assurance, student notices/terms, consent/guardian duties, data retention/deletion, and vendor terms. Automated checks do not establish legal compliance.
- [ ] Only after those gates, obtain explicit approval for any production deployment, PR merge, or billing change.

## Independent privacy and legal review checklist

This checklist is for independent counsel/privacy review, not a compliance conclusion. Review the current [Clerk Standard Terms](https://clerk.com/legal/standard-terms), [Clerk Privacy Policy](https://clerk.com/legal/privacy), and [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) against the actual deployment and jurisdictions.

- [ ] Confirm current Clerk plan/terms permit the intended educational/student audience and all end-user processing. Clerk's Standard Terms state that under-16 end-user personal information requires evidence of verifiable parental consent. The product currently gates cloud accounts to self-attested age 16+; determine how to treat 16–17-year-olds, age misrepresentation, and jurisdictions with other age/consent rules.
- [ ] Determine whether any guest-mode local data, device identifiers, or technical logs create personal-data obligations; document purpose, minimization, retention, deletion, and access controls for each field and provider.
- [ ] Review D1 data categories and retention: subject ID, progress JSON (including tasks, cards, and learning activity), version, timestamps. Confirm no email or essay draft is stored, no unnecessary student fields are collected, and operational logs/backups do not reintroduce identifiers.
- [ ] Confirm the student-facing notice accurately names MindSpark, Clerk, Cloudflare, the data collected, cross-device sync, local guest storage, retention/deletion, contact method, rights, and any analytics/cookies. A full standalone notice and user terms were not independently verified in this PR.
- [ ] Verify account deletion on staging after a Clerk development secret is configured. The route replaces progress with a minimal deleted-account tombstone, revokes the user's active Clerk sessions, then deletes the Clerk identity. The tombstone blocks stale JWTs from reading or recreating progress and allows a retry if provider cleanup fails. On success, the current browser cache is cleared; other devices may retain local cache until manually cleared. Verify provider backup and retention timing independently. The tombstone retains only the random Clerk subject ID to suppress stale sessions, so include that purpose and retention period in privacy review.
- [ ] Confirm guardian consent, notice, parental access/deletion rights, age assurance, data transfer/residency, vendor DPAs, incident response, and retention periods as applicable. Do not enable under-16 accounts until the required consent and legal review are complete.
- [ ] Record an independent reviewer’s decision and date; no legal compliance determination is made here.

## Authorized physical iPhone test checklist

Run only on an authorized tester's iPhone using the deployed staging preview. Record iPhone model, iOS version, Safari version, Chrome version, tester initials, date/time, and whether VoiceOver was enabled. Use disposable development test identities and no real student data.

1. Open the staging URL in Safari and Chrome. Confirm HTTPS, all eight tools, responsive navigation, and no horizontal overflow.
2. As a guest, create a task and flashcard; complete a quiz and math problem; record a focus session. Reload and close/reopen the browser. Confirm local progress persists.
3. Sign in with an authorized Clerk development test identity and permitted email code. Confirm guest data migrates once, sync status is announced, and reload restores it.
4. On a second authorized device/browser, sign in to the same test identity and verify synced data. Make a change on each device and confirm conflict recovery without data loss.
5. Sign out. Confirm the account view is detached, guest mode remains available, and reloading does not silently sign the user back in. Check account switching does not expose another test identity's progress.
6. If the development deletion secret is configured, use a disposable test identity: cancel the confirmation and verify nothing changes; then type `DELETE`, verify success/sign-out, and confirm sign-in is revoked and D1 progress is gone.
7. Record failures with redacted screenshots and console/network details. Never capture email codes, bearer tokens, or secret values.

A simulator or responsive desktop viewport does not count as a physical-device pass.

## Assistive-technology test checklist

Completed evidence: axe WCAG 2.0/2.1/2.2 A/AA scans passed for all eight product views and the account dialog in CI run 63. Automated and staging keyboard checks confirmed initial focus, backward and forward focus wrapping, Escape dismissal/focus return, visible sync/error status, and age-gate status text. Manual screen-reader checks remain open.

- [ ] VoiceOver on macOS and iOS: landmarks/headings, product navigation labels, form labels, quiz correctness/explanations, timer state, save/sync/backup status announcements, and error announcements.
- [ ] Keyboard only: logical order through desktop and mobile navigation, visible focus, skip-to-content behavior, dialog focus containment/wrap, Escape/close behavior, and focus restoration.
- [ ] Dialogs and Clerk-hosted sign-in: announce dialog title/description, enter/exit correctly, age gate reachable, OTP fields/errors announced, and focus restored after close or failure.
- [ ] Forms and errors: required fields, invalid/oversized/malformed/partial/duplicate imports, persistence failures, and sync conflicts associate messages with fields and announce them without losing entered data.
- [ ] Zoom/reflow, contrast, reduced motion, touch target size, orientation, and screen-reader/browser combinations on a real iPhone and desktop.
- [ ] Record assistive technology, OS/browser version, results, and issues. A manual VoiceOver/assistive-technology audit remains outstanding.

## Production launch checklist

- [x] Close backup restore/data-integrity blockers and pass the full suite on the latest code commit and deployed staging preview — GitHub Actions run 66 and deployment `05c7bd11-46d9-4054-af00-3b736c25037c`.
- [ ] Complete physical iPhone Safari/Chrome authentication, persistence, sign-out, and sync tests when an authorized device is available.
- [ ] Complete independent legal/privacy review and verify deletion retention, notices, consent, and age controls.
- [ ] Complete VoiceOver and keyboard/focus/error-announcement checks and resolve critical findings.
- [ ] Reconfirm preview-only Clerk and D1 configuration, environment separation, and current free-tier/vendor terms.
- [ ] Obtain explicit approval before any production deployment, PR merge, or live billing change.

## Remaining blockers

1. Authorized physical iPhone Safari/Chrome sign-in, sign-out, sync, and persistence verification.
2. Add the Clerk development secret only to the staging Pages preview environment, then verify identity, active-session revocation, and D1 tombstone with a disposable QA identity. The connected staging project currently lists no `CLERK_SECRET_KEY`.
3. Independent legal/privacy review and manual VoiceOver/assistive-technology review, including status/error announcements.

PR #2 remains draft and unmerged. Production deployment and live billing are disabled. MathifyX and the public Study AI site were not changed.

## Latest continuation — backup read failure coverage (2026-11-09)

- Added a browser regression for a backup file whose asynchronous read rejects before parsing. It verifies the user receives an import error and every preexisting progress field remains byte-for-byte equivalent at the application-state level.
- GitHub Actions [run 68](https://github.com/marksheininwork-netizen/study.ai/actions/runs/42708148958) passed on commit `b7785bbcc6f021f41f16367faa72ab1205549cc0`. The completed `verify` job ran the full `npm test` suite, including backup round-trip, import validation and failure atomicity, D1/JWT security tests, desktop/mobile Playwright flows, and axe checks.
- Cloudflare preview deployment `d3b2183e-a487-4518-99fd-713b40923aed` completed successfully for that commit with the dedicated `MINDSPARK_DB` preview binding. A new hash deployment origin opened as a fresh guest profile and showed all eight products. Its settings still omit `CLERK_SECRET_KEY`.
- Automated Playwright file uploads use `setInputFiles()` in CI and verify exact restore into a new browser context. The Codex in-app browser did not expose a native file chooser for a second real-preview upload attempt, so this attempt is not counted as a deployed import pass. Do not describe the in-app-browser attempt as native picker verification.
- No live Clerk account deletion was performed. The deletion endpoint and mocked provider tests remain covered; a real disposable-identity exercise requires the owner to set the development-only secret in Pages Preview settings. Production configuration was not changed.

### Remaining explicit gates

- [ ] Owner finishes the staging-only Clerk development secret setup, then complete the disposable test identity deletion/revocation check.
- [ ] Complete physical iPhone Safari/Chrome and VoiceOver testing with an authorized device.
- [ ] Obtain independent privacy/legal review; no compliance conclusion is made.

