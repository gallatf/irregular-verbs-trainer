# Task backlog

## MVP
- [ ] Create basic single-page app layout
- [ ] Load irregular verbs from JSON
- [ ] Show one flashcard at a time
- [ ] Implement Reveal button
- [ ] Implement Known / Unknown actions
- [ ] Implement Next card behavior
- [ ] Show session counters
- [ ] Add basic responsive styling
- [ ] Add empty/error state for failed data loading

## Next
- [ ] Add typing mode
- [ ] Validate typed answers
- [ ] Add keyboard shortcuts
- [ ] Add deck filtering
- [ ] Add restart session
- [ ] Add simple spaced repetition logic

## Later
- [x] Persist progress (localStorage — done)
- [ ] Add Czech translations toggle
- [ ] Add example sentences
- [ ] Add pronunciation audio
- [ ] Add statistics screen

## Server persistence (Supabase)

See `docs/supabase-persistence.md` for the full design.

### Setup
- [x] Create Supabase dev project and note URL + anon key
- [x] Create Supabase prod project
- [ ] Apply `supabase/migrations/001_user_progress.sql` in both projects via SQL editor
- [ ] Copy `app/supabase_config.example.js` → `app/supabase_config.js` and fill in dev credentials

### Auth UI
- [x] Add login/signup panel to `irregular-verbs-flashcards.html`
- [x] Add "Log in" button to toolbar; show user email + "Log out" when signed in
- [x] Wire up Supabase auth: `signUp`, `signInWithPassword`, `signOut`
- [x] Show auth errors inline (invalid credentials, email already in use)

### Sync logic (`app/app.js`)
- [x] Load Supabase JS client via CDN ESM import
- [x] On `init()`: check for existing session; if found, load progress from Supabase
- [x] Wrap `saveProgress()`: write to localStorage AND upsert to Supabase when signed in
- [x] Wrap `loadProgress()`: prefer server data when signed in
- [x] On login: fetch server progress; merge with local (local wins per-verb); save merged result
- [x] On logout: keep localStorage copy; clear Supabase session

### Polish
- [x] Show sync status indicator (saved / saving… / offline)
- [x] Handle network errors gracefully (fall back to localStorage silently)
- [x] Confirm export/import still works for signed-out users