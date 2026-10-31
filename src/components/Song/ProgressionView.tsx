import { useEffect, useRef, useState, type ReactNode } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { useSong } from '../../song/SongContext';
import { beatsPerBar } from '../../song/song';
import { analyzeProgression, keyName } from '../../utils/harmonicAnalysis';
import { formatChordName } from '../../utils/chordIdentifier';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { rootColors } from '../ChordBuilder/chordColors';
import { degreeLabels } from '../ChordBuilder/chordFormula';
import { StopActions } from '../Transit/StopActions';

// ── Progression ──────────────────────────────────────────────────────────────
// The song's chords, at a glance and one at a time. A row of chords on top;
// the picked one gets the stage (its name, its job in the key, its shape);
// one primary action (Play loop) and one secondary (Reharmonize). Undo, redo
// and share sit in the glass toolbar.

const JOB: Record<number, { en: string; he: string }> = {
  1: { en: 'Home. The progression starts and ends here.', he: 'הבית. המהלך מתחיל ונגמר כאן.' },
  2: { en: 'A gentle step away, often leading to the five.', he: 'צעד עדין החוצה, לרוב מוביל לדרגה החמישית.' },
  3: { en: 'A soft colour, close to home.', he: 'צבע רך, קרוב לבית.' },
  4: { en: 'Moves away from home, open and warm.', he: 'מתרחק מהבית, פתוח וחם.' },
  5: { en: 'Tension that wants to resolve home.', he: 'מתח שרוצה לחזור הביתה.' },
  6: { en: 'The emotional, bittersweet turn.', he: 'התפנית הרגשית, המתוקה-מרירה.' },
  7: { en: 'Bright tension, leaning toward home.', he: 'מתח בהיר שנשען אל הבית.' },
};
const BORROWED = { en: 'Borrowed colour, from outside the key.', he: 'צבע שאול, מחוץ לסולם.' };
const ROMANS = ['VII', 'VI', 'IV', 'V', 'III', 'II', 'I'];
const DEGREE: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };

function degreeOf(roman: string): number | null {
  const up = roman.toUpperCase();
  const hit = ROMANS.find(r => up.replace(/[^IV]/g, '').startsWith(r));
  return hit ? DEGREE[hit] : null;
}

const icon = (d: ReactNode, size = 19) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);

