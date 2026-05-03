import { normalizeInput, matchesExpected, isNearMiss, pickWeighted, filteredDeck, verbStatus, reportRow, reportSummary, computeNextDue, nextDueIn } from './logic.js';

let supabase = null;
let emailConfirmationRequired = true; // updated from supabase_config.js at init

const state = {
  verbs: [],
  current: null,
  mode: 'flashcard', // 'flashcard' | 'type'
  retrying: false,   // true while awaiting a near-miss second attempt
  filter: 'due',    // 'all' | 'new' | 'difficult' | 'due'
  progress: {},     // { [verbId]: { seen, knew, missed, history: boolean[] } }
  session: { seen: 0, knew: 0, missed: 0 },
  sessionQueue: [],  // in-memory only; not persisted
  report: { filter: 'all', sort: 'accuracy' },
  auth: { user: null, formMode: 'signin' }, // formMode: 'signin' | 'signup'
};

const el = {
  card: document.getElementById('card'),
  loading: document.getElementById('loading-state'),
  error: document.getElementById('error-state'),
  cardState: document.getElementById('card-state'),
  emptyFilter: document.getElementById('empty-filter-state'),
  emptyFilterMsg: document.getElementById('empty-filter-msg'),
  emptyFilterSub: document.getElementById('empty-filter-sub'),
  emptyFilterActions: document.getElementById('empty-filter-actions'),
  infinitive: document.getElementById('infinitive'),
  answer: document.getElementById('answer'),
  pastSimple: document.getElementById('past-simple'),
  pastParticiple: document.getElementById('past-participle'),
  revealArea: document.getElementById('reveal-area'),
  ratingArea: document.getElementById('rating-area'),
  inputForm: document.getElementById('input-form'),
  inputPS: document.getElementById('input-past-simple'),
  inputPP: document.getElementById('input-past-participle'),
  typeResult: document.getElementById('type-result'),
  resultBanner: document.getElementById('result-banner'),
  resultPsUser: document.getElementById('result-ps-user'),
  resultPpUser: document.getElementById('result-pp-user'),
  resultPsCorrect: document.getElementById('result-ps-correct'),
  resultPpCorrect: document.getElementById('result-pp-correct'),
  typeSubmitArea: document.getElementById('type-submit-area'),
  typeNextArea: document.getElementById('type-next-area'),
  statSeen: document.getElementById('stat-seen'),
  statKnew: document.getElementById('stat-knew'),
  statMissed: document.getElementById('stat-missed'),
  retryHint: document.getElementById('retry-hint'),
  btnReveal: document.getElementById('btn-reveal'),
  btnKnew: document.getElementById('btn-knew'),
  btnMissed: document.getElementById('btn-missed'),
  btnCheck: document.getElementById('btn-check'),
  btnNext: document.getElementById('btn-next'),
  btnModeFlashcard: document.getElementById('btn-mode-flashcard'),
  btnModeType: document.getElementById('btn-mode-type'),
  btnFilterAll: document.getElementById('btn-filter-all'),
  btnFilterDifficult: document.getElementById('btn-filter-difficult'),
  btnFilterDue: document.getElementById('btn-filter-due'),
  btnReport: document.getElementById('btn-report'),
  btnHelp: document.getElementById('btn-help'),
  helpState: document.getElementById('help-state'),
  btnHelpClose: document.getElementById('btn-help-close'),
  btnHelpCloseBottom: document.getElementById('btn-help-close-bottom'),
  reportState: document.getElementById('report-state'),
  btnReportClose: document.getElementById('btn-report-close'),
  btnReportCloseTop: document.getElementById('btn-report-close-top'),
  reportSummaryEl: document.getElementById('report-summary'),
  reportBody: document.getElementById('report-body'),
  btnExport: document.getElementById('btn-export'),
  inputImport: document.getElementById('input-import'),
  reportFilterBtns: null, // set after DOM ready
  reportSortBtns: null,
  // Auth
  authBar: document.getElementById('auth-bar'),
  authSignedOut: document.getElementById('auth-signed-out'),
  authSignedIn: document.getElementById('auth-signed-in'),
  btnResetLocalAnon: document.getElementById('btn-reset-local-anon'),
  btnLogin: document.getElementById('btn-login'),
  btnAuthMenu: document.getElementById('btn-auth-menu'),
  authMenu: document.getElementById('auth-menu'),
  btnResetLocal: document.getElementById('btn-reset-local'),
  btnResetServer: document.getElementById('btn-reset-server'),
  btnDeleteAccount: document.getElementById('btn-delete-account'),
  btnLogout: document.getElementById('btn-logout'),
  authEmailDisplay: document.getElementById('auth-email-display'),
  syncStatus: document.getElementById('sync-status'),
  authState: document.getElementById('auth-state'),
  authFormView: document.getElementById('auth-form-view'),
  authHeading: document.getElementById('auth-heading'),
  authSubheading: document.getElementById('auth-subheading'),
  authForm: document.getElementById('auth-form'),
  authEmail: document.getElementById('auth-email'),
  authPassword: document.getElementById('auth-password'),
  authError: document.getElementById('auth-error'),
  btnAuthSubmit: document.getElementById('btn-auth-submit'),
  btnAuthToggle: document.getElementById('btn-auth-toggle'),
  authPrivacyNotice: document.getElementById('auth-privacy-notice'),
  authSuccess: document.getElementById('auth-success'),
  authSuccessEmail: document.getElementById('auth-success-email'),
  btnAuthBackToSignin: document.getElementById('btn-auth-back-to-signin'),
  btnAuthCancel: document.getElementById('btn-auth-cancel'),
};

