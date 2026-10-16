document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // --- Backend Configuration & Health ---
  function getCustomBackend() {
    return (localStorage.getItem("media_studio_backend_url") || "").trim();
  }

  function getApiUrl(path) {
    const base = getCustomBackend();
    if (!base) return path;
    return `${base.replace(/\/+$/, "")}${path}`;
  }

  const btnBackendStatus = document.getElementById("btnBackendStatus");
  const backendStatusDot = document.getElementById("backendStatusDot");
  const backendStatusLabel = document.getElementById("backendStatusLabel");
  const backendModal = document.getElementById("backendModal");
  const btnCloseBackendModal = document.getElementById("btnCloseBackendModal");
  const modalBackendStatus = document.getElementById("modalBackendStatus");
  const modalFfmpegStatus = document.getElementById("modalFfmpegStatus");
  const modalSizeLimit = document.getElementById("modalSizeLimit");
  const inputBackendUrl = document.getElementById("inputBackendUrl");
  const btnSaveBackendUrl = document.getElementById("btnSaveBackendUrl");
  const btnResetBackendUrl = document.getElementById("btnResetBackendUrl");

  let currentBackendHealth = null;

  async function checkBackendHealth() {
    try {
      const res = await fetch(getApiUrl("/api/health"), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        currentBackendHealth = data;
        const isCustom = Boolean(getCustomBackend());

        if (data.ffmpeg) {
          backendStatusDot.className = "w-1.5 h-1.5 rounded-full bg-emerald-500";
          backendStatusLabel.textContent = isCustom ? "Dedicado (FFmpeg)" : "Servidor Completo";
          modalBackendStatus.textContent = isCustom ? "Servidor Dedicado Conectado" : "Servidor Completo Local/Docker";
          modalBackendStatus.className = "font-medium text-emerald-400";
          modalFfmpegStatus.textContent = "Activo (H.264, AAC, MP3 320k)";
          modalFfmpegStatus.className = "font-medium text-emerald-400";
          modalSizeLimit.textContent = "Sin límites (1080p, 4K, ilimitado)";
          modalSizeLimit.className = "font-medium text-emerald-400";
        } else {
          backendStatusDot.className = "w-1.5 h-1.5 rounded-full bg-amber-400";
          backendStatusLabel.textContent = "Vercel Serverless";
          modalBackendStatus.textContent = "Vercel Cloud (Serverless)";
          modalBackendStatus.className = "font-medium text-amber-400";
          modalFfmpegStatus.textContent = "No disponible en Serverless";
          modalFfmpegStatus.className = "font-medium text-[#86868b]";
          modalSizeLimit.textContent = "Máx 4.5 MB por descarga";
          modalSizeLimit.className = "font-medium text-amber-400";
        }
      } else {
        throw new Error("HTTP " + res.status);
      }
    } catch (e) {
      backendStatusDot.className = "w-1.5 h-1.5 rounded-full bg-rose-500";
      backendStatusLabel.textContent = "Desconectado";
      modalBackendStatus.textContent = "No responde";
      modalBackendStatus.className = "font-medium text-rose-400";
      modalFfmpegStatus.textContent = "--";
      modalSizeLimit.textContent = "--";
    }
  }

  if (btnBackendStatus) {
    btnBackendStatus.addEventListener("click", () => {
      inputBackendUrl.value = getCustomBackend();
      backendModal.classList.remove("hidden");
    });
  }

  if (btnCloseBackendModal) {
    btnCloseBackendModal.addEventListener("click", () => {
      backendModal.classList.add("hidden");
    });
  }

  if (btnSaveBackendUrl) {
    btnSaveBackendUrl.addEventListener("click", async () => {
      const val = (inputBackendUrl.value || "").trim().replace(/\/+$/, "");
      if (val) {
        localStorage.setItem("media_studio_backend_url", val);
      } else {
        localStorage.removeItem("media_studio_backend_url");
      }
      await checkBackendHealth();
      backendModal.classList.add("hidden");
      loadHistory();
    });
  }

  if (btnResetBackendUrl) {
    btnResetBackendUrl.addEventListener("click", async () => {
      localStorage.removeItem("media_studio_backend_url");
      inputBackendUrl.value = "";
      await checkBackendHealth();
      backendModal.classList.add("hidden");
      loadHistory();
    });
  }

  // --- Platform Navigation (YouTube vs TikTok) ---
  const tabPlatformYoutube = document.getElementById("tabPlatformYoutube");
  const tabPlatformTiktok = document.getElementById("tabPlatformTiktok");
  const screenYoutube = document.getElementById("screenYoutube");
  const screenTiktok = document.getElementById("screenTiktok");

  function switchPlatform(platform) {
    hideAlert();
    downloadStatusSection.classList.add("hidden");

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

  tabPlatformYoutube.addEventListener("click", () => switchPlatform("youtube"));
  tabPlatformTiktok.addEventListener("click", () => switchPlatform("tiktok"));

  // --- Shared Alert ---
  const alertBox = document.getElementById("alertBox");
  const alertMessage = document.getElementById("alertMessage");
  const btnCloseAlert = document.getElementById("btnCloseAlert");

  function showAlert(msg) {
    alertMessage.textContent = msg;
    alertBox.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();
  }

  function hideAlert() {
    alertBox.classList.add("hidden");
  }

  btnCloseAlert.addEventListener("click", hideAlert);

  // --- Shared Progress Elements ---
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

  // --- YouTube Section Logic ---
  const urlForm = document.getElementById("urlForm");
  const youtubeUrlInput = document.getElementById("youtubeUrlInput");
  const btnAnalyze = document.getElementById("btnAnalyze");
  const videoPreviewSection = document.getElementById("videoPreviewSection");

  const ytThumbnail = document.getElementById("ytThumbnail");
  const ytDuration = document.getElementById("ytDuration");
  const ytChannel = document.getElementById("ytChannel");
  const ytViews = document.getElementById("ytViews");
  const ytUploadDate = document.getElementById("ytUploadDate");
  const ytTitle = document.getElementById("ytTitle");

  const tabTypeVideo = document.getElementById("tabTypeVideo");
  const tabTypeAudio = document.getElementById("tabTypeAudio");
  const videoFormatsPanel = document.getElementById("videoFormatsPanel");
  const audioFormatsPanel = document.getElementById("audioFormatsPanel");
  const formatCards = document.querySelectorAll(".format-option-card");
  const btnStartDownload = document.getElementById("btnStartDownload");

  document.querySelectorAll(".sample-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = btn.getAttribute("data-url");
      youtubeUrlInput.value = u;
      analyzeYoutube(u);
    });
  });

  urlForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const u = youtubeUrlInput.value.trim();
    if (!u) {
      showAlert("Ingresa un enlace de YouTube.");
      return;
    }
    analyzeYoutube(u);
  });

  async function analyzeYoutube(url) {
    hideAlert();
    videoPreviewSection.classList.add("hidden");
    downloadStatusSection.classList.add("hidden");

    btnAnalyze.disabled = true;
    btnAnalyze.innerHTML = `<span>Analizando...</span>`;

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
      showAlert(err.message);
    } finally {
      btnAnalyze.disabled = false;
      btnAnalyze.innerHTML = `<span>Analizar</span>`;
    }
  }

  function renderYoutube(data) {
    ytThumbnail.src = data.thumbnail || "";
    ytDuration.textContent = data.duration_str || "00:00";
    ytChannel.textContent = data.uploader || "YouTube";
    ytViews.textContent = data.views_str || "";
    ytUploadDate.textContent = data.upload_date || "";
    ytTitle.textContent = data.title || "Video";

    videoPreviewSection.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();
    videoPreviewSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  tabTypeVideo.addEventListener("click", () => {
    tabTypeVideo.className = "px-4 py-1 rounded-full font-medium bg-[#2c2c2e] text-white shadow-sm transition-all";
    tabTypeAudio.className = "px-4 py-1 rounded-full font-medium text-[#86868b] hover:text-white transition-all";
    videoFormatsPanel.classList.remove("hidden");
    audioFormatsPanel.classList.add("hidden");

    const r = videoFormatsPanel.querySelector('input[type="radio"]');
    if (r) r.click();
  });

  tabTypeAudio.addEventListener("click", () => {
    tabTypeAudio.className = "px-4 py-1 rounded-full font-medium bg-[#2c2c2e] text-white shadow-sm transition-all";
    tabTypeVideo.className = "px-4 py-1 rounded-full font-medium text-[#86868b] hover:text-white transition-all";
    audioFormatsPanel.classList.remove("hidden");
    videoFormatsPanel.classList.add("hidden");

    const r = audioFormatsPanel.querySelector('input[type="radio"]');
    if (r) r.click();
  });

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

  btnStartDownload.addEventListener("click", () => {
    const radio = document.querySelector('input[name="format_choice"]:checked');
    const formatType = radio ? radio.value : "mp4-best";
    const url = youtubeUrlInput.value.trim();
    if (!url) {
      showAlert("Ingresa una URL válida.");
      return;
    }

    startDownloadJob(
      getApiUrl("/api/download"),
      { url, format_type: formatType },
      formatType.toUpperCase()
    );
  });

  // --- TikTok Section Logic ---
  const tiktokUrlForm = document.getElementById("tiktokUrlForm");
  const tiktokUrlInput = document.getElementById("tiktokUrlInput");
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

  document.querySelectorAll(".sample-tiktok-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = btn.getAttribute("data-url");
      tiktokUrlInput.value = u;
      analyzeTiktok(u);
    });
  });

  tiktokUrlForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const u = tiktokUrlInput.value.trim();
    if (!u) {
      showAlert("Ingresa un enlace de TikTok.");
      return;
    }
    analyzeTiktok(u);
  });

  async function analyzeTiktok(url) {
    hideAlert();
    tiktokPreviewSection.classList.add("hidden");
    downloadStatusSection.classList.add("hidden");

    btnAnalyzeTiktok.disabled = true;
    btnAnalyzeTiktok.innerHTML = `<span>Analizando...</span>`;

    try {
      const res = await fetch(getApiUrl("/api/tiktok/info"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al analizar TikTok.");

      currentTiktokData = data;
      renderTiktok(data);
    } catch (err) {
      showAlert(err.message);
    } finally {
      btnAnalyzeTiktok.disabled = false;
      btnAnalyzeTiktok.innerHTML = `<span>Analizar</span>`;
    }
  }

  function renderTiktok(data) {
    tiktokThumbnail.src = data.cover || "";
    tiktokDuration.textContent = data.duration_str || "00:15";
    tiktokAvatar.src = data.avatar || "";
    tiktokAuthorName.textContent = data.author_name || "Creador";
    tiktokAuthorUser.textContent = data.author_username || "@usuario";
    tiktokTitle.textContent = data.title || "Video de TikTok";
    tiktokMusicTitle.textContent = data.music_title || "Audio original";
    tiktokLikes.textContent = data.likes_str || "0";
    tiktokComments.textContent = data.comments_str || "0";
    tiktokViews.textContent = data.views_str || "0";

    tiktokPreviewSection.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();
    tiktokPreviewSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

  btnStartTiktokDownload.addEventListener("click", () => {
    const radio = document.querySelector('input[name="tiktok_format_choice"]:checked');
    const formatType = radio ? radio.value : "tiktok-mp4-hd";
    const url = tiktokUrlInput.value.trim();
    if (!url) {
      showAlert("Ingresa una URL válida de TikTok.");
      return;
    }

    // Direct CDN download optimization for TikTok HD without watermark:
    // If on serverless without FFmpeg, bypass server limits directly!
    if (formatType === "tiktok-mp4-hd" && currentTiktokData?.direct_video_hd && (!currentBackendHealth || !currentBackendHealth.ffmpeg)) {
      downloadStatusSection.classList.remove("hidden");
      downloadActiveState.classList.add("hidden");
      downloadCompletedState.classList.remove("hidden");

      const cleanTitle = (currentTiktokData.title || "tiktok").replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().substring(0, 45) + ".mp4";
      completedFileName.textContent = cleanTitle;
      completedFileSize.textContent = currentTiktokData.size_mb || "Máxima Calidad HD";
      btnSaveFile.href = currentTiktokData.direct_video_hd;
      btnSaveFile.setAttribute("download", cleanTitle);
      btnSaveFile.setAttribute("target", "_blank");
      downloadStatusSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    startDownloadJob(
      getApiUrl("/api/tiktok/download"),
      { url, format_type: formatType },
      formatType === "tiktok-mp4-hd" ? "TIKTOK HD ORIGINAL" : "TIKTOK MP3 320K"
    );
  });

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
      showAlert(err.message);
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
          statSpeed.textContent = "Esperando slot...";
        } else if (status === "downloading") {
          activeStatusTitle.textContent = "Descargando archivo...";
          const pct = job.progress || 0;
          progressPercent.textContent = `${pct}%`;
          progressBar.style.width = `${pct}%`;
          statSpeed.textContent = job.speed || "--";
          statEta.textContent = job.eta ? `Restante: ${job.eta}` : "--";
        } else if (status === "processing") {
          activeStatusTitle.textContent = "Finalizando procesamiento...";
          progressPercent.textContent = "99%";
          progressBar.style.width = "99%";
          statSpeed.textContent = "FFmpeg";
          statEta.textContent = "Casi listo...";
        } else if (status === "completed") {
          clearInterval(pollInterval);

          downloadActiveState.classList.add("hidden");
          downloadCompletedState.classList.remove("hidden");

          completedFileName.textContent = job.filename || "Archivo descargado";
          completedFileSize.textContent = job.size_mb ? `Tamaño: ${job.size_mb}` : "Listo";
          btnSaveFile.href = getApiUrl(`/api/file/${jobId}`);
          btnSaveFile.setAttribute("download", job.filename || "descarga");

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

  btnRefreshHistory.addEventListener("click", loadHistory);

  // Initialize
  checkBackendHealth();
  loadHistory();
});
