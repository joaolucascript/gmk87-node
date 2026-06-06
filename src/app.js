/**
 * SPA router
 */
const App = {
  _currentView: null,
  _started: false,

  views: {
    home: HomeView,
    upload: UploadView,
    via: ViaView,
    colors: ColorsView,
    timesync: TimeSyncView,
  },

  init() {
    if (this._started) return;
    this._started = true;
    Shell.init();
    ConnectionMonitor.start();
    window.addEventListener("hashchange", () => this.route());
    this.route();
  },

  route() {
    const hash = window.location.hash.slice(1) || "home";
    const view = this.views[hash];
    if (!view) {
      window.location.hash = "home";
      return;
    }

    if (this._currentView?.destroy) {
      this._currentView.destroy();
    }

    this._currentView = view;
    Shell.setActiveRoute(hash);
    ConnectionMonitor.refresh();

    if (hash === "via") {
      Shell.clearWorkspace();
      view.render();
      Shell.showWorkspace();
      return;
    }
    Shell.clearWorkspace();
    view.render();
    Shell.showWorkspace();
  },
};

function showBootError(message) {
  Shell.init();
  document.getElementById("panel-controls").innerHTML = `
    <div class="state-block">
      <p class="state-title">Failed to start</p>
      <p class="state-desc">${message}</p>
    </div>`;
  Shell.showWorkspace();
}

function boot() {
  if (!window.gmk87) {
    showBootError("Tauri bridge did not load. Restart the app.");
    return;
  }
  App.init();
}

window.addEventListener("gmk87-ready", boot);
if (window.gmk87) boot();
else {
  setTimeout(() => {
    if (!App._started) showBootError("Tauri bridge did not load. Restart the app.");
  }, 5000);
}
