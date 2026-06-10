FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg libsndfile1 wget && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Download the model checkpoint at build time so container restarts are fast
RUN python -c "from piano_transcription_inference import PianoTranscription; PianoTranscription(device='cpu', checkpoint_path=None)"

COPY --chown=user app.py .

EXPOSE 7860
CMD ["python", "app.py"]
