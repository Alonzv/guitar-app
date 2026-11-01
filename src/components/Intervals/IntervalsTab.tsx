import { IntervalExplore } from './IntervalExplore';
import { IntervalPlayground } from './IntervalPlayground';
import { IntervalInChord } from './IntervalInChord';
import { EarTrainingTab } from '../EarTraining/EarTrainingTab';

export type IntervalsSub = 'explore' | 'measure' | 'inchord' | 'practice';

// The view is chosen by the shell: Explore / Measure / In a chord are the
// Intervals stop's pills, and 'practice' is its own stop (Ear training, L4).
// Each view is one centred column; the interval table and the song hints
// live inside Explore.
export function IntervalsTab({ desktop, sub }: { desktop?: boolean; sub: string }) {
  if (sub === 'explore') return <IntervalExplore desktop={desktop} />;
  if (sub === 'measure') return <IntervalPlayground desktop={desktop} />;
  if (sub === 'inchord') return <IntervalInChord desktop={desktop} />;
  return <div style={{ maxWidth: desktop ? 680 : undefined, width: '100%' }}><EarTrainingTab desktop={desktop} /></div>;
}
