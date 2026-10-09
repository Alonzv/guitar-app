import { useEffect, useRef, useState } from 'react';

/** A flag that turns on for `ms` each time `trigger` is called — e.g. "✓ Added". */
export function useFlash(ms = 1200): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const trigger = () => {
    setOn(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), ms);
  };
  return [on, trigger];
}