function show(element) { element.classList.remove('hidden'); }
function hide(element) { element.classList.add('hidden'); }

function showCard(verb) {
  state.current = verb;
  state.retrying = false;
  el.card.classList.remove('card--incorrect', 'card--correct');
  el.infinitive.textContent = verb.infinitive;
  el.pastSimple.textContent = verb.pastSimple;
  el.pastParticiple.textContent = verb.pastParticiple;

  hide(el.answer);
  hide(el.retryHint);

  if (state.mode === 'flashcard') {
    hide(el.inputForm);
    hide(el.typeResult);
    hide(el.typeSubmitArea);
    hide(el.typeNextArea);
    show(el.revealArea);
    hide(el.ratingArea);
  } else {
    show(el.inputForm);
    hide(el.typeResult);
    show(el.typeSubmitArea);
    hide(el.typeNextArea);
    hide(el.revealArea);
    hide(el.ratingArea);
    resetInputs();
    el.inputPS.focus();
  }
}

function resetInputs() {
  el.inputPS.value = '';
  el.inputPP.value = '';
  el.inputPS.className = '';
  el.inputPP.className = '';
}

function updateStats() {
  el.statSeen.textContent = state.session.seen;
  el.statKnew.textContent = state.session.knew;
  el.statMissed.textContent = state.session.missed;
}

function recordResult(verbId, knew) {
  if (!state.progress[verbId]) state.progress[verbId] = { seen: 0, knew: 0, missed: 0, history: [] };
  const p = state.progress[verbId];
  p.seen += 1;
  if (knew) p.knew += 1; else p.missed += 1;
  p.history.push(knew);
  Object.assign(p, computeNextDue(p, knew));
  saveProgress();
}

// Flashcard mode actions

function reveal() {
  show(el.answer);
  hide(el.revealArea);
  show(el.ratingArea);
  el.btnKnew.focus();
}

function rate(knew) {
  recordResult(state.current.id, knew);
  state.session.seen += 1;
  if (knew) state.session.knew += 1;
  else { state.session.missed += 1; requeueCurrentVerb(); }
  updateStats();
  nextCard();
}

// Type mode actions

function checkAnswer() {
  const verb = state.current;
  const psCorrect = matchesExpected(el.inputPS.value, verb.pastSimple);
  const ppCorrect = matchesExpected(el.inputPP.value, verb.pastParticiple);
  const allCorrect = psCorrect && ppCorrect;

  if (!state.retrying && !allCorrect) {
    const psNearMiss = !psCorrect && isNearMiss(el.inputPS.value, verb.pastSimple);
    const ppNearMiss = !ppCorrect && isNearMiss(el.inputPP.value, verb.pastParticiple);
    if ((psCorrect || psNearMiss) && (ppCorrect || ppNearMiss)) {
      enterRetry(psNearMiss, ppNearMiss);
      return;
    }
  }

  finaliseAnswer(psCorrect, ppCorrect, allCorrect);
}

function enterRetry(psNearMiss, ppNearMiss) {
  state.retrying = true;
  show(el.retryHint);
  el.inputPS.className = psNearMiss ? 'near-miss' : '';
  el.inputPP.className = ppNearMiss ? 'near-miss' : '';
  // Defer focus to avoid Chromium synthetic keydown on the newly focused element.
  setTimeout(() => { (psNearMiss ? el.inputPS : el.inputPP).focus(); }, 0);
}

