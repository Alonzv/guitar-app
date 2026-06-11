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

# Pre-download torchcrepe weights at build time so first request is fast
RUN python -c "import torch, torchcrepe; torchcrepe.predict(torch.zeros(1, 16000), 16000, hop_length=160, model='full', batch_size=512, device='cpu')"

COPY --chown=user app.py .

EXPOSE 7860
CMD ["python", "app.py"]
