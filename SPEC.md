# English Irregular Verbs Flashcards Spec

## Purpose
A small web app for practicing English irregular verbs using a flashcards approach.

## Target user
A learner who wants to repeatedly practice irregular verbs in short sessions.

## Core concept
The app presents one verb card at a time.
The learner first tries to recall the forms mentally or by typing them.
Then the learner reveals the answer and self-evaluates.

## MVP features
1. Load a list of irregular verbs from a JSON file.
2. Show one random verb card at a time.
3. Display the infinitive first.
4. Hide the correct past simple and past participle until the user clicks "Reveal".
5. After reveal, allow:
   - "I knew it"
   - "I didn't know it"
6. Move to the next card.
7. Show simple session counters:
   - cards seen
   - knew
   - didn't know

## Nice-to-have after MVP
- Typing mode with answer validation
- Flip-card animation
- Verb categories or difficulty levels
- Spaced repetition buckets
- Practice only unknown verbs
- Progress persistence
- Czech translations
- Example sentences
- Audio pronunciation

## Non-goals for MVP
- Authentication
- Backend
- Multiplayer
- Complex analytics
- Fancy animations
- Admin interface

## UX requirements
- Simple, distraction-free layout
- Works on desktop and mobile
- Accessible buttons and sufficient contrast
- Keyboard support where practical

## Data model
Each verb item should support:

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

## Initial flow
1. App loads verb list.
2. App selects one card.
3. User sees infinitive.
4. User clicks Reveal.
5. User marks known / unknown.
6. App stores session result in memory.
7. App shows next card.

## Future spaced repetition concept
- unknown -> show again soon
- known -> show later
- hard verbs should appear more frequently

## Success criteria
The MVP is successful if a user can complete a 10-card practice session smoothly with no broken interactions.