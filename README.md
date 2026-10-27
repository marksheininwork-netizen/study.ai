# Study.ai

**Public website:** https://study-ai-student-workspace.goodbread2051.chatgpt.site

The public hosted version is in [`hosted/`](hosted/README.md), using durable cloud storage and Sites-managed sign-in. The Python version below remains available for self-hosting.

A self-hosted student workspace that turns coursework into a study routine. The core app runs without paid APIs, subscriptions, external AI, analytics, hosted fonts, or a cloud database. Python serves the app and stores account data in SQLite. The only runtime package is an open-source PDF reader.

## Run locally

Requires Python 3.9+ (3.13 recommended). Node is only needed for the JavaScript syntax check.

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python server.py
```

Open http://localhost:8000 and create an account. Without installing requirements, everything except PDF imports still works. Set `PORT` and `APP_ORIGIN` together if changing ports. Origin must exactly match the browser URL, including scheme and port.

To try **synthetic** six-week sample coursework, run `python demo.py`. It creates a new sample account and prints its unique login. It never creates a default administrator or a shared built-in password. Demo data is local and excluded from Git.

## What works

- Accounts with salted PBKDF2 password hashes, server sessions, seven-day expiry, and sign-out.
- Separate course workspaces with course, teacher, and school details.
- Editable notes, syllabi, homework, quizzes, tests, projects, and class activities.
- Assignment dates, due dates, completion, earned/possible points, and grade weights.
- Text/Markdown imports, CSV batch imports, DOCX text extraction, and text PDF extraction.
- Course averages, grade movement, recurring words/topics, homework due-day patterns, and lower-scoring work.
- Assessment-window estimates with source dates, low/moderate confidence labels, and stale-window indicators.
- Definition and cloze cards extracted locally from source text, with source attribution. Manual sets and editing are supported.
- Study guides, TSV flashcard export, and question/answer CSV export.
- Due-card review with a simple spaced schedule: known cards double their interval, starting at one day and capped at 90 days; missed cards remain due today.
- Multiple-choice quiz sprint, a 60-second quiz, and a matching game. One-card sets use typed-answer quizzes. Results persist.
- Deadline planner, due reviews, and lower-scoring material suggestions.
- JSON export of the signed-in user’s data; deletion of individual materials, sets, courses, or the account.
- Optional read-only Google Classroom and Drive imports.
- Responsive layout, keyboard-accessible forms, native dialogs, and escaped user content.

### Suggested first session

1. Create each class and add teacher/school details.
2. Bring in around six weeks of notes, homework, syllabus text, assessments, and scores. Six weeks is useful context, not an admission requirement.
3. Mark assessments as `test` or `quiz` and use the date they occurred. Add due dates to homework.
4. Open Insights to inspect the evidence and the Planner to choose your next task.
5. Generate a study set, check its source and answer, edit as needed, then review or play a game.

### CSV format

```csv
title,kind,date,due,content,score,total,weight,done
Cell transport notes,note,2026-10-20,,"Osmosis: Water moves across a selectively permeable membrane.",,,,false
Chapter 3 quiz,quiz,2026-10-21,,,8,10,1,true
Chapter 4 practice,homework,2026-10-22,2026-10-29,"Review the class examples.",,,1,false
```

Dates use `YYYY-MM-DD`. Kinds are `note`, `syllabus`, `homework`, `quiz`, `test`, `project`, `activity`. Each import accepts up to 500 rows; document uploads up to 1.5 MB, 100 PDF pages, and 200,000 extracted characters. These are resource limits, not paid usage tiers. Importing the same manual CSV again creates more records; Google imports instead update records by provider ID.

## Google Classroom, Docs, and Drive setup

The Google integration is optional and subject to Google quotas, consent verification, and school administrator policies. No credentials are included in the repository. The app never uses the developer’s own connected Google account on behalf of students.

1. Create a Google Cloud project and enable the **Google Classroom API** and **Google Drive API**.
2. Configure the OAuth consent screen. For testing, add your account as a test user.
3. Create a **Web application** OAuth client. Set the exact redirect URI to `http://localhost:8000/api/google/callback` (or your HTTPS app origin plus `/api/google/callback`).
4. Export these variables before starting the server:

```sh
export APP_ORIGIN=http://localhost:8000
export GOOGLE_CLIENT_ID='your-client-id'
export GOOGLE_CLIENT_SECRET='your-client-secret'
python server.py
```

5. Sign in to Study.ai, open Connections, and choose Connect Google.
6. Sync Classroom to import your active student courses, the last 42 days of coursework, completion state, and assigned grades. Re-sync is manual and updates existing provider records.
7. Browse Drive, choose a course, and select a Google Doc or plain-text file to import. Google Docs are exported to plain text through Drive. This flow is intentionally user-selected; it does not ingest the entire Drive.

Requested scopes:

- `classroom.courses.readonly`
- `classroom.coursework.me.readonly`
- `drive.readonly`