export function ProgressionView({ onGo }: { onGo: (stopId: string) => void }) {
  const { lang } = useLang();
  const he = lang === 'he';
  const song = useSong();
  const { progression, tuning } = song;
  const { bpm, meter, capo } = song.song;

  const names = progression.map(c => c.chord.name);
  const analysis = names.length ? analyzeProgression(names, song.keyIsAuto ? null : song.key) : null;

  const selIdx = Math.max(0, progression.findIndex(c => c.id === song.selectedChord?.id));
  const sel = progression[selIdx];

  // ── Loop playback: one bar per chord at the song's tempo ─────────────────
  const [looping, setLooping] = useState(false);
  const [sounding, setSounding] = useState(-1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopLoop = () => { timers.current.forEach(clearTimeout); timers.current = []; setLooping(false); setSounding(-1); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const startLoop = () => {
    if (!progression.length) return;
    const bar = (60 / bpm) * beatsPerBar(meter) * (meter === '6/8' ? 500 : 1000);
    const chords = progression;
    const pass = () => {
      chords.forEach((item, i) => timers.current.push(setTimeout(() => {
        setSounding(i);
        playChord(item.fretPositions, tuning.openFreqs, capo);
      }, i * bar)));
      timers.current.push(setTimeout(pass, chords.length * bar));
    };
    unlockAudio().then(() => { setLooping(true); pass(); });
  };
  // A changed progression ends the loop rather than playing stale chords.
  useEffect(() => { stopLoop(); }, [progression]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (i: number) => {
    const c = progression[i];
    playChord(c.fretPositions, tuning.openFreqs, capo);
    song.selectChord(c.id);
  };
  const move = (dir: -1 | 1) => {
    const j = selIdx + dir;
    if (!sel || j < 0 || j >= progression.length) return;
    const next = [...progression];
    [next[selIdx], next[j]] = [next[j], next[selIdx]];
    song.setProgression(next);
  };
  const remove = () => {
    if (!sel) return;
    const next = progression.filter(c => c.id !== sel.id);
    song.setProgression(next);
    const after = next[Math.min(selIdx, next.length - 1)];
    song.selectChord(after ? after.id : null);
  };

  const [copied, setCopied] = useState(false);
  const share = () => {
    const payload = progression.map(c => ({ n: c.chord.name, f: c.fretPositions }));
    const url = `${location.origin}${location.pathname}#s=${btoa(JSON.stringify(payload))}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const toolbar = (
    <StopActions>
      <div className="lg" role="group" aria-label={he ? 'היסטוריית עריכה' : 'Edit history'}
        style={{ height: 44, borderRadius: 22, display: 'flex', alignItems: 'center', padding: '0 2px' }}>
        <button onClick={song.undo} disabled={!song.canUndo} aria-label={he ? 'ביטול' : 'Undo'} className="gc-no-bar"
          style={{ width: 44, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: song.canUndo ? T.text : T.textDim }}>
          {icon(<><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>)}
        </button>
        <button onClick={song.redo} disabled={!song.canRedo} aria-label={he ? 'חזרה על פעולה' : 'Redo'} className="gc-no-bar"
          style={{ width: 44, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: song.canRedo ? T.text : T.textDim }}>
          {icon(<><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>)}
        </button>
      </div>
      <button onClick={share} disabled={!progression.length} className="lg lg-circle gc-no-bar"
        aria-label={copied ? (he ? 'הקישור הועתק' : 'Link copied') : (he ? 'שיתוף המהלך' : 'Share progression')}
        style={{ color: progression.length ? T.text : T.textDim }}>
        {copied ? icon(<path d="m5 12 5 5 9-10" />) : icon(<><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></>)}
      </button>
    </StopActions>
  );

  const subtitle = [
    analysis ? keyName(analysis.key, lang) : null,
    `${bpm} BPM`,
    progression.length ? (he ? `${progression.length} אקורדים` : `${progression.length} chord${progression.length === 1 ? '' : 's'}`) : null,
  ].filter(Boolean).join(' · ');

  // ── Empty: one clear way in ──────────────────────────────────────────────
  if (!sel) {
    return (
      <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {toolbar}
        <p className="su-sub" style={{ marginTop: -8 }}>{subtitle}</p>
        <div style={{ borderRadius: 34, background: T.bgCard, padding: '40px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{he ? 'עדיין אין אקורדים' : 'No chords yet'}</span>
          <span className="su-sub" style={{ maxWidth: 380 }}>
            {he ? 'בוחרים אקורדים בבונה האקורדים או במעגל הקווינטות, והם נאספים כאן.' : 'Pick chords in the Chord Builder or the Circle of Fifths, and they collect here.'}
          </span>
          <button onClick={() => onGo('chord-builder')} className="su-primary gc-no-bar" style={{ width: 'auto', padding: '0 28px', height: 50, marginTop: 14 }}>
            {he ? 'הוספת אקורד ראשון' : 'Add your first chord'}
          </button>
        </div>
      </div>
    );
  }

  const roman = analysis?.chords[selIdx];
  const deg = roman ? degreeOf(roman.roman) : null;
  const job = roman && !roman.diatonic ? BORROWED : deg ? JOB[deg] : null;

  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 720 }}>
      {toolbar}
      <p className="su-sub" style={{ marginTop: -8 }}>{subtitle}</p>

      {/* The chords, at a glance */}
      <div role="radiogroup" aria-label={he ? 'אקורדים' : 'Chords'} dir="ltr"
        style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', padding: 2, margin: -2 }}>
        {progression.map((c, i) => {
          const on = i === selIdx;
          const now = i === sounding;
          return (
            <button key={c.id} role="radio" aria-checked={on} onClick={() => pick(i)} className="gc-no-bar gc-notation"
              style={{
                flex: progression.length <= 5 ? '1 1 0' : '0 0 80px', minWidth: 60, height: 64, borderRadius: 22,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                background: on ? T.text : now ? T.primaryBg : 'rgba(255,255,255,0.08)', color: on ? '#000' : T.text,
                boxShadow: now && !on ? `inset 0 0 0 1.5px ${T.primary}` : undefined,
              }}>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatChordName(c.chord.name)}</span>
              {analysis && (
                <span style={{ fontSize: 12, opacity: 0.6, fontFamily: "'New York', ui-serif, Georgia, serif", fontStyle: 'italic' }}>
                  {analysis.chords[i].roman}
                </span>
              )}
            </button>
          );
        })}
        <button onClick={() => onGo('chord-builder')} aria-label={he ? 'הוספת אקורד' : 'Add a chord'} className="gc-no-bar"
          style={{ flex: '0 0 52px', height: 64, borderRadius: 22, boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text }}>
          {icon(<path d="M12 5v14M5 12h14" />, 18)}
        </button>
      </div>

      {/* The picked chord, given the stage */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center' }}>
        <span className="gc-notation" dir="ltr" style={{ fontFamily: 'var(--su-display)', fontSize: 52, lineHeight: '58px', fontWeight: 700, letterSpacing: '-0.04em' }}>
          {formatChordName(sel.chord.name)}
        </span>
        {job && (
          <span style={{ fontSize: 15, color: T.textMuted }}>
            {roman && <span dir="ltr" style={{ fontFamily: "'New York', ui-serif, Georgia, serif", fontStyle: 'italic' }}>{roman.roman}</span>}
            {' · '}{job[lang]}
          </span>
        )}
      </div>
      <div dir="ltr" style={{ width: '100%', maxWidth: 360, alignSelf: 'center' }}>
        <MiniFretboard voicing={sel.fretPositions} tuning={tuning.notes}
          dotColors={rootColors(sel.fretPositions, sel.chord.name, tuning.notes)}
          dotLabels={degreeLabels(sel.fretPositions, sel.chord.name, tuning.notes)}
          showStringLabels showFretNumbers hideFretLabel />
      </div>

      {/* One primary, one secondary */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={looping ? stopLoop : startLoop} className="gc-no-bar"
          style={{ height: 50, padding: '0 26px 0 22px', borderRadius: 25, background: T.text, color: '#000', display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 600 }}>
          {looping
            ? <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>}
          {looping ? (he ? 'עצירה' : 'Stop') : (he ? 'נגנו בלופ' : 'Play loop')}
        </button>
        <button onClick={() => onGo('reharmonize')} className="gc-no-bar"
          style={{ height: 50, padding: '0 20px', borderRadius: 25, background: 'rgba(255,255,255,0.08)', color: T.text, display: 'flex', alignItems: 'center', gap: 7, fontSize: 17, fontWeight: 600 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2 6.5L20.5 11 14 13.5 12 20l-2-6.5L3.5 11 10 8.5z" /></svg>
          {he ? 'הרמוניה מחדש' : 'Reharmonize'}
        </button>
      </div>

      {/* Quiet edits for the picked chord (the row above reads left to right) */}
      <div dir="ltr" style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
        <TextBtn onClick={() => move(-1)} disabled={selIdx === 0}>{he ? 'הזזה שמאלה' : 'Move left'}</TextBtn>
        <TextBtn onClick={remove}>{he ? 'הסרה' : 'Remove'}</TextBtn>
        <TextBtn onClick={() => move(1)} disabled={selIdx === progression.length - 1}>{he ? 'הזזה ימינה' : 'Move right'}</TextBtn>
      </div>
    </div>
  );
}

function TextBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="gc-no-bar"
      style={{ height: 40, padding: '0 14px', borderRadius: 20, fontSize: 15, fontWeight: 500, color: T.tintLabel, opacity: disabled ? 0.35 : 1 }}>
      {children}
    </button>
  );
}
