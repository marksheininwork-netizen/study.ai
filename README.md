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

Tasks, cards, scores, writing-review counts, and focus sessions save in browser storage. Data stays on that device unless the learner exports a backup or configures an account. Supported backup imports merge only included fields, de-duplicate records by ID, and keep the greater cumulative counters. Each list is limited to 1,000 records. Malformed, duplicate-ID, over-limit, unsupported-version, or invalid-field backups are rejected before changing progress. Store a JSON backup before changing browsers or clearing data.

Signed-in account deletion requires a server-only Clerk development secret (`CLERK_SECRET_KEY`) in the staging Pages preview environment. The endpoint authenticates the current subject, replaces synced progress with a minimal deletion tombstone, revokes active sessions, and asks Clerk to delete that identity. A provider failure leaves sync blocked and returns a retryable partial-completion message. The current browser's account cache is cleared after success; other devices can retain local cached progress until the learner clears it there.

EssayCoach runs in the browser and never sends draft text to an AI service. Avoid entering identifying or sensitive information. Cloud accounts require an unverified self-attestation of age 16 or older; the app does not verify age or provide a guardian-consent flow. Learners under 16 can use guest mode. This does not determine whether guest or account use is appropriate for a particular student or jurisdiction; obtain independent legal/privacy review before serving minors. Do not use school credentials.

## Optional account sync

The current development architecture uses Clerk email-code authentication with owner-scoped Cloudflare D1 storage. Guest mode remains fully usable without a login, account service, or network connection. Cloud sync stores a random Clerk subject identifier, learning progress, a version, and update time. It does not store the email in D1; EssayCoach draft text is excluded.

The existing Cloudflare Pages project is staging-only. Its preview configuration uses the public Clerk issuer, JWKS URL, allowed staging origin, and `MINDSPARK_DB` binding. The browser publishable key in `mindspark-config.js` is public. The Clerk backend secret must never be placed in browser code, source control, or chat; account deletion requires `CLERK_SECRET_KEY` in the Cloudflare Pages **Preview** environment only. Do not add it to Production.

The app requires a 16+ self-attestation before cloud sign-in. That checkbox is not age verification or guardian consent. The correct age range, consent requirements, privacy notices, retention and deletion periods, and vendor terms require independent review before launch. No legal compliance conclusion is made.

## Checks

Install the pinned development dependency and Chromium, then run all static, integration-contract, and real-browser checks:

```sh
npm install
npx playwright install chromium
npm test
```

The browser suite covers desktop and mobile navigation and first-run states across all eight products, saved tasks, quiz and contest scoring, flashcard review, legacy migration, exact full-field guest restore, malformed/interrupted/duplicate/older/partial backup behavior, MathBattle, EssayCoach, FocusRoom completion across navigation, axe accessibility scans, dialog keyboard containment, and mocked account migration/isolation/deletion. D1/JWT security tests exercise owner isolation and deletion flows with a mocked Clerk backend. Real Clerk deletion requires the development secret in staging Preview settings; CI mocks do not substitute for a live provider test.
