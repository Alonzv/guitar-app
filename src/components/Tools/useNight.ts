import { useState } from 'react';

// Whether a tool runs on the night surface (NightStage); on unless turned off.
function readOn(key: string): boolean {
  try { return localStorage.getItem(key) !== '0'; } catch { return true; }
}

export function useNight(key: string): [boolean, () => void] {
  const [on, setOn] = useState(() => readOn(key));
  const toggle = () => setOn(v => {
    try { localStorage.setItem(key, v ? '0' : '1'); } catch { /* storage unavailable */ }
    return !v;
  });
  return [on, toggle];
}

