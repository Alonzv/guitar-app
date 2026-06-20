import React, { useEffect, useRef, useState, useCallback } from 'react';
import { T } from '../../theme';
import {
  tabDataToAlphaTex, playSynth, stopSynth,
  type TabData, type DetectedNote,
} from '../../utils/audioToTab';
import { getSharedContext, unlockAudio } from '../../utils/audioPlayback';

interface Props {
  tabData:      TabData;
  notes:        DetectedNote[];
  originalUrl:  string | null;
  audioDuration: number;
}

const BTN: React.CSSProperties = {
  flex: 1, padding: '11px 8px', borderRadius: 0, fontSize: 13, fontWeight: 400,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  transition: 'background 0.15s, color 0.15s',
};

function PlayIcon()  { return <svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor"><path d="M3 2l11 6-11 6V2z"/></svg>; }
function PauseIcon() { return <svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor"><rect x="3" y="2" width="3" height="12" rx="1"/><rect x="10" y="2" width="3" height="12" rx="1"/></svg>; }

export const AlphaTabViewer: React.FC<Props> = ({ tabData, notes, originalUrl, audioDuration }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const origRef      = useRef<HTMLAudioElement | null>(null);
  const synthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rendered,   setRendered]   = useState(false);
  const [synthPlay,  setSynthPlay]  = useState(false);
  const [origPlay,   setOrigPlay]   = useState(false);

  // ── alphaTab — rendering ONLY (no soundfont / no built-in player) ─────────

  useEffect(() => {
    if (!containerRef.current) return;
    let dead = false;

    import('@coderline/alphatab').then((at) => {
      if (dead || !containerRef.current) return;

      const s = new at.Settings();
      s.core.engine               = 'svg';
      s.core.logLevel             = 0;
      s.player.enablePlayer       = false;   // ← rendering only, no soundfont needed
      s.display.layoutMode        = at.LayoutMode.Page;
      s.display.staveProfile      = at.StaveProfile.Tab;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = new at.AlphaTabApi(containerRef.current as HTMLElement, s) as any;
      api.renderFinished.on(() => { if (!dead) setRendered(true); });
      api.load(tabDataToAlphaTex(tabData));
    }).catch(e => console.error('[AlphaTabViewer] init failed:', e));

    return () => { dead = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabData]);

  // ── Original audio element (pre-loaded) ──────────────────────────────────

  useEffect(() => {
    if (!originalUrl) return;
    const el = new Audio(originalUrl);
    el.preload = 'auto';
    el.onended = () => setOrigPlay(false);
    el.onerror = () => setOrigPlay(false);
    origRef.current = el;
    return () => { el.pause(); el.src = ''; origRef.current = null; };
  }, [originalUrl]);

  // ── Synth stop helper ─────────────────────────────────────────────────────

  const stopSynthPlay = useCallback(() => {
    stopSynth();
    if (synthTimerRef.current) { clearTimeout(synthTimerRef.current); synthTimerRef.current = null; }
    setSynthPlay(false);
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────

  const handleOriginal = useCallback(() => {
    if (!originalUrl || !origRef.current) return;
    unlockAudio();
    if (synthPlay) stopSynthPlay();
    if (origPlay) {
      origRef.current.pause();
      setOrigPlay(false);
    } else {
      origRef.current.currentTime = 0;
      origRef.current.play()
        .then(() => setOrigPlay(true))
        .catch(e => console.error('[AlphaTabViewer] orig:', e));
    }
  }, [originalUrl, origPlay, synthPlay, stopSynthPlay]);

  const handleSynth = useCallback(() => {
    unlockAudio();
    if (origPlay) { origRef.current?.pause(); setOrigPlay(false); }
    if (synthPlay) { stopSynthPlay(); return; }
    if (notes.length === 0) return;

    const ctx = getSharedContext();
    const doPlay = () => {
      playSynth(notes, ctx);
      setSynthPlay(true);
      const dur = (audioDuration || 10) + 1.5;
      synthTimerRef.current = setTimeout(stopSynthPlay, dur * 1000);
    };

    if (ctx.state === 'running') doPlay();
    else ctx.resume().then(doPlay).catch(e => console.error('[AlphaTabViewer] ctx resume:', e));
  }, [notes, origPlay, synthPlay, audioDuration, stopSynthPlay]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Playback controls */}
      <div style={{ display: 'flex', gap: 10 }}>

        {/* Original */}
        {originalUrl && (
          <button onClick={handleOriginal} style={{
            ...BTN,
            background: origPlay ? T.primary : T.bgInput,
            color:      origPlay ? '#fff'    : T.textMuted,
            border:     origPlay ? 'none'    : `1px solid ${T.border}`,
          }}>
            {origPlay ? <PauseIcon /> : <PlayIcon />}
            מקורי
          </button>
        )}

        {/* Synth */}
        <button onClick={handleSynth} style={{
          ...BTN,
          background: synthPlay ? T.secondary : T.bgInput,
          color:      synthPlay ? '#fff'      : T.textMuted,
          border:     synthPlay ? 'none'      : `1px solid ${T.border}`,
        }}>
          {synthPlay ? <PauseIcon /> : <PlayIcon />}
          סינטיסייזר
        </button>
      </div>

      {/* alphaTab render container */}
      <div
        ref={containerRef}
        style={{
          borderRadius: 0, overflow: 'hidden', background: '#fff',
          minHeight: rendered ? undefined : 80,
          opacity: rendered ? 1 : 0.4,
          transition: 'opacity 0.3s',
        }}
      />
      {!rendered && (
        <p style={{ margin: 0, fontSize: 11, color: T.textMuted, textAlign: 'center' }}>
          מרנדר טאב…
        </p>
      )}
    </div>
  );
};
