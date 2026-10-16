document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // --- Smart Backend Engine (Local vs Nube) ---
  const RENDER_BASE = "https://media-studio-app.onrender.com";
  const LOCAL_BASE = "http://127.0.0.1:5050";
  let API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "" : RENDER_BASE;
  let currentEngine = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "local" : "cloud";

  const engineToggleBtn = document.getElementById("engineToggleBtn");
  const engineDot = document.getElementById("engineDot");
  const engineLabel = document.getElementById("engineLabel");

  function setEngine(mode) {
    currentEngine = mode;
    if (mode === "local") {
      API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "" : LOCAL_BASE;
      if (engineDot) engineDot.className = "w-2 h-2 rounded-full bg-emerald-400";
      if (engineLabel) engineLabel.textContent = "Motor Local (Mac activo)";
    } else {
      API_BASE = RENDER_BASE;
      if (engineDot) engineDot.className = "w-2 h-2 rounded-full bg-sky-400";
      if (engineLabel) engineLabel.textContent = "Motor Nube (Render)";
    }
  }

  async function checkBackendAvailability() {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      setEngine("local");
      return;
    }
    // Ping local backend to see if user has Iniciar-Media-Studio running on Mac
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${LOCAL_BASE}/health`, { mode: "cors", signal: controller.signal });
      clearTimeout(tid);
      if (res.ok) {
        setEngine("local");
        return;
      }
    } catch (_) {
      // Local engine not running, fall back to cloud Render
    }
    setEngine("cloud");
  }

  if (engineToggleBtn) {
    engineToggleBtn.addEventListener("click", () => {
      if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        window.open("http://localhost:5050", "_blank");
        return;
      }
      setEngine(currentEngine === "local" ? "cloud" : "local");
    });
  }

  checkBackendAvailability();

  function getApiUrl(path) {
    return `${API_BASE}${path}`;
  }

  // --- Platform Navigation (YouTube vs TikTok) ---
  const tabPlatformYoutube = document.getElementById("tabPlatformYoutube");
  const tabPlatformTiktok = document.getElementById("tabPlatformTiktok");
  const screenYoutube = document.getElementById("screenYoutube");
  const screenTiktok = document.getElementById("screenTiktok");

  function switchPlatform(platform) {
    hideAlert();
    if (downloadStatusSection) downloadStatusSection.classList.add("hidden");

    if (platform === "youtube") {
      tabPlatformYoutube.className = "px-5 py-1.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-2 bg-[#2c2c2e] text-white shadow-sm transition-all";
      tabPlatformTiktok.className = "px-5 py-1.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-2 text-[#86868b] hover:text-white transition-all";
      screenYoutube.classList.remove("hidden");
      screenTiktok.classList.add("hidden");
    } else {
      tabPlatformTiktok.className = "px-5 py-1.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-2 bg-[#2c2c2e] text-white shadow-sm transition-all";
      tabPlatformYoutube.className = "px-5 py-1.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-2 text-[#86868b] hover:text-white transition-all";
      screenTiktok.classList.remove("hidden");
      screenYoutube.classList.add("hidden");
    }
    if (window.lucide) window.lucide.createIcons();
  }

  if (tabPlatformYoutube) tabPlatformYoutube.addEventListener("click", () => switchPlatform("youtube"));
  if (tabPlatformTiktok) tabPlatformTiktok.addEventListener("click", () => switchPlatform("tiktok"));

  // --- Shared Alert ---
  const alertBox = document.getElementById("alertBox");
  const alertMessage = document.getElementById("alertMessage");
  const btnCloseAlert = document.getElementById("btnCloseAlert");

  function showAlert(msg) {
    if (!alertBox || !alertMessage) return;
    alertMessage.textContent = msg;
    alertBox.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();
  }

  function hideAlert() {
    if (alertBox) alertBox.classList.add("hidden");
  }

  if (btnCloseAlert) btnCloseAlert.addEventListener("click", hideAlert);

  // --- Shared Progress & Result Elements ---
  const downloadStatusSection = document.getElementById("downloadStatusSection");
  const downloadActiveState = document.getElementById("downloadActiveState");
  const downloadCompletedState = document.getElementById("downloadCompletedState");
  const activeStatusTitle = document.getElementById("activeStatusTitle");
  const activeFormatLabel = document.getElementById("activeFormatLabel");
  const progressPercent = document.getElementById("progressPercent");
  const progressBar = document.getElementById("progressBar");
  const statSpeed = document.getElementById("statSpeed");
  const statEta = document.getElementById("statEta");
  const completedFileName = document.getElementById("completedFileName");
  const completedFileSize = document.getElementById("completedFileSize");
  const btnSaveFile = document.getElementById("btnSaveFile");

  let pollInterval = null;

  // --- YouTube Section Elements ---
  const urlForm = document.getElementById("urlForm");
  const videoUrlInput = document.getElementById("videoUrl");
  const btnPaste = document.getElementById("btnPaste");
  const btnAnalyze = document.getElementById("btnAnalyze");
  const videoPreviewSection = document.getElementById("videoPreviewSection");

  const metaThumbnail = document.getElementById("metaThumbnail");
  const metaDuration = document.getElementById("metaDuration");
  const maxResBadge = document.getElementById("maxResBadge");
  const metaTitle = document.getElementById("metaTitle");
  const metaChannel = document.getElementById("metaChannel");
  const metaViews = document.getElementById("metaViews");
  const resChips = document.getElementById("resChips");

  const tabVideo = document.getElementById("tabVideo");
  const tabAudio = document.getElementById("tabAudio");
  const videoFormatsPanel = document.getElementById("videoFormatsPanel");
  const audioFormatsPanel = document.getElementById("audioFormatsPanel");
  const formatCards = document.querySelectorAll(".format-option-card");
  const btnStartDownload = document.getElementById("btnStartDownload");

  // Paste handler
  if (btnPaste && videoUrlInput) {
    btnPaste.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) videoUrlInput.value = text.trim();
      } catch (e) {
        videoUrlInput.focus();
      }
    });
  }

  // Quick Samples YouTube
  document.querySelectorAll(".sample-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = btn.getAttribute("data-url");
      if (videoUrlInput) {
        videoUrlInput.value = u;
        analyzeYoutube(u);
      }
    });
  });

  // Submit YouTube
  if (urlForm) {
    urlForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const u = (videoUrlInput ? videoUrlInput.value : "").trim();
      if (!u) {
        showAlert("Por favor pega un enlace de YouTube.");
        return;
      }
      analyzeYoutube(u);
    });
  }

  async function analyzeYoutube(url) {
    hideAlert();
    if (videoPreviewSection) videoPreviewSection.classList.add("hidden");
    if (downloadStatusSection) downloadStatusSection.classList.add("hidden");

    if (btnAnalyze) {
      btnAnalyze.disabled = true;
      btnAnalyze.innerHTML = `<span>Analizando...</span>`;
    }

    try {
      const res = await fetch(getApiUrl("/api/info"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al analizar el enlace.");

      renderYoutube(data);
    } catch (err) {
      showAlert(err.message || "Error al conectar con el servidor.");
    } finally {
      if (btnAnalyze) {
        btnAnalyze.disabled = false;
        btnAnalyze.innerHTML = `<span>Analizar</span>`;
      }
    }
  }

  function renderYoutube(data) {
    if (metaThumbnail) metaThumbnail.src = data.thumbnail || "";
    if (metaDuration) metaDuration.textContent = data.duration_str || "00:00";
    if (metaTitle) metaTitle.textContent = data.title || "Video";
    if (metaChannel) metaChannel.textContent = data.channel || data.uploader || "YouTube";
    if (metaViews) metaViews.textContent = data.views_str || "";
    if (maxResBadge) maxResBadge.textContent = data.max_resolution || "HD";

    if (resChips && Array.isArray(data.available_resolutions)) {
      resChips.innerHTML = data.available_resolutions.map(r => 
        `<span class="px-2 py-0.5 rounded bg-white/[0.06] text-[11px] text-[#86868b] border border-white/[0.04]">${r}p</span>`
      ).join("");
    }

    if (videoPreviewSection) {
      videoPreviewSection.classList.remove("hidden");
      videoPreviewSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (window.lucide) window.lucide.createIcons();
  }

  // Format Switch Tabs (Video vs Audio)
  if (tabVideo && tabAudio && videoFormatsPanel && audioFormatsPanel) {
    tabVideo.addEventListener("click", () => {
      tabVideo.className = "px-4 py-1 text-xs font-medium rounded-md bg-[#2c2c2e] text-white transition";
      tabAudio.className = "px-4 py-1 text-xs font-medium rounded-md text-[#86868b] hover:text-white transition";
      videoFormatsPanel.classList.remove("hidden");
      audioFormatsPanel.classList.add("hidden");

      const r = videoFormatsPanel.querySelector('input[type="radio"]');
      if (r) r.click();
    });

    tabAudio.addEventListener("click", () => {
      tabAudio.className = "px-4 py-1 text-xs font-medium rounded-md bg-[#2c2c2e] text-white transition";
      tabVideo.className = "px-4 py-1 text-xs font-medium rounded-md text-[#86868b] hover:text-white transition";
      audioFormatsPanel.classList.remove("hidden");
      videoFormatsPanel.classList.add("hidden");

      const r = audioFormatsPanel.querySelector('input[type="radio"]');
      if (r) r.click();
    });
  }

  // Format Selection Cards
  formatCards.forEach((card) => {
    card.addEventListener("click", () => {
      formatCards.forEach((c) => {
        c.classList.remove("selected", "border-white/20", "bg-white/[0.04]");
        c.classList.add("border-white/[0.08]", "bg-[#121214]");
        const r = c.querySelector('input[type="radio"]');
        if (r) r.checked = false;
      });
      card.classList.add("selected", "border-white/20", "bg-white/[0.04]");
      card.classList.remove("border-white/[0.08]", "bg-[#121214]");
      const r = card.querySelector('input[type="radio"]');
      if (r) r.checked = true;
    });
  });

  // Start Download YouTube
  if (btnStartDownload) {
    btnStartDownload.addEventListener("click", () => {
      const radio = document.querySelector('input[name="format_choice"]:checked');
      const formatType = radio ? radio.value : "mp4-1080";
      const url = (videoUrlInput ? videoUrlInput.value : "").trim();
      if (!url) {
        showAlert("Ingresa una URL válida de YouTube.");
        return;
      }

      startDownloadJob(
        getApiUrl("/api/download"),
        { url, format_type: formatType },
        formatType.toUpperCase()
      );
    });
  }

  // --- TikTok Section Elements ---
  const tiktokUrlForm = document.getElementById("tiktokUrlForm");
  const tiktokUrlInput = document.getElementById("tiktokUrl");
  const btnTiktokPaste = document.getElementById("btnTiktokPaste");
  const btnAnalyzeTiktok = document.getElementById("btnAnalyzeTiktok");
  const tiktokPreviewSection = document.getElementById("tiktokPreviewSection");

  const tiktokThumbnail = document.getElementById("tiktokThumbnail");
  const tiktokDuration = document.getElementById("tiktokDuration");
  const tiktokAvatar = document.getElementById("tiktokAvatar");
  const tiktokAuthorName = document.getElementById("tiktokAuthorName");
  const tiktokAuthorUser = document.getElementById("tiktokAuthorUser");
  const tiktokTitle = document.getElementById("tiktokTitle");
  const tiktokMusicTitle = document.getElementById("tiktokMusicTitle");
  const tiktokLikes = document.getElementById("tiktokLikes");
  const tiktokComments = document.getElementById("tiktokComments");
  const tiktokViews = document.getElementById("tiktokViews");

  const tiktokFormatCards = document.querySelectorAll(".tiktok-format-card");
  const btnStartTiktokDownload = document.getElementById("btnStartTiktokDownload");

  let currentTiktokData = null;

  // Paste TikTok
  if (btnTiktokPaste && tiktokUrlInput) {
    btnTiktokPaste.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) tiktokUrlInput.value = text.trim();
      } catch (e) {
        tiktokUrlInput.focus();
      }
    });
  }

  // Sample TikTok
  document.querySelectorAll(".sample-tiktok-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = btn.getAttribute("data-url");
      if (tiktokUrlInput) {
        tiktokUrlInput.value = u;
        analyzeTiktok(u);
      }
    });
  });

  // Submit TikTok
  if (tiktokUrlForm) {
    tiktokUrlForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const u = (tiktokUrlInput ? tiktokUrlInput.value : "").trim();
      if (!u) {
        showAlert("Ingresa un enlace de TikTok.");
        return;
      }
      analyzeTiktok(u);
    });
  }

  // --- In-Device Local Downloader (Zero 403, 100% device resources) ---
  async function downloadTikTokLocally(streamUrl, fileName, isAudio) {
    hideAlert();
    downloadStatusSection.classList.remove("hidden");
    downloadActiveState.classList.remove("hidden");
    downloadCompletedState.classList.add("hidden");

    activeStatusTitle.textContent = "Descargando en tu dispositivo...";
    activeFormatLabel.textContent = isAudio ? "TIKTOK MP3 320K" : "TIKTOK HD ORIGINAL";
    progressPercent.textContent = "0%";
    progressBar.style.width = "0%";
    statSpeed.textContent = "Usando recursos locales...";
    statEta.textContent = "Conectando...";

    downloadStatusSection.scrollIntoView({ behavior: "smooth", block: "nearest" });

    function finishDownload(finalUrl, sizeMbStr) {
      downloadActiveState.classList.add("hidden");
      downloadCompletedState.classList.remove("hidden");
      completedFileName.textContent = fileName;
      completedFileSize.textContent = sizeMbStr || "Calidad Original";
      btnSaveFile.href = finalUrl;
      btnSaveFile.setAttribute("download", fileName);
      btnSaveFile.removeAttribute("target");

      // Auto trigger native save on device
      const a = document.createElement("a");
      a.href = finalUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 100);
      downloadStatusSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    try {
      // 1. Direct fetch with Blob (Client-Side processing in device memory)
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(streamUrl, {
        referrerPolicy: "no-referrer",
        signal: controller.signal
      });
      clearTimeout(tid);

      if (!res.ok) throw new Error("CORS / Status " + res.status);

      const contentLength = +res.headers.get("Content-Length") || 0;
      const reader = res.body.getReader();
      let received = 0;
      const chunks = [];
      const startTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;

        if (contentLength > 0) {
          const pct = Math.min(Math.round((received / contentLength) * 100), 99);
          progressPercent.textContent = `${pct}%`;
          progressBar.style.width = `${pct}%`;
          const elapsed = (Date.now() - startTime) / 1000;
          const speedBps = elapsed > 0 ? received / elapsed : 0;
          statSpeed.textContent = speedBps >= 1024 * 1024 
            ? `${(speedBps / (1024 * 1024)).toFixed(1)} MB/s`
            : `${Math.round(speedBps / 1024)} KB/s`;
          const remBytes = contentLength - received;
          const etaSec = speedBps > 0 ? Math.ceil(remBytes / speedBps) : 0;
          statEta.textContent = etaSec > 0 ? `Restante: ${etaSec}s` : "Finalizando...";
        } else {
          const mb = (received / (1024 * 1024)).toFixed(1);
          progressPercent.textContent = "Descargando...";
          progressBar.style.width = "75%";
          statSpeed.textContent = `${mb} MB descargados`;
          statEta.textContent = "Procesando...";
        }
      }

      progressPercent.textContent = "100%";
      progressBar.style.width = "100%";
      statSpeed.textContent = "Descarga completada";
      statEta.textContent = "Listo";

      const mimeType = isAudio ? "audio/mpeg" : "video/mp4";
      const blob = new Blob(chunks, { type: mimeType });
      const localBlobUrl = window.URL.createObjectURL(blob);
      const sizeMbStr = `${(blob.size / (1024 * 1024)).toFixed(2)} MB`;

      finishDownload(localBlobUrl, sizeMbStr);

    } catch (err) {
      // 2. Fallback to stream proxy (guarantees zero 403, sets Referer on fly)
      console.warn("Client direct stream fallback to proxy stream:", err);
      statSpeed.textContent = "Canal directo...";
      const proxyUrl = `${API_BASE}/api/tiktok/stream?url=${encodeURIComponent(streamUrl)}&title=${encodeURIComponent(fileName.replace(/\.[^/.]+$/, ""))}&is_audio=${isAudio ? "true" : "false"}`;
      finishDownload(proxyUrl, "HD Directo");
    }
  }

  async function analyzeTiktok(url) {
    hideAlert();
    if (tiktokPreviewSection) tiktokPreviewSection.classList.add("hidden");
    if (downloadStatusSection) downloadStatusSection.classList.add("hidden");

    if (btnAnalyzeTiktok) {
      btnAnalyzeTiktok.disabled = true;
      btnAnalyzeTiktok.innerHTML = `<span>Analizando...</span>`;
    }

    try {
      let data = null;
      // 1. Try direct in-device extraction using the device's own network (residential/cellular IP)
      try {
        const clientRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
          referrerPolicy: "no-referrer"
        });
        if (clientRes.ok) {
          const json = await clientRes.json();
          if (json.code === 0 && json.data) {
            const d = json.data;
            const author = d.author || {};
            let playUrl = d.play || "";
            if (playUrl.startsWith("/")) playUrl = "https://www.tikwm.com" + playUrl;
            let hdplayUrl = d.hdplay || "";
            if (hdplayUrl.startsWith("/")) hdplayUrl = "https://www.tikwm.com" + hdplayUrl;
            let musicUrl = d.music || "";
            if (musicUrl.startsWith("/")) musicUrl = "https://www.tikwm.com" + musicUrl;

            const hdSize = d.hd_size || d.size || 0;
            const sizeDisplay = hdSize > 0 ? `${(hdSize / (1024 * 1024)).toFixed(2)} MB` : "HD Original";

            data = {
              id: d.id || String(d.video_id),
              title: d.title || "TikTok Video",
              author_name: author.nickname || "Creador",
              author_username: `@${author.unique_id || "usuario"}`,
              avatar: author.avatar || "",
              cover: d.cover || d.origin_cover || "",
              duration_str: d.duration ? `${Math.floor(d.duration / 60)}:${d.duration % 60 < 10 ? '0' : ''}${d.duration % 60}` : "00:15",
              likes_str: d.digg_count ? (d.digg_count >= 1e6 ? (d.digg_count/1e6).toFixed(1) + "M" : (d.digg_count >= 1e3 ? (d.digg_count/1e3).toFixed(1) + "K" : String(d.digg_count))) : "0",
              comments_str: d.comment_count ? String(d.comment_count) : "0",
              shares_str: d.share_count ? String(d.share_count) : "0",
              views_str: d.play_count ? (d.play_count >= 1e6 ? (d.play_count/1e6).toFixed(1) + "M" : (d.play_count >= 1e3 ? (d.play_count/1e3).toFixed(1) + "K" : String(d.play_count))) : "0",
              has_hd: Boolean(hdplayUrl),
              music_title: (d.music_info && d.music_info.title) || "Audio original",
              size_mb: sizeDisplay,
              direct_video_hd: hdplayUrl || playUrl,
              direct_video_sd: playUrl,
              direct_audio: musicUrl,
              in_device: true
            };
          }
        }
      } catch (clientErr) {
        console.warn("Direct in-device extraction unavailable, using API:", clientErr);
      }

      // 2. Fallback to API endpoint if client direct extraction was not available
      if (!data) {
        const res = await fetch(getApiUrl("/api/tiktok/info"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Error al analizar TikTok.");
      }

      currentTiktokData = data;
      renderTiktok(data);
    } catch (err) {
      showAlert(err.message || "Error al analizar el enlace de TikTok.");
    } finally {
      if (btnAnalyzeTiktok) {
        btnAnalyzeTiktok.disabled = false;
        btnAnalyzeTiktok.innerHTML = `<span>Analizar</span>`;
      }
    }
  }

  function renderTiktok(data) {
    if (tiktokThumbnail) tiktokThumbnail.src = data.cover || "";
    if (tiktokDuration) tiktokDuration.textContent = data.duration_str || "00:15";
    if (tiktokAvatar) tiktokAvatar.src = data.avatar || "";
    if (tiktokAuthorName) tiktokAuthorName.textContent = data.author_name || "Creador";
    if (tiktokAuthorUser) tiktokAuthorUser.textContent = data.author_username || "@usuario";
    if (tiktokTitle) tiktokTitle.textContent = data.title || "Video de TikTok";
    if (tiktokMusicTitle) tiktokMusicTitle.textContent = data.music_title || "Audio original";
    if (tiktokLikes) tiktokLikes.textContent = data.likes_str || "0";
    if (tiktokComments) tiktokComments.textContent = data.comments_str || "0";
    if (tiktokViews) tiktokViews.textContent = data.views_str || "0";

    if (tiktokPreviewSection) {
      tiktokPreviewSection.classList.remove("hidden");
      tiktokPreviewSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (window.lucide) window.lucide.createIcons();
  }

  tiktokFormatCards.forEach((card) => {
    card.addEventListener("click", () => {
      tiktokFormatCards.forEach((c) => {
        c.classList.remove("selected", "border-white/20", "bg-white/[0.04]");
        c.classList.add("border-white/[0.08]", "bg-[#121214]");
        const r = c.querySelector('input[type="radio"]');
        if (r) r.checked = false;
      });
      card.classList.add("selected", "border-white/20", "bg-white/[0.04]");
      card.classList.remove("border-white/[0.08]", "bg-[#121214]");
      const r = card.querySelector('input[type="radio"]');
      if (r) r.checked = true;
    });
  });

  if (btnStartTiktokDownload) {
    btnStartTiktokDownload.addEventListener("click", () => {
      const radio = document.querySelector('input[name="tiktok_format_choice"]:checked');
      const formatType = radio ? radio.value : "tiktok-mp4-hd";
      const url = (tiktokUrlInput ? tiktokUrlInput.value : "").trim();
      if (!url) {
        showAlert("Ingresa una URL válida de TikTok.");
        return;
      }

      const isAudio = (formatType === "tiktok-mp3");
      const targetStream = isAudio 
        ? (currentTiktokData?.direct_audio || currentTiktokData?.direct_video_hd)
        : (currentTiktokData?.direct_video_hd || currentTiktokData?.direct_video_sd);

      const rawTitle = currentTiktokData?.title || "tiktok_video";
      const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().substring(0, 45) || "tiktok";
      const ext = isAudio ? "mp3" : "mp4";
      const finalFileName = `${cleanTitle}.${ext}`;

      if (targetStream && targetStream.startsWith("http")) {
        // Run in-device client download (using phone/browser resources directly)
        downloadTikTokLocally(targetStream, finalFileName, isAudio);
        return;
      }

      startDownloadJob(
        getApiUrl("/api/tiktok/download"),
        { url, format_type: formatType },
        formatType === "tiktok-mp4-hd" ? "TIKTOK HD ORIGINAL" : "TIKTOK MP3 320K"
      );
    });
  }

  // --- Core Downloader Engine ---
  async function startDownloadJob(endpoint, payload, label) {
    hideAlert();
    downloadStatusSection.classList.remove("hidden");
    downloadActiveState.classList.remove("hidden");
    downloadCompletedState.classList.add("hidden");

    activeStatusTitle.textContent = "Conectando con el servidor...";
    activeFormatLabel.textContent = label;
    progressPercent.textContent = "0%";
    progressBar.style.width = "0%";
    statSpeed.textContent = "Iniciando descarga...";
    statEta.textContent = "Calculando...";

    downloadStatusSection.scrollIntoView({ behavior: "smooth", block: "nearest" });

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al iniciar la descarga.");

      pollProgress(data.job_id);
    } catch (err) {
      showAlert(err.message || "Error al contactar al motor de descargas.");
      downloadStatusSection.classList.add("hidden");
    }
  }

  function pollProgress(jobId) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(getApiUrl(`/api/progress/${jobId}`));
        if (!res.ok) {
          clearInterval(pollInterval);
          showAlert("Error al monitorear la descarga.");
          return;
        }

        const job = await res.json();
        const status = job.status;

        if (status === "queued") {
          activeStatusTitle.textContent = "En cola de espera...";
          statSpeed.textContent = "Iniciando motor...";
        } else if (status === "downloading") {
          activeStatusTitle.textContent = "Descargando archivo...";
          const pct = job.progress || 0;
          progressPercent.textContent = `${pct}%`;
          progressBar.style.width = `${pct}%`;
          statSpeed.textContent = job.speed || "--";
          statEta.textContent = job.eta ? `Restante: ${job.eta}` : "--";
        } else if (status === "processing") {
          activeStatusTitle.textContent = "Procesando códecs de alta fidelidad...";
          progressPercent.textContent = "99%";
          progressBar.style.width = "99%";
          statSpeed.textContent = "FFmpeg Engine";
          statEta.textContent = "Casi listo...";
        } else if (status === "completed") {
          clearInterval(pollInterval);

          downloadActiveState.classList.add("hidden");
          downloadCompletedState.classList.remove("hidden");

          completedFileName.textContent = job.filename || "Archivo descargado";
          completedFileSize.textContent = job.size_mb ? `Tamaño: ${job.size_mb}` : "Listo";
          btnSaveFile.href = getApiUrl(`/api/file/${jobId}`);
          btnSaveFile.setAttribute("download", job.filename || "descarga");
          btnSaveFile.removeAttribute("target");

          if (window.lucide) window.lucide.createIcons();
          loadHistory();
        } else if (status === "error") {
          clearInterval(pollInterval);
          showAlert(`Error: ${job.error_message || "Desconocido"}`);
          downloadStatusSection.classList.add("hidden");
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    }, 500);
  }

  // --- Downloads History ---
  const downloadsHistoryList = document.getElementById("downloadsHistoryList");
  const btnRefreshHistory = document.getElementById("btnRefreshHistory");

  async function loadHistory() {
    if (!downloadsHistoryList) return;
    try {
      const res = await fetch(getApiUrl("/api/downloads"));
      const data = await res.json();
      const files = data.downloads || [];

      downloadsHistoryList.innerHTML = "";
      if (files.length === 0) {
        downloadsHistoryList.innerHTML = `
          <div class="text-center py-4 text-xs text-[#86868b]">
            No hay descargas recientes aún.
          </div>
        `;
        return;
      }

      files.forEach((file) => {
        const isTikTok = file.name.includes("[TikTok]");
        const isAudio = file.name.endsWith(".mp3") || file.name.endsWith(".m4a") || file.name.endsWith(".wav");
        const tag = isTikTok ? (isAudio ? "TikTok Audio" : "TikTok HD") : (isAudio ? "Audio MP3" : "YouTube MP4");

        const row = document.createElement("div");
        row.className = "flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[#1c1c1e] text-xs transition border border-transparent hover:border-white/5";
        row.innerHTML = `
          <div class="flex items-center gap-3 min-w-0 pr-3">
            <div class="w-6 h-6 rounded-md bg-[#2c2c2e] text-neutral-300 flex items-center justify-center flex-shrink-0 text-[11px]">
              <i data-lucide="${isAudio ? 'music' : 'video'}" class="w-3.5 h-3.5"></i>
            </div>
            <div class="min-w-0">
              <div class="font-medium text-[#f5f5f7] truncate">${file.name}</div>
              <div class="text-[11px] text-[#86868b]">${tag} • ${file.size_mb}</div>
            </div>
          </div>
          <a href="${getApiUrl(`/api/file-by-name/${encodeURIComponent(file.name)}`)}" download="${file.name}" class="text-xs text-neutral-300 hover:text-white transition flex-shrink-0 px-2.5 py-1 rounded-md bg-[#2c2c2e] hover:bg-[#3a3a3c] flex items-center gap-1.5">
            <i data-lucide="download" class="w-3 h-3"></i>
            <span>Descargar</span>
          </a>
        `;

        downloadsHistoryList.appendChild(row);
      });

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error("Error loading history:", e);
    }
  }

  if (btnRefreshHistory) btnRefreshHistory.addEventListener("click", loadHistory);

  // Initialize
  loadHistory();
});
