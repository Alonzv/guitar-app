import React, { useCallback, useEffect, useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../Auth/AuthModal';
import { SignInPrompt, Loading } from './shared';
import { icon } from '../ChordBuilder/Stage';
import { useLang } from '../../contexts/LanguageContext';
import { savedProgressions, savedTabs, savedHarmonizations, savedReharms, audioTabs } from '../../services/workspace';
import { AudioArchive } from './AudioArchive';
import { MyTabs } from './MyTabs';
import { SavedProgressions } from './SavedProgressions';
import { Harmonizations } from './Harmonizations';
import { ReharmsSection } from './ReharmsSection';
import type { TabContent } from '../../services/types';
import type { ChordInProgression } from '../../types/music';

type Sub = 'progressions' | 'harmonizations' | 'reharms' | 'tabs' | 'audio';

// One category per creation tool, ordered to mirror the app's own flow:
// CHORDS → VOICINGS (Harmonize / Reharm) → TOOLS (Tabs / Audio).
const SUBS: { id: Sub; label: { en: string; he: string } }[] = [
  { id: 'progressions',   label: { en: 'Progressions', he: 'מהלכים' }    },
  { id: 'harmonizations', label: { en: 'Harmonized',   he: 'הרמוניות' }   },
  { id: 'reharms',        label: { en: 'Reharms',      he: 'רה-הרמוניזציות' } },
  { id: 'tabs',           label: { en: 'Tabs',         he: 'טאבים' }      },
  { id: 'audio',          label: { en: 'Audio',        he: 'אודיו' }      },
];

interface Props {
  onOpenTabInBuilder: (content: TabContent, id: string) => void;
  onOpenProgressionInBuilder: (chords: ChordInProgression[]) => void;
  desktop?: boolean;
}

export const WorkspacePanel: React.FC<Props> = ({ onOpenTabInBuilder, onOpenProgressionInBuilder, desktop }) => {
  const { user, loading, configured } = useAuth();
  const { lang } = useLang();
  const he = lang === 'he';
  const [sub, setSub]           = useState<Sub>('progressions');
  const [authOpen, setAuthOpen] = useState(false);
  const [query, setQuery]       = useState('');
  const [counts, setCounts]     = useState<Partial<Record<Sub, number>>>({});

  // Every category's count up front, for the filter pills; the open section
  // keeps its own count current as items are added or deleted.
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const n = (k: Sub, p: Promise<unknown[]>) => p.then(xs => setCounts(c => ({ ...c, [k]: xs.length }))).catch(() => {});
    n('progressions', savedProgressions.list(uid));
    n('harmonizations', savedHarmonizations.list(uid));
    n('reharms', savedReharms.list(uid));
    n('tabs', savedTabs.list(uid));
    n('audio', audioTabs.list(uid));
  }, [user]);
  const onCount = useCallback((n: number) => setCounts(c => c[sub] === n ? c : { ...c, [sub]: n }), [sub]);

  if (loading) {
    return <Loading />;
  }

  if (!configured) {
    return (
      <div className="su-sub" style={{ background: T.bgCard, borderRadius: 26, padding: '24px 22px', textAlign: 'center', fontSize: 15, lineHeight: 1.55 }}>
        {he ? 'החשבונות לא מוגדרים בגרסה הזו, ולכן הספרייה האישית לא זמינה.' : 'Accounts aren’t set up in this build, so the personal library isn’t available.'}
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SignInPrompt onSignIn={() => setAuthOpen(true)} />
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      </>
    );
  }

  const common = { desktop, query, onCount };
  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: desktop ? 900 : undefined, margin: '0 auto', paddingTop: 4 }}>
      {/* Search */}
      <div className="lg" style={{ height: 50, borderRadius: 25, display: 'flex', alignItems: 'center', gap: 10, paddingInlineStart: 16, paddingInlineEnd: 8 }}>
        <span aria-hidden style={{ color: T.textMuted, display: 'flex', flex: 'none' }}>{icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, 18)}</span>
        <input value={query} onChange={e => setQuery(e.target.value)} dir="auto"
          onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}
          aria-label={he ? 'חיפוש בספרייה' : 'Search the library'}
          placeholder={he ? 'חיפוש בספרייה' : 'Search your library'}
          style={{ flex: 1, minWidth: 0, height: 40, border: 'none', outline: 'none', background: 'transparent', color: T.text, fontFamily: 'var(--gc-font)', fontSize: 16 }} />
        {query && (
          <button onClick={() => setQuery('')} aria-label={he ? 'ניקוי החיפוש' : 'Clear search'} className="gc-no-bar"
            style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.12)', color: T.text, cursor: 'pointer', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            {icon(<path d="M18 6 6 18M6 6l12 12" />, 15)}
          </button>
        )}
      </div>

      {/* One chip per kind of saved work, with its count */}
      <div role="radiogroup" aria-label={he ? 'סוג' : 'Kind'} className="gc-no-scrollbar"
        style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: 2, margin: -2 }}>
        {SUBS.map(s => {
          const on = s.id === sub;
          return (
            <button key={s.id} role="radio" aria-checked={on} onClick={() => setSub(s.id)} className="gc-no-bar"
              style={{
                flex: 'none', height: 40, padding: '0 16px', borderRadius: 20, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap',
                background: on ? T.text : 'rgba(255,255,255,0.08)', color: on ? '#000' : T.text,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {s.label[lang]}
              {counts[s.id] != null && <span style={{ opacity: 0.55, fontVariantNumeric: 'tabular-nums' }}>{counts[s.id]}</span>}
            </button>
          );
        })}
      </div>

      {/* key={sub} remounts the section so the fade plays on every switch */}
      <div key={sub} className="gc-fadein" style={{ minWidth: 0 }}>
        {sub === 'progressions'   && <SavedProgressions {...common} onOpenInBuilder={onOpenProgressionInBuilder} />}
        {sub === 'harmonizations' && <Harmonizations {...common} />}
        {sub === 'reharms'        && <ReharmsSection {...common} />}
        {sub === 'tabs'           && <MyTabs {...common} onOpenInBuilder={onOpenTabInBuilder} />}
        {sub === 'audio'          && <AudioArchive {...common} />}
      </div>
      <style>{`.gc-fadein { animation: gcFadeIn .2s var(--gc-ease-out); } @keyframes gcFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } } @media (prefers-reduced-motion: reduce) { .gc-fadein { animation: none; } }`}</style>
    </div>
  );
};
