import os
import sys
import uuid
import time
import subprocess
import threading
from typing import Dict, Any, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks, APIRouter, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp
import json
import re
import urllib.request
import urllib.parse

import shutil

BASE_DIR = Path(__file__).resolve().parent
# On Vercel serverless environment, filesystem is read-only except /tmp
if os.environ.get("VERCEL") or not os.access(str(BASE_DIR), os.W_OK):
    DOWNLOADS_DIR = Path("/tmp/downloads")
else:
    DOWNLOADS_DIR = BASE_DIR / "downloads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

FFMPEG_PATH = "/usr/local/bin/ffmpeg" if os.path.exists("/usr/local/bin/ffmpeg") else (shutil.which("ffmpeg") or "ffmpeg")
NODE_PATH = "/usr/local/bin/node" if os.path.exists("/usr/local/bin/node") else (shutil.which("node") or None)

app = FastAPI(title="YouTube High-Quality Downloader API", version="1.0.0")
router = APIRouter()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_private_network_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

# In-memory job tracker
jobs: Dict[str, Dict[str, Any]] = {}
jobs_lock = threading.Lock()

class InfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_type: str  # e.g., 'mp4-best', 'mp4-1080', 'mp4-720', 'mp4-480', 'mp3-320', 'mp3-192', 'm4a', 'wav', 'webm'

COOKIES_FILE = BASE_DIR / "cookies.txt"

def load_cookies() -> bool:
    # 1. Check environment variables (supports YOUTUBE_COOKIES, YUOTUBE_COOKIES, or any key containing COOKIE)
    for env_key, val in os.environ.items():
        if "COOKIE" in env_key.upper() and val and val.strip():
            content = val.strip()
            if content.startswith("base64:"):
                import base64
                content = base64.b64decode(content[7:]).decode("utf-8", errors="ignore")
            try:
                COOKIES_FILE.write_text(content, encoding="utf-8")
                return True
            except Exception:
                pass

    # 2. Check Render Secret Files default mount path: /etc/secrets/cookies.txt
    secret_path = Path("/etc/secrets/cookies.txt")
    if secret_path.exists() and secret_path.stat().st_size > 0:
        try:
            COOKIES_FILE.write_text(secret_path.read_text(encoding="utf-8"), encoding="utf-8")
            return True
        except Exception:
            pass

    # 3. Check existing file on disk
    if COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 0:
        return True

    return False

def get_base_ydl_opts() -> dict:
    has_cookies = load_cookies()
    # When authenticated with cookies, web and mweb yield best quality and bypass bot walls
    clients = ["web", "mweb", "ios"] if has_cookies else ["visionos", "android", "web"]
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "ffmpeg_location": FFMPEG_PATH,
        "extractor_args": {
            "youtube": {
                "player_client": clients
            }
        },
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        }
    }
    if has_cookies:
        opts["cookiefile"] = str(COOKIES_FILE)
    if NODE_PATH:
        opts["js_runtimes"] = {"node": {"path": NODE_PATH}}
    return opts
    if has_cookies:
        opts["cookiefile"] = str(COOKIES_FILE)
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

