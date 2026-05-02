# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Project overview
This project is a small web application for practicing English irregular verbs using a flashcards learning flow.

## Goal
Build the app incrementally.
Always prefer the smallest working version first, then extend it in later steps.

## Running the app
No build step. Open `app/irregular-verbs-flashcards.html` directly in a browser.
The app fetches `data/irregular-verbs.json` at runtime; serve via a local HTTP server (e.g. `python -m http.server`) if the browser blocks local `fetch()` calls.

## Reference docs
- `SPEC.md` — full feature spec and UX requirements
- `TASKS.md` — task backlog organized by milestone

## File layout
- `app/irregular-verbs-flashcards.html` — single-page app shell
- `app/styles.css` — all styles
- `app/app.js` — all JavaScript
- `data/irregular-verbs.json` — verb data

## Verb data schema
```json
{
  "id": "be",
  "infinitive": "be",
  "pastSimple": "was/were",
  "pastParticiple": "been",
  "translationCs": "být",
  "difficulty": 1
}
```
`difficulty` is 1–3. `translationCs` is optional in the UI but present in the data.

## Product rules
- The application is for learners practicing English irregular verbs.
- Core learning unit is one flashcard with:
  - infinitive
  - past simple
  - past participle
  - optional Czech translation
  - optional example sentence later
- The app should stay simple, fast, and easy to understand.
- Prefer clarity over visual complexity.

## Tech rules
- Use plain HTML, CSS, and vanilla JavaScript unless I explicitly ask for a framework.
- Keep the app fully client-side.
- Do not introduce a backend unless I explicitly ask for one.
- Store verb data in `data/irregular-verbs.json`.
- Main app files are in `app/`.

## UX rules
- Mobile-first layout.
- Accessible keyboard-friendly interactions.
- Clear primary action on each screen.
- Avoid unnecessary animations.
- Use simple, readable English in the UI.

## Implementation workflow
- For non-trivial tasks: first inspect relevant files, then write a short plan, then implement.
- For each feature, make the smallest useful change that works end to end.
- Reuse existing patterns and avoid premature abstraction.
- Keep code easy to refactor in later iterations.

## Verification
After each meaningful change:
- check for broken HTML/CSS/JS
- manually verify the main flashcard flow
- confirm there are no obvious console errors
- summarize what changed and what still needs work

## Coding style
- Prefer small pure functions in JavaScript.
- Keep DOM manipulation straightforward and localized.
- Use descriptive names.
- Avoid adding libraries for simple problems.

## Current priorities
1. Build a minimal flashcards MVP.
2. Add answer reveal and self-rating.
3. Add lightweight progress tracking.
4. Add spaced repetition behavior.
