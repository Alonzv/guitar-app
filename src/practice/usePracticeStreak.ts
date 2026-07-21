import { useCallback, useRef, useState } from 'react';
import { initStreak, submitAnswer, nextQuestion, type Outcome } from './streak';

// React wrapper around the second-chance streak logic. `submit` returns the
// outcome synchronously (via a ref) so callers can react immediately —
// 'retry' → flash the palette Error indicator and let them answer again;
// 'reset' → the run broke (reveal the answer / move on); 'correct' → advance.
export function usePracticeStreak(initialBest = 0) {
  const [state, setState] = useState(() => initStreak(initialBest));
  const ref = useRef(state);
  ref.current = state;

  const submit = useCallback((correct: boolean): Outcome => {
    const { state: next, outcome } = submitAnswer(ref.current, correct);
    ref.current = next;
    setState(next);
    return outcome;
  }, []);

  const advance = useCallback(() => {
    const next = nextQuestion(ref.current);
    ref.current = next;
    setState(next);
  }, []);

  const setBest = useCallback((best: number) => {
    setState(s => (best > s.best ? { ...s, best } : s));
  }, []);

  return { streak: state.streak, best: state.best, attempts: state.attempts, submit, advance, setBest };
}
