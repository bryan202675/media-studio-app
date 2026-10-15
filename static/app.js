document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    window.lucide.createIcons();
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

  const btnRefreshHistory = document.getElementById("btnRefreshHistory");
  const downloadsHistoryList = document.getElementById("downloadsHistoryList");

  let pollInterval = null;

  // --- YouTube Section ---
  const urlForm = document.getElementById("urlForm");
  const videoUrlInput = document.getElementById("videoUrl");
  const btnPaste = document.getElementById("btnPaste");
  const btnAnalyze = document.getElementById("btnAnalyze");
  const videoPreviewSection = document.getElementById("videoPreviewSection");
  const metaThumbnail = document.getElementById("metaThumbnail");
  const metaTitle = document.getElementById("metaTitle");
  const metaChannel = document.getElementById("metaChannel");
  const metaViews = document.getElementById("metaViews");
  const metaDuration = document.getElementById("metaDuration");
  const maxResBadge = document.getElementById("maxResBadge");
  const resChips = document.getElementById("resChips");

  const tabVideo = document.getElementById("tabVideo");
  const tabAudio = document.getElementById("tabAudio");
  const videoFormatsPanel = document.getElementById("videoFormatsPanel");
  const audioFormatsPanel = document.getElementById("audioFormatsPanel");
  const formatCards = document.querySelectorAll(".format-option-card");
  const btnStartDownload = document.getElementById("btnStartDownload");

  btnPaste.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        videoUrlInput.value = text.trim();
        analyzeYoutube(text.trim());
      }
    } catch {
      videoUrlInput.focus();
    }
  });

  document.querySelectorAll(".sample-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = btn.getAttribute("data-url");
      videoUrlInput.value = u;
      analyzeYoutube(u);
    });
  });

  urlForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const u = videoUrlInput.value.trim();
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
      const res = await fetch("/api/info", {
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

  function renderYoutube(info) {
    metaTitle.textContent = info.title;
    metaChannel.textContent = info.channel;
    metaViews.textContent = info.views_str;
    metaDuration.textContent = info.duration_str;
    metaThumbnail.src = info.thumbnail || "";
    maxResBadge.textContent = info.max_resolution || "HD";

    resChips.innerHTML = "";
    if (info.available_resolutions && info.available_resolutions.length > 0) {
      info.available_resolutions.forEach((h) => {
        const chip = document.createElement("span");
        chip.className = "px-2 py-0.5 rounded text-[10px] font-mono bg-[#121214] border border-white/[0.08] text-neutral-300";
        chip.textContent = `${h}p`;
        if (h >= 1080) chip.className += " text-white font-medium";
        resChips.appendChild(chip);
      });
    }

    videoPreviewSection.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();
    videoPreviewSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  tabVideo.addEventListener("click", () => {
    tabVideo.className = "px-4 py-1 text-xs font-medium rounded-md bg-[#2c2c2e] text-white transition";
    tabAudio.className = "px-4 py-1 text-xs font-medium rounded-md text-[#86868b] hover:text-white transition";
    videoFormatsPanel.classList.remove("hidden");
    audioFormatsPanel.classList.add("hidden");
  });

  tabAudio.addEventListener("click", () => {
    tabAudio.className = "px-4 py-1 text-xs font-medium rounded-md bg-[#2c2c2e] text-white transition";
    tabVideo.className = "px-4 py-1 text-xs font-medium rounded-md text-[#86868b] hover:text-white transition";
    audioFormatsPanel.classList.remove("hidden");
    videoFormatsPanel.classList.add("hidden");
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
    const formatType = radio ? radio.value : "mp4-1080";
    const url = videoUrlInput.value.trim();
    if (!url) {
      showAlert("Enlace no válido.");
      return;
    }
    startDownload("/api/download", { url, format_type: formatType }, `YouTube • ${formatType.toUpperCase()}`);
  });

  // --- TikTok Section ---
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

  btnTiktokPaste.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        tiktokUrlInput.value = text.trim();
        analyzeTiktok(text.trim());
      }
    } catch {
      tiktokUrlInput.focus();
    }
  });

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
      const res = await fetch("/api/tiktok/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al analizar TikTok.");

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
      showAlert("Enlace no válido.");
      return;
    }
    startDownload("/api/tiktok/download", { url, format_type: formatType }, "TikTok • Sin Marca HD");
  });

  // --- Unified Download Execution ---
  async function startDownload(endpoint, payload, label) {
    downloadStatusSection.classList.remove("hidden");
    downloadActiveState.classList.remove("hidden");
    downloadCompletedState.classList.add("hidden");

    activeStatusTitle.textContent = "Conectando...";
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
        const res = await fetch(`/api/progress/${jobId}`);
        if (!res.ok) {
          clearInterval(pollInterval);
          showAlert("Error al monitorear la descarga.");
          return;
        }

        const job = await res.json();
        const status = job.status;

        if (status === "downloading") {
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
          btnSaveFile.href = `/api/file/${jobId}`;
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

  async function loadHistory() {
    try {
      const res = await fetch("/api/downloads");
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
          <a href="/api/file-by-name/${encodeURIComponent(file.name)}" download="${file.name}" class="text-xs text-neutral-300 hover:text-white transition flex-shrink-0 px-2.5 py-1 rounded-md bg-[#2c2c2e] hover:bg-[#3a3a3c] flex items-center gap-1.5">
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
  loadHistory();
});
