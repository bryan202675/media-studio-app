# Media Studio

Minimalist, high-performance media downloader for YouTube and TikTok. Built with FastAPI, yt-dlp, native FFmpeg, and an Apple-inspired responsive interface.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/bryan202675/media-studio-app)

## Features

- **YouTube HD & 4K**: Native H.264 + AAC MP4 remuxing with faststart for 100% universal compatibility across iOS (iPhone/iPad QuickTime), macOS (Finder Quick Look), Windows, Android, and Linux.
- **Audio Extraction**: Studio-quality MP3 320 kbps, M4A AAC, and Lossless WAV.
- **TikTok Without Watermark**: Original HD video stream extraction with zero compression loss.
- **Dual Architecture**:
  - **Frontend / Serverless**: Deployed on Vercel (`https://media-studio-pro.vercel.app`).
  - **Dedicated Backend**: Containerized with full FFmpeg (`Dockerfile`, `render.yaml`, `railway.json`) for processing unlimited file sizes without serverless payload limits.
- **Dynamic Backend Switching**: The frontend allows configuring and switching between the cloud serverless function, a dedicated cloud backend on Render/Railway, or a local server.

## Live Deployments

- **Web App**: [https://media-studio-pro.vercel.app](https://media-studio-pro.vercel.app)
- **Secondary Domain**: [https://media-studio-downloader.vercel.app](https://media-studio-downloader.vercel.app)

---

## Deploying Your Own Dedicated Backend (Unlimited Sizes)

### 1-Click Deploy on Render (Free)
Click the button below to deploy your own containerized backend with full FFmpeg:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/bryan202675/media-studio-app)

Once deployed, copy your Render URL (e.g. `https://media-studio-backend-xxxx.onrender.com`) and paste it into the **Servidor** settings in the web app.

### Run with Docker

```bash
docker build -t media-studio .
docker run -p 5050:5050 media-studio
```

### Run Locally

```bash
# Clone the repository
git clone https://github.com/bryan202675/media-studio-app.git
cd media-studio-app

# Setup environment & run
./run.sh
```

App will be available at `http://localhost:5050`.
