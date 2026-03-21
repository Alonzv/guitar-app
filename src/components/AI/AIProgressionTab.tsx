import React, { useState, useRef, useEffect, useMemo } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import type { ChordInProgression, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { findChordVoicings } from '../../utils/chordVoicings';
import { TUNINGS } from '../../utils/musicTheory';
import { T, card } from '../../theme';

// ── Types ─────────────────────────────────────────────────────────────────────
interface AIProgression {
  name: string;
  description: string;
  key: string;
  chords: string[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  progressions?: AIProgression[];
  error?: string;
  loading?: boolean;
}

interface Props {
  onLoadProgression: (chords: ChordInProgression[]) => void;
  tuning?: Tuning;
}

// ── Anthropic client (browser / PWA fallback) ──────────────────────────────────
const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

// ── Detect Electron (IPC path) ─────────────────────────────────────────────────
type ElectronAPI = {
  callAnthropic: (p: {
    apiKey: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    systemPrompt: string;
  }) => Promise<{ content: Array<{ type: string; text: string }> }>;
};
const electronAPI = (
  typeof window !== 'undefined' && (window as { electronAPI?: ElectronAPI }).electronAPI
) as ElectronAPI | undefined;

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert music theorist, composer, and guitarist with encyclopedic knowledge of harmony, chord progressions, genre conventions, and cultural music references from around the world.

Your knowledge includes:
- All major Western genres: blues, rock, jazz, pop, country, metal, folk, classical, R&B, soul, funk, reggae, bossa nova, flamenco, and more
- Film and TV scores: Hans Zimmer, Ennio Morricone, John Williams, etc.
- Specific artists and their harmonic language across all eras and cultures
- Israeli music: Shlomo Artzi (Dorian/Aeolian rock), Arik Einstein (diatonic folk-pop), Idan Raichel (Ethiopian-influenced Dorian), Aviv Geffen (dark alternative), Ehud Banai, Berry Sakharof, Ethnix (Mizrahi/Hijaz scale), Yehoram Gaon (Mediterranean Am–F–E), and the general character of Israeli songs (harmonic minor cadences, Hijaz mode, Mediterranean colour)
- Middle Eastern, Balkan, and world music scales and modes

When the user describes a mood, vibe, artist, song, genre, movie, TV show, feeling, energy, decade, or any creative prompt — in any language — generate 3 distinct chord progression suggestions that authentically capture that vibe.

Return ONLY a JSON object — no markdown, no explanation outside the JSON:

{
  "progressions": [
    {
      "name": "Short evocative name (3-5 words)",
      "description": "2-3 sentences explaining the musical choices and why they capture the requested vibe.",
      "key": "Key signature (e.g. 'A minor', 'G major', 'E Dorian')",
      "chords": ["Am", "F", "C", "G"]
    }
  ]
}

Chord naming rules:
- Major: C, G, D (just root = major)
- Minor: Am, Em, Dm (m suffix)
- Dominant 7th: G7, E7
- Major 7th: Cmaj7, Fmaj7
- Minor 7th: Am7, Dm7
- Half-diminished: Bm7b5
- Suspended: Dsus4, Gsus2
- Added: Cadd9
- 4-8 chords per progression
- The 3 progressions must be musically distinct from each other
- Always respond with descriptions and chord names in English, regardless of what language the user writes in`;

const QUICK_PROMPTS = [
  'Dusty blues-country vibe — Far From Any Road (True Detective)',
  'Dark cinematic tension — Interstellar / Hans Zimmer',
  'Uplifting anthemic rock — stadium energy',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseProgressions(raw: string): AIProgression[] | null {
  try {
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed.progressions)) return parsed.progressions;
    return null;
  } catch {
    return null;
  }
}

function makeChordInProgression(name: string, idx: number): ChordInProgression {
  return {
    id: `ai-chord-${Date.now()}-${idx}`,
    chord: { name, notes: [], aliases: [] },
    fretPositions: [],
  };
}

// ── API call (IPC in Electron, SDK in browser) ─────────────────────────────────
async function callMuseAPI(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  if (electronAPI) {
    // Electron: route through main process (no CORS)
    const result = await electronAPI.callAnthropic({
      apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
      messages,
      systemPrompt: SYSTEM_PROMPT,
    });
    return result.content[0]?.type === 'text' ? result.content[0].text : '';
  }

  // Browser / PWA: Anthropic SDK (supports CORS natively)
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages,
  });
  return response.content[0]?.type === 'text' ? response.content[0].text : '';
}

// ── Chord pill with hover fretboard preview ────────────────────────────────────
const ChordPillWithPreview: React.FC<{ name: string; tuningNotes: string[] }> = ({ name, tuningNotes }) => {
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const voicings = useMemo(() => {
    if (!hovered) return [];
    return findChordVoicings(name, 1, tuningNotes);
  }, [hovered, name, tuningNotes]);

  return (
    <>
      <span
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseMove={e => setMousePos({ x: e.clientX, y: e.clientY })}
        style={{
          display: 'inline-block',
          padding: '4px 10px',
          borderRadius: 8,
          background: hovered ? T.primary : T.primarySoft,
          color: hovered ? T.white : T.primary,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.2px',
          cursor: 'default',
          transition: 'background 0.12s, color 0.12s',
          userSelect: 'none',
        }}
      >
        {name}
      </span>

      {hovered && (
        <div style={{
          position: 'fixed',
          left: mousePos.x + 14,
          top: mousePos.y - 120,
          zIndex: 9999,
          width: 210,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          padding: '8px 10px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, color: T.text, fontSize: 13, marginBottom: 6 }}>{name}</div>
          {voicings.length > 0
            ? <MiniFretboard voicing={voicings[0]} tuning={tuningNotes} dotColor={T.primary} />
            : <span style={{ color: T.textDim, fontSize: 11 }}>No voicing found</span>
          }
        </div>
      )}
    </>
  );
};

// ── Progression card ───────────────────────────────────────────────────────────
const ProgressionCard: React.FC<{
  prog: AIProgression;
  tuningNotes: string[];
  onLoad: () => void;
}> = ({ prog, tuningNotes, onLoad }) => (
  <div style={{ ...card(), padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{prog.name}</div>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>🎵 {prog.key}</div>
      </div>
      <button
        onClick={onLoad}
        style={{
          padding: '6px 14px', borderRadius: 8, border: 'none',
          background: T.secondary, color: T.white,
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          flexShrink: 0, whiteSpace: 'nowrap',
        }}
      >
        ← Load
      </button>
    </div>
    <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.55 }}>
      {prog.description}
    </p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {prog.chords.map((ch, i) => (
        <ChordPillWithPreview key={i} name={ch} tuningNotes={tuningNotes} />
      ))}
    </div>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────
export const AIProgressionTab: React.FC<Props> = ({ onLoadProgression, tuning }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tuningNotes = tuning?.notes ?? TUNINGS[0].notes;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', text: text.trim() };
    setMessages(prev => [...prev, userMsg, { role: 'assistant', text: '', loading: true }]);
    setInput('');
    setLoading(true);

    // Build clean API history (user messages + previous AI text responses)
    const apiHistory = [...messages, userMsg]
      .filter(m => m.text.trim())
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.text }));

    try {
      const raw = await callMuseAPI(apiHistory);
      const progressions = parseProgressions(raw);

      setMessages(prev => [
        ...prev.slice(0, -1),
        {
          role: 'assistant',
          text: raw,
          progressions: progressions ?? undefined,
          error: progressions ? undefined : 'Could not parse response — please try again.',
        },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', text: '', error: `Error: ${message}` },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'clamp(400px, 60vh, 700px)', gap: 12 }}>

      {/* ── Chat area ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '2px 0' }}>

        {/* Empty state */}
        {isEmpty && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: '24px 0' }}>
            <div style={{ fontSize: 36 }}>🔮</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>Muse — AI Progression Generator</div>
              <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>
                Describe any vibe, artist, song, film, or feeling.<br />
                Type in any language — Muse understands.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%', maxWidth: 480 }}>
              {QUICK_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(p)}
                  style={{
                    padding: '9px 14px', borderRadius: 10,
                    border: `1px solid ${T.border}`,
                    background: T.bgCard, color: T.textMuted,
                    fontSize: 12, textAlign: 'left', cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.primarySoft; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.bgCard; e.currentTarget.style.color = T.textMuted; }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => {
          if (msg.role === 'user') {
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  maxWidth: '80%', padding: '10px 14px',
                  borderRadius: '14px 14px 4px 14px',
                  background: T.primary, color: T.white,
                  fontSize: 13, lineHeight: 1.5,
                }}>
                  {msg.text}
                </div>
              </div>
            );
          }

          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {msg.loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.textMuted, fontSize: 13, padding: '8px 0' }}>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    {[0, 1, 2].map(d => (
                      <span key={d} style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: T.secondary, display: 'inline-block',
                        animation: `museBounce 1.2s ${d * 0.2}s ease-in-out infinite`,
                      }} />
                    ))}
                  </span>
                  Generating progressions...
                </div>
              )}
              {msg.error && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: T.coralFaint, color: T.coral,
                  fontSize: 13, border: `1px solid ${T.coralFaint2}`,
                }}>
                  ⚠ {msg.error}
                </div>
              )}
              {msg.progressions?.map((prog, j) => (
                <ProgressionCard
                  key={j}
                  prog={prog}
                  tuningNotes={tuningNotes}
                  onLoad={() => onLoadProgression(prog.chords.map(makeChordInProgression))}
                />
              ))}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div style={{ ...card(), padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe a vibe, artist, song, mood... (Enter to send)"
          rows={2}
          style={{
            flex: 1, resize: 'none', border: 'none',
            background: 'transparent', color: T.text,
            fontSize: 13, lineHeight: 1.5, outline: 'none',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
          disabled={loading}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: !input.trim() || loading ? T.border : T.primary,
            color: !input.trim() || loading ? T.textDim : T.white,
            fontSize: 18, cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.15s', lineHeight: 1,
          }}
          title="Send"
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
