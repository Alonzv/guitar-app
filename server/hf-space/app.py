"""ScaleUp transcription server — torchcrepe pitch tracking + onset segmentation.

Replaces piano_transcription_inference: validated against a hand-written
ground-truth tab of a real iPhone guitar recording, crepe recovers the full
melody (including quiet opening notes the piano model missed entirely) and
measures actual frequency, making it immune to the octave/harmonic confusion
that plagued the piano model on phone recordings.
"""
import os
import subprocess
import tempfile
import traceback

import librosa
import numpy as np
import torch
import torchcrepe
from flask import Flask, request, jsonify

app = Flask(__name__)

SR = 16000
HOP = 160  # 10 ms frames

print('Loading crepe model (warm-up)...', flush=True)
_warm = torch.zeros(1, SR)
torchcrepe.predict(_warm, SR, hop_length=HOP, model='full', batch_size=512, device='cpu')
print('Model ready.', flush=True)


@app.after_request
def cors(r):
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers['Access-Control-Allow-Methods'] = 'POST,GET,OPTIONS'
    r.headers['Access-Control-Allow-Headers'] = '*'
    return r


def load_audio_ffmpeg(path: str, sr: int = SR) -> np.ndarray:
    out = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path,
         '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
        capture_output=True, check=True,
    )
    return np.frombuffer(out.stdout, dtype=np.float32).copy()


def transcribe_crepe(audio: np.ndarray) -> list:
    x = torch.from_numpy(audio)[None]
    f0, per = torchcrepe.predict(
        x, SR, hop_length=HOP, fmin=70.0, fmax=1200.0,
        model='full', batch_size=512, device='cpu', return_periodicity=True,
    )
    per = torchcrepe.filter.median(per, 5)[0].numpy()
    f0 = torchcrepe.filter.median(f0, 5)[0].numpy()

    # Strong re-attack onsets (for splitting repeated same-pitch notes)
    o_env = librosa.onset.onset_strength(y=audio, sr=SR, hop_length=HOP)
    on_frames = librosa.onset.onset_detect(
        y=audio, sr=SR, hop_length=HOP, backtrack=False, units='frames',
        delta=0.12, wait=4, pre_max=3, post_max=3, pre_avg=8, post_avg=8,
    )
    onset_set = {
        int(f) for f in on_frames
        if o_env[f] > 1.8 * np.median(o_env[max(0, f - 30):f + 30] + 1e-9)
    }

    n_frames = len(f0)
    frame_rms = np.array([
        np.sqrt((audio[i * HOP:(i + 1) * HOP] ** 2).mean()) for i in range(n_frames)
    ])

    # Global tuning offset so a slightly detuned guitar still quantizes right
    voiced = per > 0.55
    if not voiced.any():
        return []
    midi_voiced = 69 + 12 * np.log2(f0[voiced] / 440.0)
    offset_cents = float(np.median((midi_voiced - np.round(midi_voiced)) * 100))
    midi_all = 69 + 12 * np.log2(np.maximum(f0, 1e-6) / 440.0) - offset_cents / 100.0

    # Segment voiced frames into notes; split at strong onsets
    notes = []
    i = 0
    while i < n_frames:
        if per[i] > 0.55 and frame_rms[i] > 0.01:
            j = i
            pitches = [midi_all[i]]
            while (j + 1 < n_frames and per[j + 1] > 0.45
                   and abs(midi_all[j + 1] - np.median(pitches)) < 0.6
                   and (j + 1) not in onset_set):
                j += 1
                pitches.append(midi_all[j])
            dur = (j - i + 1) * HOP / SR
            if dur >= 0.10:
                notes.append({
                    'start': i * HOP / SR,
                    'end': (j + 1) * HOP / SR,
                    'midi': int(round(np.median(pitches))),
                    'amp': float(frame_rms[i:j + 1].max()),
                    'dur': dur,
                })
            i = j + 1
        else:
            i += 1

    # Drop transition glides: a short note 1-2 semitones from a longer neighbor
    clean = []
    for k, n in enumerate(notes):
        if n['dur'] < 0.14:
            nb = notes[k + 1] if k + 1 < len(notes) else (notes[k - 1] if k else None)
            if nb and nb['dur'] > n['dur'] * 1.5 and 0 < abs(nb['midi'] - n['midi']) <= 2:
                continue
        clean.append(n)

    amp_max = max((n['amp'] for n in clean), default=1.0) or 1.0
    results = []
    for n in clean:
        freq = 440.0 * (2 ** ((n['midi'] - 69) / 12.0))
        results.append({
            'startTime':  round(n['start'], 4),
            'endTime':    round(n['end'], 4),
            'midiNote':   n['midi'],
            'confidence': round(min(1.0, n['amp'] / amp_max), 3),
            'frequency':  round(freq, 3),
        })
    return results


@app.route('/')
@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'model': 'torchcrepe'})


@app.route('/transcribe', methods=['POST', 'OPTIONS'])
def transcribe():
    if request.method == 'OPTIONS':
        return '', 204
    if 'audio' not in request.files:
        return jsonify({'error': 'missing audio field'}), 400
    f = request.files['audio']
    ext = os.path.splitext(f.filename or 'audio.wav')[-1] or '.wav'
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        f.save(tmp.name)
        path = tmp.name
    try:
        print(f'[server] transcribing {f.filename} ({os.path.getsize(path)} bytes)...', flush=True)
        audio = load_audio_ffmpeg(path)
        if audio.size == 0:
            raise ValueError('decoded audio is empty — unsupported or corrupt file')
        notes = transcribe_crepe(audio)
        print(f'[server] done — {len(notes)} notes', flush=True)
        return jsonify({'notes': notes, 'count': len(notes)})
    except subprocess.CalledProcessError as e:
        msg = (e.stderr or b'').decode(errors='ignore')[:300]
        print(f'[server] ffmpeg ERROR: {msg}', flush=True)
        return jsonify({'error': f'audio decode failed: {msg}'}), 500
    except Exception as e:  # noqa: BLE001 — report any failure to the client
        traceback.print_exc()
        print(f'[server] ERROR: {e}', flush=True)
        return jsonify({'error': str(e)}), 500
    finally:
        os.unlink(path)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7860)
