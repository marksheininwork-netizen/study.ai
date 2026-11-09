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
- The downloaded file was selected in FlashcardLab's restore control in the same QA account context. Restore completed without an error and retained the two saved cards. The target already contained the same progress, so restoration into a clean guest profile remains to be verified. Automated CI separately covers backup JSON import/merge behavior.

## Staging and infrastructure

HTTPS preview: https://codex-mindspark-learning-wor.mindspark-learning-staging.pages.dev/

The latest successful Pages preview deployment is `7525c196` for commit `748f46d6a309f538e154ba441bbc5b1e26e670e0`. The Cloudflare Pages project `mindspark-learning-staging` is connected to the PR branch. Production deployments are disabled; production has no D1 binding or Clerk environment variables. The existing public Study AI site was not changed.

Supabase project creation remains blocked by the account's free project quota. No existing Supabase or D1 project was deleted, repurposed, or migrated. See current [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Clerk development environments](https://clerk.com/docs/guides/development/managing-environments), and [Clerk JavaScript quickstart](https://clerk.com/docs/js-frontend/getting-started/quickstart).

## Remaining blockers

1. Verify cross-device restoration using a second independent browser/device and complete the deployed backup download and restore using a browser that exposes its download location.
2. Obtain independent student privacy/legal review, including jurisdiction-specific guardian-consent requirements for any future under-16 accounts; complete a screen-reader/assistive-technology audit.
3. Before launch, review current vendor limits and verify staging-specific auth/domain configuration again. Production deployment remains an explicit approval step.

PR #2 remains draft and unmerged. No production deployment, live billing, MathifyX change, or public Study AI change was made.