function finaliseAnswer(psCorrect, ppCorrect, allCorrect) {
  state.retrying = false;
  hide(el.retryHint);
  hide(el.inputForm);
  showResult(el.inputPS.value, el.inputPP.value, psCorrect, ppCorrect, state.current);

  recordResult(state.current.id, allCorrect);
  state.session.seen += 1;
  if (allCorrect) state.session.knew += 1;
  else { state.session.missed += 1; requeueCurrentVerb(); }
  updateStats();

  el.card.classList.add(allCorrect ? 'card--correct' : 'card--incorrect');
  hide(el.typeSubmitArea);
  show(el.typeNextArea);
  // Defer focus so it runs outside the current keydown event. Chromium fires a
  // synthetic keydown on whatever element focus() targets during a keydown handler,
  // which would immediately trigger nextCard(). setTimeout breaks that chain.
  setTimeout(() => el.typeResult.focus(), 0);
}

function showResult(userPS, userPP, psCorrect, ppCorrect, verb) {
  const allCorrect = psCorrect && ppCorrect;

  el.resultBanner.textContent = allCorrect ? 'Correct!' : 'Not quite';
  el.resultBanner.className = 'result-banner ' + (allCorrect ? 'correct' : 'incorrect');

  setResultRow(el.resultPsUser, el.resultPsCorrect, userPS, psCorrect, verb.pastSimple);
  setResultRow(el.resultPpUser, el.resultPpCorrect, userPP, ppCorrect, verb.pastParticiple);

  show(el.typeResult);
}

function setResultRow(userEl, correctEl, userValue, correct, expected) {
  userEl.textContent = userValue || '(empty)';
  userEl.className = 'result-user ' + (correct ? 'correct' : 'incorrect');
  if (correct) {
    hide(correctEl);
  } else {
    correctEl.textContent = expected;
    show(correctEl);
  }
}

function showEmptyFilterState() {
  hide(el.cardState);
  const difficultCount = filteredDeck(state.verbs, 'difficult', state.progress).length;
  const nextDue = nextDueIn(state.progress);
  const nextDueText = nextDue ? `Next verb due in ${nextDue}.` : '';
  const actions = [];

  if (state.filter === 'due') {
    el.emptyFilterMsg.textContent = 'All caught up!';
    if (difficultCount > 0) {
      actions.push({ label: `Practice ${difficultCount} difficult verb${difficultCount === 1 ? '' : 's'}`, filter: 'difficult', primary: true });
      actions.push({ label: 'Practice all verbs', filter: 'all', primary: false });
    } else {
      actions.push({ label: 'Practice all verbs', filter: 'all', primary: true });
    }
  } else if (state.filter === 'difficult') {
    el.emptyFilterMsg.textContent = 'No difficult verbs — great work!';
    actions.push({ label: 'Practice all verbs', filter: 'all', primary: true });
  } else {
    el.emptyFilterMsg.textContent = 'No verbs match this filter yet.';
    actions.push({ label: 'Show all verbs', filter: 'all', primary: true });
  }

  el.emptyFilterSub.textContent = nextDueText;
  el.emptyFilterActions.innerHTML = '';
  actions.forEach(({ label, filter, primary }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = `btn ${primary ? 'btn-primary' : 'btn-secondary'}`;
    btn.addEventListener('click', () => setFilter(filter));
    el.emptyFilterActions.appendChild(btn);
  });

  show(el.emptyFilter);
}

function startSession(deck) {
  const queue = [];
  const remaining = [...deck];
  let lastId = state.current?.id ?? null;
  while (remaining.length) {
    const next = pickWeighted(remaining, state.progress, lastId);
    queue.push(next);
    remaining.splice(remaining.findIndex(v => v.id === next.id), 1);
    lastId = next.id;
  }
  state.sessionQueue = queue;
}

function requeueCurrentVerb() {
  const insertAt = Math.min(3, state.sessionQueue.length);
  state.sessionQueue.splice(insertAt, 0, state.current);
}

// When the only remaining queue item is the verb just answered, pull a filler
// from the next broader group so the verb is never shown back-to-back.
function pickFillerVerb() {
  const currentId = state.current?.id;
  const fallbacks = state.filter === 'due'      ? ['difficult', 'all'] :
                    state.filter === 'difficult' ? ['all'] : [];
  for (const f of fallbacks) {
    const pool = filteredDeck(state.verbs, f, state.progress).filter(v => v.id !== currentId);
    if (pool.length) return pickWeighted(pool, state.progress, currentId);
  }
  const pool = state.verbs.filter(v => v.id !== currentId);
  return pool.length ? pickWeighted(pool, state.progress, currentId) : null;
}

