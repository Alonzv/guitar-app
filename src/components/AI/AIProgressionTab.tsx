import React, { useState, useRef, useEffect } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import type { ChordInProgression } from '../../types/music';
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
}

// ── Anthropic client ───────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert music theorist, composer, and guitarist with encyclopedic knowledge of harmony, chord progressions, genre conventions, and cultural music references.

When the user describes a mood, vibe, artist, song, genre, movie, TV show, feeling, energy, decade, or any creative prompt, generate 3 distinct chord progression suggestions that authentically capture that vibe.

Return ONLY a JSON object — no markdown, no explanation outside the JSON:

{
  "progressions": [
    {
      "name": "Short evocative name (3-5 words)",
      "description": "2-3 sentences explaining the musical choices and why they capture the requested vibe.",
      "key": "Key signature (e.g. 'D minor', 'G major', 'E Dorian')",
      "chords": ["Am", "F", "C", "G"]
    }
  ]
}

Chord naming rules:
- Major: C, G, D (just root = major)
- Minor: Am, Em, Dm (lowercase m suffix)
- Dominant 7th: G7, A7, E7
- Major 7th: Cmaj7, Fmaj7
- Minor 7th: Am7, Dm7, Em7
- Half-diminished: Bm7b5
- Diminished: Bdim
- Suspended: Dsus4, Gsus2
- Added: Cadd9, Gadd9
- Augmented: Caug
- 4-8 chords per progression
- Make the 3 progressions musically distinct from each other
- Be specific and authentic to the cultural reference`;

const QUICK_PROMPTS = [
  'Blues country dusty vibe like Far From Any Road — True Detective',
  'Happy 90s pop — uplifting, radio-friendly',
  'Dark cinematic tension — Hans Zimmer / Interstellar',
  'Jazz bossa nova chill — café afternoon',
  'Classic rock anthem — stadium energy',
  'Dreamy indie shoegaze — hazy and emotional',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseProgressions(raw: string): AIProgression[] | null {
  try {
    // Strip markdown code fences if present
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

// ── Sub-components ─────────────────────────────────────────────────────────────
const ChordPill: React.FC<{ name: string }> = ({ name }) => (
  <span style={{
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 8,
    background: T.primarySoft,
    color: T.primary,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.2px',
  }}>{name}</span>
);

const ProgressionCard: React.FC<{
  prog: AIProgression;
  onLoad: () => void;
}> = ({ prog, onLoad }) => (
  <div style={{
    ...card(),
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  }}>
    {/* Header */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{prog.name}</div>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>🎵 {prog.key}</div>
      </div>
      <button
        onClick={onLoad}
        style={{
          padding: '6px 14px',
          borderRadius: 8,
          border: 'none',
          background: T.secondary,
          color: T.white,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        ← Load
      </button>
    </div>

    {/* Description */}
    <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.55 }}>
      {prog.description}
    </p>

    {/* Chord pills */}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {prog.chords.map((ch, i) => <ChordPill key={i} name={ch} />)}
    </div>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────
export const AIProgressionTab: React.FC<Props> = ({ onLoadProgression }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', text: text.trim() };
    const loadingMsg: ChatMessage = { role: 'assistant', text: '', loading: true };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setLoading(true);

    // Build conversation history for API (exclude loading placeholder)
    const history = [...messages, userMsg].map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.text || '',
    }));

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: history,
      });

      const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const progressions = parseProgressions(raw);

      setMessages(prev => [
        ...prev.slice(0, -1), // remove loading
        {
          role: 'assistant',
          text: raw,
          progressions: progressions ?? undefined,
          error: progressions ? undefined : 'Could not parse progressions — try again.',
        },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', text: '', error: `API error: ${message}` },
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'clamp(400px, 60vh, 700px)',
      gap: 12,
    }}>

      {/* ── Chat area ── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '2px 0',
      }}>
        {/* Empty state */}
        {isEmpty && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 16,
            padding: '24px 0',
          }}>
            <div style={{ fontSize: 36 }}>✨</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                AI Progression Generator
              </div>
              <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>
                תאר מצב רוח, אמן, שיר, סרט, תחושה — כל דבר.<br />
                ה-AI יכין לך רצפי אקורדים שמתאימים בדיוק.
              </div>
            </div>
            {/* Quick prompts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%', maxWidth: 480 }}>
              {QUICK_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(p)}
                  style={{
                    padding: '9px 14px',
                    borderRadius: 10,
                    border: `1px solid ${T.border}`,
                    background: T.bgCard,
                    color: T.textMuted,
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = T.primarySoft;
                    e.currentTarget.style.color = T.text;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = T.bgCard;
                    e.currentTarget.style.color = T.textMuted;
                  }}
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
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: '14px 14px 4px 14px',
                  background: T.primary,
                  color: T.white,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}>
                  {msg.text}
                </div>
              </div>
            );
          }

          // Assistant message
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {msg.loading && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: T.textMuted,
                  fontSize: 13,
                  padding: '8px 0',
                }}>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    {[0, 1, 2].map(d => (
                      <span
                        key={d}
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: T.secondary,
                          display: 'inline-block',
                          animation: `bounce 1.2s ${d * 0.2}s ease-in-out infinite`,
                        }}
                      />
                    ))}
                  </span>
                  Generating progressions...
                </div>
              )}
              {msg.error && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: T.coralFaint,
                  color: T.coral,
                  fontSize: 13,
                  border: `1px solid ${T.coralFaint2}`,
                }}>
                  ⚠ {msg.error}
                </div>
              )}
              {msg.progressions && msg.progressions.map((prog, j) => (
                <ProgressionCard
                  key={j}
                  prog={prog}
                  onLoad={() => onLoadProgression(prog.chords.map(makeChordInProgression))}
                />
              ))}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div style={{
        ...card(),
        padding: '10px 12px',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
      }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="תאר וייב, שיר, אמן, מצב רוח... (Enter לשליחה)"
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            background: 'transparent',
            color: T.text,
            fontSize: 13,
            lineHeight: 1.5,
            outline: 'none',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
          disabled={loading}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: !input.trim() || loading ? T.border : T.primary,
            color: !input.trim() || loading ? T.textDim : T.white,
            fontSize: 18,
            cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s',
            lineHeight: 1,
          }}
          title="Send"
        >
          ↑
        </button>
      </div>

      {/* Bounce animation */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
