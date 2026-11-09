# MindSpark Learning

MindSpark Learning is a local-first student workspace in the `study.ai` repository. The current feature branch expands Study AI into a shared home for eight tools:

- **Study AI:** lightweight study planning and task completion.
- **QuizArena:** subject quizzes with answer explanations.
- **FlashcardLab:** create, search, review, and export flashcards with spaced repetition.
- **MathBattle:** generated arithmetic rounds and personal score tracking.
- **EssayCoach:** on-device revision prompts based on basic writing signals; it is not an AI grader.
- **FocusRoom:** configurable focus sessions and local session history.
- **Competition Academy:** original competition-style practice with explanations.
- **Educational Games:** a mental-math streak game.

MathifyX remains outside this change.

## Run locally

Open `index.html` in a modern browser. The app has no build step or third-party runtime dependency.

## Progress and privacy

Guest use is available without sign-in. Tasks, cards, scores, and focus history are stored in browser local storage. Existing Study AI flashcards and recall totals are migrated from `study-ai-cards-v1` and `study-ai-stats-v1` when the new workspace first opens. Use **Export backup** to keep a portable JSON copy. Clearing browser storage or changing devices removes access unless the learner imports a backup.

EssayCoach performs simple checks in the browser. It does not send text to an AI service. Avoid entering identifying or sensitive information into a shared device.

There is no authentication backend, cross-device sync, subscription code, or billing connection in this static app. No billing is enabled.

## Checks

Run the static and JavaScript syntax checks with:

```sh
node tests/check.mjs
```

See [RELEASE_READINESS.md](RELEASE_READINESS.md) for verification limits and remaining release work.
