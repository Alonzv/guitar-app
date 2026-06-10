---
title: ScaleUp Transcription Server
emoji: 🎸
colorFrom: green
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# ScaleUp Transcription Server

Permanent audio-to-notes transcription server for the ScaleUp guitar app,
powered by ByteDance's `piano_transcription_inference` model (96.7% note F1).

## Endpoints

- `GET /health` — returns `{"status": "ok"}` when the model is loaded
- `POST /transcribe` — multipart form with an `audio` file field; returns
  `{"notes": [{startTime, endTime, midiNote, confidence, frequency}], "count": n}`

## Deploying

Create a new **Docker** Space on Hugging Face and upload the three files in
this folder (`README.md`, `Dockerfile`, `requirements.txt`, `app.py`).
The Space URL (e.g. `https://username-scaleup-transcribe.hf.space`) is
permanent — paste it once into ScaleUp → Audio to Tab → ⚙️ Advanced.
