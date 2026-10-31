import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLang } from '../../contexts/LanguageContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import {
  FIFTHS, FEELS, DEGREES, keyName, feelById, scaleBox, hearKey, hearNote, hearScale, hearBox,
  loadSession, saveSession, type FeelId, type Box, type ScaleSession,
} from './scaleData';

// ── Learn a scale ────────────────────────────────────────────────────────────
// A funnel, one question per screen: pick a key, pick a feel, then play the
// scale one position at a time. One primary action per screen. Opening with
// `resume` goes straight to where the player left off.

type Step = 'key' | 'feel' | 'scale';

const TINT = 'var(--gc-primary)';
const MUTED = 'var(--gc-text-muted)';

export function LearnScale({ resume }: { resume?: boolean }) {
  const { lang } = useLang();
  const he = lang === 'he';
  const [last] = useState(loadSession);
  const [step, setStep] = useState<Step>(resume && last ? 'scale' : 'key');
  const [key, setKey] = useState(last?.key ?? 9);
  const [feel, setFeel] = useState<FeelId>(last?.feel ?? 'pmin');
  const [pos, setPos] = useState(resume && last ? last.pos : 0);

  // Each step is a page in the browser history, so the header's back
  // button, the swipe and the in-page Back all step back one screen
  // instead of throwing the player out to Home.
  const first = useRef(step);
  useEffect(() => {
    const onPop = () => { setStep((history.state?.learnStep as Step | undefined) ?? first.current); window.scrollTo?.(0, 0); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (s: Step) => {
    setStep(s); window.scrollTo?.(0, 0);
    try { history.pushState({ ...(history.state ?? {}), learnStep: s }, ''); } catch { /* sandboxed */ }
  };
  const back = (to: Step) => {
    if (history.state?.learnStep) history.back();
    else { setStep(to); window.scrollTo?.(0, 0); }
  };
  const remember = (s: ScaleSession) => saveSession(s);

  return (
    <div key={step} className="su-in" style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
      {step === 'key' && (
        <KeyStep he={he} value={key} onChange={setKey} onNext={() => go('feel')} />
      )}
      {step === 'feel' && (
        <FeelStep he={he} keyPc={key} value={feel} onChange={setFeel} onBack={() => back('key')}
          onNext={() => { setPos(0); remember({ key, feel, pos: 0 }); go('scale'); }} />
      )}
      {step === 'scale' && (
        <ScaleStep key={`${key}-${feel}-${pos}`} he={he} keyPc={key} feel={feel} pos={pos}
          onPos={p => { setPos(p); remember({ key, feel, pos: p }); }}
          onBack={() => back('feel')}
          onChange={() => go('key')} />
      )}
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function Steps({ at, he }: { at: number; he: boolean }) {
  return (
    <div role="img" aria-label={he ? `שלב ${at} מתוך 2` : `Step ${at} of 2`} style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
      {[1, 2].map(i => (
        <span key={i} style={{ width: 28, height: 4, borderRadius: 2, background: i === at ? 'var(--gc-text)' : 'rgba(255,255,255,0.2)' }} />
      ))}
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1 className="su-title">{title}</h1>
      <p className="su-sub">{sub}</p>
    </div>
  );
}

/** Back one screen: a small glass pill above the step (Mac). */
function BackLink({ he, label, onClick }: { he: boolean; label: string; onClick: () => void }) {
  // On the phone the header's round back button already steps back.
  if (!useIsDesktop()) return null;
  return (
    <button onClick={onClick} className="lg gc-no-bar"
      style={{ alignSelf: 'flex-start', height: 36, borderRadius: 18, padding: '0 14px 0 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 15, fontWeight: 600, marginBottom: 18 }}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden style={he ? { transform: 'scaleX(-1)' } : undefined}><path d="M12.5 4 L6.5 10 L12.5 16" /></svg>
      {label}
    </button>
  );
}

function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} style={{ height: 44, padding: '0 4px', color: 'var(--su-tint-label)', fontSize: 17, alignSelf: 'flex-start' }}>
      {children}
    </button>
  );
}

function PlayGlyph({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path d="M6 3.5v17l15-8.5z" fill="currentColor" /></svg>;
}

// ── 1 · Key ──────────────────────────────────────────────────────────────────

function KeyStep({ he, value, onChange, onNext }: { he: boolean; value: number; onChange: (pc: number) => void; onNext: () => void }) {
  const R = 130, C = 160;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Steps at={1} he={he} />
      <Heading title={he ? 'בחרו סולם' : 'Pick a key'}
        sub={he ? 'הקישו על תו כדי לשמוע אותו. לא בטוחים? A זו התחלה מצוינת.' : 'Tap a note to hear it. Not sure? A is a great place to start.'} />

      <div role="radiogroup" aria-label={he ? 'סולם' : 'Key'} dir="ltr"
        style={{ position: 'relative', width: 320, maxWidth: '100%', aspectRatio: '1', margin: '40px auto 44px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: '9.4%', borderRadius: '50%', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span className="gc-notation" style={{ fontFamily: 'var(--su-display)', fontSize: 64, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>{keyName(value)}</span>
          <span style={{ fontSize: 15, color: MUTED, marginTop: 6 }}>{he ? 'הסולם שלכם' : 'Your key'}</span>
        </div>
        {FIFTHS.map((k, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const on = k.pc === value;
          const size = on ? 60 : 48;
          return (
            <button key={k.name} role="radio" aria-checked={on} aria-label={k.name} className="gc-notation"
              onClick={() => { onChange(k.pc); hearKey(k.pc); }}
              style={{
                position: 'absolute', width: size, height: size, borderRadius: size / 2,
                left: `calc(${((C + R * Math.cos(a)) / 320) * 100}% - ${size / 2}px)`,
                top: `calc(${((C + R * Math.sin(a)) / 320) * 100}% - ${size / 2}px)`,
                background: on ? TINT : 'transparent', color: on ? '#fff' : 'var(--gc-text)',
                fontSize: on ? 22 : 18, fontWeight: on ? 700 : 500,
              }}>
              {k.name}
            </button>
          );
        })}
      </div>

      <button className="su-primary" onClick={onNext}>{he ? 'המשך' : 'Continue'}</button>
    </div>
  );
}

// ── 2 · Feel ─────────────────────────────────────────────────────────────────

function FeelStep({ he, keyPc, value, onChange, onBack, onNext }: {
  he: boolean; keyPc: number; value: FeelId; onChange: (f: FeelId) => void; onBack: () => void; onNext: () => void;
}) {
  const lang = he ? 'he' : 'en';
  const cur = feelById(value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <BackLink he={he} label={he ? 'בחירת סולם' : 'Key'} onClick={onBack} />
      <Steps at={2} he={he} />
      <Heading title={he ? 'איזו תחושה?' : 'How should it feel?'}
        sub={he ? 'לכל סולם יש מצב רוח. קודם תקשיבו.' : 'Every scale has a mood. Listen first.'} />

      <div role="radiogroup" aria-label={he ? 'תחושה' : 'Feel'} style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '32px 0 36px' }}>
        {FEELS.map(f => {
          const on = f.id === value;
          return (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', borderRadius: 26, background: 'var(--gc-bg-card)', boxShadow: on ? `inset 0 0 0 2px ${TINT}` : 'none', transition: 'box-shadow .25s' }}>
              <button role="radio" aria-checked={on} onClick={() => onChange(f.id)}
                style={{ flex: 1, minHeight: 80, paddingInlineStart: 18, display: 'flex', alignItems: 'center', gap: 14, textAlign: 'start' }}>
                <span aria-hidden style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? TINT : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 1.5px rgba(235,235,245,0.3)' }}>
                  {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 17, fontWeight: 600 }}>{f.name[lang]}</span>
                  <span style={{ fontSize: 15, color: MUTED }}>{f.mood[lang]}</span>
                </span>
              </button>
              <button aria-label={he ? `השמיעו ${f.name.he}` : `Listen to ${f.name.en}`} onClick={() => { onChange(f.id); hearScale(keyPc, f.iv); }}
                style={{ width: 44, height: 44, marginInlineEnd: 16, borderRadius: 22, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <PlayGlyph size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <button className="su-primary" onClick={onNext}>
        {he ? `הראו לי ${keyName(keyPc)} ${cur.name.he}` : `Show me ${keyName(keyPc)} ${cur.name.en.toLowerCase()}`}
      </button>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
        <TextButton onClick={onBack}>{he ? 'החלפת סולם' : 'Change key'}</TextButton>
      </div>
    </div>
  );
}

// ── 3 · Play ─────────────────────────────────────────────────────────────────

function ScaleStep({ he, keyPc, feel, pos, onPos, onBack, onChange }: {
  he: boolean; keyPc: number; feel: FeelId; pos: number; onPos: (p: number) => void; onBack: () => void; onChange: () => void;
}) {
  const lang = he ? 'he' : 'en';
  const f = feelById(feel);
  const count = f.iv.length;
  const box = scaleBox(keyPc, f.iv, pos);
  const [pick, setPick] = useState(0);

  const rows = box.hi - box.lo + 1;
  const RH = rows > 5 ? 60 : 72;
  const SP = 52, X0 = 38, DOT = 44;
  const W = X0 * 2 + SP * 5, H = RH * rows;
  const deg = DEGREES[pick];

  const chevron = (d: string) => (
    <svg width="9" height="15" viewBox="0 0 11 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <BackLink he={he} label={he ? 'תחושה' : 'Feel'} onClick={onBack} />
      <Heading title={he ? `${keyName(keyPc)} ${f.name.he}` : `${keyName(keyPc)} ${f.name.en.toLowerCase()}`}
        sub={he ? `שריגים ${box.lo}–${box.hi} · הקישו על תו כדי לשמוע` : `Frets ${box.lo}–${box.hi} · tap any note to hear it`} />

      {/* The neck, vertical: strings are columns, frets are rows. */}
      <div dir="ltr" style={{ position: 'relative', width: W, height: H, margin: '32px auto 0' }}>
        {Array.from({ length: 6 }, (_, s) => (
          <span key={s} aria-hidden style={{ position: 'absolute', left: X0 + s * SP - 0.5, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.16)' }} />
        ))}
        {Array.from({ length: rows + 1 }, (_, r) => (
          <span key={r} aria-hidden style={{ position: 'absolute', left: X0, width: SP * 5, top: r * RH, height: 1, background: 'rgba(255,255,255,0.1)' }} />
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <span key={r} aria-hidden style={{ position: 'absolute', left: 0, width: 14, textAlign: 'right', top: r * RH + RH / 2 - 9, fontSize: 13, color: 'var(--gc-text-dim)', fontVariantNumeric: 'tabular-nums' }}>{box.lo + r}</span>
        ))}
        {box.notes.map((n, i) => {
          const root = n.iv === 0, sel = n.iv === pick;
          return (
            <button key={i} className="gc-notation"
              aria-label={`${keyName(keyPc + n.iv)}, ${DEGREES[n.iv].title[lang]}`}
              onClick={() => { setPick(n.iv); hearNote(n.midi); }}
              style={{
                position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2,
                left: X0 + n.string * SP - DOT / 2, top: (n.fret - box.lo) * RH + RH / 2 - DOT / 2,
                background: root ? TINT : sel ? 'var(--gc-text)' : 'var(--gc-bg-input)',
                color: root ? '#fff' : sel ? '#000' : 'var(--gc-text)', fontSize: 15, fontWeight: 600,
              }}>
              {DEGREES[n.iv].label}
            </button>
          );
        })}
      </div>

      <div aria-live="polite" style={{ textAlign: 'center', marginTop: 28, minHeight: 56, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 600 }}><span className="gc-notation">{keyName(keyPc + pick)}</span> · {deg.title[lang]}</span>
        <span style={{ fontSize: 16, color: MUTED }}>{deg.role[lang]}</span>
      </div>

      {/* Toolbar: the position control grouped in glass, one play button. */}
      <div dir="ltr" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 28 }}>
        <div className="lg" style={{ height: 52, borderRadius: 26, display: 'flex', alignItems: 'center' }}>
          <button aria-label={he ? 'הפוזיציה הקודמת' : 'Previous position'} disabled={pos === 0} onClick={() => onPos(pos - 1)}
            style={{ width: 52, height: 52, opacity: pos === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {chevron('M9 1.5 1.5 9 9 16.5')}
          </button>
          <span dir={he ? 'rtl' : 'ltr'} style={{ fontSize: 15, fontWeight: 600, minWidth: 128, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {he ? `פוזיציה ${pos + 1} מתוך ${count}` : `Position ${pos + 1} of ${count}`}
          </span>
          <button aria-label={he ? 'הפוזיציה הבאה' : 'Next position'} disabled={pos === count - 1} onClick={() => onPos(pos + 1)}
            style={{ width: 52, height: 52, opacity: pos === count - 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {chevron('M2 1.5 9.5 9 2 16.5')}
          </button>
        </div>
        <button aria-label={he ? 'נגנו את הפוזיציה' : 'Play this position'} onClick={() => hearBox(box)}
          style={{ width: 52, height: 52, borderRadius: 26, background: TINT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 }}>
          <PlayGlyph size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
        <TextButton onClick={onChange}>{he ? 'סולם או תחושה אחרים' : 'Try another key or feel'}</TextButton>
      </div>
    </div>
  );
}

/** A small, horizontal picture of one position, for the Continue card. */
export function MiniBox({ box }: { box: Box }) {
  const lo = Math.max(box.lo - 1, 0), hi = box.hi;
  const W = 320, H = 96, X0 = 14, Y0 = 10;
  const cw = (W - X0 * 2) / (hi - lo + 1), sh = (H - Y0 * 2) / 5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden style={{ display: 'block' }} direction="ltr">
      {Array.from({ length: 6 }, (_, s) => (
        <line key={s} x1={X0} x2={W - X0} y1={Y0 + s * sh} y2={Y0 + s * sh} stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      ))}
      {Array.from({ length: hi - lo + 2 }, (_, f) => (
        <line key={f} x1={X0 + f * cw} x2={X0 + f * cw} y1={Y0} y2={H - Y0} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      ))}
      {box.notes.map((n, i) => (
        <circle key={i} cx={X0 + (n.fret - lo + 0.5) * cw} cy={Y0 + (5 - n.string) * sh} r="6.5"
          fill={n.iv === 0 ? 'var(--gc-primary)' : 'var(--gc-text)'} />
      ))}
    </svg>
  );
}
