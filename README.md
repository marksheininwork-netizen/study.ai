# MindSpark Learning

MindSpark Learning is a local-first student workspace in the `study.ai` repository. The eight tools share a progress dashboard and keep guest use free without login:

- **Study AI:** create and check off a practical study plan.
- **QuizArena:** practice subject questions with explanations and saved attempts.
- **FlashcardLab:** create, search, review, and export cards with spaced repetition; existing Study AI cards and recall counts are migrated.
- **MathBattle:** solve generated arithmetic challenges and track streaks.
- **EssayCoach:** get a local revision checklist based on basic writing signals; it is not an AI grader.
- **FocusRoom:** run 10, 25, or 45-minute sessions and review completed focus history.
- **Competition Academy:** practice original contest-style questions with explanations.
- **Educational Games Portal:** play a mental-math streak game and keep a personal best.

MathifyX is outside this change.

## Run locally

Serve the repository root with any static HTTP server and open `index.html`. Guest mode has no runtime service dependency. Without backend configuration, sign-in forms are hidden and the app makes no network requests.

## Progress, privacy, and backup

Tasks, cards, scores, writing-review counts, and focus sessions save in browser storage. Data stays on that device unless the learner exports a backup or configures an account. Import merges with the current browser records to avoid replacing existing progress. Store a JSON backup before changing browsers or clearing data.

EssayCoach runs in the browser and never sends draft text to an AI service. Avoid entering identifying or sensitive information. Account use is optional; learners under 13 should get parent or guardian approval before using email sign-in. Do not use school credentials.

## Optional Supabase account sync

1. Create an isolated development Supabase project. Do not reuse a project with unrelated data.
2. Apply `supabase/migrations/202611080001_mindspark_progress.sql`.
3. Configure Supabase email authentication to send a six-digit code (email template uses `{{ .Token }}`) and set the correct local/preview redirect URLs.
4. Set `url` and the browser-safe **publishable** key in `mindspark-config.js`. Never use a secret or `service_role` key in the browser.
5. Use a development-only account and verify authentication, RLS isolation, and backup restoration before enabling it in a shared preview.

The first account sign-in merges guest data with existing account progress. Simultaneous device writes retry using an update timestamp; account switching stores a separate local cache per account. The table only permits authenticated users to read, insert, and update their own row. Cloud sync is intentionally disabled until a development project is configured.

## Checks

Install the pinned development dependency and Chromium, then run all static, integration-contract, and real-browser checks:

```sh
npm install
npx playwright install chromium
npm test
```

The browser suite covers desktop and mobile navigation across all eight products, saved tasks, quiz and contest scoring, flashcard review, legacy migration, backup export/import and invalid-file handling, MathBattle, EssayCoach, FocusRoom completion across navigation, and mocked account migration/isolation. The SQL integration-contract test checks the RLS policy shape. A live Supabase integration run still requires an isolated development project and configured auth email flow.
