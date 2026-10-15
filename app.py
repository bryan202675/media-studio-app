import os
import sys
import uuid
import time
import subprocess
import threading
from typing import Dict, Any, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp
import json
import re
import urllib.request
import urllib.parse

BASE_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
DOWNLOADS_DIR.mkdir(exist_ok=True)

FFMPEG_PATH = "/usr/local/bin/ffmpeg" if os.path.exists("/usr/local/bin/ffmpeg") else "ffmpeg"
NODE_PATH = "/usr/local/bin/node" if os.path.exists("/usr/local/bin/node") else None

app = FastAPI(title="YouTube High-Quality Downloader API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job tracker
jobs: Dict[str, Dict[str, Any]] = {}
jobs_lock = threading.Lock()

class InfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_type: str  # e.g., 'mp4-best', 'mp4-1080', 'mp4-720', 'mp4-480', 'mp3-320', 'mp3-192', 'm4a', 'wav', 'webm'

def get_base_ydl_opts() -> dict:
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "ffmpeg_location": FFMPEG_PATH,
    }
    if NODE_PATH:
        opts["js_runtimes"] = {"node": {"path": NODE_PATH}}
    return opts

def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "Desconocido"
    mins, secs = divmod(seconds, 60)
    hours, mins = divmod(mins, 60)
    if hours > 0:
        return f"{hours:02d}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"

def format_views(views: Optional[int]) -> str:
    if not views:
        return "N/A"
    if views >= 1_000_000:
        return f"{views / 1_000_000:.1f}M vistas"
    if views >= 1_000:
        return f"{views / 1_000:.1f}K vistas"
    return f"{views} vistas"

@app.post("/api/info")
def get_video_info(req: InfoRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Por favor ingresa una URL válida de YouTube.")

    opts = get_base_ydl_opts()
    opts["extract_flat"] = False

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        error_msg = str(e)
        if "Video unavailable" in error_msg:
            detail = "El video no está disponible (puede ser privado o haber sido eliminado)."
        elif "Private video" in error_msg:
            detail = "Este video es privado."
        else:
            detail = f"Error al analizar el enlace: {error_msg}"
        raise HTTPException(status_code=400, detail=detail)

    # Extract available video resolutions
    available_heights = set()
    formats = info.get("formats", [])
    for f in formats:
        h = f.get("height")
        if h and isinstance(h, int):
            available_heights.add(h)

    sorted_heights = sorted(list(available_heights), reverse=True)

    max_height = sorted_heights[0] if sorted_heights else 1080
    has_4k = any(h >= 2160 for h in sorted_heights)
    has_2k = any(h >= 1440 for h in sorted_heights)
    has_1080p = any(h >= 1080 for h in sorted_heights)
    has_720p = any(h >= 720 for h in sorted_heights)

    thumbnails = info.get("thumbnails", [])
    best_thumbnail = info.get("thumbnail")
    if thumbnails:
        # Get highest resolution thumbnail
        best_thumbnail = thumbnails[-1].get("url") or best_thumbnail

    return {
        "id": info.get("id"),
        "title": info.get("title", "Sin título"),
        "channel": info.get("uploader") or info.get("channel", "Canal desconocido"),
        "channel_url": info.get("uploader_url") or info.get("channel_url", ""),
        "duration": info.get("duration"),
        "duration_str": format_duration(info.get("duration")),
        "view_count": info.get("view_count"),
        "views_str": format_views(info.get("view_count")),
        "thumbnail": best_thumbnail,
        "max_resolution": f"{max_height}p",
        "has_4k": has_4k,
        "has_2k": has_2k,
        "has_1080p": has_1080p,
        "has_720p": has_720p,
        "available_resolutions": sorted_heights[:6]
    }

def run_download_job(job_id: str, url: str, format_type: str):
    def update_job(**kwargs):
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id].update(kwargs)

    def progress_hook(d):
        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes") or 0
            percent = 0.0
            if total > 0:
                percent = round((downloaded / total) * 100, 1)
            else:
                p_str = d.get("_percent_str", "0%").replace("%", "").strip()
                try:
                    percent = float(p_str)
                except ValueError:
                    percent = 0.0

            speed = d.get("_speed_str", "").strip()
            eta = d.get("_eta_str", "").strip()

            update_job(
                status="downloading",
                progress=percent,
                speed=speed or "Descargando...",
                eta=eta or "--",
                downloaded_bytes=downloaded,
                total_bytes=total
            )
        elif status == "finished":
            update_job(
                status="processing",
                progress=99.0,
                speed="Procesando",
                eta="Un momento..."
            )