function nextCard() {
  if (state.sessionQueue.length > 0) {
    if (state.sessionQueue.length === 1 && state.sessionQueue[0].id === state.current?.id) {
      const filler = pickFillerVerb();
      if (filler) state.sessionQueue.unshift(filler);
    }
    hide(el.emptyFilter);
    show(el.cardState);
    showCard(state.sessionQueue.shift());
    return;
  }
  const deck = filteredDeck(state.verbs, state.filter, state.progress);
  if (!deck.length) { showEmptyFilterState(); return; }
  startSession(deck);
  hide(el.emptyFilter);
  show(el.cardState);
  showCard(state.sessionQueue.shift());
}

// Mode switching

function setMode(mode) {
  state.mode = mode;
  el.btnModeFlashcard.classList.toggle('active', mode === 'flashcard');
  el.btnModeType.classList.toggle('active', mode === 'type');
  el.btnModeFlashcard.setAttribute('aria-pressed', String(mode === 'flashcard'));
  el.btnModeType.setAttribute('aria-pressed', String(mode === 'type'));
  saveProgress();
  if (state.current) showCard(state.current);
}

// Filter switching

function applyFilterButtons(filter) {
  [
    [el.btnFilterAll, 'all'],
    [el.btnFilterDifficult, 'difficult'],
    [el.btnFilterDue, 'due'],
  ].forEach(([btn, value]) => {
    btn.classList.toggle('active', filter === value);
    btn.setAttribute('aria-pressed', String(filter === value));
  });
}

function setFilter(filter) {
  state.filter = filter;
  state.sessionQueue = [];
  applyFilterButtons(filter);
  saveProgress();
  nextCard();
}

// Persistence

const STORAGE_KEY = 'ivt-progress';

function saveProgress() {
  const payload = { progress: state.progress, mode: state.mode, filter: state.filter };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch { /* quota exceeded or private mode — ignore */ }
  if (supabase && state.auth.user) {
    syncToServer(payload);
  }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.progress) state.progress = saved.progress;
    if (saved.mode) state.mode = saved.mode;
    if (saved.filter) state.filter = saved.filter === 'new' ? 'due' : saved.filter;
  } catch { /* corrupted data — start fresh */ }
}

function exportProgress() {
  const payload = {
    exportedAt: new Date().toISOString(),
    progress: state.progress,
    mode: state.mode,
    filter: state.filter,
  };
  if (state.auth.user) {
    payload.account = {
      email: state.auth.user.email,
      createdAt: state.auth.user.created_at,
      lastSignInAt: state.auth.user.last_sign_in_at,
    };
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'irregular-verbs-progress.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const saved = JSON.parse(e.target.result);
      if (saved.progress) state.progress = saved.progress;
      if (saved.mode) state.mode = saved.mode;
      if (saved.filter) state.filter = saved.filter;
      saveProgress();
      setMode(state.mode);
      applyFilterButtons(state.filter);
      hideReport();
    } catch { /* invalid file — ignore */ }
  };
  reader.readAsText(file);
}

// Supabase sync

async function initSupabase() {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const config = await import('./supabase_config.js');
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return;
    supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    emailConfirmationRequired = config.EMAIL_CONFIRMATION_REQUIRED ?? true;
    applyEmailConfirmationConfig();

    supabase.auth.onAuthStateChange((event, session) => {
      state.auth.user = session?.user ?? null;
      updateAuthUI();
    });

    const { data: { session } } = await supabase.auth.getSession();
    state.auth.user = session?.user ?? null;
  } catch {
    // config missing or network unavailable — run without server sync
  }
}

let syncTimer = null;

function setSyncStatus(status) {
  clearTimeout(syncTimer);
  if (status === 'saving') {
    el.syncStatus.textContent = 'Saving…';
    el.syncStatus.className = 'sync-status sync-saving';
  } else if (status === 'saved') {
    el.syncStatus.textContent = 'Saved';
    el.syncStatus.className = 'sync-status sync-saved';
    syncTimer = setTimeout(() => { el.syncStatus.textContent = ''; el.syncStatus.className = 'sync-status'; }, 2000);
  } else if (status === 'loaded') {
    el.syncStatus.textContent = 'Progress loaded from server';
    el.syncStatus.className = 'sync-status sync-saved';
    syncTimer = setTimeout(() => { el.syncStatus.textContent = ''; el.syncStatus.className = 'sync-status'; }, 4000);
  } else if (status === 'offline') {
    el.syncStatus.textContent = 'Offline';
    el.syncStatus.className = 'sync-status sync-offline';
  } else {
    el.syncStatus.textContent = '';
    el.syncStatus.className = 'sync-status';
  }
}

