const EFFECT_OPTIONS = [
  "Off",
  "Wave (soft)",
  "Wave (pulse)",
  "Waterfall",
  "Color cycle",
  "Breathing",
  "Solid color",
  "Glow on keypress",
  "Ripple on keypress",
  "Row on keypress",
  "Random",
  "Rainbow",
  "Rainbow waterfall",
  "Wave from center",
  "Spiral",
  "Rain drops",
  "Wave (bounce)",
  "Hue shift",
  "Rainbow from center",
];

const LED_MODE_OPTIONS = [
  "Pulse",
  "Rainbow pulse",
  "Pulse (alt)",
  "Solid",
  "Solid (alt)",
];

const COLOR_NAMES = [
  "Red", "Orange", "Yellow", "Green", "Teal", "Blue", "Purple", "White", "Off",
];

const HUE_SWATCHES = [
  { name: "Red", rgb: { red: 255, green: 0, blue: 0 }, hex: "#ff0000" },
  { name: "Orange", rgb: { red: 255, green: 128, blue: 0 }, hex: "#ff8000" },
  { name: "Yellow", rgb: { red: 255, green: 255, blue: 0 }, hex: "#ffff00" },
  { name: "Green", rgb: { red: 0, green: 255, blue: 0 }, hex: "#00ff00" },
  { name: "Cyan", rgb: { red: 0, green: 255, blue: 255 }, hex: "#00ffff" },
  { name: "Blue", rgb: { red: 0, green: 0, blue: 255 }, hex: "#0000ff" },
  { name: "Purple", rgb: { red: 128, green: 0, blue: 255 }, hex: "#8000ff" },
  { name: "White", rgb: { red: 255, green: 255, blue: 255 }, hex: "#ffffff" },
];