def ensure_apple_mp4_compatibility(filepath: str, update_job=None) -> str:
    """
    Ensures video streams are encoded in H.264 (yuv420p) and audio in AAC,
    with +faststart flags so they play natively on iPhone, iPad, macOS QuickTime,
    Finder Quick Look, and all Apple devices without black screens or audio-only bugs.
    """
    if not filepath.lower().endswith(".mp4"):
        return filepath

    try:
        cmd_probe = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", filepath]
        res = subprocess.run(cmd_probe, capture_output=True, text=True)
        if res.returncode != 0:
            return filepath

        data = json.loads(res.stdout)
        vcodec = None
        acodec = None
        for s in data.get("streams", []):
            if s.get("codec_type") == "video" and not vcodec:
                vcodec = (s.get("codec_name") or "").lower()
            elif s.get("codec_type") == "audio" and not acodec:
                acodec = (s.get("codec_name") or "").lower()

        needs_vtranscode = vcodec not in ("h264", "avc1")
        needs_atranscode = acodec not in ("aac", "mp4a")

        if not needs_vtranscode and not needs_atranscode:
            return filepath

        if update_job:
            update_job(
                status="processing",
                progress=99.0,
                speed="Optimizando códecs (H.264/AAC) para iPhone y Mac...",
                eta="Casi listo..."
            )

        temp_out = filepath + ".apple_compat.mp4"
        cmd_ffmpeg = [FFMPEG_PATH, "-y", "-i", filepath]

        if needs_vtranscode:
            cmd_ffmpeg.extend(["-c:v", "h264_videotoolbox", "-b:v", "4500k", "-pix_fmt", "yuv420p"])
        else:
            cmd_ffmpeg.extend(["-c:v", "copy"])

        if needs_atranscode:
            cmd_ffmpeg.extend(["-c:a", "aac", "-b:a", "192k"])
        else:
            cmd_ffmpeg.extend(["-c:a", "copy"])

        cmd_ffmpeg.extend(["-movflags", "+faststart", temp_out])

        proc = subprocess.run(cmd_ffmpeg, capture_output=True, text=True)
        if proc.returncode != 0 and needs_vtranscode:
            # Fallback to libx264 if videotoolbox failed
            cmd_ffmpeg_fallback = [FFMPEG_PATH, "-y", "-i", filepath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]
            if needs_atranscode:
                cmd_ffmpeg_fallback.extend(["-c:a", "aac", "-b:a", "192k"])
            else:
                cmd_ffmpeg_fallback.extend(["-c:a", "copy"])
            cmd_ffmpeg_fallback.extend(["-movflags", "+faststart", temp_out])
            proc = subprocess.run(cmd_ffmpeg_fallback, capture_output=True, text=True)

        if proc.returncode == 0 and os.path.exists(temp_out):
            os.replace(temp_out, filepath)
            return filepath
        else:
            if os.path.exists(temp_out):
                os.remove(temp_out)
            return filepath
    except Exception as err:
        print("Apple compat error:", err)
        return filepath

