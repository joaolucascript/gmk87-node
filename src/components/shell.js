/**

 * App chrome — top bar + icon rail

 */

const Shell = {

  _version: null,

  _connected: false,



  routes: [

    { id: "home", label: "Dashboard", icon: "grid_view" },

    { id: "upload", label: "Display", icon: "monitor" },

    { id: "colors", label: "Lighting", icon: "tungsten" },

    { id: "timesync", label: "Clock", icon: "schedule" },

  ],



  init() {

    this._renderTopbar();

    this._renderRail();



    if (!this._version) {

      window.gmk87.getVersion().then((v) => {

        this._version = v;

        const el = document.getElementById("shell-version");

        if (el) el.textContent = `v${v}`;

      });

    }

  },



  setConnected(connected) {
    this._connected = connected;

    const dot = document.getElementById("shell-status-dot");

    const text = document.getElementById("shell-status-text");

    if (!dot || !text) return;

    dot.classList.toggle("is-online", connected);

    text.textContent = connected ? "Connected" : "Offline";

  },



  setActiveRoute(id) {

    document.querySelectorAll(".rail-btn").forEach((btn) => {

      btn.classList.toggle("is-active", btn.dataset.route === id);

    });

    const route = this.routes.find((r) => r.id === id);

    const title = document.getElementById("shell-route-title");

    if (title && route) title.textContent = route.label;

  },



  clearWorkspace() {

    document.getElementById("panel-controls").innerHTML = "";

    document.getElementById("workspace").classList.remove("is-ready");

  },



  showWorkspace() {

    requestAnimationFrame(() => {

      document.getElementById("workspace").classList.add("is-ready");

    });

  },



  _renderTopbar() {

    document.getElementById("topbar").innerHTML = `

      <div class="topbar-left">

        <span class="topbar-logo">GMK87</span>

        <span class="topbar-sep"></span>

        <span class="topbar-route" id="shell-route-title">Dashboard</span>

      </div>

      <div class="topbar-right">

        <div class="topbar-status">

          <span class="status-dot" id="shell-status-dot"></span>

          <span id="shell-status-text">Offline</span>

        </div>

        <span class="topbar-version" id="shell-version">v…</span>

      </div>

    `;

  },



  _renderRail() {

    const rail = document.getElementById("rail");

    rail.innerHTML = this.routes

      .map(

        (r) => `

      <button class="rail-btn" data-route="${r.id}" title="${r.label}">

        <span class="material-symbols-outlined">${r.icon}</span>

        <span class="rail-tooltip">${r.label}</span>

      </button>`

      )

      .join("");



    rail.querySelectorAll(".rail-btn").forEach((btn) => {

      btn.addEventListener("click", () => {

        window.location.hash = btn.dataset.route;

      });

    });

  },

};