@router.post("/info")
def get_video_info(req: InfoRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Por favor ingresa una URL válida de YouTube.")

    opts = get_base_ydl_opts()
    opts["extract_flat"] = False

    info = None
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        error_msg = str(e)
        # Fallback to alternate player client combination if initial attempt failed
        if "unavailable" not in error_msg.lower() and "private" not in error_msg.lower():
            try:
                fallback_opts = get_base_ydl_opts()
                fallback_opts["extractor_args"] = {"youtube": {"player_client": ["android", "tv_simply", "web"]}}
                with yt_dlp.YoutubeDL(fallback_opts) as ydl2:
                    info = ydl2.extract_info(url, download=False)
            except Exception:
                pass

        if not info:
            if "unavailable" in error_msg.lower() or "no está disponible" in error_msg.lower():
                detail = "El video no está disponible en YouTube (puede ser privado, haber sido eliminado o tener restricción geográfica)."
            elif "private" in error_msg.lower() or "privado" in error_msg.lower():
                detail = "Este video es privado y no se puede descargar."
            elif "sign in" in error_msg.lower() or "bot" in error_msg.lower():
                detail = "YouTube ha solicitado verificación para este contenido. Por favor prueba con otro video o enlace."
            else:
                detail = f"Error al analizar el enlace: {error_msg.split(':', 1)[-1].strip()}"
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
        use_videotoolbox = sys.platform == "darwin"
        cmd_ffmpeg = [FFMPEG_PATH, "-y", "-i", filepath]

        if needs_vtranscode:
            if use_videotoolbox:
                cmd_ffmpeg.extend(["-c:v", "h264_videotoolbox", "-b:v", "4500k", "-pix_fmt", "yuv420p"])
            else:
                cmd_ffmpeg.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"])
        else:
            cmd_ffmpeg.extend(["-c:v", "copy"])

        if needs_atranscode:
            cmd_ffmpeg.extend(["-c:a", "aac", "-b:a", "192k"])
        else:
            cmd_ffmpeg.extend(["-c:a", "copy"])

        cmd_ffmpeg.extend(["-movflags", "+faststart", temp_out])

        proc = subprocess.run(cmd_ffmpeg, capture_output=True, text=True)
        if proc.returncode != 0 and needs_vtranscode and use_videotoolbox:
            # Fallback to libx264 if videotoolbox failed on macOS
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

@router.post("/download")
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

def fetch_tiktok_via_ytdlp(url: str) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        video_url = info.get("url")
        formats = info.get("formats", [])
        if not video_url and formats:
            video_url = formats[-1].get("url")

        return {
            "id": info.get("id"),
            "video_id": info.get("id"),
            "title": info.get("title") or "TikTok Video",
            "author": {
                "nickname": info.get("uploader") or "Creador",
                "unique_id": info.get("uploader_id") or info.get("uploader") or "usuario",
                "avatar": ""
            },
            "cover": info.get("thumbnail") or "",
            "duration": info.get("duration", 0),
            "digg_count": info.get("like_count"),
            "comment_count": info.get("comment_count"),
            "share_count": info.get("repost_count"),
            "play_count": info.get("view_count"),
            "play": video_url or "",
            "hdplay": video_url or "",
            "music": None,
            "hd_size": info.get("filesize") or 0,
            "music_info": {"title": info.get("track") or "Audio original"}
        }

def fetch_tiktok_data(url: str) -> dict:
    # 1. Try tikwm API
    try:
        api_url = f"https://www.tikwm.com/api/?url={urllib.parse.quote(url)}&hd=1"
        req = urllib.request.Request(
            api_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Referer": "https://www.tikwm.com/"
            }
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            res = json.loads(resp.read().decode())
            if res.get("code") == 0 and res.get("data"):
                return res["data"]
    except Exception:
        pass

    # 2. Try LoveTik API fallback
    try:
        body = urllib.parse.urlencode({"query": url}).encode("utf-8")
        req = urllib.request.Request(
            "https://lovetik.com/api/ajax/search",
            data=body,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Referer": "https://lovetik.com/"
            }
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            res = json.loads(resp.read().decode())
            if res.get("status") == "ok" and res.get("links"):
                links = res.get("links", [])
                hd_url = None
                sd_url = None
                audio_url = None
                for l in links:
                    t = (l.get("t") or "").lower()
                    a = l.get("a") or ""
                    if "hd" in t:
                        hd_url = a
                    elif "mp4" in (l.get("s") or "").upper() and not sd_url:
                        sd_url = a
                    elif "mp3" in (l.get("s") or "").upper() or "audio" in t:
                        audio_url = a
                return {
                    "id": res.get("vid") or "tiktok_video",
                    "video_id": res.get("vid") or "tiktok_video",
                    "title": res.get("desc") or "TikTok Video",
                    "author": {
                        "nickname": res.get("author") or "Creador",
                        "unique_id": res.get("author") or "usuario",
                        "avatar": ""
                    },
                    "cover": res.get("cover") or "",
                    "duration": 0,
                    "play": sd_url or hd_url or "",
                    "hdplay": hd_url or sd_url or "",
                    "music": audio_url,
                    "hd_size": 0,
                    "music_info": {"title": "Audio original"}
                }
    except Exception:
        pass

    # 3. Fallback to native yt-dlp extractor
    return fetch_tiktok_via_ytdlp(url)

@router.post("/tiktok/info")
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
            "size_mb": size_display,
            "direct_video_hd": hdplay_url or play_url,
            "direct_video_sd": play_url,
            "direct_audio": music_url
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al analizar el enlace de TikTok: {str(e)}")

@router.get("/tiktok/stream")
def stream_tiktok_video(url: str, title: Optional[str] = "video", is_audio: Optional[bool] = False):
    try:
        clean_title = re.sub(r'[\\/*?:"<>|]', "", title).strip() or "tiktok_media"
        ext = "mp3" if is_audio else "mp4"
        filename = f"{clean_title}.{ext}"

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Referer": "https://www.tiktok.com/"
            }
        )
        resp = urllib.request.urlopen(req, timeout=30)
        content_type = resp.headers.get("Content-Type", "video/mp4" if not is_audio else "audio/mpeg")
        content_length = resp.headers.get("Content-Length")

        def iterfile():
            while chunk := resp.read(64 * 1024):
                yield chunk

        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Disposition, Content-Length"
        }
        if content_length:
            headers["Content-Length"] = content_length

        return StreamingResponse(iterfile(), media_type=content_type, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al transmitir video: {str(e)}")

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

        download_ok = False
        if target_stream and target_stream.startswith("http"):
            try:
                req = urllib.request.Request(
                    target_stream,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
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

                if os.path.exists(temp_file) and os.path.getsize(temp_file) > 10000:
                    download_ok = True
            except Exception:
                download_ok = False

        if not download_ok:
            # Fallback to yt-dlp native downloader
            update_job(status="downloading", progress=25.0, speed="Descargando vía motor nativo...", eta="--")
            out_template = str(DOWNLOADS_DIR / f"{base_name}.%(ext)s")
            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "outtmpl": out_template,
                "format": "bestaudio/best" if is_audio else "bestvideo+bestaudio/best",
            }
            if is_audio:
                ydl_opts["postprocessors"] = [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                }]
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            candidates = list(DOWNLOADS_DIR.glob(f"*{job_id[:6]}*"))
            if candidates:
                final_file = candidates[0]
            elif os.path.exists(temp_file):
                final_file = temp_file

        if is_audio and not final_file.name.endswith(".mp3"):
            if shutil.which(FFMPEG_PATH) or os.path.exists(FFMPEG_PATH):
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
        elif not is_audio and os.path.exists(final_file):
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

