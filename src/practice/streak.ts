// ── Practice gamification — second-chance streak ─────────────────────────────
// Shared by every Practice Mode trainer (Intervals / Chords / Scales, Theory &
// Ear Training). The rule: the FIRST wrong answer on a question does not reset
// the streak — it grants a retry (the UI shows a temporary error in the
// palette's Error colour). A SECOND wrong answer on the same question resets
// the streak. A correct answer (first try or after the forgiven miss) advances
// the streak. Pure logic here so it can be unit-tested; the React wrapper lives
// in usePracticeStreak.ts.

export interface StreakState {
  streak: number;    // current run of solved questions
  best: number;      // best streak ever (persisted by the caller)
  attempts: number;  // wrong attempts on the CURRENT question (0, 1)
}

export type Outcome = 'correct' | 'retry' | 'reset';

export const initStreak = (best = 0): StreakState => ({ streak: 0, best, attempts: 0 });

/** Apply an answer. Returns the next state and what the UI should do. */
export function submitAnswer(s: StreakState, correct: boolean): { state: StreakState; outcome: Outcome } {
  if (correct) {
    const streak = s.streak + 1;
    return { state: { streak, best: Math.max(s.best, streak), attempts: 0 }, outcome: 'correct' };
  }
  const attempts = s.attempts + 1;
  if (attempts === 1) {
    // First miss — forgiven. Streak stands; let them try again.
    return { state: { ...s, attempts }, outcome: 'retry' };
  }
  // Second miss — the run is broken.
  return { state: { streak: 0, best: s.best, attempts: 0 }, outcome: 'reset' };
}

/** Move to a fresh question (clears the per-question attempt counter). */
export const nextQuestion = (s: StreakState): StreakState => ({ ...s, attempts: 0 });