const ColorsView = {
  _presets: null,
  _busy: false,
  _colorPicker: null,
  _tab: "underglow",
  _ug: { effect: 0, brightness: 5, speed: 5, orientation: 1, rainbow: 0, hue: { red: 255, green: 255, blue: 255 } },
  _led: { mode: 3, color: 0, saturation: 5, rainbow: 0 },
  _display: 0,

  async render() {
    this._busy = false;
    this._colorPicker = null;
    document.getElementById("panel-controls").innerHTML = `
      <div class="state-block"><div class="spinner"></div><p class="state-desc">Loading…</p></div>`;

    const [presetsResult, configResult] = await Promise.all([
      window.gmk87.getPresets(),
      window.gmk87.readConfig(),
    ]);

    if (presetsResult.success) this._presets = presetsResult.data;

    if (configResult.success) {
      const cfg = configResult.data;
      if (cfg.underglow) {
        this._ug = { ...this._ug, ...cfg.underglow };
        if (cfg.underglow.hue) this._ug.hue = { ...this._ug.hue, ...cfg.underglow.hue };
      }
      if (cfg.led) this._led = { ...this._led, ...cfg.led };
      this._display = cfg.showImage ?? 0;
    }

    this._renderControls();
  },

  _renderControls() {
    document.getElementById("panel-controls").innerHTML = `
      <nav class="tab-strip" id="colors-tabs">
        ${this._presets ? `<button type="button" class="tab-btn ${this._tab === "presets" ? "is-active" : ""}" data-tab="presets">Presets</button>` : ""}
        <button type="button" class="tab-btn ${this._tab === "underglow" ? "is-active" : ""}" data-tab="underglow">Underglow</button>
        <button type="button" class="tab-btn ${this._tab === "led" ? "is-active" : ""}" data-tab="led">LED bar</button>
        <button type="button" class="tab-btn ${this._tab === "display" ? "is-active" : ""}" data-tab="display">LCD</button>
      </nav>
      <div class="tab-body" id="colors-tab-body">${this._renderTab()}</div>
      <div class="panel-actions">
        <button class="btn btn--solid btn--wide" id="colors-apply">Apply changes</button>
      </div>`;

    document.querySelectorAll("#colors-tabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._tab = btn.dataset.tab;
        this._colorPicker = null;
        this._renderControls();
      });
    });

    document.getElementById("colors-apply").addEventListener("click", () => this._apply());
    this._bindTab();
  },

  _renderTab() {
    switch (this._tab) {
      case "presets":
        return this._tabPresets();
      case "underglow":
        return this._tabUnderglow();
      case "led":
        return this._tabLed();
      case "display":
        return this._tabDisplay();
      default:
        return "";
    }
  },

  _tabPresets() {
    if (!this._presets) return `<p class="muted">No presets</p>`;
    return `
      <p class="panel-lead">Tap a preset to apply.</p>
      <div class="chip-grid">
        ${Object.keys(this._presets).map((name) =>
          `<button type="button" class="chip" data-preset="${name}">${name}</button>`
        ).join("")}
      </div>`;
  },

  _tabUnderglow() {
    const ug = this._ug;
    const activeSwatch = HUE_SWATCHES.findIndex(
      (s) => s.rgb.red === ug.hue.red && s.rgb.green === ug.hue.green && s.rgb.blue === ug.hue.blue
    );
    const isCustom = activeSwatch === -1;
    return `
      <div class="field">
        <label class="field-label">Effect</label>
        <select id="ug-effect">${EFFECT_OPTIONS.map((n, i) =>
          `<option value="${i}" ${i === ug.effect ? "selected" : ""}>${n}</option>`
        ).join("")}</select>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Brightness</label>
          <div class="range-row">
            <input type="range" id="ug-brightness" min="0" max="9" value="${ug.brightness}">
            <output id="ug-brightness-val">${ug.brightness}</output>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Speed</label>
          <div class="range-row">
            <input type="range" id="ug-speed" min="0" max="9" value="${ug.speed}">
            <output id="ug-speed-val">${ug.speed}</output>
          </div>
        </div>
      </div>
      <div class="field-row field-row--toggles">
        <label class="toggle-field"><span>Reverse direction</span><input type="checkbox" id="ug-orientation" ${ug.orientation ? "checked" : ""}><i></i></label>
        <label class="toggle-field"><span>Rainbow mode</span><input type="checkbox" id="ug-rainbow" ${ug.rainbow ? "checked" : ""}><i></i></label>
      </div>
      <div class="field">
        <label class="field-label">Color</label>
        <div class="swatch-row" id="ug-hue-swatches">
          ${HUE_SWATCHES.map((s, i) =>
            `<button type="button" class="swatch ${i === activeSwatch ? "is-active" : ""}" data-hue="${i}" style="background:${s.hex}" title="${s.name}"></button>`
          ).join("")}
          <button type="button" class="swatch swatch--wheel ${isCustom ? "is-active" : ""}" data-hue="custom" title="Custom"></button>
        </div>
        <div id="ug-hue-picker" class="${isCustom ? "" : "is-hidden"} ${ug.rainbow ? "is-dimmed" : ""}"></div>
      </div>`;
  },

  _tabLed() {
    const led = this._led;
    return `
      <div class="field">
        <label class="field-label">Mode</label>
        <select id="led-mode">${LED_MODE_OPTIONS.map((n, i) =>
          `<option value="${i}" ${i === led.mode ? "selected" : ""}>${n}</option>`
        ).join("")}</select>
      </div>
      <div class="field">
        <label class="field-label">Color</label>
        <div class="swatch-row">
          ${COLOR_NAMES.map((name, i) =>
            `<button type="button" class="swatch swatch--led ${i === led.color ? "is-active" : ""}" data-color="${i}" data-led-color title="${name}"></button>`
          ).join("")}
        </div>
      </div>
      <div class="field">
        <label class="field-label">Saturation</label>
        <div class="range-row">
          <input type="range" id="led-saturation" min="0" max="9" value="${led.saturation}">
          <output id="led-saturation-val">${led.saturation}</output>
        </div>
      </div>
      <label class="toggle-field"><span>Rainbow mode</span><input type="checkbox" id="led-rainbow" ${led.rainbow ? "checked" : ""}><i></i></label>`;
  },

  _tabDisplay() {
    return `
      <p class="panel-lead">What the LCD shows.</p>
      <div class="segmented" id="display-segment">
        <button type="button" class="${this._display === 0 ? "is-active" : ""}" data-display="0">Clock</button>
        <button type="button" class="${this._display === 1 ? "is-active" : ""}" data-display="1">Slot 0</button>
        <button type="button" class="${this._display === 2 ? "is-active" : ""}" data-display="2">Slot 1</button>
      </div>`;
  },

  _bindTab() {
    if (this._tab === "presets") {
      document.querySelectorAll("[data-preset]").forEach((btn) => {
        btn.addEventListener("click", () => this._applyPreset(btn.dataset.preset));
      });
      return;
    }

    if (this._tab === "underglow") {
      document.getElementById("ug-effect").addEventListener("change", (e) => {
        this._ug.effect = parseInt(e.target.value);
      });
      document.getElementById("ug-brightness").addEventListener("input", (e) => {
        this._ug.brightness = parseInt(e.target.value);
        document.getElementById("ug-brightness-val").textContent = e.target.value;
      });
      document.getElementById("ug-speed").addEventListener("input", (e) => {
        this._ug.speed = parseInt(e.target.value);
        document.getElementById("ug-speed-val").textContent = e.target.value;
      });
      document.getElementById("ug-orientation").addEventListener("change", (e) => {
        this._ug.orientation = e.target.checked ? 1 : 0;
      });
      const picker = document.getElementById("ug-hue-picker");
      document.getElementById("ug-rainbow").addEventListener("change", (e) => {
        this._ug.rainbow = e.target.checked ? 1 : 0;
        picker.classList.toggle("is-dimmed", e.target.checked);
      });
      document.querySelectorAll("#ug-hue-swatches .swatch").forEach((sw) => {
        sw.addEventListener("click", () => {
          document.querySelectorAll("#ug-hue-swatches .swatch").forEach((s) => s.classList.remove("is-active"));
          sw.classList.add("is-active");
          if (sw.dataset.hue === "custom") {
            picker.classList.remove("is-hidden");
            this._initColorPicker();
          } else {
            picker.classList.add("is-hidden");
            this._ug.hue = { ...HUE_SWATCHES[parseInt(sw.dataset.hue)].rgb };
          }
        });
      });
      if (document.querySelector("#ug-hue-swatches .swatch--wheel.is-active")) {
        this._initColorPicker();
      }
    }

    if (this._tab === "led") {
      document.getElementById("led-mode").addEventListener("change", (e) => {
        this._led.mode = parseInt(e.target.value);
      });
      document.getElementById("led-saturation").addEventListener("input", (e) => {
        this._led.saturation = parseInt(e.target.value);
        document.getElementById("led-saturation-val").textContent = e.target.value;
      });
      document.getElementById("led-rainbow").addEventListener("change", (e) => {
        this._led.rainbow = e.target.checked ? 1 : 0;
      });
      document.querySelectorAll("[data-led-color]").forEach((sw) => {
        sw.addEventListener("click", () => {
          document.querySelectorAll("[data-led-color]").forEach((s) => s.classList.remove("is-active"));
          sw.classList.add("is-active");
          this._led.color = parseInt(sw.dataset.color);
        });
      });
    }

    if (this._tab === "display") {
      document.querySelectorAll("#display-segment button").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll("#display-segment button").forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          this._display = parseInt(btn.dataset.display);
        });
      });
    }
  },

  async _applyPreset(name) {
    if (this._busy) return;
    const ok = await this._confirm(`Apply preset "${name}"? This overwrites current settings.`);
    if (!ok) return;

    this._busy = true;
    const result = await window.gmk87.applyPreset(name);
    this._busy = false;

    if (result.success) {
      Toast.success(`Preset "${name}" applied`);
      const cfg = await window.gmk87.readConfig();
      if (cfg.success) {
        const c = cfg.data;
        if (c.underglow) {
          this._ug = { ...this._ug, ...c.underglow };
          if (c.underglow.hue) this._ug.hue = { ...this._ug.hue, ...c.underglow.hue };
        }
        if (c.led) this._led = { ...this._led, ...c.led };
        this._display = c.showImage ?? 0;
        this._renderControls();
      }
    } else {
      Toast.error(result.error || "Preset failed");
    }
  },

  _confirm(text) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "overlay";
      overlay.innerHTML = `
        <div class="dialog">
          <h2 class="dialog-title">Confirm</h2>
          <p class="dialog-text">${text}</p>
          <div class="dialog-actions">
            <button class="btn btn--ghost" data-no>Cancel</button>
            <button class="btn btn--solid" data-yes>Apply</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector("[data-no]").addEventListener("click", () => { overlay.remove(); resolve(false); });
      overlay.querySelector("[data-yes]").addEventListener("click", () => { overlay.remove(); resolve(true); });
    });
  },

  async _apply() {
    if (this._busy) return;
    this._busy = true;
    const btn = document.getElementById("colors-apply");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Applying…`;

    const result = await window.gmk87.setLighting({
      underglow: { ...this._ug },
      led: { ...this._led },
      showImage: this._display,
    });

    this._busy = false;
    btn.disabled = false;
    btn.innerHTML = "Apply changes";

    if (result.success) {
      const toastByTab = {
        display: "Display updated",
        underglow: "Underglow updated",
        led: "LED bar updated",
      };
      Toast.success(toastByTab[this._tab] || "Settings applied");
    } else Toast.error(result.error || "Failed");
  },

  _initColorPicker() {
    if (this._colorPicker) return;
    const hex = Stage.hexFromRgb(this._ug.hue);
    this._colorPicker = new iro.ColorPicker("#ug-hue-picker", {
      width: 140,
      color: hex,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
      handleRadius: 7,
      layout: [{ component: iro.ui.Wheel }],
    });
    this._colorPicker.on("color:change", (color) => {
      this._ug.hue = { red: color.rgb.r, green: color.rgb.g, blue: color.rgb.b };
    });
  },
};

// LED swatch colors via CSS data attributes — set in stylesheet
