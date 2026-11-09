# Release readiness

## Scope

This branch extends the existing Study AI app into the MindSpark Learning workspace: Study AI, QuizArena, FlashcardLab, MathBattle, EssayCoach, FocusRoom, Competition Academy, and Educational Games Portal. MathifyX is out of scope and was not changed.

## Implemented

- Eight usable student tools with responsive navigation, dashboards, local progress history, explanations, and student-facing limitation/privacy messages.
- Free guest mode continues to work without sign-in or network access.
- Study AI flashcards and recall totals migrate from the existing legacy browser keys. Backup imports merge records and do not replace current progress.
- Optional email one-time-code accounts and Supabase progress sync are implemented behind empty-by-default development configuration.
- Sync uses a per-user RLS-protected row, account-specific local caches, optimistic concurrency retries, and local data preservation on sync failure.
- SQL migration applies explicit authenticated-only SELECT/INSERT/UPDATE policies tied to `auth.uid()`, enables and forces RLS, limits payload size, and revokes anonymous access.
- EssayCoach is a transparent on-device heuristic, not an AI grader. No live billing or external AI service is enabled.

## Verification

`npm test` runs JavaScript/static checks, backend policy contract checks, and Chromium browser interactions at desktop and mobile viewports. Browser checks cover all eight products, task persistence, quizzes, competition questions, card creation/review, legacy migration, backup round-trip and malformed backup handling, math challenges, EssayCoach, focus timer persistence across navigation, and mocked account migration/isolation.

GitHub Actions run 19 passed on PR head `3241f4946d72904bb8ec2e9e6d4da60d7938fcc4`: Chromium interaction checks completed for desktop and mobile, and the mocked account migration/isolation checks passed. This workspace has no installed browser and cannot retrieve npm packages directly, so the browser suite ran in GitHub Actions. No live Supabase credentials are configured, so the SQL/RLS contract and mocked client flows are tested, while a hosted Supabase integration remains unverified.

## Remaining release work

- Create or select a dedicated development Supabase project, apply the migration, configure OTP email template/redirects, add the development URL and publishable key, and run real authenticated two-user isolation and cross-device tests. No accessible project was appropriate: the active project contains unrelated data and the user's other project is paused/unavailable. No paid branch or project was created.
- Run an assistive-technology and formal privacy review before public release.
- No preview deployment was created. The live Study AI site was not modified; this feature branch is not deployed there.
- Account sync cannot be exercised until the development backend configuration is supplied. No subscription, payment, or billing flow is present.

## Deployment

Do not point the production Study AI URL at this branch until the development backend setup and formal privacy/accessibility reviews are complete. No deployment or billing changes were made.