OAuth uses state, PKCE, and server-side refresh tokens. Google tokens never reach the frontend or JSON export. Disconnect attempts provider token revocation and removes local tokens. Imported coursework remains until the user deletes it. Classroom teacher names are entered manually; roster scopes are not requested. Imported Classroom coursework defaults to homework because the API does not reliably identify teacher assessment intent; reclassify quizzes/tests before using forecasts. A subsequent sync overwrites imported item edits with provider values.

Drive read-only access is a broad scope and may require Google verification. A future production deployment may prefer a verified Picker flow with per-file access. This app does not silently bypass school restrictions.

References: [Classroom scopes](https://developers.google.com/workspace/classroom/guides/auth), [coursework and student submissions](https://developers.google.com/workspace/classroom/guides/manage-coursework), [Drive files](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get).

## How the analysis works

Grades are the weighted mean of scored item percentages. Default item weight is 1; no grade is shown without scored work. The dashboard averages course averages equally. This may differ from a school’s category-weighted gradebook; enter appropriate item weights and compare with the teacher’s official grade.

Grade movement compares the first half of dated scored items with the second half, requiring at least four results. Topic counts are per-source keyword counts, not semantic understanding. Homework patterns count recorded due weekdays.

Assessment estimates use the median positive gap between historical quizzes and tests. At least two gaps are required. The window is the median-gap date plus/minus at least two days or the observed interval standard deviation. Confidence is moderate only with at least four gaps and low variability; otherwise it is low. A past estimate is labeled stale rather than advanced silently. These uncalibrated heuristics cannot promise exam dates, assessment contents, or grades.

Study generation extracts `term: definition`, `term — definition`, and `term is/are ...` pairs. Other sentences become cloze prompts. Repeated sentences are deduplicated, up to 60 cards per generation. This is transparent local text processing, **not an LLM tutor**. It does not solve arbitrary homework, understand diagrams, or validate facts. Always review generated questions and answers. Custom sets accept up to 200 cards. No automatic Kahoot/Quizlet publishing or multiplayer room service is included; equivalent solo/pass-the-screen games run within Study.ai, with TSV/CSV exports for reuse.

PDF extraction uses [pypdf](https://pypi.org/project/pypdf/). Scanned images need OCR before import. Word import reads body text, without retaining formatting, embedded images, or attachments.

## Tests

```sh
python -m unittest -v
node --check public/app.js
```

Tests cover real local HTTP account flows, cross-account isolation, CSRF origin checks, validation, atomic imports, grades and forecasts, generated sets, review and attempt persistence, cascade deletion, Word/PDF extraction, and mocked Google sync/pagination. Google live consent/permissions require deployment credentials and are not covered by a live account test. CI runs the suite on pushes and pull requests.

Browser checks were performed with synthetic data for login, dashboard layout, a complete quiz sprint, and a complete matching game. Do not treat this as a load test or an independent security audit.

## Docker and hosting

```sh
docker build -t study-ai .
docker run --rm -p 127.0.0.1:8000:8000 \
  -e APP_ORIGIN=http://localhost:8000 \
  -v study-data:/app/data study-ai
```

The image runs as an unprivileged user and keeps SQLite in the volume. Set Google variables with your hosting secret manager when needed. Do not commit `.env`, databases, or tokens. The app does **not** automatically load `.env` files; `.env.example` documents supported settings.

This is a working self-hosted application for local or small trusted deployments, not a claim of a fully operated public SaaS. The standard-library HTTP server should sit behind a maintained HTTPS reverse proxy with request timeouts, request/body limits, and rate limiting before internet exposure. Keep a single app instance with persistent local SQLite storage; do not put the database on an ephemeral or shared network filesystem. Configure `APP_ORIGIN` to the exact HTTPS origin; this enables Secure session cookies. The server uses its configured timezone for dates; set `TZ` consistently with the school.

For a public student service, deployment work still includes HTTPS/domain setup, monitoring, backups and restore drills, privacy/consent policies for the intended students and region, credential management, abuse controls, and an independent security review. There is no email verification, password reset/recovery, admin dashboard, or end-to-end encryption. Passwords are hashed; coursework and OAuth refresh tokens are stored unencrypted in the local database, so protect the host, backups, and volume permissions. Local authentication limits are basic and not a replacement for proxy-level protection. The database is not included in Git or Docker images.

Export downloads contain the user’s data and should be kept privately. Account deletion removes live database records, not historical external backups. Disconnect Google before deleting an account if you want provider token revocation, or revoke access from Google account settings afterward.

## Structure

- `server.py`: HTTP API, validation, SQLite schema, analysis, document parsing, Google OAuth/imports.
- `public/`: dependency-free frontend.
- `test_app.py`: integration and domain tests.
- `demo.py`: optional synthetic preview generator.
- `requirements.txt`: PDF parser pin.
- `Dockerfile`: portable application image.
- `.github/workflows/check.yml`: CI.
