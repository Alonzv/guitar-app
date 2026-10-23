import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../../theme';
import { Pill, Cta, Rule } from '../Transit/parts';
import { pillStyle } from '../Transit/styles';
import { PosterInput } from '../Tabs/PosterInput';
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
        open: 'פתח', del: 'מחק', melody: 'מלודיה', noMelody: 'עדיין אין מלודיה — כתבו אחת בכתיבת טאבים או הקליטו באודיו לטאב',
        tab: 'כתיבת טאבים', harm: 'הרמוניה', mine: 'השירים שלי', newSong: 'שיר חדש', variant: 'גרסה', empty: 'אין אקורדים',
        sync: { local: 'שמור במכשיר', saving: 'שומר בענן…', cloud: 'שמור בענן ✓', error: 'לא נשמר בענן — שמור במכשיר' }, current: 'פתוח' }
    : { title: 'Song map', play: 'Play the song', stop: 'Stop', click: 'Click', sections: 'Sections', add: 'Add section', copy: 'Copy the current one',
        open: 'Open', del: 'Delete', melody: 'Melody', noMelody: 'No melody yet — write one at Tab Writer or record one at Audio → Tab',
        tab: 'Tab Writer', harm: 'Harmonize', mine: 'My songs', newSong: 'New song', variant: 'Variant', empty: 'No chords',
        sync: { local: 'Saved on this device', saving: 'Saving to the cloud…', cloud: 'Saved to the cloud ✓', error: 'Not saved to the cloud — kept on this device' }, current: 'open' };

  const melodyNotes = song.melody ? song.melody.grid.reduce((n, row) => n + row.filter(c => c.fret !== '').length, 0) : 0;
  const goTo = (stop: string) => { close(); requestNavigate({ stop }); };
  const round: React.CSSProperties = { padding: 0, width: 44 };
  const noChords = !allChords(song).length;

  return createPortal(
    <div className="gc-fade-in" role="dialog" aria-modal="true" aria-label={t.title} dir={rtl ? 'rtl' : 'ltr'} style={{
      position: 'fixed', inset: 0, zIndex: 9000, background: T.bgDeep, overflowY: 'auto', color: T.text, fontFamily: 'var(--gc-font)',
    }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: desktop ? '22px 40px 48px' : '14px 20px 32px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="su-label" style={{ display: 'block', marginBottom: 12 }}>{t.title}</span>
            <PosterInput value={song.title} onChange={v => api.update({ title: v })}
              placeholder={he ? 'שיר ללא שם' : 'Untitled song'} label={he ? 'שם השיר' : 'Song title'}
              max={desktop ? 130 : 64} min={30} />
            <p dir="ltr" style={{ margin: '12px 0 0', fontSize: 12, fontWeight: 700, fontFamily: 'var(--gc-mono)', letterSpacing: '0.06em', textAlign: rtl ? 'right' : 'left' }}>
              {api.key ? keyName(api.key, lang) : '—'} · {song.bpm} BPM · {song.meter} · {tuning.label}{song.capo ? ` · capo ${song.capo}` : ''}
            </p>
            <p className="su-label" style={{ margin: '6px 0 0' }}>{t.sync[sync]}</p>
          </div>
          <Pill onClick={close} label={he ? 'סגירה' : 'Close'} style={round}>✕</Pill>
        </div>

        {/* Transport + export */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {playingSec
            ? <Pill active onClick={playSong}>■ {t.stop}</Pill>
            : <Cta onClick={playSong} disabled={noChords}>▶ {t.play}</Cta>}
          <Pill active={click} onClick={() => setClick(c => !c)}>{t.click}</Pill>
          <span style={{ flex: 1 }} />
          <Pill onClick={() => exportMidi(allChords(song).map(c => c.chord.name), song.title || 'song', song.bpm)} disabled={noChords}>MIDI</Pill>
          <Pill onClick={() => exportProgressionPDF(song.title || 'Song', allChords(song))} disabled={noChords}>PDF</Pill>
        </div>

        {/* Sections */}
        <section>
          <span className="su-label" style={{ display: 'block', marginBottom: 10 }}>{t.sections}</span>
          <div style={{ display: 'grid', gap: desktop ? 24 : 18, gridTemplateColumns: desktop ? 'repeat(auto-fill, minmax(280px, 1fr))' : '1fr' }}>
            {song.sections.map((sec, i) => {
              const active = sec.id === song.activeSection;
              const playing = sec.id === playingSec;
              return (
                <div key={sec.id} className="gc-list-in" style={{
                  animationDelay: `${Math.min(i, 8) * 30}ms`,
                  borderTop: `${active ? 5 : 2}px solid ${T.text}`, paddingTop: 10,
                  display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="su-label" style={{ minWidth: 18 }}>{String(i + 1).padStart(2, '0')}</span>
                    <input value={sec.name} onChange={e => api.renameSection(sec.id, e.target.value)} aria-label={he ? 'שם הקטע' : 'Section name'} dir="auto"
                      className="su-semi"
                      style={{ flex: 1, minWidth: 0, fontSize: 22, textTransform: 'uppercase', border: 'none', borderBottom: `1px solid ${T.hairline}`, outline: 'none', background: 'transparent', color: T.text, padding: '2px 0' }} />
                    {playing && <span className="su-label" style={{ color: T.text }}>▶</span>}
                    <Pill size="sm" onClick={() => api.moveSection(sec.id, -1)} disabled={i === 0} label={he ? 'מוקדם יותר' : 'Earlier'} style={{ padding: 0 }}>{rtl ? '→' : '←'}</Pill>
                    <Pill size="sm" onClick={() => api.moveSection(sec.id, 1)} disabled={i === song.sections.length - 1} label={he ? 'מאוחר יותר' : 'Later'} style={{ padding: 0 }}>{rtl ? '←' : '→'}</Pill>
                  </div>
                  <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 30 }}>
                    {sec.progression.length === 0 && <span className="su-label" style={{ alignSelf: 'center' }}>{t.empty}</span>}
                    {sec.progression.map(c => {
                      const now = sounding.shape(shapeKey(c.fretPositions));
                      return (
                        <span key={c.id} className="gc-notation" style={{
                          height: 30, padding: '0 10px', display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 700,
                          borderRadius: 'var(--su-pill)', border: `1.5px solid ${now ? T.primary : T.text}`,
                          background: now ? T.primary : 'transparent', color: now ? T.onPrimary : T.text,
                          transition: 'background-color var(--gc-dur-fast) var(--gc-ease-out)',
                        }}>{formatChordName(c.chord.name)}</span>
                      );
                    })}
                  </div>
                  {!!sec.variants?.length && (
                    <select value="" onChange={e => { api.selectSection(sec.id); api.useVariant(e.target.value); }} aria-label={t.variant}
                      style={{ ...pillStyle(false, 'sm'), appearance: 'none', WebkitAppearance: 'none', alignSelf: 'flex-start', maxWidth: '100%', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400 }}>
                      <option value="">{t.variant}: {he ? 'החלף ל…' : 'switch to…'} ({sec.variants.length})</option>
                      {sec.variants.map(v => <option key={v.id} value={v.id}>{v.name} — {v.progression.map(c => formatChordName(c.chord.name)).join(' ')}</option>)}
                    </select>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Pill size="sm" active={active} onClick={() => { api.selectSection(sec.id); close(); }} style={{ flex: 1 }}>
                      {active ? `✓ ${t.current}` : t.open}
                    </Pill>
                    <Pill size="sm" onClick={() => api.addSection(`${sec.name} 2`, sec.id)}>{he ? 'שכפל' : 'Duplicate'}</Pill>
                    <Pill size="sm" onClick={() => api.removeSection(sec.id)} disabled={song.sections.length < 2}>{t.del}</Pill>
                  </div>
                </div>
              );
            })}

            {/* Add a section */}
            <div style={{ border: `var(--su-rule) dashed ${T.text}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="su-label">{t.add}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SECTION_NAMES.map(n => (
                  <Pill key={n} size="sm" onClick={() => api.addSection(n)}>+ {n}</Pill>
                ))}
              </div>
              <Pill size="sm" onClick={() => api.addSection(`${api.section.name} 2`, api.section.id)} style={{ alignSelf: 'flex-start' }}>{t.copy}</Pill>
            </div>
          </div>
        </section>

        {/* Melody */}
        <Rule label={t.melody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: song.melody ? T.text : T.textMuted, flex: 1, minWidth: 200, lineHeight: 1.5 }}>
              {song.melody
                ? `${melodyNotes} ${he ? 'תווים' : 'notes'}${song.melodyFrom ? ` · ${he ? 'מ-' : 'from '}${({ tabbuilder: 'Tab Writer', harmonizer: 'Harmonize', audiotab: 'Audio → Tab' } as Record<string, string>)[song.melodyFrom] ?? song.melodyFrom}` : ''}`
                : t.noMelody}
            </span>
            <Pill size="sm" onClick={() => goTo('tab-writer')}>{t.tab}</Pill>
            <Pill size="sm" onClick={() => goTo('harmonize')}>{t.harm}</Pill>
          </div>
        </Rule>

        {/* My songs */}
        <Rule label={t.mine} right={<Pill size="sm" active onClick={() => { api.newSong(); close(); }}>+ {t.newSong}</Pill>}>
          {cloudNote && <p style={{ margin: '0 0 8px', fontSize: 11.5, color: T.textMuted }}>{cloudNote}</p>}
          <div style={{ display: 'grid', columnGap: 24, gridTemplateColumns: desktop ? 'repeat(auto-fill, minmax(280px, 1fr))' : '1fr' }}>
            {songs.filter(s => s.id !== song.id && hasContent(s)).map(s => (
              <div key={s.id} style={{ borderTop: `1px solid ${T.hairline}`, padding: '10px 0', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="su-semi" dir="auto" style={{ fontSize: 19, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || (he ? 'שיר ללא שם' : 'Untitled song')}</div>
                  <div dir="ltr" style={{ fontSize: 11, color: T.textMuted, fontFamily: 'var(--gc-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>
                    {s.sections.length} · {allChords(s).slice(0, 6).map(c => formatChordName(c.chord.name)).join(' ')}
                  </div>
                </div>
                <Pill size="sm" onClick={() => { api.loadSong(s); close(); }}>{t.open}</Pill>
                <Pill size="sm" onClick={() => deleteSong(s)} label={t.del} style={{ padding: 0 }}>✕</Pill>
              </div>
            ))}
          </div>
        </Rule>
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
