import { useState, useEffect } from 'react';

export function useIsDesktop(breakpoint = 1024): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(min-width: ${breakpoint}px)`).matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isDesktop;
}
