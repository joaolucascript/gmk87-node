const UploadView = {
  _slot0File: null,
  _slot1File: null,
  _slot0IsGif: false,
  _slot1IsGif: false,
  _frameDuration: 100,
  _uploading: false,

  render() {
    this._slot0File = null;
    this._slot1File = null;
    this._slot0IsGif = false;
    this._slot1IsGif = false;
    this._frameDuration = 100;
    this._uploading = false;

    document.getElementById("panel-controls").innerHTML = `
      <div class="upload-panel">
        <p class="panel-lead">PNG, JPG or GIF — one file per slot.</p>

        <div class="upload-slot-control">
          <label class="field-label">Slot 0</label>
          <div class="file-row">
            <button class="btn btn--ghost" id="upload-pick-slot0">Browse</button>
            <span class="file-row-name" id="upload-slot0-name">No file</span>
            <button class="btn btn--ghost btn--sm" id="upload-clear-slot0" hidden>×</button>
          </div>
        </div>

        <div class="upload-slot-control">
          <label class="field-label">Slot 1</label>
          <div class="file-row">
            <button class="btn btn--ghost" id="upload-pick-slot1">Browse</button>
            <span class="file-row-name" id="upload-slot1-name">No file</span>
            <button class="btn btn--ghost btn--sm" id="upload-clear-slot1" hidden>×</button>
          </div>
        </div>

        <div class="field frame-delay-section" id="upload-gif-section">
          <label class="field-label">GIF frame delay</label>
          <div class="range-row">
            <input type="range" id="upload-frame-delay" min="60" max="1000" step="10" value="100">
            <output id="upload-frame-delay-value">100 ms</output>
          </div>
        </div>

        <div class="upload-log-block" id="upload-log-block">
          <label class="field-label">Activity log</label>
          <div class="upload-log" id="upload-log">
            <p class="upload-log-empty" id="upload-log-empty">Waiting for upload…</p>
          </div>
        </div>

        <div class="progress-block" id="upload-progress" hidden>
          <div class="progress-track"><div class="progress-fill" id="upload-progress-fill"></div></div>
          <span class="progress-label" id="upload-progress-text">0%</span>
        </div>

        <div class="panel-actions">
          <button class="btn btn--solid btn--wide" id="upload-btn" disabled>Upload</button>
        </div>
      </div>`;

    this._bind();
  },

  _updateGifSection() {
    document.getElementById("upload-gif-section").classList.toggle("visible", this._slot0IsGif || this._slot1IsGif);
  },

  _updateUploadBtn() {
    document.getElementById("upload-btn").disabled =
      this._uploading || (!this._slot0File && !this._slot1File);
  },

  _bind() {
    document.getElementById("upload-pick-slot0").addEventListener("click", () => this._pick(0));
    document.getElementById("upload-pick-slot1").addEventListener("click", () => this._pick(1));
    document.getElementById("upload-clear-slot0").addEventListener("click", () => this._clear(0));
    document.getElementById("upload-clear-slot1").addEventListener("click", () => this._clear(1));
    document.getElementById("upload-frame-delay").addEventListener("input", (e) => {
      this._frameDuration = parseInt(e.target.value);
      document.getElementById("upload-frame-delay-value").textContent = `${e.target.value} ms`;
    });
    document.getElementById("upload-btn").addEventListener("click", () => this._upload());
  },

  async _pick(slot) {
    if (this._uploading) return;
    const result = await window.gmk87.openFile();
    if (!result.success || !result.data) return;

    const name = result.data.split(/[/\\]/).pop();
    const isGif = result.data.toLowerCase().endsWith(".gif");

    if (slot === 0) {
      this._slot0File = result.data;
      this._slot0IsGif = isGif;
      document.getElementById("upload-slot0-name").textContent = name;
      document.getElementById("upload-clear-slot0").hidden = false;
      localStorage.setItem("gmk87-slot0-path", result.data);
    } else {
      this._slot1File = result.data;
      this._slot1IsGif = isGif;
      document.getElementById("upload-slot1-name").textContent = name;
      document.getElementById("upload-clear-slot1").hidden = false;
      localStorage.setItem("gmk87-slot1-path", result.data);
    }
    this._updateGifSection();
    this._updateUploadBtn();
  },

  _clear(slot) {
    if (this._uploading) return;
    if (slot === 0) {
      this._slot0File = null;
      this._slot0IsGif = false;
      document.getElementById("upload-slot0-name").textContent = "No file";
      document.getElementById("upload-clear-slot0").hidden = true;
    } else {
      this._slot1File = null;
      this._slot1IsGif = false;
      document.getElementById("upload-slot1-name").textContent = "No file";
      document.getElementById("upload-clear-slot1").hidden = true;
    }
    this._updateGifSection();
    this._updateUploadBtn();
  },

  _setUploadProgress(percent, status) {
    requestAnimationFrame(() => {
      document.getElementById("upload-progress").hidden = false;
      document.getElementById("upload-progress-fill").style.width = `${percent}%`;
      document.getElementById("upload-progress-text").textContent = `${percent}% · ${status}`;
      document.getElementById("upload-btn").innerHTML = `<span class="spinner"></span> ${percent}%`;
      this._appendLog(percent, status);
    });
  },

  _clearLog() {
    const log = document.getElementById("upload-log");
    if (!log) return;
    log.innerHTML = `<p class="upload-log-empty" id="upload-log-empty">Waiting for upload…</p>`;
    this._lastLogStatus = null;
  },

  _appendLog(percent, status, level = "info") {
    const log = document.getElementById("upload-log");
    if (!log) return;

    document.getElementById("upload-log-empty")?.remove();

    if (level === "info" && status === this._lastLogStatus) {
      const last = log.querySelector(".upload-log-line:last-child .upload-log-pct");
      if (last) last.textContent = `${percent}%`;
      log.scrollTop = log.scrollHeight;
      return;
    }

    this._lastLogStatus = level === "info" ? status : null;

    const time = new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const line = document.createElement("div");
    line.className = `upload-log-line upload-log-line--${level}`;
    line.innerHTML =
      `<time>${time}</time>` +
      (level === "info" ? `<span class="upload-log-pct">${percent}%</span>` : "") +
      `<span class="upload-log-msg">${this._esc(status)}</span>`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  },

  _esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  },

  _resetUploadProgress() {
    document.getElementById("upload-progress").hidden = true;
    document.getElementById("upload-progress-fill").style.width = "0%";
    document.getElementById("upload-btn").innerHTML = "Upload";
  },

  async _upload() {
    if ((!this._slot0File && !this._slot1File) || this._uploading) return;

    let slot0File = this._slot0File;
    let slot1File = this._slot1File;
    if (!slot0File && slot1File) {
      slot0File = localStorage.getItem("gmk87-slot0-path") || null;
    }
    if (!slot1File && slot0File) {
      slot1File = localStorage.getItem("gmk87-slot1-path") || null;
    }

    const hasGif =
      (slot0File && slot0File.toLowerCase().endsWith(".gif")) ||
      (slot1File && slot1File.toLowerCase().endsWith(".gif")) ||
      this._slot0IsGif ||
      this._slot1IsGif;

    this._uploading = true;
    document.getElementById("upload-btn").disabled = true;
    ["upload-pick-slot0", "upload-pick-slot1", "upload-clear-slot0", "upload-clear-slot1"].forEach((id) => {
      document.getElementById(id).disabled = true;
    });

    this._clearLog();
    this._appendLog(0, "Upload started", "info");

    const slot0Name = slot0File ? slot0File.split(/[/\\]/).pop() : "(keep from device/cache)";
    const slot1Name = slot1File ? slot1File.split(/[/\\]/).pop() : "(keep from device/cache)";
    this._appendLog(0, `Slot 0 → ${slot0Name}`, "detail");
    this._appendLog(0, `Slot 1 → ${slot1Name}`, "detail");
    if (hasGif) {
      this._appendLog(0, `GIF frame delay: ${this._frameDuration} ms`, "detail");
    }

    this._setUploadProgress(0, "Starting");
    const unlisten = window.gmk87.onUploadProgress(({ percent, status }) => {
      this._setUploadProgress(percent, status);
    });

    let result;
    try {
      result = await window.gmk87.uploadImage({
        slot0File,
        slot1File,
        frameDuration: hasGif ? this._frameDuration : undefined,
      });
    } finally {
      unlisten();
    }

    this._uploading = false;
    this._resetUploadProgress();
    ["upload-pick-slot0", "upload-pick-slot1", "upload-clear-slot0", "upload-clear-slot1"].forEach((id) => {
      document.getElementById(id).disabled = false;
    });
    this._updateUploadBtn();

    if (result.success) {
      this._appendLog(100, "Upload complete", "success");
      Toast.success("Upload complete");
    } else {
      this._appendLog(0, result.error || "Upload failed", "error");
      Toast.error(result.error || "Upload failed");
    }
  },
};