async function syncToServer(payload) {
  setSyncStatus('saving');
  try {
    const { error } = await supabase.from('user_progress').upsert(
      { user_id: state.auth.user.id, data: payload },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
    setSyncStatus('saved');
  } catch {
    setSyncStatus('offline');
  }
}

async function loadFromServer() {
  if (!supabase || !state.auth.user) return;
  try {
    const { data, error } = await supabase
      .from('user_progress')
      .select('data')
      .eq('user_id', state.auth.user.id)
      .maybeSingle();
    if (error) throw error;
    if (data?.data) {
      const saved = data.data;
      if (saved.progress) state.progress = saved.progress;
      if (saved.mode) state.mode = saved.mode;
      if (saved.filter) state.filter = saved.filter;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch {}
      setSyncStatus('loaded');
    }
  } catch {
    // network error — keep whatever was loaded from localStorage
  }
}

async function mergeAndSyncOnLogin() {
  // Read local data before overwriting
  const localProgress = { ...state.progress };
  await loadFromServer();
  // Add any local verbs the server didn't have
  Object.keys(localProgress).forEach(id => {
    if (!state.progress[id]) state.progress[id] = localProgress[id];
  });
  saveProgress();
}

function saveLocalOnly() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      progress: state.progress, mode: state.mode, filter: state.filter,
    }));
  } catch {}
}

function resetProgressLocal() {
  closeAuthMenu();
  if (!confirm('Reset all local progress? This cannot be undone.\n\nNote: if you are signed in, server progress is kept and will reload on next login.')) return;
  state.progress = {};
  saveLocalOnly();
  renderReportSummary();
  renderReportTable();
}

async function resetProgressEverywhere() {
  closeAuthMenu();
  if (!confirm('Reset all progress on this device and on the server? This cannot be undone.')) return;
  state.progress = {};
  saveProgress();
  renderReportSummary();
  renderReportTable();
}

async function deleteAccount() {
  closeAuthMenu();
  if (!confirm('Delete your account and all server data permanently?\n\nYour account and progress will be removed from the live database immediately. Supabase may retain encrypted backups for up to 7 days — these cannot be used to restore your account.\n\nThis cannot be undone.')) return;
  try {
    await supabase.from('user_progress').delete().eq('user_id', state.auth.user.id);
    await supabase.rpc('delete_own_account');
    await supabase.auth.signOut({ scope: 'local' });
    state.progress = {};
    saveLocalOnly();
    state.auth.user = null;
    updateAuthUI();
    hideReport();
  } catch (e) {
    alert('Could not delete account: ' + (e.message ?? 'unknown error'));
  }
}

// Auth UI

function updateAuthUI() {
  if (state.auth.user) {
    hide(el.authSignedOut);
    show(el.authSignedIn);
    el.authEmailDisplay.textContent = state.auth.user.email;
  } else {
    show(el.authSignedOut);
    hide(el.authSignedIn);
    setSyncStatus('');
  }
}

function openAuthMenu() {
  show(el.authMenu);
  el.btnAuthMenu.setAttribute('aria-expanded', 'true');
}

function closeAuthMenu() {
  hide(el.authMenu);
  el.btnAuthMenu.setAttribute('aria-expanded', 'false');
}

function toggleAuthMenu() {
  el.authMenu.classList.contains('hidden') ? openAuthMenu() : closeAuthMenu();
}

function showAuth() {
  el.btnReport.textContent = 'Report';
  hide(el.cardState);
  hide(el.emptyFilter);
  hide(el.reportState);
  hide(el.helpState);
  show(el.authState);
  resetAuthForm();
  el.authEmail.focus();
}

function hideAuth() {
  hide(el.authState);
  const deck = filteredDeck(state.verbs, state.filter, state.progress);
  if (!deck.length) showEmptyFilterState(); else show(el.cardState);
}

function resetAuthForm() {
  el.authForm.reset();
  hide(el.authSuccess);
  show(el.authFormView);
  el.btnAuthSubmit.disabled = false;
  setAuthFormMode('signin');
}

