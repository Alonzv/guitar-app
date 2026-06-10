"""ScaleUp transcription server — Flask + piano_transcription_inference (CPU)."""
import os
import tempfile

from flask import Flask, request, jsonify
from piano_transcription_inference import PianoTranscription, sample_rate as PT_SR, load_audio

app = Flask(__name__)

print('Loading model...')
TRANSCRIPTOR = PianoTranscription(device='cpu', checkpoint_path=None)
print('Model loaded.')


@app.after_request
def cors(r):
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers['Access-Control-Allow-Methods'] = 'POST,GET,OPTIONS'
    r.headers['Access-Control-Allow-Headers'] = '*'
    return r


def transcribe_audio(audio_path: str):
    audio, _ = load_audio(audio_path, sr=PT_SR, mono=True)
    with tempfile.NamedTemporaryFile(suffix='.mid', delete=False) as tmp:
        result = TRANSCRIPTOR.transcribe(audio, tmp.name)
        os.unlink(tmp.name)
    return result['est_note_events']


def note_events_to_json(events) -> list:
    results = []
    for onset, offset, pitch, velocity in events:
        freq = 440.0 * (2 ** ((int(pitch) - 69) / 12.0))
        results.append({
            'startTime':  round(float(onset), 4),
            'endTime':    round(float(offset), 4),
            'midiNote':   int(pitch),
            'confidence': round(float(velocity) / 127.0, 3),
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
        print(f'[server] transcribing {f.filename} ({os.path.getsize(path)} bytes)...')
        events = transcribe_audio(path)
        notes = note_events_to_json(events)
        print(f'[server] done — {len(notes)} notes')
        return jsonify({'notes': notes, 'count': len(notes)})
    except Exception as e:  # noqa: BLE001 — report any failure to the client
        print(f'[server] ERROR: {e}')
        return jsonify({'error': str(e)}), 500
    finally:
        os.unlink(path)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7860)
