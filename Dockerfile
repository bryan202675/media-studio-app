FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install FFmpeg, Node.js, and CA certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create downloads folder
RUN mkdir -p /app/downloads

# Dynamic port for Render, Railway, Fly.io, Cloud Run
ENV PORT=5050
EXPOSE 5050

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-5050}"]
