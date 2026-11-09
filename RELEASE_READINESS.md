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

### Backups

- A completed staging export was downloaded in Chrome as `mindspark-learning-backup.json` (2,666 bytes). Its QA dataset contained 2 cards, 1 task, 3 quiz records, 1 academy record, 3 math records, 0 focus sessions, game best 1, essay check count 1, and card review stats 1/1.
- Backup version 1 and legacy version 0 are supported. A valid partial backup merges only the fields it contains: list records append by unique ID, repeated imports are idempotent, counters take the greater value, and omitted fields remain unchanged. Conflicting records with an existing ID keep the current local record.
- Malformed JSON, duplicate IDs within one backup, unsupported future versions/fields, invalid partial fields, and merges exceeding the 1,000-record list limit are rejected before mutation; browser checks assert the full pre-import state remains unchanged.
- The expanded Playwright suite exercises these cases in guest contexts. The latest CI evidence is recorded below after completion.

### Device, CI, and accessibility

- No authorized physical iPhone session was available. Do not treat the 390×844 viewport run or Chrome Incognito as physical iPhone/Safari verification.
- Earlier GitHub Actions [run 52](https://github.com/marksheininwork-netizen/study.ai/actions/runs/42622366716) passed on prior PR head `e3b1c458e5fd54e974843e6d3e8d0311727779b4`. The latest CI result for this continuation will be recorded after completion.
- Prior deployed browser checks covered the eight products at desktop and 390×844 mobile sizes; automated axe WCAG A/AA scans passed. The expanded browser suite checks dialog focus containment from its first control and focus restoration after Escape. Full VoiceOver remains outstanding.

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

Completed evidence: automated axe WCAG 2.0/2.1/2.2 A/AA scans passed for all eight product views and the account dialog; keyboard interaction confirmed account-dialog initial focus, Escape dismissal/focus return, and age-gate status text.

- [ ] VoiceOver on macOS and iOS: landmarks/headings, product navigation labels, form labels, quiz correctness/explanations, timer state, save/sync/backup status announcements, and error announcements.
- [ ] Keyboard only: logical order through desktop and mobile navigation, visible focus, skip-to-content behavior, dialog focus containment/wrap, Escape/close behavior, and focus restoration.
- [ ] Dialogs and Clerk-hosted sign-in: announce dialog title/description, enter/exit correctly, age gate reachable, OTP fields/errors announced, and focus restored after close or failure.
- [ ] Forms and errors: required fields, invalid/oversized/malformed/partial/duplicate imports, persistence failures, and sync conflicts associate messages with fields and announce them without losing entered data.
- [ ] Zoom/reflow, contrast, reduced motion, touch target size, orientation, and screen-reader/browser combinations on a real iPhone and desktop.
- [ ] Record assistive technology, OS/browser version, results, and issues. A manual VoiceOver/assistive-technology audit remains outstanding.

## Production launch checklist

- [ ] Close all backup restore/data-integrity blockers and pass the full suite on the final functional commit and the deployed preview.
- [ ] Complete physical iPhone Safari/Chrome authentication, persistence, sign-out, and sync tests when an authorized device is available.
- [ ] Complete independent legal/privacy review and verify deletion retention, notices, consent, and age controls.
- [ ] Complete VoiceOver and keyboard/focus/error-announcement checks and resolve critical findings.
- [ ] Reconfirm preview-only Clerk and D1 configuration, environment separation, and current free-tier/vendor terms.
- [ ] Obtain explicit approval before any production deployment, PR merge, or live billing change.

## Remaining blockers

1. Latest CI and staging preview results for the new restore/import and deletion implementation.
2. Authorized physical iPhone Safari/Chrome auth and sync verification.
3. Add the Clerk development secret only to the staging Pages preview environment, then verify identity, active-session revocation, and D1 tombstone with a disposable QA identity. The connected staging project currently lists no `CLERK_SECRET_KEY`.
4. Independent legal/privacy review and manual VoiceOver/assistive-technology review, including status/error announcements.

PR #2 remains draft and unmerged. Production deployment and live billing are disabled. MathifyX and the public Study AI site were not changed.
