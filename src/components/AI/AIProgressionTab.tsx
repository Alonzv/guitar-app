import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Chord } from '@tonaljs/tonal';
import type { ChordInProgression, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { findChordVoicings } from '../../utils/chordVoicings';
import { TUNINGS } from '../../utils/musicTheory';
import { T, card } from '../../theme';

// ── Types ─────────────────────────────────────────────────────────────────────
interface AIProgression { name: string; description: string; key: string; chords: string[]; }
interface ChatMessage { role: 'user'|'assistant'; text: string; progressions?: AIProgression[]; error?: string; loading?: boolean; }
interface MuseSession { id: string; name: string; messages: ChatMessage[]; createdAt: number; }
type Complexity = 'simple' | 'medium' | 'complex';

interface Props {
  onLoadProgression: (chords: ChordInProgression[]) => void;
  onSaveSong: (name: string, chords: ChordInProgression[]) => void;
  onNavigateToLyrics?: (key: string, mood: string) => void;
  tuning?: Tuning;
}

// ── Storage ───────────────────────────────────────────────────────────────────
const SESSIONS_KEY = 'scaleup_muse_sessions';
const ACTIVE_KEY   = 'scaleup_muse_active';
const LEGACY_KEY   = 'scaleup_muse_history';
const WORKER_URL   = 'https://guitar-composer-muse.vipapito.workers.dev';

function loadSessions(): MuseSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (raw) {
      return (JSON.parse(raw) as MuseSession[]).map(s => ({
        ...s, messages: s.messages.filter(m => !m.loading),
      }));
    }
    // Migrate legacy single-session history
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const msgs = (JSON.parse(legacy) as ChatMessage[]).filter(m => !m.loading);
      if (msgs.length > 0)
        return [{ id: `session-${Date.now()}`, name: 'שיחה קודמת', messages: msgs, createdAt: Date.now() }];
    }
    return [];
  } catch { return []; }
}

function saveSessions(sessions: MuseSession[]) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(
      sessions.map(s => ({ ...s, messages: s.messages.filter(m => !m.loading) }))
    ));
  } catch {}
}

function newSession(): MuseSession {
  return { id: `session-${Date.now()}`, name: 'שיחה חדשה', messages: [], createdAt: Date.now() };
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(complexity: Complexity, tuning?: Tuning): string {
  const cxGuide = {
    simple:  'Use 3-4 chords per progression. Stick to basic triads (major and minor). Keep it simple and beginner-friendly.',
    medium:  'Use 4-5 chords per progression. Include seventh chords (maj7, m7, dom7) where they add color.',
    complex: 'Use 5-8 chords per progression. Embrace extended harmony: 9ths, 11ths, sus, add9, borrowed chords, secondary dominants, modal interchange. Be sophisticated.',
  }[complexity];

  const tuningLine = tuning
    ? `\nThe guitarist uses ${tuning.label} tuning (strings low→high: ${tuning.notes.join(' ')}). Consider voicings practical in this tuning.`
    : '';

  return `You are an expert music theorist, composer, and guitarist with encyclopedic knowledge of harmony, chord progressions, genre conventions, and cultural music references from around the world.

Your knowledge spans all genres, eras, and cultures including Israeli music (Shlomo Artzi, Arik Einstein, Idan Raichel, Aviv Geffen, Ethnix, Yehoram Gaon, and the characteristic Mediterranean/Mizrahi harmonic language), Middle Eastern scales (Hijaz, harmonic minor), and world music.

When the user describes a mood, vibe, artist, song, genre, film, TV show, feeling, energy, decade, or any creative prompt — generate 3 distinct chord progression suggestions that authentically capture that vibe.

Complexity level: ${cxGuide}${tuningLine}

LANGUAGE RULE: Detect the language of the user's message and respond in that same language for the "name" and "description" fields. If they write in Hebrew, respond in Hebrew. If Arabic, in Arabic. If English, in English. The "chords" array and "key" field must ALWAYS use standard English music notation regardless of response language.

Return ONLY a JSON object — no markdown, no explanation outside the JSON:

{
  "progressions": [
    {
      "name": "Short evocative name (3-5 words, in the user's language)",
      "description": "2-3 sentences explaining the musical choices (in the user's language).",
      "key": "Key signature in English (e.g. 'A minor', 'G major', 'E Dorian')",
      "chords": ["Am", "F", "C", "G"]
    }
  ]
}

Chord naming rules:
- Major: C, G, D  |  Minor: Am, Em, Dm  |  Dom7: G7, E7
- Maj7: Cmaj7, Fmaj7  |  Min7: Am7, Dm7  |  Half-dim: Bm7b5
- Sus: Dsus4, Gsus2  |  Added: Cadd9
- The 3 progressions must be musically distinct from each other`;
}

// ── Quick prompts (Hebrew) ────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  'בלוז כפרי ועשן — ג\'ון לי הוקר',
  'מתח קולנועי כהה — Interstellar',
  'שלמה ארצי — מלנכוליה ים תיכונית',
  'ג\'אז לילי — ניו יורק בחצות',
  'רוק אנתמי — אנרגיית אצטדיון',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseProgressions(raw: string): AIProgression[] | null {
  try {
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed.progressions) ? parsed.progressions : null;
  } catch { return null; }
}

