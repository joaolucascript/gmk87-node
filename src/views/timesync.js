const TimeSyncView = {
  _intervalId: null,

  render() {
    document.getElementById("panel-controls").innerHTML = `
      <div class="clock-page">
        <p class="panel-lead">Send system time to the keyboard LCD.</p>
        <p class="clock-digital" id="ts-clock-label">00:00:00</p>
        <div class="panel-actions">
          <button class="btn btn--solid btn--wide" id="ts-sync-btn">Sync now</button>
        </div>
      </div>`;

    this._tick();
    this._intervalId = setInterval(() => this._tick(), 1000);
    document.getElementById("ts-sync-btn").addEventListener("click", () => this._sync());
  },

  _tick() {
    const label = document.getElementById("ts-clock-label");
    if (!label) return;

    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    const blink = now.getSeconds() % 2 === 0;

    label.innerHTML =
      `${h}<span class="clock-digital__sep${blink ? "" : " is-off"}">:</span>${m}` +
      `<span class="clock-digital__sep${blink ? "" : " is-off"}">:</span>${s}`;
  },

  async _sync() {
    const btn = document.getElementById("ts-sync-btn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Syncing…`;

    const result = await window.gmk87.syncTime();

    btn.disabled = false;
    btn.textContent = "Sync now";

    if (result.success) Toast.success("Clock synced");
    else Toast.error(result.error || "Sync failed");
  },

  destroy() {
    if (this._intervalId) clearInterval(this._intervalId);
    this._intervalId = null;
  },
};