@router.post("/tiktok/download")
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

@router.get("/progress/{job_id}")
def get_progress(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Descarga no encontrada.")
    return job

@router.api_route("/file/{job_id}", methods=["GET", "HEAD"])
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

@router.api_route("/file-by-name/{filename}", methods=["GET", "HEAD"])
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

@router.get("/downloads")
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

@router.post("/open-folder")
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

class CookiePayload(BaseModel):
    cookies: str

@router.post("/set-cookies")
def set_cookies_endpoint(payload: CookiePayload):
    text = payload.cookies.strip()
    if not text:
        raise HTTPException(status_code=400, detail="El contenido de las cookies está vacío.")
    COOKIES_FILE.write_text(text, encoding="utf-8")
    return {"success": True, "message": "Cookies configuradas exitosamente en el servidor."}

@router.get("/health")
def health():
    has_cookies = load_cookies()
    return {
        "status": "online",
        "ffmpeg": bool(shutil.which(FFMPEG_PATH) or os.path.exists(FFMPEG_PATH)),
        "node_js_runtime": bool(NODE_PATH),
        "cookies_loaded": has_cookies,
        "downloads_dir": str(DOWNLOADS_DIR)
    }

# Include all API routes both with prefix '/api' and directly on root
app.include_router(router, prefix="/api")
app.include_router(router, prefix="")

# Mount static files (served by Vercel directly in cloud, or locally by FastAPI)
STATIC_DIR = BASE_DIR / "static"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5050, reload=True)