def run_download_job(job_id: str, url: str, format_type: str):
    def update_job(**kwargs):
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id].update(kwargs)

    def progress_hook(d):
        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes") or 0
            percent = 0.0
            if total > 0:
                percent = round((downloaded / total) * 100, 1)
            else:
                p_str = d.get("_percent_str", "0%").replace("%", "").strip()
                try:
                    percent = float(p_str)
                except ValueError:
                    percent = 0.0

            speed = d.get("_speed_str", "").strip()
            eta = d.get("_eta_str", "").strip()

            update_job(
                status="downloading",
                progress=percent,
                speed=speed or "Descargando...",
                eta=eta or "--",
                downloaded_bytes=downloaded,
                total_bytes=total
            )
        elif status == "finished":
            update_job(
                status="processing",
                progress=99.0,
                speed="Ensamblando video...",
                eta="Un momento..."
            )

    job_folder = DOWNLOADS_DIR
    out_template = str(job_folder / f"%(title)s_{job_id[:6]}.%(ext)s")

    opts = get_base_ydl_opts()
    opts["outtmpl"] = out_template
    opts["progress_hooks"] = [progress_hook]

    # Prioritize H.264 (avc1) video and AAC (mp4a) audio for 100% native Apple QuickTime and iPhone compatibility
    if format_type == "mp4-best":
        opts["format"] = "bestvideo[vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
        opts["merge_output_format"] = "mp4"
    elif format_type == "mp4-4k":
        opts["format"] = "bestvideo[height<=2160]+bestaudio/best[height<=2160]/best"
        opts["merge_output_format"] = "mp4"
    elif format_type == "mp4-1080":
        opts["format"] = "bestvideo[height<=1080][vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best"
        opts["merge_output_format"] = "mp4"
    elif format_type == "mp4-720":
        opts["format"] = "bestvideo[height<=720][vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[height<=720][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best"
        opts["merge_output_format"] = "mp4"
    elif format_type == "mp4-480":
        opts["format"] = "bestvideo[height<=480][vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[height<=480][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best"
        opts["merge_output_format"] = "mp4"
    elif format_type == "webm-best":
        opts["format"] = "bestvideo+bestaudio/best"
        opts["merge_output_format"] = "webm"
    elif format_type == "mp3-320":
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320",
        }]
    elif format_type == "mp3-192":
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }]
    elif format_type == "m4a":
        opts["format"] = "bestaudio[ext=m4a]/bestaudio/best"
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "m4a",
            "preferredquality": "0",
        }]
    elif format_type == "wav":
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
        }]
    else:
        opts["format"] = "bestvideo[vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best"
        opts["merge_output_format"] = "mp4"

    try:
        update_job(status="starting", progress=0.0)
        with yt_dlp.YoutubeDL(opts) as ydl:
            res = ydl.extract_info(url, download=True)
            # Find the final saved file
            final_filename = None
            if "requested_downloads" in res and res["requested_downloads"]:
                final_filename = res["requested_downloads"][0].get("filepath")
            if not final_filename or not os.path.exists(final_filename):
                # Search by job_id in DOWNLOADS_DIR
                candidates = list(DOWNLOADS_DIR.glob(f"*{job_id[:6]}*"))
                if candidates:
                    final_filename = str(candidates[0])

            if final_filename and os.path.exists(final_filename):
                # Ensure 100% native Apple QuickTime & iPhone compatibility for MP4 files
                if final_filename.lower().endswith(".mp4"):
                    final_filename = ensure_apple_mp4_compatibility(final_filename, update_job)

                size_bytes = os.path.getsize(final_filename)
                size_mb = round(size_bytes / (1024 * 1024), 2)
                file_base = Path(final_filename).name

                update_job(
                    status="completed",
                    progress=100.0,
                    filepath=final_filename,
                    filename=file_base,
                    size_mb=f"{size_mb} MB",
                    completed_at=time.time()
                )
            else:
                update_job(status="error", error_message="El archivo descargado no pudo ser localizado.")
    except Exception as e:
        update_job(status="error", error_message=str(e))

@app.post("/api/download")
def start_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL inválida.")

    job_id = str(uuid.uuid4())
    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "url": url,
            "format_type": req.format_type,
            "status": "queued",
            "progress": 0.0,
            "speed": "Iniciando...",
            "eta": "--",
            "created_at": time.time(),
            "filepath": None,
            "filename": None,
            "size_mb": None,
            "error_message": None,
        }

    background_tasks.add_task(run_download_job, job_id, url, req.format_type)
    return {"job_id": job_id}

# --- TIKTOK WITHOUT WATERMARK LOGIC ---

def fetch_tiktok_data(url: str) -> dict:
    api_url = f"https://www.tikwm.com/api/?url={urllib.parse.quote(url)}&hd=1"
    req = urllib.request.Request(
        api_url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
    )
    with urllib.request.urlopen(req, timeout=12) as resp:
        res = json.loads(resp.read().decode())
        if res.get("code") != 0 or not res.get("data"):
            raise Exception(res.get("msg") or "No se pudo obtener el video de TikTok sin marca de agua.")
        return res["data"]

