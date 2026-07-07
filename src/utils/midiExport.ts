import { Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';

// ── Variable-length quantity encoding ────────────────────────────────────────

function encodeVLQ(value: number): number[] {
  if (value < 0) value = 0;
  const bytes: number[] = [];
  bytes.push(value & 0x7f);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes.reverse();
}

// ── Write 32-bit big-endian ───────────────────────────────────────────────────

function uint32BE(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

// ── Write 16-bit big-endian ───────────────────────────────────────────────────

function uint16BE(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

// ── Chord to MIDI notes ───────────────────────────────────────────────────────

function chordToMidiNotes(chordName: string): number[] {
  const info = TonalChord.get(chordName);
  if (!info || info.notes.length === 0) return [];

  // Root in octave 3: C3 = MIDI 48
  const rootPc = TonalNote.chroma(info.notes[0]);
  if (rootPc == null) return [];

  // C3 = midi 48, which is chroma 0. So root midi = 48 + rootPc
  // (chroma 0 = C, 1 = C#, ..., 11 = B)
  const rootMidi = 48 + rootPc;

  const midiNotes: number[] = [rootMidi];

  // Voice remaining notes ascending above root
  let prevMidi = rootMidi;
  for (let i = 1; i < info.notes.length; i++) {
    const pc = TonalNote.chroma(info.notes[i]);
    if (pc == null) continue;

    // Find next occurrence of this pitch class at or above prevMidi
    let candidate = 48 + pc; // start from octave 3
    // Step up by octave until candidate > prevMidi
    while (candidate <= prevMidi) {
      candidate += 12;
    }
    // Keep within reasonable range (cap at midi 84 = C6)
    if (candidate > 84) candidate -= 12;

    midiNotes.push(candidate);
    prevMidi = candidate;
  }

  return midiNotes;
}

// ── Build MIDI track bytes ────────────────────────────────────────────────────

function buildTrack(chords: string[], bpm: number): number[] {
  const PPQ = 480;
  const beatsPerChord = 2;
  const ticksPerChord = PPQ * beatsPerChord;

  const events: number[] = [];

  // Tempo meta event: FF 51 03 tt tt tt
  const microsPerBeat = Math.round(60_000_000 / bpm);
  events.push(
    ...encodeVLQ(0), // delta time 0
    0xff, 0x51, 0x03,
    (microsPerBeat >>> 16) & 0xff,
    (microsPerBeat >>> 8) & 0xff,
    microsPerBeat & 0xff,
  );

  // Program change to piano (channel 0, program 0)
  events.push(
    ...encodeVLQ(0), // delta time 0
    0xc0, 0x00, // program change channel 0, program 0
  );

  for (const chordName of chords) {
    const notes = chordToMidiNotes(chordName);
    const velocity = 80;

    if (notes.length === 0) {
      // Silence for this chord (advance time with no notes)
      // We'll just advance time at the next event
      // Insert a dummy meta text event with the chord duration
      // Actually just skip — the next note-on will have accumulated delta
      // We need to track accumulated silence
      // Simple approach: add a note-on for middle C at velocity 0 (note off) won't work
      // Use a meta event with delta = ticksPerChord
      // Actually the cleanest: use running status approach — just emit note-on/off for nothing
      // We'll accumulate delta by writing a no-op meta event
      events.push(...encodeVLQ(ticksPerChord), 0xff, 0x01, 0x00); // text meta with empty text
      continue;
    }

    // Note ON for all notes at delta 0 (first note uses 0 delta, rest also 0)
    events.push(...encodeVLQ(0)); // delta 0 for first note-on
    events.push(0x90, notes[0], velocity);
    for (let i = 1; i < notes.length; i++) {
      events.push(...encodeVLQ(0));
      events.push(0x90, notes[i], velocity);
    }

    // Note OFF for all notes after ticksPerChord ticks
    // First note-off gets the full duration delta, rest get 0
    events.push(...encodeVLQ(ticksPerChord));
    events.push(0x80, notes[0], 0);
    for (let i = 1; i < notes.length; i++) {
      events.push(...encodeVLQ(0));
      events.push(0x80, notes[i], 0);
    }
  }

  // End of track
  events.push(...encodeVLQ(0), 0xff, 0x2f, 0x00);

  return events;
}

// ── Timed-notes export (Audio→Tab transcriptions) ────────────────────────────

interface TimedNote { startTime: number; endTime: number; midiNote: number; }

export function exportNotesMidi(notes: TimedNote[], filename = 'transcription.mid', bpm = 120): void {
  const PPQ = 480;
  const ticksPerSec = (PPQ * bpm) / 60;

  // Flatten to absolute-tick on/off events, then sort
  const evts: { tick: number; on: boolean; note: number }[] = [];
  for (const n of notes) {
    const t0 = Math.max(0, Math.round(n.startTime * ticksPerSec));
    const t1 = Math.max(t0 + 1, Math.round(n.endTime * ticksPerSec));
    evts.push({ tick: t0, on: true, note: n.midiNote });
    evts.push({ tick: t1, on: false, note: n.midiNote });
  }
  // Offs before ons at the same tick so repeated notes re-trigger cleanly
  evts.sort((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on));

  const trackData: number[] = [];
  const microsPerBeat = Math.round(60_000_000 / bpm);
  trackData.push(
    ...encodeVLQ(0), 0xff, 0x51, 0x03,
    (microsPerBeat >>> 16) & 0xff, (microsPerBeat >>> 8) & 0xff, microsPerBeat & 0xff,
  );
  // Program 25 = acoustic guitar (steel)
  trackData.push(...encodeVLQ(0), 0xc0, 0x19);

  let prevTick = 0;
  for (const e of evts) {
    trackData.push(...encodeVLQ(e.tick - prevTick));
    trackData.push(e.on ? 0x90 : 0x80, e.note & 0x7f, e.on ? 90 : 0);
    prevTick = e.tick;
  }
  trackData.push(...encodeVLQ(0), 0xff, 0x2f, 0x00);

  const header = [
    0x4d, 0x54, 0x68, 0x64, ...uint32BE(6),
    ...uint16BE(0), ...uint16BE(1), ...uint16BE(PPQ),
  ];
  const track = [0x4d, 0x54, 0x72, 0x6b, ...uint32BE(trackData.length), ...trackData];

  const blob = new Blob([new Uint8Array([...header, ...track])], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Main export ───────────────────────────────────────────────────────────────

export function exportMidi(chords: string[], filename = 'progression', bpm = 120): void {
  const PPQ = 480;

  const trackData = buildTrack(chords, bpm);

  // MIDI file header chunk: MThd
  const header: number[] = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    ...uint32BE(6),          // chunk length = 6
    ...uint16BE(0),          // format 0 (single track)
    ...uint16BE(1),          // 1 track
    ...uint16BE(PPQ),        // PPQ = 480
  ];

  // Track chunk: MTrk
  const track: number[] = [
    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
    ...uint32BE(trackData.length),
    ...trackData,
  ];

  const allBytes = new Uint8Array([...header, ...track]);
  const blob = new Blob([allBytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);

  const safe = filename.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'progression';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.mid`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoke after a short delay to allow the download to start
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