function makeChordObj(name: string, idx: number): ChordInProgression {
  return { id: `ai-chord-${Date.now()}-${idx}`, chord: { name, notes: [], aliases: [] }, fretPositions: [] };
}

function isRTL(text: string): boolean {
  return /[\u0590-\u05FF\u0600-\u06FF]/.test(text);
}

// ── Web Audio chord player ────────────────────────────────────────────────────
const NOTE_SEMIS: Record<string, number> = {
  C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11,
};

function playChordAudio(notes: string[], ctx: AudioContext, startTime: number, duration: number) {
  let prevMidi = 35; // low guitar B
  notes.forEach((note, i) => {
    const semi = NOTE_SEMIS[note] ?? 0;
    let octave = 2;
    let midi = (octave + 1) * 12 + semi;
    while (midi <= prevMidi) { midi += 12; octave++; }
    prevMidi = midi;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const t = startTime + i * 0.055;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.13, t + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration - 0.08);
    osc.start(t);
    osc.stop(t + duration);
  });
}

// ── API call ──────────────────────────────────────────────────────────────────
async function callMuseAPI(
  messages: Array<{ role: 'user'|'assistant'; content: string }>,
  complexity: Complexity,
  tuning?: Tuning,
): Promise<string> {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1400,
      system: buildSystemPrompt(complexity, tuning),
      messages,
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content[0]?.type === 'text' ? data.content[0].text : '';
}

// ── ChordPill with hover preview ─────────────────────────────────────────────
const ChordPill: React.FC<{ name: string; tuningNotes: string[] }> = ({ name, tuningNotes }) => {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const voicings = useMemo(() => hovered ? findChordVoicings(name, 1, tuningNotes) : [], [hovered, name, tuningNotes]);

  return (
    <>
      <span
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
        style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 8, background: hovered ? T.primary : T.primarySoft, color: hovered ? T.white : T.primary, fontSize: 13, fontWeight: 700, cursor: 'default', transition: 'background 0.12s, color 0.12s', userSelect: 'none' }}
      >{name}</span>
      {hovered && (
        <div style={{ position: 'fixed', left: pos.x + 14, top: pos.y - 120, zIndex: 9999, width: 210, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 10px', boxShadow: '0 4px 20px rgba(0,0,0,0.18)', pointerEvents: 'none' }}>
          <div style={{ fontWeight: 700, color: T.text, fontSize: 13, marginBottom: 6 }}>{name}</div>
          {voicings.length > 0 && voicings[0]
            ? <MiniFretboard voicing={voicings[0]} tuning={tuningNotes} dotColor={T.primary} />
            : <span style={{ color: T.textDim, fontSize: 11 }}>No voicing found</span>}
        </div>
      )}
    </>
  );
};