@app.post("/api/tiktok/info")
def get_tiktok_info(req: InfoRequest):
    url = req.url.strip()
    if not url or "tiktok.com" not in url:
        raise HTTPException(status_code=400, detail="Por favor ingresa un enlace válido de TikTok.")

    try:
        data = fetch_tiktok_data(url)
        author = data.get("author") or {}
        title = data.get("title") or "TikTok Video"
        cover = data.get("cover") or data.get("origin_cover") or ""
        
        play_url = data.get("play") or ""
        if play_url.startswith("/"):
            play_url = "https://www.tikwm.com" + play_url
            
        hdplay_url = data.get("hdplay") or ""
        if hdplay_url.startswith("/"):
            hdplay_url = "https://www.tikwm.com" + hdplay_url

        music_url = data.get("music") or ""
        if music_url.startswith("/"):
            music_url = "https://www.tikwm.com" + music_url

        hd_size = data.get("hd_size") or data.get("size") or 0
        size_display = f"{round(hd_size / (1024 * 1024), 2)} MB" if hd_size > 0 else "HD Original"

        return {
            "id": data.get("id") or str(data.get("video_id")),
            "title": title,
            "author_name": author.get("nickname", "Creador"),
            "author_username": f"@{author.get('unique_id', 'usuario')}",
            "avatar": author.get("avatar", ""),
            "cover": cover,
            "duration_str": format_duration(data.get("duration", 0)),
            "likes_str": format_views(data.get("digg_count")),
            "comments_str": format_views(data.get("comment_count")),
            "shares_str": format_views(data.get("share_count")),
            "views_str": format_views(data.get("play_count")),
            "has_hd": bool(hdplay_url),
            "music_title": data.get("music_info", {}).get("title", "Audio original"),
            "size_mb": size_display
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al analizar el enlace de TikTok: {str(e)}")

def run_tiktok_download_job(job_id: str, url: str, format_type: str):
    def update_job(**kwargs):
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id].update(kwargs)

    try:
        update_job(status="starting", progress=0.0, speed="Obteniendo flujo HD original sin marca...", eta="--")
        data = fetch_tiktok_data(url)
        author = (data.get("author") or {}).get("unique_id", "tiktok")
        raw_title = data.get("title") or "video"
        clean_title = re.sub(r'[\\/*?:"<>|]', "", raw_title).strip()[:40]
        if not clean_title:
            clean_title = "tiktok_video"

        is_audio = (format_type == "tiktok-mp3")
        target_stream = None

        if is_audio:
            target_stream = data.get("music") or data.get("hdplay") or data.get("play")
        else:
            # ALWAYS prioritize hdplay (Original full resolution without loss)
            if format_type == "tiktok-mp4-sd":
                target_stream = data.get("play") or data.get("hdplay")
            else:
                target_stream = data.get("hdplay") or data.get("play")

        if not target_stream:
            raise Exception("No se encontró enlace de video en alta definición sin marca de agua.")

        if target_stream.startswith("/"):
            target_stream = "https://www.tikwm.com" + target_stream

        base_name = f"[TikTok] @{author} - {clean_title}_{job_id[:6]}"
        final_ext = "mp3" if is_audio else "mp4"
        final_file = DOWNLOADS_DIR / f"{base_name}.{final_ext}"
        temp_file = DOWNLOADS_DIR / f"temp_{job_id[:6]}.mp4" if is_audio else DOWNLOADS_DIR / f"{base_name}.mp4"

        update_job(status="downloading", progress=5.0, speed="Descargando en máxima calidad...", eta="--")

        req = urllib.request.Request(
            target_stream,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://www.tiktok.com/"
            }
        )

        start_time = time.time()
        downloaded = 0
        total_size = 0

        with urllib.request.urlopen(req, timeout=25) as resp, open(temp_file, "wb") as f:
            total_header = resp.headers.get("Content-Length")
            if total_header and total_header.isdigit():
                total_size = int(total_header)

            chunk_size = 64 * 1024
            last_update = time.time()

            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)

                now = time.time()
                if now - last_update >= 0.35:
                    elapsed = now - start_time
                    speed_bps = downloaded / elapsed if elapsed > 0 else 0
                    speed_str = f"{speed_bps / (1024 * 1024):.1f} MB/s" if speed_bps >= 1024 * 1024 else f"{speed_bps / 1024:.0f} KB/s"

                    pct = 0.0
                    eta_str = "--"
                    if total_size > 0:
                        pct = min(round((downloaded / total_size) * 100, 1), 98.0)
                        remaining = total_size - downloaded
                        if speed_bps > 0:
                            eta_secs = int(remaining / speed_bps)
                            eta_str = f"{eta_secs}s"
                    else:
                        pct = min(round((downloaded / (5 * 1024 * 1024)) * 80, 1), 95.0)

                    update_job(
                        status="downloading",
                        progress=pct,
                        speed=speed_str,
                        eta=eta_str,
                        downloaded_bytes=downloaded,
                        total_bytes=total_size
                    )
                    last_update = now

        if is_audio:
            update_job(status="processing", progress=99.0, speed="Extrayendo MP3 con FFmpeg...", eta="Casi listo...")
            cmd = [
                FFMPEG_PATH, "-y",
                "-i", str(temp_file),
                "-vn", "-c:a", "libmp3lame",
                "-b:a", "320k",
                str(final_file)
            ]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            if os.path.exists(temp_file):
                os.remove(temp_file)
        else:
            final_file = temp_file
            if str(final_file).lower().endswith(".mp4"):
                final_file = Path(ensure_apple_mp4_compatibility(str(final_file), update_job))

        if os.path.exists(final_file):
            size_mb = round(os.path.getsize(final_file) / (1024 * 1024), 2)
            update_job(
                status="completed",
                progress=100.0,
                filepath=str(final_file),
                filename=final_file.name,
                size_mb=f"{size_mb} MB",
                completed_at=time.time()
            )
        else:
            update_job(status="error", error_message="No se pudo procesar el archivo final de TikTok.")
    except Exception as e:
        update_job(status="error", error_message=str(e))

