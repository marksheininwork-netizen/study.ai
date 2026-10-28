# Study.ai — hosted website

This is the public, hosted version of the Study.ai app. It preserves the student interface and study tools from the Python version, with a Cloudflare Worker backend, D1 persistence, and Sites-managed ChatGPT sign-in.

The website is public. Each signed-in visitor receives a private workspace. Anonymous visitors see the sign-in page; all coursework API routes reject anonymous access. Every database read and write is scoped to the platform-provided user ID. Browser-supplied IDs do not grant access to another student’s materials. The platform owns the sign-in endpoints; the app never handles a ChatGPT password.

## Features

Courses, teacher/school details, notes/syllabi/homework/assessments, grades, deadlines, completion, assessment estimates, topic/homework patterns, study sets, guides, spaced review, three game modes, practice history, planner, TSV/CSV/JSON exports, and workspace-data deletion are supported. Text/Markdown/CSV, Word, and text PDF imports are supported. PDF and Word extraction runs in the visitor’s browser; extracted text is saved to their workspace. Scanned images require OCR first.

The app uses local rules for card generation and date-pattern estimates. It does not call a paid AI service. Forecasts are uncertain heuristics with source evidence, not confirmed teacher announcements. Grade weights are per item and may differ from a school’s official category-weighted gradebook. Quiz games run inside the app; automatic publishing to Kahoot/Quizlet and network multiplayer are not included.

The original local database and sample accounts are not copied into the hosted site. A visitor starts with a clean workspace. Erasing workspace data removes that visitor’s app records, not their ChatGPT account.

## Optional Google connection

Google imports are implemented but unavailable until the site owner adds runtime `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` through Sites environment variables. Enable Google Classroom and Drive APIs, configure OAuth consent and test users/verification as applicable, and set the redirect URI to the published origin plus `/api/google/callback`.

Scopes: `classroom.courses.readonly`, `classroom.coursework.me.readonly`, `drive.readonly`. These are read-only, subject to Google quotas and school policies. Sync imports active student courses and coursework from the last 42 days, plus assigned grades/completion. Imports update provider records on subsequent sync; imported coursework defaults to homework and should be reclassified as quiz/test when appropriate. Drive imports only the Google Doc/text file selected by the visitor. Tokens stay server-side and are excluded from exports. Disconnect attempts revocation and removes saved tokens.

## Development

```sh
npm run install:ci
npm run db:generate # only after changing db/schema.ts
node /absolute/path/to/sites/scripts/build-site.mjs
```

The `.openai/hosting.json` manifest binds `DB`. SQL in `drizzle/` is applied by Sites when publishing. Applied migrations are immutable. For a new local preview database, apply the generated migration with the starter’s Wrangler command and use `.wrangler/state` for persistence. `npm run dev -- --port 5173` provides the supported local sign-in mock, which is excluded from the production Worker.

```sh
node --test tests/study.test.mjs
node --check public/app.js
# With the dev server and local migrations running:
node tests/http-check.mjs
```

The domain tests check grade weighting, forecasts, attribution, deduplication, cloze generation, validation, homework patterns, and review date arithmetic. The API check exercises authentication, persistence, ownership checks, CSRF, atomic import validation, grades, sets, reviews, attempts, and cascade deletion in the local test database. Live Google consent is not tested without owner credentials.

## Deployment

Publish through the Sites workflow with the project ID in `.openai/hosting.json`. The hosted database is separate from local previews and from the original Python app. Keep generated build output, local state, and credentials out of Git. The PDF worker in `public/` comes from the installed `pdfjs-dist` package; refresh it when updating that package and preserve its license header.

Core operations have no app-level paid feature gates. File imports have resource limits (1.5 MB, 100 PDF pages, 200,000 extracted characters; CSV up to 500 rows) to keep browser/server work bounded. Hosting and Google service quotas still apply. This deployment is not an independent security/compliance certification; the owner remains responsible for privacy/consent policies and operating the student service appropriately.

## Guest mode and the 50-feature expansion

Choose **Continue as guest** on the entry screen to use the app without signing in. Guest records remain in that browser's local storage (or temporary memory if browser storage is blocked). They are never written to the hosted account database. The guest banner makes the storage boundary visible. Export a JSON backup before clearing browser data. Leaving guest mode does not erase the local guest copy.

Signed-in students can import this browser's guest work from Progress. Imports create new course/material/set/tool records with new IDs; they do not overwrite existing account records. Review schedules and game history restart on restored sets. Google authorization still requires a signed-in account and the existing provider consent process.

The full, numbered list of exactly 50 additions is in [FEATURES.md](FEATURES.md) and in the app's **What's new** page. Tool entries use the existing owned-record database schema, so this release needs no schema migration. Server-side validation and ownership checks apply to all signed-in tool writes and restores. No Google secrets or existing account records are changed by this update.

Added validation: `node --test tests/study.test.mjs tests/upgrade.test.mjs` (24 checks), plus `node tests/http-check.mjs` against a running local preview for account-backed tools and restore flows. Browser checks cover guest entry and reload persistence, task details/subtasks/priorities, reverse/starred/typing cards, mistake logging, focus elapsed-time logging, and explanation feedback. The checklist in FEATURES.md describes functionality; it is not a claim of an independent audit of all 50 workflows.