function setAuthFormMode(mode) {
  state.auth.formMode = mode;
  if (mode === 'signin') {
    el.authHeading.textContent = 'Sign in';
    el.authSubheading.textContent = 'Welcome back.';
    el.btnAuthSubmit.textContent = 'Sign in';
    el.btnAuthToggle.textContent = 'No account yet? Sign up';
    el.authPassword.setAttribute('autocomplete', 'current-password');
    hide(el.authPrivacyNotice);
  } else {
    el.authHeading.textContent = 'Create an account';
    el.authSubheading.textContent = 'Sync your progress across devices.';
    el.btnAuthSubmit.textContent = 'Sign up';
    el.btnAuthToggle.textContent = 'Already have an account? Sign in';
    el.authPassword.setAttribute('autocomplete', 'new-password');
    show(el.authPrivacyNotice);
  }
  hide(el.authError);
}

function showAuthError(message) {
  el.authError.textContent = message;
  show(el.authError);
}

function applyEmailConfirmationConfig() {
  const signupDesc = document.getElementById('help-signup-desc');
  const loginDesc  = document.getElementById('help-login-desc');
  if (!signupDesc || !loginDesc) return;
  if (emailConfirmationRequired) {
    signupDesc.innerHTML = 'Click <strong>Log in</strong>, then switch to <strong>Sign up</strong> using the toggle at the bottom of the form. Enter your email and a password, then submit. You\'ll receive a confirmation email — click the link in it to activate your account. Once confirmed, come back and sign in with your email and password.';
    loginDesc.textContent = 'Sign in with your confirmed email and password to enable server sync.';
  } else {
    signupDesc.innerHTML = 'Click <strong>Log in</strong>, then switch to <strong>Sign up</strong> using the toggle at the bottom of the form. Enter your email and a password and submit — you\'ll be signed in immediately.';
    loginDesc.textContent = 'Sign in with your email and password to enable server sync.';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = el.authEmail.value.trim();
  const password = el.authPassword.value;
  if (!email || !password) return;

  el.btnAuthSubmit.disabled = true;
  hide(el.authError);

  const fn = state.auth.formMode === 'signin'
    ? supabase.auth.signInWithPassword({ email, password })
    : supabase.auth.signUp({ email, password, options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
      } });

  const { data, error } = await fn;

  if (error) {
    showAuthError(error.message);
    el.btnAuthSubmit.disabled = false;
    return;
  }

  if (state.auth.formMode === 'signup') {
    if (data.session) {
      // Email confirmation is disabled — user is already signed in.
      await mergeAndSyncOnLogin();
      updateAuthUI();
      setMode(state.mode);
      applyFilterButtons(state.filter);
      hideAuth();
    } else {
      // Confirmation email sent — show the check-your-email screen.
      el.authSuccessEmail.textContent = email;
      hide(el.authFormView);
      show(el.authSuccess);
      el.btnAuthSubmit.disabled = false;
    }
    return;
  }

  // Signed in — merge local + server progress
  await mergeAndSyncOnLogin();
  updateAuthUI();
  setMode(state.mode);
  applyFilterButtons(state.filter);
  hideAuth();
}

async function handleSignOut() {
  closeAuthMenu();
  if (!supabase) return;
  await supabase.auth.signOut();
  updateAuthUI();
}

// Report

function renderReportSummary() {
  const s = reportSummary(state.verbs, state.progress);
  const pct = s.accuracy === null ? '—' : Math.round(s.accuracy * 100) + '%';
  el.reportSummaryEl.innerHTML =
    tile('Practiced', s.practiced) +
    tile('Accuracy', pct) +
    tile('Mastered', s.mastered) +
    tile('Difficult', s.difficult) +
    tile('Not seen', s.notSeen);
}

function tile(label, value) {
  return `<div class="stat-tile"><span class="stat-tile-value">${value}</span><span class="stat-tile-label">${label}</span></div>`;
}

