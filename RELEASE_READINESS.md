# Release readiness

## Scope

This branch turns the existing single-page Study AI app into the MindSpark Learning guest workspace. It includes Study AI, QuizArena, FlashcardLab, MathBattle, EssayCoach, FocusRoom, Competition Academy, and Educational Games. MathifyX was deliberately left out of scope.

## Verified in this branch

- JavaScript syntax compiles with Node's `vm.Script`.
- The repository check asserts all eight product entries and core feature hooks are present.
- Responsive viewport and mobile layout rules are present in the source.
- Guest use and the absence of billing are disclosed in the UI.
- Progress is written to browser local storage; legacy Study AI card and stats keys are migrated.
- Flashcard review scheduling, JSON backup import/export, and the competition geometry answer key are covered by structural assertions.
- EssayCoach identifies its checks as local heuristics and says it does not send draft text to an AI service.
- No authentication, payment, or external AI calls are present in this static app.

Run the check with `node tests/check.mjs`.

## Not verified / not included

- Browser interaction testing for sign-up, guest, task saving, card migration, quizzes, timers, import/export, and narrow-screen behavior remains pending. The browser-use environment refused local-file URLs, so this pass could not drive the local UI.
- No deployed preview was created. The feature branch is not the live Study AI site.
- The existing public deployment was not confirmed to be running this branch.
- There is no account system, server-side progress sync, subscription flow, or billing integration. Live and test-mode billing are both absent.
- EssayCoach is a simple local checklist, not an AI writing model, factuality checker, plagiarism checker, or grade.
- No accessibility audit with assistive technology or formal student privacy review has been completed.

## Release conditions

Before treating this as a public release, run browser-level tests on desktop and mobile for guest entry, local progress persistence and migration, quiz scoring, spaced review, timer completion/pause, and backup round trips. Decide whether the products remain local-first or need an account/sync backend. If subscriptions are later added, first specify and verify test-mode flows; do not enable live billing without approval.

## Deployment

Do not point the existing production URL at this branch until the browser-level checks above pass. Deployment and billing were not performed for this change.
