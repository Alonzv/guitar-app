import React, { useCallback, useEffect, useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../Auth/AuthModal';
import { SignInPrompt } from './shared';
import { PillRow } from '../Transit/parts';
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
  { id: 'reharms',        label: { en: 'Reharms',      he: 'רה-הרמוניה' } },
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
    return <p className="su-label" style={{ textAlign: 'center', padding: 30 }}>{he ? 'טוען…' : 'Loading…'}</p>;
  }

  if (!configured) {
    return (
      <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, color: T.textMuted, fontSize: 13, lineHeight: 1.6, padding: '18px 0' }}>
        Accounts aren&apos;t configured in this build. Add your Supabase keys to
        <code style={{ margin: '0 4px', color: T.text }}>.env</code> to enable the
        personal library.
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Search pill */}
      <div style={{
        height: 50, border: `var(--su-rule) solid ${T.text}`, borderRadius: 'var(--su-pill)', background: T.bgCard,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 0 18px', maxWidth: desktop ? 520 : undefined,
      }}>
        <span aria-hidden style={{ fontSize: 15, fontWeight: 700 }}>⌕</span>
        <input value={query} onChange={e => setQuery(e.target.value)} dir="auto"
          onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}
          aria-label={he ? 'חיפוש בספרייה' : 'Search the library'}
          placeholder={he ? 'חיפוש בספרייה…' : 'Search your library…'}
          style={{ flex: 1, minWidth: 0, height: 40, border: 'none', outline: 'none', background: 'transparent', color: T.text, fontFamily: 'var(--gc-font)', fontSize: 13 }} />
        {query && (
          <button onClick={() => setQuery('')} aria-label={he ? 'ניקוי החיפוש' : 'Clear search'} className="gc-no-bar"
            style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: T.text, color: T.bgDeep, fontSize: 14, cursor: 'pointer', flex: 'none' }}>×</button>
        )}
      </div>

      {/* Filter pills with counts — one per kind of saved work. */}
      <PillRow<Sub>
        label={he ? 'סוג' : 'Kind'}
        value={sub}
        onChange={setSub}
        items={SUBS.map(s => ({
          id: s.id,
          label: <>{s.label[lang]}{counts[s.id] != null && <span style={{ opacity: 0.7, marginInlineStart: 6, fontFamily: 'var(--gc-mono)' }}>{counts[s.id]}</span>}</>,
        }))}
      />

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