function renderReportTable() {
  const { filter, sort } = state.report;
  let rows = state.verbs.map(v => reportRow(v, state.progress));

  if (filter === 'difficult') rows = rows.filter(r => r.missed > r.knew);
  else if (filter === 'practiced') rows = rows.filter(r => r.seen > 0);
  else if (filter === 'known') rows = rows.filter(r => r.seen > 0 && r.knew >= r.missed);

  if (sort === 'accuracy') rows.sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1));
  else if (sort === 'verb') rows.sort((a, b) => a.verb.infinitive.localeCompare(b.verb.infinitive));
  else if (sort === 'attempts') rows.sort((a, b) => b.seen - a.seen);

  if (!rows.length) {
    el.reportBody.innerHTML = `<tr><td colspan="6" class="report-empty">No verbs match this filter yet.</td></tr>`;
    return;
  }

  el.reportBody.innerHTML = rows.map(r => {
    const status = verbStatus(r.verb.id, state.progress);
    const pct = r.accuracy === null ? '—' : Math.round(r.accuracy * 100) + '%';
    const trendChar = { improving: '↑', declining: '↓', stable: '→', null: '—' }[r.trend] ?? '—';
    const trendClass = { improving: 'trend-up', declining: 'trend-down', stable: 'trend-stable' }[r.trend] ?? '';
    const dots = r.history.slice(-5).map(c => `<span class="attempt-dot ${c ? 'dot-correct' : 'dot-missed'}">${c ? '●' : '○'}</span>`).join('');
    return `<tr>
      <td class="report-verb">${r.verb.infinitive}</td>
      <td><span class="status-badge badge-${status}">${status}</span></td>
      <td class="report-num">${r.seen}</td>
      <td class="report-num">${pct}</td>
      <td class="report-num ${trendClass}">${trendChar}</td>
      <td class="report-dots">${dots}</td>
    </tr>`;
  }).join('');
}

function setReportFilter(filter) {
  state.report.filter = filter;
  el.reportFilterBtns.forEach(btn => {
    const active = btn.dataset.filter === filter;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderReportTable();
}

function setReportSort(sort) {
  state.report.sort = sort;
  el.reportSortBtns.forEach(btn => {
    const active = btn.dataset.sort === sort;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderReportTable();
}

// Help

function showHelp() {
  hide(el.cardState);
  hide(el.emptyFilter);
  hide(el.reportState);
  hide(el.authState);
  show(el.helpState);
  el.btnHelpClose.focus();
}

function hideHelp() {
  hide(el.helpState);
  const deck = filteredDeck(state.verbs, state.filter, state.progress);
  if (!deck.length) showEmptyFilterState(); else show(el.cardState);
}

function showReport() {
  el.btnReport.textContent = 'Practice';
  renderReportSummary();
  // Reset filter/sort buttons to current state
  el.reportFilterBtns.forEach(btn => {
    const active = btn.dataset.filter === state.report.filter;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  el.reportSortBtns.forEach(btn => {
    const active = btn.dataset.sort === state.report.sort;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderReportTable();
  hide(el.cardState);
  hide(el.emptyFilter);
  hide(el.authState);
  show(el.reportState);
  el.btnReportCloseTop.focus();
}

function hideReport() {
  el.btnReport.textContent = 'Report';
  hide(el.reportState);
  // Restore whichever practice state was active
  const deck = filteredDeck(state.verbs, state.filter, state.progress);
  if (!deck.length) showEmptyFilterState(); else show(el.cardState);
}

// Event listeners

el.btnReveal.addEventListener('click', reveal);
el.btnKnew.addEventListener('click', () => rate(true));
el.btnMissed.addEventListener('click', () => rate(false));
el.btnCheck.addEventListener('click', checkAnswer);
el.btnNext.addEventListener('click', nextCard);
el.btnModeFlashcard.addEventListener('click', () => setMode('flashcard'));
el.btnModeType.addEventListener('click', () => setMode('type'));
el.btnFilterAll.addEventListener('click', () => setFilter('all'));
el.btnFilterDifficult.addEventListener('click', () => setFilter('difficult'));
el.btnFilterDue.addEventListener('click', () => setFilter('due'));
el.btnReport.addEventListener('click', () => {
  if (el.reportState.classList.contains('hidden')) showReport();
  else hideReport();
});
el.btnHelp.addEventListener('click', showHelp);
el.btnHelpClose.addEventListener('click', hideHelp);
el.btnHelpCloseBottom.addEventListener('click', hideHelp);
el.btnReportClose.addEventListener('click', hideReport);
el.btnReportCloseTop.addEventListener('click', hideReport);
el.btnExport.addEventListener('click', exportProgress);
el.btnResetLocal.addEventListener('click', resetProgressLocal);
el.btnResetServer.addEventListener('click', resetProgressEverywhere);
el.btnDeleteAccount.addEventListener('click', deleteAccount);
el.inputImport.addEventListener('change', (e) => {
  if (e.target.files[0]) importProgress(e.target.files[0]);
  e.target.value = ''; // reset so the same file can be re-imported
});

// Auth listeners
el.btnResetLocalAnon.addEventListener('click', resetProgressLocal);
el.btnLogin.addEventListener('click', showAuth);
el.btnAuthMenu.addEventListener('click', (e) => { e.stopPropagation(); toggleAuthMenu(); });
el.btnLogout.addEventListener('click', handleSignOut);
el.btnAuthCancel.addEventListener('click', hideAuth);
el.btnAuthToggle.addEventListener('click', () => {
  setAuthFormMode(state.auth.formMode === 'signin' ? 'signup' : 'signin');
});
el.btnAuthBackToSignin.addEventListener('click', () => {
  hide(el.authSuccess);
  show(el.authFormView);
  setAuthFormMode('signin');
  el.authEmail.focus();
});
el.authForm.addEventListener('submit', handleAuthSubmit);

// Report filter/sort buttons are queried after DOM is ready
el.reportFilterBtns = document.querySelectorAll('[data-filter]');
el.reportSortBtns = document.querySelectorAll('[data-sort]');

el.reportFilterBtns.forEach(btn => btn.addEventListener('click', () => setReportFilter(btn.dataset.filter)));
el.reportSortBtns.forEach(btn => btn.addEventListener('click', () => setReportSort(btn.dataset.sort)));

el.inputPP.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.repeat) {
    e.stopPropagation();
    checkAnswer();
  }
});

el.inputPS.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.repeat) {
    el.inputPP.focus();
  }
});

// Result panel handles Enter/Space to advance so keyboard users never need to reach btnNext.
el.typeResult.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
    e.preventDefault();
    nextCard();
  }
});

