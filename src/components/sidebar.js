/**
 * Sidebar navigation component
 */
const Sidebar = {
  _version: null,

  items: [
    {
      id: "home",
      label: "Home",
      icon: `<span class="material-icons">home</span>`,
    },
    {
      id: "upload",
      label: "Upload Image",
      icon: `<span class="material-icons">upload</span>`,
    },
    {
      id: "colors",
      label: "Color Options",
      icon: `<span class="material-icons">palette</span>`,
    },
    {
      id: "timesync",
      label: "Time Sync",
      icon: `<span class="material-icons">schedule</span>`,
    },
  ],

  init() {
    const sidebar = document.getElementById("sidebar");
    const versionLabel = this._version ? `v${this._version}` : "v…";

    sidebar.innerHTML = `
      <div class="sidebar-title">GMK87 Configurator</div>
      <nav class="sidebar-nav">
        ${this.items
          .map(
            (item) => `
          <button class="sidebar-item" data-view="${item.id}">
            ${item.icon}
            <span>${item.label}</span>
          </button>`
          )
          .join("")}
      </nav>
      <div class="sidebar-spacer"></div>
      <div class="sidebar-footer">
        <div class="sidebar-version" id="sidebar-version">${versionLabel}</div>
        <button class="sidebar-item" id="show-logs">
          <span class="material-icons">terminal</span>
          <span>Logs</span>
        </button>
      </div>
    `;

    sidebar.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.hash = btn.dataset.view;
      });
    });

    document.getElementById("show-logs").addEventListener("click", () => {
      Sidebar.showLogsModal();
    });

    if (!this._version) {
      window.gmk87.getVersion().then((version) => {
        this._version = version;
        const versionEl = document.getElementById("sidebar-version");
        if (versionEl) {
          versionEl.textContent = `v${version}`;
        }
      });
    }
  },

  setActive(activeId) {
    const sidebar = document.getElementById("sidebar");
    sidebar.querySelectorAll("[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === activeId);
    });
  },

  render(activeId) {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar.querySelector(".sidebar-nav")) {
      this.init();
    }
    this.setActive(activeId);
  },

  async showLogsModal() {
    const logs = await window.gmk87.getLogs();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const logLines = logs.length === 0
      ? '<span class="log-empty">No logs yet</span>'
      : logs.map((l) => {
          const t = new Date(l.time).toLocaleTimeString();
          return `<div class="log-line log-${l.level}"><span class="log-time">${t}</span> ${this._escapeHtml(l.msg)}</div>`;
        }).join("");

    overlay.innerHTML = `
      <div class="modal logs-modal">
        <div class="modal-title">Backend Logs</div>
        <div class="logs-container">${logLines}</div>
        <div class="modal-actions">
          <button class="btn" id="logs-close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const container = overlay.querySelector(".logs-container");
    container.scrollTop = container.scrollHeight;

    const close = () => overlay.remove();
    overlay.querySelector("#logs-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  },

  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
