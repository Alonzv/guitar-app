import React, { useEffect, useRef, useState, useCallback } from 'react';
import { T } from '../../theme';
import { tabDataToAlphaTex, type TabData } from '../../utils/audioToTab';

interface Props {
  tabData: TabData;
  originalUrl: string | null;
}

const BTN: React.CSSProperties = {
  flex: 1, padding: '11px 6px', borderRadius: 10, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  border: 'none', transition: 'background 0.15s, color 0.15s',
};

export const AlphaTabViewer: React.FC<Props> = ({ tabData, originalUrl }) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const apiRef        = useRef<unknown>(null);
  const origRef       = useRef<HTMLAudioElement | null>(null);
  const [synthPlay,   setSynthPlay]   = useState(false);
  const [origPlay,    setOrigPlay]    = useState(false);
  const [sfReady,     setSfReady]     = useState(false);
  const [atReady,     setAtReady]     = useState(false);
  const [mode,        setMode]        = useState<'synth' | 'original'>('synth');

  // ── Init alphaTab ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;
    let dead = false;

    import('@coderline/alphatab').then((at) => {
      if (dead || !containerRef.current) return;

      const s = new at.Settings();
      s.core.engine                 = 'svg';
      s.core.logLevel               = 0; // Error only
      s.player.enablePlayer         = true;
      s.player.enableUserInteraction = false;
      s.player.soundFont            = '/sonivox.sf2';
      s.display.layoutMode          = at.LayoutMode.Page;
      s.display.staveProfile        = at.StaveProfile.Tab;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = new at.AlphaTabApi(containerRef.current as HTMLElement, s) as any;
      apiRef.current = api;

      api.soundFontLoaded.on(() => setSfReady(true));
      api.renderStarted.on(() => setAtReady(false));
      api.renderFinished.on(() => setAtReady(true));
      api.playerStateChanged.on((args: { state: number }) => {
        setSynthPlay(args.state === 1);
      });
      api.playerFinished.on(() => setSynthPlay(false));

      api.load(tabDataToAlphaTex(tabData));
    });

    return () => {
      dead = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (apiRef.current as any)?.destroy?.();
      apiRef.current = null;
    };
  // Run only once per tabData instance
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabData]);

  // ── Original audio element ───────────────────────────────────────────────

  useEffect(() => {
    if (!originalUrl) return;
    const el = new Audio(originalUrl);
    el.preload = 'auto';
    el.onended  = () => setOrigPlay(false);
    el.onerror  = () => setOrigPlay(false);
    origRef.current = el;
    return () => { el.pause(); el.src = ''; origRef.current = null; };
  }, [originalUrl]);

  // ── Controls ─────────────────────────────────────────────────────────────

  const stopAll = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = apiRef.current as any;
    if (synthPlay) { api?.stop?.(); setSynthPlay(false); }
    if (origPlay)  { origRef.current?.pause(); setOrigPlay(false); }
  }, [synthPlay, origPlay]);

  const handleSynth = useCallback(() => {
    if (!sfReady || !atReady) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = apiRef.current as any;
    if (origPlay) { origRef.current?.pause(); setOrigPlay(false); }
    setMode('synth');
    api?.playPause?.();
  }, [sfReady, atReady, origPlay]);

  const handleOriginal = useCallback(() => {
    if (!originalUrl || !origRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = apiRef.current as any;
    if (synthPlay) { api?.stop?.(); setSynthPlay(false); }
    setMode('original');
    if (origPlay) {
      origRef.current.pause();
      setOrigPlay(false);
    } else {
      origRef.current.currentTime = 0;
      origRef.current.play()
        .then(() => setOrigPlay(true))
        .catch(e => console.error('[AlphaTabViewer] orig play:', e));
    }
  }, [originalUrl, synthPlay, origPlay]);

  // ── Render ────────────────────────────────────────────────────────────────

  const synthActive = mode === 'synth' && synthPlay;
  const origActive  = mode === 'original' && origPlay;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Playback bar */}
      <div style={{ display: 'flex', gap: 10 }}>
        {/* Original */}
        {originalUrl && (
          <button onClick={handleOriginal} style={{
            ...BTN,
            background: origActive ? T.primary : T.bgInput,
            color: origActive ? '#fff' : T.textMuted,
            border: origActive ? 'none' : `1px solid ${T.border}`,
          }}>
            <svg viewBox="0 0 16 16" width={13} height={13} fill="currentColor">
              {origActive
                ? <><rect x="3" y="2" width="3" height="12" rx="1"/><rect x="10" y="2" width="3" height="12" rx="1"/></>
                : <path d="M3 2l11 6-11 6V2z"/>}
            </svg>
            מקורי
          </button>
        )}

        {/* Synth */}
        <button
          onClick={handleSynth}
          disabled={!sfReady || !atReady}
          title={!sfReady ? 'טוען SoundFont…' : !atReady ? 'מרנדר…' : undefined}
          style={{
            ...BTN,
            background: synthActive ? T.secondary : T.bgInput,
            color: synthActive ? '#fff' : (!sfReady || !atReady) ? T.textDim : T.textMuted,
            border: synthActive ? 'none' : `1px solid ${T.border}`,
            cursor: (!sfReady || !atReady) ? 'wait' : 'pointer',
            opacity: (!sfReady || !atReady) ? 0.7 : 1,
          }}
        >
          {(!sfReady || !atReady)
            ? <span style={{ fontSize: 11 }}>⏳</span>
            : (
              <svg viewBox="0 0 16 16" width={13} height={13} fill="currentColor">
                {synthActive
                  ? <><rect x="3" y="2" width="3" height="12" rx="1"/><rect x="10" y="2" width="3" height="12" rx="1"/></>
                  : <path d="M3 2l11 6-11 6V2z"/>}
              </svg>
            )
          }
          {!sfReady ? 'טוען…' : !atReady ? 'מכין…' : synthActive ? 'עצור' : 'נגן טאב'}
        </button>

        {/* Stop all */}
        {(synthPlay || origPlay) && (
          <button onClick={stopAll} style={{
            ...BTN, flex: 'none', padding: '11px 14px',
            background: T.bgInput, color: T.textMuted,
            border: `1px solid ${T.border}`,
          }}>
            <svg viewBox="0 0 16 16" width={13} height={13} fill="currentColor">
              <rect x="2" y="2" width="12" height="12" rx="2"/>
            </svg>
          </button>
        )}
      </div>

      {/* AlphaTab render target */}
      <div
        ref={containerRef}
        style={{
          borderRadius: 10, overflow: 'hidden',
          background: '#fff',
          minHeight: 120,
        }}
      />
    </div>
  );
};