@app.post("/api/tiktok/download")
def start_tiktok_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    url = req.url.strip()
    if not url or "tiktok.com" not in url:
        raise HTTPException(status_code=400, detail="URL de TikTok inválida.")

    job_id = str(uuid.uuid4())
    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "url": url,
            "format_type": req.format_type,
            "status": "queued",
            "progress": 0.0,
            "speed": "Iniciando...",
            "eta": "--",
            "created_at": time.time(),
            "filepath": None,
            "filename": None,
            "size_mb": None,
            "error_message": None,
        }

    background_tasks.add_task(run_tiktok_download_job, job_id, url, req.format_type)
    return {"job_id": job_id}

@app.get("/api/progress/{job_id}")
def get_progress(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Descarga no encontrada.")
    return job

@app.api_route("/api/file/{job_id}", methods=["GET", "HEAD"])
def download_file(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job or job.get("status") != "completed":
        raise HTTPException(status_code=404, detail="Archivo no listo o no encontrado.")

    filepath = job.get("filepath")
    if not filepath or not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="El archivo ya no existe en el disco.")

    filename = job.get("filename") or Path(filepath).name
    return FileResponse(
        filepath,
        filename=filename,
        media_type="application/octet-stream"
    )

@app.api_route("/api/file-by-name/{filename}", methods=["GET", "HEAD"])
def download_file_by_name(filename: str):
    safe_name = Path(filename).name
    filepath = DOWNLOADS_DIR / safe_name
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado.")

    return FileResponse(
        filepath,
        filename=safe_name,
        media_type="application/octet-stream"
    )

@app.get("/api/downloads")
def list_downloads():
    files = []
    if DOWNLOADS_DIR.exists():
        for p in sorted(DOWNLOADS_DIR.glob("*"), key=os.path.getmtime, reverse=True):
            if p.is_file() and not p.name.startswith("."):
                size_mb = round(p.stat().st_size / (1024 * 1024), 2)
                files.append({
                    "name": p.name,
                    "size_mb": f"{size_mb} MB",
                    "path": str(p),
                    "created_at": time.ctime(p.stat().st_mtime)
                })
    return {"downloads": files[:15]}

@app.post("/api/open-folder")
def open_downloads_folder():
    try:
        if sys.platform == "darwin":
            subprocess.run(["open", str(DOWNLOADS_DIR)], check=True)
        elif sys.platform == "win32":
            os.startfile(str(DOWNLOADS_DIR))
        else:
            subprocess.run(["xdg-open", str(DOWNLOADS_DIR)], check=True)
        return {"success": True, "path": str(DOWNLOADS_DIR)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo abrir la carpeta: {e}")

@app.get("/api/health")
def health():
    return {
        "status": "online",
        "ffmpeg": os.path.exists(FFMPEG_PATH),
        "node_js_runtime": bool(NODE_PATH),
        "downloads_dir": str(DOWNLOADS_DIR)
    }

# Mount static files
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5050, reload=True)
