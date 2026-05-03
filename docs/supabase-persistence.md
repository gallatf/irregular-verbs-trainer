# Supabase Server-Side Persistence

## Overview

Progress is currently stored only in `localStorage`. This design adds server-side sync via [Supabase](https://supabase.com) so users can log in and access their progress from any device.

The app remains fully client-side. No custom backend is needed — the Supabase JS client talks directly to the hosted Supabase project.

---

## Architecture

```
Browser
  └── app.js
        ├── localStorage       (offline / anonymous fallback)
        └── Supabase JS client (CDN) ──► Supabase project
                                            ├── Auth (email + password)
                                            └── PostgreSQL (user_progress table)
```

---

## Authentication

- Supabase built-in **email + password** auth
- On sign-in, Supabase issues a JWT stored automatically in `localStorage` by the client library
- Session is restored on page load without any extra work

---

## Database schema

```sql
create table user_progress (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null unique,
  data       jsonb not null default '{}',
  updated_at timestamptz default now()
);

alter table user_progress enable row level security;

create policy "own rows only"
  on user_progress for all
  using (auth.uid() = user_id);
```

One row per user. All progress is stored in a single `data` JSONB column.

---

## Data shape

The `data` column mirrors the existing `localStorage` schema exactly:

```json
{
  "progress": {
    "be":   { "seen": 10, "knew": 8, "missed": 2, "history": [true, false, true] },
    "go":   { "seen": 5,  "knew": 4, "missed": 1, "history": [true, true, false] }
  },
  "mode":   "flashcard",
  "filter": "all"
}
```

---

## Sync strategy

| Event | Action |
|---|---|
| Page load, session exists | Load progress from Supabase; write to `state` and `localStorage` |
| Page load, no session | Load from `localStorage` as before |
| `saveProgress()` called | Write to `localStorage` + upsert to Supabase (if signed in) |
| User logs in | Fetch server data; merge with local (local wins per-verb if server has no entry); save merged result |
| User logs out | Keep `localStorage` copy; clear Supabase session |
| Network error | Fall back to `localStorage` silently; no crash |

---

## Offline / anonymous behaviour

Signed-out users work exactly as before — `localStorage` only. The server sync layer is additive and never breaks the existing flow.

---

## Development workflow (no Docker)

Create **two separate free Supabase projects** at [supabase.com](https://supabase.com):

| Project | Purpose |
|---|---|
| `ivt-dev` | Development and testing |
| `ivt-prod` | Production |

Switch between them by editing `app/supabase_config.js`:

```js
// Development
export const SUPABASE_URL  = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';
```

`supabase_config.js` is gitignored for the production values. A `supabase_config.example.js` file documents the required shape.

---

## Migration files

SQL migrations are kept in `supabase/migrations/` as plain `.sql` files. Apply them manually in the Supabase dashboard SQL editor, or via `supabase db push` if the CLI becomes available later.

---

## Files changed

| File | Change |
|---|---|
| `app/app.js` | Wrap `saveProgress` / `loadProgress`; add auth state |
| `app/irregular-verbs-flashcards.html` | Login panel + toolbar "Log in" button |
| `app/styles.css` | Login panel and sync indicator styles |
| `app/supabase_config.js` | Supabase URL + anon key (gitignored) |
| `app/supabase_config.example.js` | Documents required shape |
| `supabase/migrations/001_user_progress.sql` | Schema + RLS |
