import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlContent = readFileSync(join(__dirname, '../app/irregular-verbs-flashcards.html'), 'utf-8');
const bodyContent = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';

const verbsFixture = [
  { id: 'go', infinitive: 'go', pastSimple: 'went', pastParticiple: 'gone', difficulty: 1 },
  { id: 'be', infinitive: 'be', pastSimple: 'was/were', pastParticiple: 'been', difficulty: 1 },
];

const goVerb = verbsFixture[0];

function mockFetchOk() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([...verbsFixture]),
  }));
}

function mockFetchFail() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
}

function fireKeydown(target, key, { repeat = false } = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, repeat }));
}

describe('app integration', () => {
  let app;

  beforeEach(async () => {
    document.body.innerHTML = bodyContent;
    mockFetchOk();
    vi.resetModules();
    app = await import('../app/app.js');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── init ──────────────────────────────────────────────────────────────────

  describe('init', () => {
    it('hides loading state and shows card state after successful load', async () => {
      await app.init();
      expect(app.el.loading.classList.contains('hidden')).toBe(true);
      expect(app.el.cardState.classList.contains('hidden')).toBe(false);
    });

    it('populates state.verbs from fetch response', async () => {
      await app.init();
      expect(app.state.verbs).toHaveLength(2);
    });

    it('shows error state when fetch fails', async () => {
      vi.unstubAllGlobals();
      mockFetchFail();
      await app.init();
      expect(app.el.error.classList.contains('hidden')).toBe(false);
      expect(app.el.loading.classList.contains('hidden')).toBe(true);
    });
  });

  // ─── type mode: checkAnswer ─────────────────────────────────────────────────

  describe('checkAnswer', () => {
    beforeEach(() => {
      app.state.verbs = [...verbsFixture];
      app.state.mode = 'type';
      app.showCard(goVerb);
    });

    it('hides input form and shows result panel', () => {
      app.el.inputPS.value = 'wrong';
      app.el.inputPP.value = 'wrong';
      app.checkAnswer();
      expect(app.el.inputForm.classList.contains('hidden')).toBe(true);
      expect(app.el.typeResult.classList.contains('hidden')).toBe(false);
    });

    it('shows "Correct!" banner when both answers are right', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      app.checkAnswer();
      expect(app.el.resultBanner.textContent).toBe('Correct!');
      expect(app.el.resultBanner.classList.contains('correct')).toBe(true);
    });

    it('shows "Not quite" banner when an answer is wrong', () => {
      app.el.inputPS.value = 'goed';
      app.el.inputPP.value = 'gone';
      app.checkAnswer();
      expect(app.el.resultBanner.textContent).toBe('Not quite');
      expect(app.el.resultBanner.classList.contains('incorrect')).toBe(true);
    });

    it('hides type-submit-area and shows type-next-area', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      app.checkAnswer();
      expect(app.el.typeSubmitArea.classList.contains('hidden')).toBe(true);
      expect(app.el.typeNextArea.classList.contains('hidden')).toBe(false);
    });

    it('defers focus to typeResult via setTimeout so no synthetic keydown fires in the browser', () => {
      vi.useFakeTimers();
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      app.checkAnswer();
      // focus must NOT move immediately — that's what caused the bug in real browsers
      expect(document.activeElement).not.toBe(app.el.typeResult);
      vi.runAllTimers();
      expect(document.activeElement).toBe(app.el.typeResult);
      vi.useRealTimers();
    });

    it('increments seen and knew when both correct', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      app.checkAnswer();
      expect(app.state.session.seen).toBe(1);
      expect(app.state.session.knew).toBe(1);
      expect(app.state.session.missed).toBe(0);
    });

    it('increments seen and missed when an answer is wrong', () => {
      app.el.inputPS.value = 'goed';
      app.el.inputPP.value = 'gone';
      app.checkAnswer();
      expect(app.state.session.seen).toBe(1);
      expect(app.state.session.missed).toBe(1);
      expect(app.state.session.knew).toBe(0);
    });

    it('adds card--incorrect class when any answer is wrong', () => {
      app.el.inputPS.value = 'goed';
      app.el.inputPP.value = 'goned';
      app.checkAnswer();
      expect(app.el.card.classList.contains('card--incorrect')).toBe(true);
    });

    it('adds card--correct class when both answers are correct', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      app.checkAnswer();
      expect(app.el.card.classList.contains('card--correct')).toBe(true);
      expect(app.el.card.classList.contains('card--incorrect')).toBe(false);
    });

    it('removes card result classes when next card is shown', () => {
      app.el.inputPS.value = 'goed';
      app.el.inputPP.value = 'goned';
      app.checkAnswer();
      app.nextCard();
      expect(app.el.card.classList.contains('card--incorrect')).toBe(false);
      expect(app.el.card.classList.contains('card--correct')).toBe(false);
    });

    it('accepts slash-variant alternatives as correct', () => {
      app.state.mode = 'type';
      app.showCard(verbsFixture[1]); // be: was/were / been
      app.el.inputPS.value = 'were';
      app.el.inputPP.value = 'been';
      app.checkAnswer();
      expect(app.el.resultBanner.textContent).toBe('Correct!');
    });
  });

  // ─── type mode: result row content ─────────────────────────────────────────

  describe('result row content', () => {
    beforeEach(() => {
      app.state.verbs = [...verbsFixture];
      app.state.mode = 'type';
      app.showCard(goVerb);
    });

    it('correct field gets correct class and hides the expected-answer span', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'wrong';
      app.checkAnswer();
      expect(app.el.resultPsUser.classList.contains('correct')).toBe(true);
      expect(app.el.resultPsCorrect.classList.contains('hidden')).toBe(true);
    });

    it('incorrect field gets incorrect class and shows the expected answer', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'wrong';
      app.checkAnswer();
      expect(app.el.resultPpUser.classList.contains('incorrect')).toBe(true);
      expect(app.el.resultPpCorrect.classList.contains('hidden')).toBe(false);
      expect(app.el.resultPpCorrect.textContent).toBe('gone');
    });

    it('shows "(empty)" when input was left blank', () => {
      app.el.inputPS.value = '';
      app.el.inputPP.value = '';
      app.checkAnswer();
      expect(app.el.resultPsUser.textContent).toBe('(empty)');
      expect(app.el.resultPpUser.textContent).toBe('(empty)');
    });
  });

  // ─── Enter key regressions ─────────────────────────────────────────────────

  describe('Enter on #input-past-participle — result stays visible', () => {
    beforeEach(() => {
      app.state.verbs = [...verbsFixture];
      app.state.mode = 'type';
      app.showCard(goVerb);
    });

    it('shows result and keeps it visible when answers are correct', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      fireKeydown(app.el.inputPP, 'Enter');

      expect(app.el.typeResult.classList.contains('hidden')).toBe(false);
      expect(app.el.typeNextArea.classList.contains('hidden')).toBe(false);
      // if nextCard() had run, typeSubmitArea would be visible again
      expect(app.el.typeSubmitArea.classList.contains('hidden')).toBe(true);
    });

    it('shows result and keeps it visible when answers are wrong', () => {
      app.el.inputPS.value = 'goed';
      app.el.inputPP.value = 'goned';
      fireKeydown(app.el.inputPP, 'Enter');

      expect(app.el.typeResult.classList.contains('hidden')).toBe(false);
      expect(app.el.typeNextArea.classList.contains('hidden')).toBe(false);
      expect(app.el.typeSubmitArea.classList.contains('hidden')).toBe(true);
    });

    it('key-repeat Enter does not call checkAnswer a second time', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      fireKeydown(app.el.inputPP, 'Enter');             // first press → checkAnswer
      fireKeydown(app.el.inputPP, 'Enter', { repeat: true }); // repeat → ignored

      // stats must only increment once
      expect(app.state.session.seen).toBe(1);
    });
  });

  describe('Enter on result panel — advances to next card', () => {
    beforeEach(() => {
      app.state.verbs = [...verbsFixture];
      app.state.mode = 'type';
      app.showCard(goVerb);
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      app.checkAnswer(); // result showing; focus deferred to typeResult via setTimeout
    });

    it('Enter on typeResult advances to next card', () => {
      fireKeydown(app.el.typeResult, 'Enter');

      expect(app.el.typeResult.classList.contains('hidden')).toBe(true);
      expect(app.el.typeSubmitArea.classList.contains('hidden')).toBe(false);
      expect(app.el.inputForm.classList.contains('hidden')).toBe(false);
    });

    it('Space on typeResult also advances to next card', () => {
      fireKeydown(app.el.typeResult, ' ');

      expect(app.el.typeResult.classList.contains('hidden')).toBe(true);
      expect(app.el.typeSubmitArea.classList.contains('hidden')).toBe(false);
    });

    it('key-repeat Enter on typeResult does not trigger nextCard', () => {
      fireKeydown(app.el.typeResult, 'Enter', { repeat: true });

      expect(app.el.typeResult.classList.contains('hidden')).toBe(false);
      expect(app.el.typeNextArea.classList.contains('hidden')).toBe(false);
    });
  });

  describe('Enter on #btn-next — single nextCard call', () => {
    beforeEach(() => {
      app.state.verbs = [...verbsFixture];
      app.state.mode = 'type';
      app.showCard(goVerb);
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      app.checkAnswer(); // result showing; focus deferred to typeResult via setTimeout
    });

    it('advances to the next card', () => {
      fireKeydown(app.el.btnNext, 'Enter');

      expect(app.el.typeResult.classList.contains('hidden')).toBe(true);
      expect(app.el.typeSubmitArea.classList.contains('hidden')).toBe(false);
      expect(app.el.inputForm.classList.contains('hidden')).toBe(false);
    });

    it('key-repeat Enter does not trigger nextCard', () => {
      fireKeydown(app.el.btnNext, 'Enter', { repeat: true });

      expect(app.el.typeResult.classList.contains('hidden')).toBe(false);
      expect(app.el.typeNextArea.classList.contains('hidden')).toBe(false);
    });
  });

  // ─── mode switching ────────────────────────────────────────────────────────

  describe('setMode', () => {
    beforeEach(() => {
      app.state.verbs = [...verbsFixture];
      app.showCard(goVerb); // start in flashcard mode
    });

    it('type mode shows input form and hides reveal area', () => {
      app.setMode('type');
      expect(app.el.inputForm.classList.contains('hidden')).toBe(false);
      expect(app.el.revealArea.classList.contains('hidden')).toBe(true);
    });

    it('flashcard mode shows reveal area and hides input form', () => {
      app.setMode('type');
      app.setMode('flashcard');
      expect(app.el.revealArea.classList.contains('hidden')).toBe(false);
      expect(app.el.inputForm.classList.contains('hidden')).toBe(true);
    });

    it('updates active class on mode buttons', () => {
      app.setMode('type');
      expect(app.el.btnModeType.classList.contains('active')).toBe(true);
      expect(app.el.btnModeFlashcard.classList.contains('active')).toBe(false);

      app.setMode('flashcard');
      expect(app.el.btnModeFlashcard.classList.contains('active')).toBe(true);
      expect(app.el.btnModeType.classList.contains('active')).toBe(false);
    });
  });

  // ─── flashcard mode ────────────────────────────────────────────────────────

  describe('flashcard mode', () => {
    beforeEach(() => {
      app.state.verbs = [...verbsFixture];
      app.showCard(goVerb);
    });

    it('reveal shows answer and hides reveal button', () => {
      expect(app.el.answer.classList.contains('hidden')).toBe(true);
      app.el.btnReveal.click();
      expect(app.el.answer.classList.contains('hidden')).toBe(false);
      expect(app.el.revealArea.classList.contains('hidden')).toBe(true);
      expect(app.el.ratingArea.classList.contains('hidden')).toBe(false);
    });

    it('"I knew it" increments knew and seen', () => {
      app.el.btnReveal.click();
      app.el.btnKnew.click();
      expect(app.state.session.seen).toBe(1);
      expect(app.state.session.knew).toBe(1);
      expect(app.state.session.missed).toBe(0);
    });

    it('"I didn\'t know it" increments missed and seen', () => {
      app.el.btnReveal.click();
      app.el.btnMissed.click();
      expect(app.state.session.seen).toBe(1);
      expect(app.state.session.missed).toBe(1);
      expect(app.state.session.knew).toBe(0);
    });

    it('"I knew it" records knew in progress for the verb', () => {
      app.el.btnReveal.click();
      app.el.btnKnew.click();
      expect(app.state.progress['go'].knew).toBe(1);
      expect(app.state.progress['go'].missed).toBe(0);
    });

    it('"I didn\'t know it" records missed in progress for the verb', () => {
      app.el.btnReveal.click();
      app.el.btnMissed.click();
      expect(app.state.progress['go'].missed).toBe(1);
      expect(app.state.progress['go'].knew).toBe(0);
    });
  });

  // ─── progress tracking in type mode ───────────────────────────────────────

  describe('progress tracking (type mode)', () => {
    beforeEach(() => {
      app.state.verbs = [...verbsFixture];
      app.state.mode = 'type';
      app.showCard(goVerb);
    });

    it('records a correct answer in progress', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      app.checkAnswer();
      expect(app.state.progress['go'].knew).toBe(1);
      expect(app.state.progress['go'].missed).toBe(0);
      expect(app.state.progress['go'].seen).toBe(1);
      expect(app.state.progress['go'].history).toEqual([true]);
    });

    it('records an incorrect answer in progress', () => {
      app.el.inputPS.value = 'goed';
      app.el.inputPP.value = 'goned';
      app.checkAnswer();
      expect(app.state.progress['go'].missed).toBe(1);
      expect(app.state.progress['go'].history).toEqual([false]);
      expect(app.state.progress['go'].knew).toBe(0);
    });

    it('accumulates progress across multiple attempts', () => {
      app.el.inputPS.value = 'goed';
      app.el.inputPP.value = 'goned';
      app.checkAnswer();
      app.showCard(goVerb);
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      app.checkAnswer();
      expect(app.state.progress['go'].seen).toBe(2);
      expect(app.state.progress['go'].missed).toBe(1);
      expect(app.state.progress['go'].knew).toBe(1);
    });
  });

  // ─── near-miss retry ──────────────────────────────────────────────────────

  describe('near-miss retry (type mode)', () => {
    beforeEach(() => {
      app.state.verbs = [...verbsFixture];
      app.state.mode = 'type';
      app.showCard(goVerb); // go / went / gone
    });

    it('shows retry hint and keeps input form visible on a near-miss', () => {
      app.el.inputPS.value = 'wент'; // completely wrong — use a real near-miss below
      // Use a 1-char substitution: 'gane' instead of 'gone'
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gane'; // near-miss: 'a' instead of 'o'
      app.checkAnswer();
      expect(app.el.retryHint.classList.contains('hidden')).toBe(false);
      expect(app.el.inputForm.classList.contains('hidden')).toBe(false);
    });

    it('does not record a result on near-miss (waits for retry)', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gane';
      app.checkAnswer();
      expect(app.state.progress['go']).toBeUndefined();
      expect(app.state.session.seen).toBe(0);
    });

    it('sets state.retrying to true on near-miss', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gane';
      app.checkAnswer();
      expect(app.state.retrying).toBe(true);
    });

    it('adds near-miss class to the near-miss input only', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gane';
      app.checkAnswer();
      expect(app.el.inputPP.className).toBe('near-miss');
      expect(app.el.inputPS.className).toBe('');
    });

    it('does not offer retry for a clear error (not near-miss)', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'wrong'; // completely wrong
      app.checkAnswer();
      expect(app.el.retryHint.classList.contains('hidden')).toBe(true);
      expect(app.el.typeResult.classList.contains('hidden')).toBe(false);
    });

    it('does not offer retry when all answers are correct', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      app.checkAnswer();
      expect(app.el.retryHint.classList.contains('hidden')).toBe(true);
      expect(app.el.typeResult.classList.contains('hidden')).toBe(false);
    });

    it('records as knew when retry answer is correct', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gane'; // near-miss
      app.checkAnswer();             // → retry mode
      app.el.inputPP.value = 'gone'; // fix the typo
      app.checkAnswer();             // → finalise
      expect(app.state.progress['go'].knew).toBe(1);
      expect(app.state.progress['go'].missed).toBe(0);
      expect(app.state.session.seen).toBe(1);
    });

    it('records as missed when retry answer is still wrong', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gane'; // near-miss
      app.checkAnswer();
      app.el.inputPP.value = 'gune'; // still wrong
      app.checkAnswer();
      expect(app.state.progress['go'].missed).toBe(1);
      expect(app.state.progress['go'].knew).toBe(0);
    });

    it('does not offer a second retry even if retry answer is also near-miss', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gane'; // near-miss → retry
      app.checkAnswer();
      app.el.inputPP.value = 'gune'; // another near-miss on retry
      app.checkAnswer();             // must finalise, not enter retry again
      expect(app.el.typeResult.classList.contains('hidden')).toBe(false);
      expect(app.state.retrying).toBe(false);
    });

    it('hides retry hint and resets retrying when next card is shown', () => {
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gane';
      app.checkAnswer();
      app.showCard(goVerb);
      expect(app.el.retryHint.classList.contains('hidden')).toBe(true);
      expect(app.state.retrying).toBe(false);
    });
  });

  // ─── filter switching ──────────────────────────────────────────────────────

  describe('setFilter', () => {
    beforeEach(() => {
      app.state.verbs = [...verbsFixture];
      app.state.filter = 'all';
      app.showCard(goVerb);
    });

    it('updates active class on filter buttons', () => {
      app.setFilter('difficult');
      expect(app.el.btnFilterDifficult.classList.contains('active')).toBe(true);
      expect(app.el.btnFilterAll.classList.contains('active')).toBe(false);
      expect(app.el.btnFilterDue.classList.contains('active')).toBe(false);
    });

    it('updates aria-pressed on filter buttons', () => {
      app.setFilter('due');
      expect(app.el.btnFilterDue.getAttribute('aria-pressed')).toBe('true');
      expect(app.el.btnFilterAll.getAttribute('aria-pressed')).toBe('false');
    });

    it('shows empty-filter state when no verbs match the filter', () => {
      // no progress yet → no difficult verbs
      app.setFilter('difficult');
      expect(app.el.emptyFilter.classList.contains('hidden')).toBe(false);
      expect(app.el.cardState.classList.contains('hidden')).toBe(true);
    });

    it('hides empty-filter state and shows card when switching back to all', () => {
      app.setFilter('difficult'); // goes empty
      app.setFilter('all');
      expect(app.el.emptyFilter.classList.contains('hidden')).toBe(true);
      expect(app.el.cardState.classList.contains('hidden')).toBe(false);
    });

    it('empty state actions include a "Practice all verbs" button that switches to all filter', () => {
      app.setFilter('difficult'); // deck empty, shows empty state
      const allBtn = app.el.emptyFilterActions.querySelector('button');
      allBtn.click();
      expect(app.state.filter).toBe('all');
      expect(app.el.cardState.classList.contains('hidden')).toBe(false);
    });

    it('"difficult" filter shows verbs that have been missed more than knew', () => {
      app.state.progress['go'] = { seen: 2, knew: 0, missed: 2 };
      app.setFilter('difficult');
      expect(app.el.emptyFilter.classList.contains('hidden')).toBe(true);
      expect(app.el.cardState.classList.contains('hidden')).toBe(false);
    });

    it('"new" filter shows only unseen verbs', () => {
      // mark both verbs as seen
      app.state.progress['go'] = { seen: 1, knew: 1, missed: 0 };
      app.state.progress['be'] = { seen: 1, knew: 1, missed: 0 };
      app.setFilter('new');
      expect(app.el.emptyFilter.classList.contains('hidden')).toBe(false);
    });

    it('"due" filter includes new and difficult, excludes known', () => {
      // go: difficult, be: known
      app.state.progress['go'] = { seen: 2, knew: 0, missed: 2 };
      app.state.progress['be'] = { seen: 2, knew: 2, missed: 0 };
      app.setFilter('due');
      // deck has go (difficult) — card state should be visible
      expect(app.el.cardState.classList.contains('hidden')).toBe(false);
      expect(app.el.emptyFilter.classList.contains('hidden')).toBe(true);
    });

    it('"due" filter is empty when all verbs are scheduled in the future', () => {
      const futureDate = Date.now() + 86400000 * 7;
      app.state.verbs.forEach(v => {
        app.state.progress[v.id] = { seen: 2, knew: 2, missed: 0, history: [], due: futureDate };
      });
      app.setFilter('due');
      expect(app.el.emptyFilter.classList.contains('hidden')).toBe(false);
    });

    it('"due" button becomes active when selected', () => {
      app.setFilter('due');
      expect(app.el.btnFilterDue.classList.contains('active')).toBe(true);
      expect(app.el.btnFilterAll.classList.contains('active')).toBe(false);
    });
  });

  // ─── persistence ──────────────────────────────────────────────────────────

  describe('saveProgress / loadProgress', () => {
    let store;

    beforeEach(() => {
      store = {};
      vi.stubGlobal('localStorage', {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
      });
      app.state.verbs = [...verbsFixture];
      app.showCard(goVerb);
    });

    it('saveProgress writes progress, mode and filter to localStorage', () => {
      app.state.progress['go'] = { seen: 1, knew: 1, missed: 0, history: [true] };
      app.state.mode = 'type';
      app.state.filter = 'difficult';
      app.saveProgress();
      const saved = JSON.parse(store['ivt-progress']);
      expect(saved.progress['go'].knew).toBe(1);
      expect(saved.mode).toBe('type');
      expect(saved.filter).toBe('difficult');
    });

    it('recordResult triggers saveProgress automatically', () => {
      app.state.mode = 'type';
      app.showCard(goVerb);
      app.el.inputPS.value = 'went';
      app.el.inputPP.value = 'gone';
      app.checkAnswer();
      expect(store['ivt-progress']).toBeDefined();
      const saved = JSON.parse(store['ivt-progress']);
      expect(saved.progress['go']).toBeDefined();
    });

    it('loadProgress restores progress, mode and filter into state', async () => {
      const farFuture = Date.now() + 86400000 * 7;
      store['ivt-progress'] = JSON.stringify({
        progress: {
          go: { seen: 3, knew: 2, missed: 1, history: [true, false, true], due: farFuture },
          be: { seen: 1, knew: 1, missed: 0, history: [true], due: farFuture },
        },
        mode: 'type',
        filter: 'difficult',
      });
      await app.init();
      expect(app.state.progress['go'].knew).toBe(2);
      expect(app.state.mode).toBe('type');
      expect(app.state.filter).toBe('difficult');
    });

    it('loadProgress is a no-op when localStorage is empty', async () => {
      await app.init();
      expect(app.state.progress).toEqual({});
      expect(app.state.mode).toBe('flashcard');
      expect(app.state.filter).toBe('due');
    });

    it('loadProgress ignores corrupted JSON without throwing', async () => {
      store['ivt-progress'] = 'not-valid-json{{{';
      await expect(app.init()).resolves.not.toThrow();
      expect(app.state.progress).toEqual({});
    });
  });

  // ─── report ────────────────────────────────────────────────────────────────

  describe('report', () => {
    beforeEach(() => {
      app.state.verbs = [...verbsFixture];
      app.state.filter = 'all';
      app.showCard(goVerb);
    });

    it('showReport hides card state and shows report state', () => {
      app.showReport();
      expect(app.el.reportState.classList.contains('hidden')).toBe(false);
      expect(app.el.cardState.classList.contains('hidden')).toBe(true);
    });

    it('hideReport hides report state and restores card state', () => {
      app.showReport();
      app.hideReport();
      expect(app.el.reportState.classList.contains('hidden')).toBe(true);
      expect(app.el.cardState.classList.contains('hidden')).toBe(false);
    });

    it('summary tiles are rendered by showReport', () => {
      app.showReport();
      expect(app.el.reportSummaryEl.innerHTML).not.toBe('');
    });

    it('report table shows "no verbs" row when filter yields empty set (no difficult verbs yet)', () => {
      app.state.report.filter = 'difficult';
      app.showReport();
      expect(app.el.reportBody.innerHTML).toContain('No verbs match');
    });

    it('report table shows rows when difficult verbs exist', () => {
      app.state.progress['go'] = { seen: 3, knew: 0, missed: 3, history: [false, false, false] };
      app.state.report.filter = 'difficult';
      app.showReport();
      expect(app.el.reportBody.querySelector('td.report-verb').textContent).toBe('go');
    });

    it('flashcard mode records history in progress via rate()', () => {
      app.el.btnReveal.click(); // reveal
      app.el.btnKnew.click();  // rate as knew
      expect(app.state.progress['go'].history).toEqual([true]);
    });
  });
});
