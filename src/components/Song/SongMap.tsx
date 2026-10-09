import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, card } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { useSong } from '../../song/SongContext';
import { SECTION_NAMES, beatsPerBar, allChords, type Song } from '../../song/song';
import { listLocal, listCloud, removeLocal, removeCloud, mergeSongs, hasContent } from '../../song/library';
import type { SyncState } from '../../song/useSongSync';
import { keyName } from '../../utils/harmonicAnalysis';
import { formatChordName } from '../../utils/chordIdentifier';
import { playChord, unlockAudio, getSharedContext, getOutputNode, shapeKey } from '../../utils/audioPlayback';
import { exportMidi } from '../../utils/midiExport';
import { exportProgressionPDF } from '../../utils/pdfExport';
import { requestNavigate } from '../../services/navigate';
import { useSounding } from '../../motion/useSounding';

// ── Song map ─────────────────────────────────────────────────────────────────
// The whole song on one screen: its sections in order with their chords and
// variants, its melody, and every other song you have. Play the song through
// with a click, rearrange or rename sections, export it, or open another song.

interface Props {
  open: boolean;
  onClose: () => void;
  desktop?: boolean;
  userId: string | null;
  sync: SyncState;
}

export function SongMap({ open, onClose, desktop, userId, sync }: Props) {
  const { lang, rtl } = useLang();
  const he = lang === 'he';
  const api = useSong();
  const { song, tuning } = api;
  const sounding = useSounding();

  // ── Play the whole song, section by section, one bar per chord ────────────
  const [playingSec, setPlayingSec] = useState<string | null>(null);
  const [click, setClick] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stop = () => { timers.current.forEach(clearTimeout); timers.current = []; setPlayingSec(null); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const close = () => { stop(); onClose(); };

  const playSong = () => {
    if (playingSec) { stop(); return; }
    const beats = beatsPerBar(song.meter);
    const beatMs = (60 / song.bpm) * 1000 * (song.meter === '6/8' ? 0.5 : 1);
    const barMs = beatMs * beats;
    unlockAudio().then(() => {
      let t = 0;
      for (const sec of song.sections) {
        timers.current.push(setTimeout(() => setPlayingSec(sec.id), t));
        for (const item of sec.progression) {
          const at = t;
          timers.current.push(setTimeout(() => playChord(item.fretPositions, tuning.openFreqs, song.capo), at));
          if (click) for (let b = 0; b < beats; b++) timers.current.push(setTimeout(() => tick(b === 0), at + b * beatMs));
          t += barMs;
        }
      }
      timers.current.push(setTimeout(() => setPlayingSec(null), t + 200));
    });
  };

  // ── My songs ──────────────────────────────────────────────────────────────
  const [songs, setSongs] = useState<Song[]>([]);
  const [cloudNote, setCloudNote] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const local = listLocal();
    setSongs(mergeSongs(local, []));
    if (!userId) return;
    listCloud(userId)
      .then(cloud => { setSongs(mergeSongs(listLocal(), cloud)); setCloudNote(null); })
      .catch(() => setCloudNote(he ? 'הסנכרון לענן לא זמין כרגע — השירים שמורים במכשיר' : 'Cloud sync is unavailable right now — your songs are kept on this device'));
  }, [open, userId, he]);

  const deleteSong = (s: Song) => {
    if (!window.confirm(he ? `למחוק את "${s.title || 'שיר ללא שם'}"?` : `Delete "${s.title || 'Untitled song'}"?`)) return;
    removeLocal(s.id);
    if (userId) removeCloud(userId, s.id).catch(() => {});
    setSongs(xs => xs.filter(x => x.id !== s.id));
  };

  if (!open) return null;

  const t = he
    ? { title: 'מפת השיר', play: 'נגן את השיר', stop: 'עצור', click: 'קליק', sections: 'קטעים', add: 'הוסף קטע', copy: 'שכפל את הנוכחי',
        open: 'פתח', del: 'מחק', melody: 'מלודיה', noMelody: 'עדיין אין מלודיה — כתבו אחת ב-Tab Builder או הקליטו ב-Audio→Tab',
        tab: 'Tab Builder', harm: 'הרמוניה', mine: 'השירים שלי', newSong: 'שיר חדש', variant: 'גרסה', empty: 'אין אקורדים',
        sync: { local: 'שמור במכשיר', saving: 'שומר בענן…', cloud: 'שמור בענן ✓', error: 'לא נשמר בענן — שמור במכשיר' }, current: 'פתוח' }
    : { title: 'Song map', play: 'Play the song', stop: 'Stop', click: 'Click', sections: 'Sections', add: 'Add section', copy: 'Copy the current one',
        open: 'Open', del: 'Delete', melody: 'Melody', noMelody: 'No melody yet — write one in Tab Builder or record one with Audio→Tab',
        tab: 'Tab Builder', harm: 'Harmonize', mine: 'My songs', newSong: 'New song', variant: 'Variant', empty: 'No chords',
        sync: { local: 'Saved on this device', saving: 'Saving to the cloud…', cloud: 'Saved to the cloud ✓', error: 'Not saved to the cloud — kept on this device' }, current: 'open' };

  const melodyNotes = song.melody ? song.melody.grid.reduce((n, row) => n + row.filter(c => c.fret !== '').length, 0) : 0;
  const goTo = (id: string, tab: number, sub: string) => { close(); requestNavigate({ id, tab, sub }); };
  const btn: React.CSSProperties = {
    padding: '7px 12px', fontSize: 11, cursor: 'pointer', background: T.bgInput, color: T.text,
    border: `1px solid ${T.border}`, borderLeft: '3px solid var(--gc-bar-color)', borderRadius: 0,
  };
  const lbl: React.CSSProperties = { margin: 0, fontSize: 10, color: T.textDim, fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' };

  return createPortal(
    <div className="gc-fade-in" dir={rtl ? 'rtl' : 'ltr'} style={{
      position: 'fixed', inset: 0, zIndex: 9000, background: T.bgDeep, overflowY: 'auto', color: T.text, fontFamily: 'var(--gc-font)',
    }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: desktop ? '22px 40px 48px' : '14px 18px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={lbl}>{t.title}</p>
            <input value={song.title} onChange={e => api.update({ title: e.target.value })} dir="auto"
              placeholder={he ? 'שיר ללא שם' : 'Untitled song'}
              style={{ fontSize: desktop ? 26 : 20, fontWeight: 800, border: 'none', outline: 'none', background: 'transparent', color: T.text, fontFamily: 'inherit', width: '100%', padding: '2px 0' }} />
            <p dir="ltr" style={{ margin: '4px 0 0', fontSize: 12, color: T.textMuted, fontFamily: 'var(--gc-mono)' }}>
              {api.key ? keyName(api.key, lang) : '—'} · {song.bpm} BPM · {song.meter} · {tuning.label}{song.capo ? ` · capo ${song.capo}` : ''}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: T.textDim }}>{t.sync[sync]}</p>
          </div>
          <button onClick={close} aria-label="Close" style={{ width: 36, height: 36, flexShrink: 0, border: `1px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>

        {/* Transport + export */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={playSong} data-active={!!playingSec} disabled={!allChords(song).length} style={{
            ...btn, padding: '10px 18px', fontSize: 12.5, background: playingSec ? T.primary : T.text, color: T.bgDeep,
          }}>{playingSec ? `■ ${t.stop}` : `▶ ${t.play}`}</button>
          <button onClick={() => setClick(c => !c)} data-active={click} aria-pressed={click} style={{
            ...btn, background: click ? T.primary : T.bgInput, color: click ? T.white : T.text,
          }}>{t.click}</button>
          <span style={{ flex: 1 }} />
          <button onClick={() => exportMidi(allChords(song).map(c => c.chord.name), song.title || 'song', song.bpm)} disabled={!allChords(song).length} style={btn}>MIDI</button>
          <button onClick={() => exportProgressionPDF(song.title || 'Song', allChords(song))} disabled={!allChords(song).length} style={btn}>PDF</button>
        </div>

        {/* Sections */}
        <section>
          <p style={{ ...lbl, marginBottom: 10 }}>{t.sections}</p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: desktop ? 'repeat(auto-fill, minmax(260px, 1fr))' : '1fr' }}>
            {song.sections.map((sec, i) => {
              const active = sec.id === song.activeSection;
              const playing = sec.id === playingSec;
              return (
                <div key={sec.id} className="gc-list-in" style={{
                  ...card({ padding: 12 }), animationDelay: `${Math.min(i, 8) * 30}ms`,
                  outline: playing ? `2px solid var(--gc-success)` : active ? `2px solid ${T.text}` : 'none', outlineOffset: -2,
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--gc-mono)', fontSize: 10, color: T.textDim }}>{i + 1}</span>
                    <input value={sec.name} onChange={e => api.renameSection(sec.id, e.target.value)} aria-label="Section name"
                      style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, border: 'none', borderBottom: `1px dashed ${T.border}`, outline: 'none', background: 'transparent', color: T.text, fontFamily: 'inherit' }} />
                    <button onClick={() => api.moveSection(sec.id, -1)} disabled={i === 0} aria-label="Earlier" style={{ ...btn, padding: '4px 7px' }}>{rtl ? '→' : '←'}</button>
                    <button onClick={() => api.moveSection(sec.id, 1)} disabled={i === song.sections.length - 1} aria-label="Later" style={{ ...btn, padding: '4px 7px' }}>{rtl ? '←' : '→'}</button>
                  </div>
                  <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 26 }}>
                    {sec.progression.length === 0 && <span style={{ fontSize: 11.5, color: T.textDim }}>{t.empty}</span>}
                    {sec.progression.map(c => {
                      const now = sounding.shape(shapeKey(c.fretPositions));
                      return (
                        <span key={c.id} className="gc-notation" style={{
                          padding: '3px 8px', fontSize: 12.5, fontWeight: 700,
                          background: now ? T.primary : T.bgInput, color: now ? T.white : T.text,
                          transition: 'background-color var(--gc-dur-fast) var(--gc-ease-out)',
                        }}>{formatChordName(c.chord.name)}</span>
                      );
                    })}
                  </div>
                  {!!sec.variants?.length && (
                    <select value="" onChange={e => { api.selectSection(sec.id); api.useVariant(e.target.value); }}
                      style={{ appearance: 'none', padding: '5px 8px', fontSize: 11, border: `1px solid ${T.border}`, background: T.bgInput, color: T.text, borderRadius: 0 }}>
                      <option value="">{t.variant}: {he ? 'החלף ל…' : 'switch to…'} ({sec.variants.length})</option>
                      {sec.variants.map(v => <option key={v.id} value={v.id}>{v.name} — {v.progression.map(c => formatChordName(c.chord.name)).join(' ')}</option>)}
                    </select>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { api.selectSection(sec.id); close(); }} style={{ ...btn, flex: 1, background: active ? T.text : T.bgInput, color: active ? T.bgDeep : T.text }}>
                      {active ? `✓ ${t.current}` : t.open}
                    </button>
                    <button onClick={() => api.addSection(`${sec.name} 2`, sec.id)} style={btn}>{he ? 'שכפל' : 'Duplicate'}</button>
                    <button onClick={() => api.removeSection(sec.id)} disabled={song.sections.length < 2} style={btn}>{t.del}</button>
                  </div>
                </div>
              );
            })}

            {/* Add a section */}
            <div style={{ ...card({ padding: 12 }), display: 'flex', flexDirection: 'column', gap: 8, borderStyle: 'dashed' }}>
              <p style={lbl}>{t.add}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SECTION_NAMES.map(n => (
                  <button key={n} onClick={() => api.addSection(n)} style={btn}>+ {n}</button>
                ))}
              </div>
              <button onClick={() => api.addSection(`${api.section.name} 2`, api.section.id)} style={{ ...btn, alignSelf: 'flex-start' }}>{t.copy}</button>
            </div>
          </div>
        </section>

        {/* Melody */}
        <section style={{ ...card({ padding: 12 }), display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={lbl}>{t.melody}</p>
          <span style={{ fontSize: 12.5, color: song.melody ? T.text : T.textMuted, flex: 1, minWidth: 200 }}>
            {song.melody
              ? `${melodyNotes} ${he ? 'תווים' : 'notes'}${song.melodyFrom ? ` · ${he ? 'מ-' : 'from '}${({ tabbuilder: 'Tab Builder', harmonizer: 'Harmonize', audiotab: 'Audio→Tab' } as Record<string, string>)[song.melodyFrom] ?? song.melodyFrom}` : ''}`
              : t.noMelody}
          </span>
          <button onClick={() => goTo('tools:tabbuilder', 4, 'tabbuilder')} style={btn}>{t.tab}</button>
          <button onClick={() => goTo('voicings:harmonizer', 3, 'harmonizer')} style={btn}>{t.harm}</button>
        </section>

        {/* My songs */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <p style={lbl}>{t.mine}</p>
            <span style={{ flex: 1 }} />
            <button onClick={() => { api.newSong(); close(); }} style={{ ...btn, background: T.text, color: T.bgDeep }}>+ {t.newSong}</button>
          </div>
          {cloudNote && <p style={{ margin: '0 0 8px', fontSize: 11.5, color: T.textMuted }}>{cloudNote}</p>}
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: desktop ? 'repeat(auto-fill, minmax(260px, 1fr))' : '1fr' }}>
            {songs.filter(s => s.id !== song.id && hasContent(s)).map(s => (
              <div key={s.id} style={{ ...card({ padding: 12 }), display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || (he ? 'שיר ללא שם' : 'Untitled song')}</div>
                  <div dir="ltr" style={{ fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.sections.length} · {allChords(s).slice(0, 6).map(c => formatChordName(c.chord.name)).join(' ')}
                  </div>
                </div>
                <button onClick={() => { api.loadSong(s); close(); }} style={btn}>{t.open}</button>
                <button onClick={() => deleteSong(s)} aria-label={t.del} style={{ ...btn, padding: '7px 9px' }}>✕</button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}

/** One metronome click — accented on the downbeat. */
function tick(accent: boolean) {
  const ctx = getSharedContext();
  const t0 = ctx.currentTime + 0.01;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1100 : 880;
  gain.gain.setValueAtTime(accent ? 0.22 : 0.13, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
  osc.connect(gain); gain.connect(getOutputNode());
  osc.start(t0); osc.stop(t0 + 0.06);
}