// Dedicated handler so the browser's native button-click activation (also triggered by Enter)
// does not fire a second nextCard() call via the click listener.
el.btnNext.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.repeat) {
    e.stopPropagation();
    e.preventDefault();
    nextCard();
  }
});

document.addEventListener('click', (e) => {
  if (!el.authMenu.classList.contains('hidden') && !el.authSignedIn.contains(e.target)) {
    closeAuthMenu();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!el.authMenu.classList.contains('hidden')) { closeAuthMenu(); return; }
    if (!el.authState.classList.contains('hidden')) { hideAuth(); return; }
    if (!el.helpState.classList.contains('hidden')) { hideHelp(); return; }
    if (!el.reportState.classList.contains('hidden')) { hideReport(); return; }
  }
  if (state.mode === 'flashcard') {
    if ((e.key === ' ' || e.key === 'Enter') && !el.revealArea.classList.contains('hidden')) {
      if (document.activeElement === document.body || document.activeElement === el.btnReveal) {
        e.preventDefault();
        reveal();
      }
    } else if (e.key === 'ArrowLeft') {
      if (!el.ratingArea.classList.contains('hidden')) rate(false);
    }
  } else {
    // btnNext handles its own Enter; this fallback covers body-focused Enter only
    if (e.key === 'Enter' && !el.typeNextArea.classList.contains('hidden')) {
      if (document.activeElement === document.body) {
        nextCard();
      }
    }
  }
});

// Init

async function init() {
  try {
    await initSupabase();
    const res = await fetch('../data/irregular-verbs.json');
    if (!res.ok) throw new Error('fetch failed');
    state.verbs = await res.json();
    if (!state.verbs.length) throw new Error('empty');
    loadProgress();
    if (state.auth.user) {
      await loadFromServer();
    }
    if (filteredDeck(state.verbs, 'due', state.progress).length > 0) {
      state.filter = 'due';
    }
    updateAuthUI();
    if (supabase) show(el.authBar);
    setMode(state.mode);           // safe: state.current is null, won't call showCard
    applyFilterButtons(state.filter);
    const deck = filteredDeck(state.verbs, state.filter, state.progress);
    hide(el.loading);
    if (deck.length) {
      startSession(deck);
      show(el.cardState);
      showCard(state.sessionQueue.shift());
    } else {
      showEmptyFilterState();
    }
  } catch {
    hide(el.loading);
    show(el.error);
  }
}

export { init, checkAnswer, showCard, nextCard, setMode, setFilter, showHelp, hideHelp, showReport, hideReport, showResult, setResultRow, enterRetry, finaliseAnswer, saveProgress, loadProgress, exportProgress, importProgress, state, el };

if (typeof process === 'undefined') {
  init();
}
