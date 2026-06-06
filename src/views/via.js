const ViaView = {
  _defaultSize: { width: 560, height: 720 },
  // Shell chrome (~80px) + VIA nav (~50) + canvas (500) + keymap pane (~380)
  _keymapSize: { width: 1520, height: 1060 },
  _keymapMinSize: { width: 1280, height: 800 },
  _resizeDurationMs: 400,
  _savedBounds: null,
  _resizeGen: 0,
  _recording: false,
  _frame: null,
  _forwardKey: null,
  _onRecordingMessage: null,
  _onViaToast: null,

  render() {
    const workspace = document.getElementById("workspace");
    const panel = document.getElementById("panel-controls");
    workspace.classList.add("workspace--via");
    if (panel) panel.hidden = true;
    void this._expandWindow();
    this._bindRecordingBridge();
    this._bindViaToasts();

    let block = document.getElementById("via-host");
    if (!block) {
      block = document.createElement("div");
      block.id = "via-host";
      block.className = "via-host";
      workspace.appendChild(block);
    }

    block.innerHTML = `
      <div class="via-frame-wrap">
        <div class="state-block state-block--compact via-loading">
          <div class="spinner"></div>
          <p class="state-desc">Loading editor…</p>
        </div>
      </div>`;

    const frame = document.createElement("iframe");
    frame.className = "via-frame";
    frame.title = "VIA keymap editor";
    frame.hidden = true;
    frame.setAttribute("allow", "keyboard-lock; fullscreen");
    frame.tabIndex = 0;
    this._frame = frame;

    frame.addEventListener("load", () => {
      const doc = frame.contentDocument;
      if (doc) {
        doc.documentElement.setAttribute("data-gmk87-embed", "true");
        doc.documentElement.setAttribute("data-theme-mode", "dark");
      }
      const wrap = block.querySelector(".via-frame-wrap");
      const started = Date.now();
      const waitForUi = () => {
        const root = doc?.getElementById("root");
        if (root?.childElementCount > 0) {
          wrap?.querySelector(".via-loading")?.remove();
          frame.hidden = false;
          return;
        }
        if (Date.now() - started > 20000) {
          block.innerHTML = `
            <div class="via-setup state-block">
              <span class="material-symbols-outlined state-icon">keyboard</span>
              <p class="state-title">Editor did not start</p>
              <p class="state-desc">Run <code>npm run rebuild:via</code>, restart the app, then open Keymap again.</p>
            </div>`;
          return;
        }
        requestAnimationFrame(waitForUi);
      };
      waitForUi();
    });
    frame.addEventListener("error", () => {
      block.innerHTML = `
        <div class="via-setup state-block">
          <span class="material-symbols-outlined state-icon">keyboard</span>
          <p class="state-title">Could not load VIA</p>
          <p class="state-desc">Run <code>npm run rebuild:via</code> or <code>npm run setup:via</code>, then restart.</p>
        </div>`;
    });

    this._authorizeViaDevice().finally(() => {
      frame.src = "./via/index.html#/";
      block.querySelector(".via-frame-wrap")?.appendChild(frame);
    });
  },

  _bindViaToasts() {
    if (this._onViaToast) return;
    this._onViaToast = (e) => {
      if (e.data?.type !== "gmk87-via-toast") return;
      if (e.data.level === "error") Toast.error(e.data.message);
      else if (e.data.level === "success") Toast.success(e.data.message);
    };
    window.addEventListener("message", this._onViaToast);
  },

  async _authorizeViaDevice() {
    if (!navigator.hid) return;
    const viaFilter = (device) =>
      device.collections?.some(
        (c) => c.usagePage === 0xff60 && c.usage === 0x61,
      );
    const gmk87Filter = (device) =>
      device.vendorId === 0x320f &&
      (device.productId === 0x5055 || device.productId === 0x5088);

    try {
      const known = await navigator.hid.getDevices();
      if (known.some((d) => viaFilter(d) && gmk87Filter(d))) return;

      await navigator.hid.requestDevice({
        filters: [
          { vendorId: 0x320f, productId: 0x5055, usagePage: 0xff60, usage: 0x61 },
          { vendorId: 0x320f, productId: 0x5088, usagePage: 0xff60, usage: 0x61 },
        ],
      });
    } catch {
      // User dismissed the picker — VIA can still prompt inside the iframe.
    }
  },

  _bindRecordingBridge() {
    if (this._onRecordingMessage) return;

    this._forwardKey = (e) => {
      if (!this._recording || !this._frame?.contentWindow) return;
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      this._frame.contentWindow.postMessage(
        {
          type: "gmk87-forward-key",
          eventType: e.type,
          props: {
            key: e.key,
            code: e.code || (e.key === " " ? "Space" : e.code),
            location: e.location,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            repeat: e.repeat,
          },
        },
        "*",
      );
    };

    this._onRecordingMessage = (e) => {
      if (e.data?.type !== "gmk87-via-recording") return;
      this._recording = !!e.data.active;
      if (this._recording) {
        window.addEventListener("keydown", this._forwardKey, true);
        window.addEventListener("keyup", this._forwardKey, true);
      } else {
        window.removeEventListener("keydown", this._forwardKey, true);
        window.removeEventListener("keyup", this._forwardKey, true);
      }
    };

    window.addEventListener("message", this._onRecordingMessage);
  },

  _unbindRecordingBridge() {
    if (this._forwardKey) {
      window.removeEventListener("keydown", this._forwardKey, true);
      window.removeEventListener("keyup", this._forwardKey, true);
    }
    if (this._onRecordingMessage) {
      window.removeEventListener("message", this._onRecordingMessage);
      this._onRecordingMessage = null;
    }
    if (this._onViaToast) {
      window.removeEventListener("message", this._onViaToast);
      this._onViaToast = null;
    }
    this._recording = false;
    this._frame = null;
  },

  destroy() {
    this._unbindRecordingBridge();
    document.getElementById("workspace")?.classList.remove("workspace--via");
    document.getElementById("panel-controls")?.removeAttribute("hidden");
    document.getElementById("via-host")?.remove();
    void this._restoreWindow();
  },

  _chrome: null,

  _getTauriWindow() {
    const tauri = window.__TAURI__;
    const winModule = tauri?.window;
    if (!winModule?.getCurrentWindow) return null;

    const dpi = tauri?.dpi || {};
    const LogicalSize = winModule.LogicalSize || dpi.LogicalSize;
    const LogicalPosition = winModule.LogicalPosition || dpi.LogicalPosition;
    const PhysicalPosition = winModule.PhysicalPosition || dpi.PhysicalPosition;
    if (!LogicalSize) return null;

    return {
      win: winModule.getCurrentWindow(),
      LogicalSize,
      LogicalPosition,
      PhysicalPosition,
    };
  },

  _makeLogicalPosition(LogicalPosition, x, y) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (LogicalPosition) return new LogicalPosition(px, py);
    return { type: "Logical", x: px, y: py };
  },

  async _measureChrome(win) {
    if (this._chrome) return this._chrome;

    const scale = await win.scaleFactor();
    try {
      const [inner, outer] = await Promise.all([win.innerSize(), win.outerSize()]);
      this._chrome = {
        dw: (outer.width - inner.width) / scale,
        dh: (outer.height - inner.height) / scale,
      };
    } catch {
      this._chrome = { dw: 0, dh: 39 };
    }
    return this._chrome;
  },

  async _tryGetWindowCenter(win) {
    const scale = await win.scaleFactor();

    try {
      if (win.outerPosition && win.outerSize) {
        const [pos, outer] = await Promise.all([win.outerPosition(), win.outerSize()]);
        return {
          x: pos.x / scale + outer.width / scale / 2,
          y: pos.y / scale + outer.height / scale / 2,
        };
      }
    } catch {
      /* try inner */
    }

    try {
      if (win.innerPosition && win.innerSize) {
        const [pos, inner] = await Promise.all([win.innerPosition(), win.innerSize()]);
        const chrome = await this._measureChrome(win);
        return {
          x: pos.x / scale + inner.width / scale / 2 + chrome.dw / 2,
          y: pos.y / scale + inner.height / scale / 2 + chrome.dh / 2,
        };
      }
    } catch {
      /* unavailable */
    }

    return null;
  },

  async _tryGetMonitorCenter(win) {
    try {
      const monitor = await win.currentMonitor();
      if (!monitor) return null;

      const scale = monitor.scaleFactor;
      return {
        x: monitor.position.x / scale + monitor.size.width / scale / 2,
        y: monitor.position.y / scale + monitor.size.height / scale / 2,
      };
    } catch {
      return null;
    }
  },

  async _setWindowPosition(win, LogicalPosition, PhysicalPosition, scale, x, y) {
    if (!win.setPosition) return false;

    const logical = this._makeLogicalPosition(LogicalPosition, x, y);
    try {
      await win.setPosition(logical);
      return true;
    } catch {
      if (!PhysicalPosition) return false;
      await win.setPosition(
        new PhysicalPosition(Math.round(x * scale), Math.round(y * scale)),
      );
      return true;
    }
  },

  async _setWindowCenterAndSize(
    win,
    LogicalSize,
    LogicalPosition,
    PhysicalPosition,
    chrome,
    centerX,
    centerY,
    width,
    height,
  ) {
    const scale = await win.scaleFactor();
    await win.setSize(new LogicalSize(width, height));

    const outer = await win.outerSize();
    const outerW = outer.width / scale;
    const outerH = outer.height / scale;
    const x = Math.round(centerX - outerW / 2);
    const y = Math.round(centerY - outerH / 2);
    return this._setWindowPosition(win, LogicalPosition, PhysicalPosition, scale, x, y);
  },

  async _readBounds() {
    if (window.gmk87?.windowGetBounds) {
      const result = await window.gmk87.windowGetBounds();
      if (result.success) return result.data;
    }

    const ctx = this._getTauriWindow();
    if (!ctx) return null;

    const { win } = ctx;
    const center = await this._tryGetWindowCenter(win);
    if (!center) return null;

    const scale = await win.scaleFactor();
    const inner = await win.innerSize();
    const chrome = await this._measureChrome(win);
    return {
      width: inner.width / scale,
      height: inner.height / scale,
      center_x: center.x,
      center_y: center.y,
      chrome_w: chrome.dw,
      chrome_h: chrome.dh,
    };
  },

  async _readMonitorCenter() {
    if (window.gmk87?.windowGetMonitorCenter) {
      const result = await window.gmk87.windowGetMonitorCenter();
      if (result.success) return result.data;
    }

    const ctx = this._getTauriWindow();
    if (!ctx) return null;
    return this._tryGetMonitorCenter(ctx.win);
  },

  async _applyInnerSize(width, height) {
    if (window.gmk87?.windowSetInnerSize) {
      const result = await window.gmk87.windowSetInnerSize(width, height);
      if (result.success) return true;
    }

    const ctx = this._getTauriWindow();
    if (!ctx) return false;
    await ctx.win.setSize(new ctx.LogicalSize(width, height)).catch(() => {});
    return true;
  },

  async _applyCenterSize(width, height, centerX, centerY, chrome) {
    if (window.gmk87?.windowSetCenterSize) {
      const result = await window.gmk87.windowSetCenterSize({
        width,
        height,
        centerX,
        centerY,
        chromeW: chrome.chrome_w ?? chrome.dw,
        chromeH: chrome.chrome_h ?? chrome.dh,
      });
      if (result.success) return true;
    }

    const ctx = this._getTauriWindow();
    if (!ctx) return false;

    const { win, LogicalSize, LogicalPosition, PhysicalPosition } = ctx;
    const chromeNorm = {
      dw: chrome.chrome_w ?? chrome.dw ?? 0,
      dh: chrome.chrome_h ?? chrome.dh ?? 39,
    };
    return this._setWindowCenterAndSize(
      win,
      LogicalSize,
      LogicalPosition,
      PhysicalPosition,
      chromeNorm,
      centerX,
      centerY,
      width,
      height,
    );
  },

  async _setMinInnerSize(width, height) {
    if (window.gmk87?.windowSetMinInnerSize) {
      const result = await window.gmk87.windowSetMinInnerSize(width, height);
      if (result.success) return;
    }

    const ctx = this._getTauriWindow();
    if (!ctx?.win.setMinSize) return;
    await ctx.win.setMinSize(new ctx.LogicalSize(width, height)).catch(() => {});
  },

  async _computeKeymapSize(win) {
    const target = this._keymapSize;
    try {
      const monitor = await win.currentMonitor();
      if (!monitor) return target;

      const scale = monitor.scaleFactor;
      const maxW = monitor.size.width / scale - 24;
      const maxH = monitor.size.height / scale - 24;

      return {
        width: Math.min(target.width, maxW),
        height: Math.min(target.height, maxH),
      };
    } catch {
      return target;
    }
  },

  _easeWindow(t) {
    return 1 - (1 - t) ** 3;
  },

  _waitFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  },

  async _runTimedAnimation(gen, onStep) {
    const duration = this._resizeDurationMs;
    const startTime = performance.now();
    let lastKey = null;

    while (true) {
      if (gen !== this._resizeGen) return;

      const rawT = Math.min((performance.now() - startTime) / duration, 1);
      const eased = this._easeWindow(rawT);
      const step = onStep(eased, rawT >= 1);
      const key = step?.key ?? "";

      if (key !== lastKey || rawT >= 1) {
        lastKey = key;
        await step.apply();
      }

      if (rawT >= 1) return;
      await this._waitFrame();
    }
  },

  _lockContentLayout(width, height) {
    const root = document.documentElement;
    root.style.setProperty("--resize-lock-w", `${Math.round(width)}px`);
    root.style.setProperty("--resize-lock-h", `${Math.round(height)}px`);
  },

  _unlockContentLayout() {
    const root = document.documentElement;
    root.style.removeProperty("--resize-lock-w");
    root.style.removeProperty("--resize-lock-h");
  },

  async _runCenterSizeAnimation(
    startW,
    startH,
    endW,
    endH,
    startCenterX,
    startCenterY,
    endCenterX,
    endCenterY,
    chrome,
    gen,
  ) {
    const sizeClose =
      Math.abs(startW - endW) < 2 &&
      Math.abs(startH - endH) < 2;
    const centerClose =
      Math.abs(startCenterX - endCenterX) < 2 &&
      Math.abs(startCenterY - endCenterY) < 2;

    if (sizeClose && centerClose) {
      await this._applyCenterSize(endW, endH, endCenterX, endCenterY, chrome);
      return;
    }

    let fallback = false;
    await this._runTimedAnimation(gen, (eased) => {
      const nextW = Math.round(startW + (endW - startW) * eased);
      const nextH = Math.round(startH + (endH - startH) * eased);
      const nextCenterX = Math.round(
        startCenterX + (endCenterX - startCenterX) * eased,
      );
      const nextCenterY = Math.round(
        startCenterY + (endCenterY - startCenterY) * eased,
      );

      return {
        key: `${nextW},${nextH},${nextCenterX},${nextCenterY}`,
        apply: async () => {
          const moved = await this._applyCenterSize(
            nextW,
            nextH,
            nextCenterX,
            nextCenterY,
            chrome,
          );
          if (!moved) fallback = true;
        },
      };
    });

    if (fallback) {
      await this._runSizeAnimation(startW, startH, endW, endH, gen);
    }
  },

  async _runSizeAnimation(startW, startH, endW, endH, gen) {
    if (
      Math.abs(startW - endW) < 2 &&
      Math.abs(startH - endH) < 2
    ) {
      await this._applyInnerSize(endW, endH);
      return;
    }

    await this._runTimedAnimation(gen, (eased) => {
      const nextW = Math.round(startW + (endW - startW) * eased);
      const nextH = Math.round(startH + (endH - startH) * eased);

      return {
        key: `${nextW},${nextH}`,
        apply: () => this._applyInnerSize(nextW, nextH),
      };
    });
  },

  async _animateWindowSizeOnly(width, height) {
    const ctx = this._getTauriWindow();
    if (!ctx) return;

    const { win } = ctx;
    const gen = ++this._resizeGen;

    const scale = await win.scaleFactor();
    const inner = await win.innerSize();
    const startW = inner.width / scale;
    const startH = inner.height / scale;

    document.body.classList.add("is-window-resizing");
    this._lockContentLayout(startW, startH);

    try {
      await this._runSizeAnimation(startW, startH, width, height, gen);
    } finally {
      if (gen === this._resizeGen) {
        this._unlockContentLayout();
        document.body.classList.remove("is-window-resizing");
      }
    }
  },

  async _animateWindowBounds(target) {
    const start = await this._readBounds();
    const endCenterX = target.centerX ?? target.center_x;
    const endCenterY = target.centerY ?? target.center_y;

    if (!start || endCenterX == null || endCenterY == null) {
      await this._animateWindowSizeOnly(target.width, target.height);
      const ctx = this._getTauriWindow();
      if (ctx?.win.center) await ctx.win.center().catch(() => {});
      return;
    }

    const endW = target.width;
    const endH = target.height;
    const startW = start.width;
    const startH = start.height;
    const startCenterX = start.center_x;
    const startCenterY = start.center_y;
    const chrome = start;

    const sizeClose =
      Math.abs(startW - endW) < 2 &&
      Math.abs(startH - endH) < 2;
    const centerClose =
      Math.abs(startCenterX - endCenterX) < 2 &&
      Math.abs(startCenterY - endCenterY) < 2;

    if (sizeClose && centerClose) {
      await this._applyCenterSize(endW, endH, endCenterX, endCenterY, chrome);
      return;
    }

    const gen = ++this._resizeGen;
    document.body.classList.add("is-window-resizing");
    this._lockContentLayout(startW, startH);

    try {
      await this._runCenterSizeAnimation(
        startW,
        startH,
        endW,
        endH,
        startCenterX,
        startCenterY,
        endCenterX,
        endCenterY,
        chrome,
        gen,
      );
      if (gen !== this._resizeGen) return;

      await this._applyCenterSize(endW, endH, endCenterX, endCenterY, chrome);
    } finally {
      if (gen === this._resizeGen) {
        this._unlockContentLayout();
        document.body.classList.remove("is-window-resizing");
      }
    }
  },

  async _expandWindow() {
    const ctx = this._getTauriWindow();
    if (!ctx) return;

    const { win } = ctx;

    try {
      if (!this._savedBounds) {
        const bounds = await this._readBounds();
        if (bounds) {
          this._savedBounds = {
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
            centerX: bounds.center_x,
            centerY: bounds.center_y,
            chrome_w: bounds.chrome_w,
            chrome_h: bounds.chrome_h,
          };
        }
      }

      const { width, height } = await this._computeKeymapSize(win);
      const monitorCenter = await this._readMonitorCenter();
      const min = this._keymapMinSize;
      await this._setMinInnerSize(min.width, min.height);
      await this._animateWindowBounds({
        width,
        height,
        centerX: monitorCenter?.center_x,
        centerY: monitorCenter?.center_y,
      });
    } catch (err) {
      document.body.classList.remove("is-window-resizing");
      console.warn("[via] window expand failed:", err);
    }
  },

  async _restoreWindow() {
    const ctx = this._getTauriWindow();
    if (!ctx) return;

    const saved = this._savedBounds;
    this._savedBounds = null;

    const fallbackCenter = await this._readMonitorCenter();
    const bounds = saved || {
      ...this._defaultSize,
      centerX: fallbackCenter?.center_x,
      centerY: fallbackCenter?.center_y,
    };

    try {
      await this._setMinInnerSize(480, 560);
      await this._animateWindowBounds(bounds);
    } catch (err) {
      document.body.classList.remove("is-window-resizing");
      console.warn("[via] window restore failed:", err);
    }
  },
};
