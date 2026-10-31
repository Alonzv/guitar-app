import type { ReactNode } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { stopById } from '../../data/tools';
import { loadSession, feelById, keyName, scaleBox } from '../Play/scaleData';
import { MiniBox } from '../Play/LearnScale';

// ── Home: one thing to continue, three ways to start ─────────────────────────

interface Props {
  lastStop: string;
  onGo: (stopId: string, sub?: string) => void;
}

function Chevron({ rtl }: { rtl: boolean }) {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="rgba(235,235,245,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ flex: 'none', transform: rtl ? 'scaleX(-1)' : undefined }}>
      <path d="m1 1 6 6-6 6" />
    </svg>
  );
}

const icon = (d: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);

export function HomeHero({ lastStop, onGo }: Props) {
  const { lang, rtl } = useLang();
  const he = lang === 'he';
  const session = loadSession();
  const last = stopById(lastStop);

  const starts = [
    { id: 'learn-scale', sub: 'start', title: he ? 'ללמוד סולם' : 'Learn a scale', note: he ? 'בוחרים סולם, ואז תחושה.' : 'Pick a key, then a feel.',
      icon: icon(<path d="M4 18h4v-4h4v-4h4V6h4" />) },
    { id: 'chord-builder', title: he ? 'לכתוב מהלך' : 'Write a progression', note: he ? 'אקורדים שנשמעים טוב יחד.' : 'Chords that fit together.',
      icon: icon(<><rect x="3" y="5" width="5" height="14" rx="1.5" /><rect x="10" y="5" width="5" height="14" rx="1.5" /><rect x="17" y="5" width="4" height="14" rx="1.5" /></>) },
    { id: 'tuner', title: he ? 'לכוון את הגיטרה' : 'Tune up', note: he ? 'לפני שמתחילים לנגן.' : 'Get in tune before you play.',
      icon: icon(<><path d="M12 20V10" /><path d="M5.6 7.6a9 9 0 0 1 12.8 0" /><path d="M8.5 10.5a5 5 0 0 1 7 0" /></>) },
  ];

  let card: ReactNode;
  if (session) {
    const f = feelById(session.feel);
    const title = he ? `${keyName(session.key)} ${f.name.he}` : `${keyName(session.key)} ${f.name.en.toLowerCase()}`;
    card = (
      <button onClick={() => onGo('learn-scale', 'resume')} data-press="soft" className="gc-no-bar"
        style={{ width: '100%', borderRadius: 34, background: T.bgCard, padding: '24px 24px 20px', textAlign: 'start', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="gc-notation" style={{ fontFamily: 'var(--su-display)', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</span>
            <span style={{ fontSize: 15, color: T.textMuted }}>
              {he ? `פוזיציה ${session.pos + 1} מתוך ${f.iv.length}` : `Position ${session.pos + 1} of ${f.iv.length}`}
            </span>
          </span>
          <span style={{ width: 52, height: 52, borderRadius: 26, background: T.text, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, paddingLeft: 3 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M6 3.5v17l15-8.5z" fill="currentColor" /></svg>
          </span>
        </span>
        <MiniBox box={scaleBox(session.key, f.iv, session.pos)} />
      </button>
    );
  } else if (last) {
    card = (
      <button onClick={() => onGo(last.id)} data-press="soft" className="su-row gc-no-bar gc-notation" style={{ minHeight: 88, padding: '0 22px', borderRadius: 26, background: T.bgCard }}>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: 'var(--su-display)', fontSize: 22, fontWeight: 700 }}>{last.name[lang]}</span>
          <span style={{ fontSize: 15, color: T.textMuted }}>{he ? 'מאיפה שעצרתם' : 'Where you left off'}</span>
        </span>
        <Chevron rtl={rtl} />
      </button>
    );
  }

  return (
    <>
      {card && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="su-h2">{he ? 'להמשיך' : 'Continue'}</h2>
          {card}
        </section>
      )}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 className="su-h2">{he ? 'להתחיל משהו חדש' : 'Start something new'}</h2>
        <div className="su-group">
          {starts.map(s => (
            <button key={s.id} onClick={() => onGo(s.id, s.sub)} className="su-row gc-no-bar" data-press="soft" style={{ minHeight: 76 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.08)', color: T.tintLabel, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.icon}</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 17, fontWeight: 600 }}>{s.title}</span>
                <span style={{ fontSize: 15, color: T.textMuted }}>{s.note}</span>
              </span>
              <Chevron rtl={rtl} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