// ── ProgressionCard ───────────────────────────────────────────────────────────
const ProgressionCard: React.FC<{
  prog: AIProgression;
  tuningNotes: string[];
  onLoad: () => void;
  onSave: () => void;
  onExplain: () => void;
  onVariation: (type: string) => void;
  onNavigateToLyrics?: () => void;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  justSaved: boolean;
}> = ({ prog, tuningNotes, onLoad, onSave, onExplain, onVariation, isPlaying, onPlay, onStop, justSaved, onNavigateToLyrics }) => {
  const nameRTL = isRTL(prog.name);
  const descRTL = isRTL(prog.description);

  const btnStyle = (color: string): React.CSSProperties => ({
    padding: '4px 9px', borderRadius: 7, border: `1px solid ${color}22`,
    background: color + '18', color, fontSize: 11, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.4,
  });

  return (
    <div style={{ ...card(), padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div dir={nameRTL ? 'rtl' : 'ltr'} style={{ fontSize: 14, fontWeight: 700, color: T.text, textAlign: nameRTL ? 'right' : 'left' }}>{prog.name}</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>🎵 {prog.key}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onSave} style={{ ...btnStyle(T.secondary), background: justSaved ? T.secondary : T.secondary + '18', color: justSaved ? T.white : T.secondary }}>
            {justSaved ? '✓ נשמר' : '💾 שמור'}
          </button>
          <button onClick={onLoad} style={{ padding: '4px 12px', borderRadius: 7, border: 'none', background: T.primary, color: T.white, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>← Load</button>
        </div>
      </div>

      {/* Description */}
      <p dir={descRTL ? 'rtl' : 'ltr'} style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.55, textAlign: descRTL ? 'right' : 'left' }}>{prog.description}</p>

      {/* Action row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        <button onClick={isPlaying ? onStop : onPlay} style={btnStyle(T.secondary)}>
          {isPlaying ? '⏹ עצור' : '▶ נגן'}
        </button>
        <button onClick={onExplain} style={btnStyle(T.textMuted)}>✏ הסבר</button>
        <button onClick={() => onVariation('minor')} style={btnStyle(T.textMuted)}>🌙 מינורי</button>
        <button onClick={() => onVariation('jazz')} style={btnStyle(T.textMuted)}>🎷 ג׳אזי</button>
        <button onClick={() => onVariation('simple')} style={btnStyle(T.textMuted)}>⬇ פשוט</button>
        {onNavigateToLyrics && (
          <button onClick={onNavigateToLyrics} style={btnStyle(T.primary)}>📝 → Lyrics</button>
        )}
      </div>

      {/* Chord pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {prog.chords.map((ch, i) => <ChordPill key={i} name={ch} tuningNotes={tuningNotes} />)}
      </div>
    </div>
  );
};

// ── Session Switcher ──────────────────────────────────────────────────────────
const SessionSwitcher: React.FC<{
  sessions: MuseSession[];
  activeId: string;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}> = ({ sessions, activeId, onSwitch, onNew, onRename, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const active = sessions.find(s => s.id === activeId);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setRenaming(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startRename = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setRenameVal(name);
    setRenaming(id);
  };

  const commitRename = (id: string) => {
    if (renameVal.trim()) onRename(id, renameVal.trim());
    setRenaming(null);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(o => !o); setRenaming(null); }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: open ? T.primarySoft : T.bgCard, color: T.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', maxWidth: 200 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {active?.name ?? 'שיחה חדשה'}
        </span>
        <span style={{ fontSize: 9, color: T.textMuted, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 500, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.22)', minWidth: 240, maxHeight: 280, overflowY: 'auto' }}>

          {sessions.map((s, i) => (
            <div
              key={s.id}
              onClick={() => { if (renaming !== s.id) { onSwitch(s.id); setOpen(false); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', background: s.id === activeId ? T.primarySoft : 'transparent', borderBottom: i < sessions.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (s.id !== activeId && renaming !== s.id) e.currentTarget.style.background = T.bgInput; }}
              onMouseLeave={e => { e.currentTarget.style.background = s.id === activeId ? T.primarySoft : 'transparent'; }}
            >
              {renaming === s.id ? (
                <input
                  autoFocus
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(s.id); if (e.key === 'Escape') setRenaming(null); e.stopPropagation(); }}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, padding: '2px 6px', borderRadius: 5, border: `1px solid ${T.primary}`, background: T.bgInput, color: T.text, fontSize: 12, outline: 'none' }}
                />
              ) : (
                <span style={{ flex: 1, fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'right' }}>
                  {s.name}
                </span>
              )}
              <span onClick={e => startRename(e, s.id, s.name)} title="שנה שם" style={{ fontSize: 11, color: T.textDim, cursor: 'pointer', padding: '2px 3px', borderRadius: 4, flexShrink: 0 }}>✏</span>
              <span
                onClick={e => { e.stopPropagation(); onDelete(s.id); if (sessions.length === 1) setOpen(false); }}
                title="מחק שיחה"
                style={{ fontSize: 13, color: T.textDim, cursor: 'pointer', padding: '2px 3px', borderRadius: 4, flexShrink: 0, lineHeight: 1 }}
                onMouseEnter={e => e.currentTarget.style.color = T.coral}
                onMouseLeave={e => e.currentTarget.style.color = T.textDim}
              >🗑</span>
            </div>
          ))}

          <div
            onClick={() => { onNew(); setOpen(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', color: T.primary, fontSize: 12, fontWeight: 700, borderTop: sessions.length > 0 ? `1px solid ${T.border}` : 'none' }}
            onMouseEnter={e => e.currentTarget.style.background = T.primarySoft}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> שיחה חדשה
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export const AIProgressionTab: React.FC<Props> = ({ onLoadProgression, onSaveSong, onNavigateToLyrics, tuning }) => {
  // Load once, always ensure at least one session
  const [sessions, setSessions] = useState<MuseSession[]>(() => {
    const loaded = loadSessions();
    return loaded.length > 0 ? loaded : [newSession()];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    const loaded = loadSessions();
    const list = loaded.length > 0 ? loaded : [newSession()];
    const stored = localStorage.getItem(ACTIVE_KEY);
    return (stored && list.find(s => s.id === stored)) ? stored : list[0].id;
  });

  const activeSession = sessions.find(s => s.id === activeId) ?? sessions[0];
  const messages = activeSession?.messages ?? [];

  // Chat state
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [complexity, setComplexity] = useState<Complexity>('medium');

  // Audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [playingProg, setPlayingProg] = useState<string | null>(null);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Saved flash
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tuningNotes = tuning?.notes ?? TUNINGS[0].notes;

  // Persist sessions
  useEffect(() => { saveSessions(sessions); }, [sessions]);
  useEffect(() => { try { localStorage.setItem(ACTIVE_KEY, activeId); } catch {} }, [activeId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Session helpers ──────────────────────────────────────────────────────────
  const updateSession = (id: string, updater: (s: MuseSession) => MuseSession) => {
    setSessions(prev => prev.map(s => s.id === id ? updater(s) : s));
  };

  const handleNewSession = () => {
    const s = newSession();
    setSessions(prev => [s, ...prev]);
    setActiveId(s.id);
  };

  const handleSwitchSession = (id: string) => setActiveId(id);

  const handleRenameSession = (id: string, name: string) => {
    if (name.trim()) updateSession(id, s => ({ ...s, name: name.trim() }));
  };

  const handleDeleteSession = (id: string) => {
    const filtered = sessions.filter(s => s.id !== id);
    if (filtered.length === 0) {
      const s = newSession();
      setSessions([s]);
      setActiveId(s.id);
    } else {
      setSessions(filtered);
      if (activeId === id) setActiveId(filtered[0].id);
    }
  };

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const session = activeSession;
    if (!session) return;

    const userMsg: ChatMessage = { role: 'user', text: text.trim() };
    const isFirstMsg = session.messages.length === 0;
    const autoName = text.trim().slice(0, 30) + (text.trim().length > 30 ? '…' : '');

    setSessions(prev => prev.map(s => s.id !== session.id ? s : {
      ...s,
      name: isFirstMsg ? autoName : s.name,
      messages: [...s.messages, userMsg, { role: 'assistant', text: '', loading: true }],
    }));

    setInput('');
    setLoading(true);

    const apiHistory = [...session.messages, userMsg]
      .filter(m => m.text.trim() && !m.loading && !m.error)
      .map(m => ({ role: m.role as 'user'|'assistant', content: m.text }));

    try {
      const raw = await callMuseAPI(apiHistory, complexity, tuning);
      const progressions = parseProgressions(raw);
      updateSession(session.id, s => ({
        ...s,
        messages: [
          ...s.messages.filter(m => !m.loading),
          { role: 'assistant', text: raw, progressions: progressions ?? undefined, error: progressions ? undefined : 'Could not parse response — please try again.' },
        ],
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      updateSession(session.id, s => ({
        ...s,
        messages: [...s.messages.filter(m => !m.loading), { role: 'assistant', text: '', error: `Error: ${msg}` }],
      }));
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  // ── Play progression ─────────────────────────────────────────────────────────
  const playProgression = (prog: AIProgression) => {
    if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const chordDuration = 2.2;
    setPlayingProg(prog.name);

    prog.chords.forEach((chordName, i) => {
      const { notes } = Chord.get(chordName);
      if (notes.length > 0) {
        playChordAudio(notes, ctx, ctx.currentTime + i * chordDuration, chordDuration - 0.15);
      }
    });

    playTimeoutRef.current = setTimeout(() => setPlayingProg(null), prog.chords.length * chordDuration * 1000);
  };

  const stopPlayback = () => {
    if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setPlayingProg(null);
  };

  // ── Save to library ──────────────────────────────────────────────────────────
  const saveProgression = (prog: AIProgression) => {
    onSaveSong(prog.name, prog.chords.map(makeChordObj));
    setSavedFlash(prev => ({ ...prev, [prog.name]: true }));
    setTimeout(() => setSavedFlash(prev => ({ ...prev, [prog.name]: false })), 2000);
  };

  // ── Explain / Variation ──────────────────────────────────────────────────────
  const explainProgression = (prog: AIProgression) => {
    const prompt = isRTL(prog.name)
      ? `הסבר לי למה הפרוגרסיה "${prog.name}" (${prog.chords.join(' - ')}) עובדת הרמונית. מה הקשר בין האקורדים?`
      : `Explain why the progression "${prog.name}" (${prog.chords.join(' - ')}) works harmonically. What's the relationship between the chords?`;
    sendMessage(prompt);
  };

  const requestVariation = (prog: AIProgression, type: string) => {
    const typeHe: Record<string, string> = { minor: 'מינורית יותר', jazz: "ג'אזית יותר", simple: 'פשוטה יותר' };
    const typeEn: Record<string, string> = { minor: 'more minor/darker', jazz: 'more jazzy', simple: 'simpler' };
    const prompt = isRTL(prog.name)
      ? `תן לי וריאציה ${typeHe[type]} של "${prog.name}": ${prog.chords.join(' - ')}`
      : `Give me a ${typeEn[type]} variation of "${prog.name}": ${prog.chords.join(' - ')}`;
    sendMessage(prompt);
  };

  // ── Navigate to Lyrics ────────────────────────────────────────────────────────
  const goToLyrics = (prog: AIProgression) => {
    onNavigateToLyrics?.(prog.key, prog.name);
  };


  const isEmpty = messages.length === 0;

  const COMPLEXITY_LABELS: Record<Complexity, string> = { simple: '🎸 פשוט', medium: '🎵 בינוני', complex: '🎶 מורכב' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'clamp(400px, 60vh, 700px)', gap: 10 }}>

      {/* ── Session bar ── */}
      <SessionSwitcher
        sessions={sessions}
        activeId={activeId}
        onSwitch={handleSwitchSession}
        onNew={handleNewSession}
        onRename={handleRenameSession}
        onDelete={handleDeleteSession}
      />

      {/* ── Chat area ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '2px 0' }}>

        {isEmpty && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: '24px 0' }}>
            <div style={{ fontSize: 36 }}>🔮</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>Muse — AI Progression Generator</div>
              <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>
                תאר כל וייב, אמן, שיר, סרט או תחושה.<br />
                Muse מבין בכל שפה.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%', maxWidth: 480 }}>
              {QUICK_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => sendMessage(p)}
                  style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgCard, color: T.textMuted, fontSize: 12, textAlign: 'right', direction: 'rtl', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.primarySoft; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.bgCard; e.currentTarget.style.color = T.textMuted; }}
                >{p}</button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => {
          if (msg.role === 'user') {
            const rtl = isRTL(msg.text);
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div dir={rtl ? 'rtl' : 'ltr'} style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: '14px 14px 4px 14px', background: T.primary, color: T.white, fontSize: 13, lineHeight: 1.5, textAlign: rtl ? 'right' : 'left' }}>{msg.text}</div>
              </div>
            );
          }
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {msg.loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.textMuted, fontSize: 13, padding: '8px 0' }}>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    {[0,1,2].map(d => <span key={d} style={{ width: 7, height: 7, borderRadius: '50%', background: T.secondary, display: 'inline-block', animation: `museBounce 1.2s ${d * 0.2}s ease-in-out infinite` }} />)}
                  </span>
                  מייצר פרוגרסיות…
                </div>
              )}
              {msg.error && <div style={{ padding: '10px 14px', borderRadius: 10, background: T.coralFaint, color: T.coral, fontSize: 13, border: `1px solid ${T.coralFaint2}` }}>⚠ {msg.error}</div>}
              {msg.progressions?.map((prog, j) => (
                <ProgressionCard
                  key={j}
                  prog={prog}
                  tuningNotes={tuningNotes}
                  onLoad={() => onLoadProgression(prog.chords.map(makeChordObj))}
                  onSave={() => saveProgression(prog)}
                  onExplain={() => explainProgression(prog)}
                  onVariation={type => requestVariation(prog, type)}
                  onNavigateToLyrics={onNavigateToLyrics ? () => goToLyrics(prog) : undefined}
                  isPlaying={playingProg === prog.name}
                  onPlay={() => playProgression(prog)}
                  onStop={stopPlayback}
                  justSaved={!!savedFlash[prog.name]}
                />
              ))}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Complexity selector ── */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {(['simple', 'medium', 'complex'] as Complexity[]).map(cx => (
          <button key={cx} onClick={() => setComplexity(cx)} style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${complexity === cx ? T.secondary : T.border}`, background: complexity === cx ? T.secondary + '22' : T.bgCard, color: complexity === cx ? T.secondary : T.textMuted, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
            {COMPLEXITY_LABELS[cx]}
          </button>
        ))}
      </div>

      {/* ── Input area ── */}
      <div style={{ ...card(), padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          placeholder="תאר וייב, אמן, שיר, מצב רוח… (Enter לשליחה)"
          rows={2}
          style={{ flex: 1, resize: 'none', border: 'none', background: 'transparent', color: T.text, fontSize: 13, lineHeight: 1.5, outline: 'none', fontFamily: 'system-ui, -apple-system, sans-serif', direction: isRTL(input) ? 'rtl' : 'ltr' }}
          disabled={loading}
        />
        <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
          style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: !input.trim() || loading ? T.border : T.primary, color: !input.trim() || loading ? T.textDim : T.white, fontSize: 18, cursor: !input.trim() || loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s', lineHeight: 1 }}
        >↑</button>
      </div>

      <style>{`
        @keyframes museBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
