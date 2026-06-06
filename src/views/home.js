const HomeView = {

  async render() {

    const controls = document.getElementById("panel-controls");



    controls.innerHTML = `<div class="state-block"><div class="spinner"></div><p class="state-desc">Connecting…</p></div>`;



    const infoResult = await window.gmk87.getInfo();



    if (!infoResult.success) {

      Shell.setConnected(false);

      controls.innerHTML = `

        <div class="state-block">

          <span class="material-symbols-outlined state-icon">usb_off</span>

          <p class="state-title">No device</p>

          <p class="state-desc">${this._esc(infoResult.error)}</p>

          <button class="btn btn--solid" id="home-retry">Retry</button>

        </div>`;

      document.getElementById("home-retry").addEventListener("click", () => this.render());

      return;

    }



    Shell.setConnected(true);

    const info = infoResult.data;



    controls.innerHTML = `
      <div class="panel-page">
        <div class="panel-head">
          <h2>${this._esc(info.product || "GMK87")}</h2>
          <button class="btn btn--ghost btn--sm" id="home-refresh">Refresh</button>
        </div>
        <dl class="spec-list">
          <div><dt>Manufacturer</dt><dd>${this._esc(info.manufacturer || "—")}</dd></div>
          <div><dt>Vendor ID</dt><dd>0x${(info.vendorId || 0).toString(16).padStart(4, "0")}</dd></div>
          <div><dt>Product ID</dt><dd>0x${(info.productId || 0).toString(16).padStart(4, "0")}</dd></div>
        </dl>
        <div id="home-config"><div class="state-block state-block--compact"><div class="spinner"></div></div></div>
      </div>`;



    document.getElementById("home-refresh").addEventListener("click", () => this.loadConfig());

    await this.loadConfig();

  },



  async loadConfig() {

    const box = document.getElementById("home-config");

    if (!box) return;



    const result = await window.gmk87.readConfig();

    if (!result.success) {

      box.innerHTML = `<p class="error-text">${this._esc(result.error)}</p>`;

      return;

    }



    const cfg = result.data;

    const ug = cfg.underglow || {};

    const led = cfg.led || {};



    box.innerHTML = Stage.statGrid([

      { label: "Underglow", value: EFFECT_NAMES[ug.effect] || "—" },

      { label: "Brightness", value: `${ug.brightness ?? "?"}/9` },

      { label: "LED bar", value: LED_MODE_NAMES[led.mode] || "—" },

      { label: "Display", value: DISPLAY_SLOT_NAMES[cfg.showImage] || "—" },

      { label: "Slot 0 frames", value: cfg.image1Frames ?? 0 },

      { label: "Slot 1 frames", value: cfg.image2Frames ?? 0 },

    ]);

  },



  _esc(str) {

    const d = document.createElement("div");

    d.textContent = str;

    return d.innerHTML;

  },

};



const EFFECT_NAMES = [
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

const LED_MODE_NAMES = [
  "Pulse",
  "Rainbow pulse",
  "Pulse (alt)",
  "Solid",
  "Solid (alt)",
];



const DISPLAY_SLOT_NAMES = ["Clock", "Slot 0", "Slot 1"];

