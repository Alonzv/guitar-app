"""ScaleUp transcription server — Flask + piano_transcription_inference (CPU)."""
import os
import subprocess
import tempfile
import traceback

import numpy as np
from flask import Flask, request, jsonify
from piano_transcription_inference import PianoTranscription, sample_rate as PT_SR

app = Flask(__name__)

print('Loading model...', flush=True)
TRANSCRIPTOR = PianoTranscription(device='cpu', checkpoint_path=None)
print('Model loaded.', flush=True)


@app.after_request
def cors(r):
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers['Access-Control-Allow-Methods'] = 'POST,GET,OPTIONS'
    r.headers['Access-Control-Allow-Headers'] = '*'
    return r


def load_audio_ffmpeg(path: str, sr: int = PT_SR) -> np.ndarray:
    """Decode any audio format to mono float32 at the target rate.

    The library's own load_audio uses a librosa internal API that was
    removed in librosa >= 0.10, so we decode with ffmpeg directly.
    """
    out = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path,
         '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
        capture_output=True, check=True,
    )
    return np.frombuffer(out.stdout, dtype=np.float32)


def transcribe_audio(audio_path: str):
    audio = load_audio_ffmpeg(audio_path)
    if audio.size == 0:
        raise ValueError('decoded audio is empty — unsupported or corrupt file')
    with tempfile.NamedTemporaryFile(suffix='.mid', delete=False) as tmp:
        result = TRANSCRIPTOR.transcribe(audio, tmp.name)
        os.unlink(tmp.name)
    return result['est_note_events']


def note_events_to_json(events) -> list:
    """est_note_events is a list of dicts: onset_time, offset_time, midi_note, velocity."""
    results = []
    for ev in events:
        pitch = int(ev['midi_note'])
        freq = 440.0 * (2 ** ((pitch - 69) / 12.0))
        results.append({
            'startTime':  round(float(ev['onset_time']), 4),
            'endTime':    round(float(ev['offset_time']), 4),
            'midiNote':   pitch,
            'confidence': round(float(ev['velocity']) / 127.0, 3),
            'frequency':  round(freq, 3),
        })
    results.sort(key=lambda n: n['startTime'])
    return results


@app.route('/')
@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'model': 'piano_transcription'})


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
        events = transcribe_audio(path)
        notes = note_events_to_json(events)
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
