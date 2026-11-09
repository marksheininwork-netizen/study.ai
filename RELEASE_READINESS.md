# Release readiness

## Scope

This branch continues the existing Study AI app as the MindSpark Learning workspace: Study AI, QuizArena, FlashcardLab, MathBattle, EssayCoach, FocusRoom, Competition Academy, and Educational Games Portal. MathifyX is out of scope and was not changed.

## Implemented

- Eight student tools with responsive navigation, dashboards, local progress history, explanations, and student-facing limitation/privacy messages.
- Free guest mode works without sign-in or a network connection.
- Existing Study AI flashcards and recall totals migrate from legacy browser keys. Backup imports merge with current progress rather than replacing it.
- Optional email one-time-code accounts and Supabase progress sync are implemented behind empty-by-default development configuration.
- Sync uses a per-user RLS-protected row, account-specific local caches, optimistic concurrency retries, and local data preservation on sync failure.
- SQL migration applies authenticated-only SELECT/INSERT/UPDATE policies tied to `auth.uid()`, enables and forces RLS, limits payload size, and revokes anonymous access.
- EssayCoach uses transparent on-device writing signals, not an AI grader. Draft text is not sent to an AI service. No live billing is enabled.

## Verification

GitHub Actions [run 26](https://github.com/marksheininwork-netizen/study.ai/actions/runs/42552360149) passed on PR head `1209b8cf903ec46db6b48c50552d350b8dfce606`. It runs static/safety checks, RLS and sync contract checks, and Chromium desktop/mobile interactions. The browser suite covers all eight products, task persistence, quizzes and competition questions, flashcard creation/review, Study AI legacy migration, valid and malformed backup imports, backup export/restore, math challenges, EssayCoach, focus timer behavior, and mocked account migration/isolation.

Automated axe-core checks cover WCAG 2.0, 2.1, and 2.2 A/AA rules across all eight product views at desktop and mobile sizes, plus the account dialog. The scan found muted-text contrast failures and an unlabeled FocusRoom duration selector; both were corrected. Automated checks passed on run 26. This is not a full assistive-technology audit.

A real browser test against the deployed preview verified:
- All eight products rendered on desktop and at a 390×844 mobile viewport, with no horizontal overflow on mobile.
- Study AI task entry; correct QuizArena and Competition Academy answers; MathBattle scoring; Educational Games streak; EssayCoach feedback; and FocusRoom countdown, pause, and reset.
- Quiz progress persisted after reload; flashcard creation and review worked; backup import merged a second card without removing the existing card.
- The account dialog retains guest access and explicitly reports cloud sync is not configured.

The CI suite completed the full backup export/import round-trip. In the live preview browser, clicking Export backup did not surface a downloadable file event, so live export remains unverified.

## Staging

HTTPS preview: https://codex-mindspark-learning-wor.mindspark-learning-staging.pages.dev/

This isolated Cloudflare Pages project deploys the MindSpark branch only. Production deployments are disabled. The existing public Study AI site was not changed.

## Remaining release work

- The signed-in Supabase dashboard has a separate “MindSpark” organization on the Free Plan with no projects. Supabase blocks free project creation because the account owner has reached the limit of two active free projects across organizations. The project form offers pausing/deleting an existing project or upgrading. I left both unrelated projects unchanged and did not upgrade. To continue within the free tier without interrupting other work, the owner must free a slot themselves or provide access to a separate Supabase account with free-project capacity.
- No MindSpark Supabase project was created, so the existing RLS migration was not applied anywhere. After a dedicated development project is available, inspect it, apply the migration, configure email OTP and preview redirects, and use only its publishable key in the client.
- Real two-user OTP sign-in/sign-out, guest-to-account migration, cross-device sync, conflict resolution, account switching, backup restoration, and unauthorized RLS denial remain unverified. Cloud sync remains disabled until these tests pass.
- Complete an assistive-technology accessibility audit and a student privacy/minors review before public release.

No production deployment, billing change, or production Study AI change has been made. Do not enable live billing, merge, or point the public Study AI URL at this branch without the required approval.
