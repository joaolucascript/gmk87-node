/**
 * SPA Router and view management
 */
const App = {
  _currentView: null,
  _started: false,

  views: {
    home: HomeView,
    upload: UploadView,
    colors: ColorsView,
    timesync: TimeSyncView,
  },

  init() {
    if (this._started) {
      return;
    }
    this._started = true;
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

    if (this._currentView && this._currentView.destroy) {
      this._currentView.destroy();
    }

    this._currentView = view;
    Sidebar.render(hash);
    view.render();
  },
};

function showBootError(message) {
  const content = document.getElementById("content");
  if (!content) {
    return;
  }
  content.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-title">Failed to start</p>
      <p class="empty-state-desc">${message}</p>
    </div>`;
}

function boot() {
  if (!window.gmk87) {
    showBootError("Tauri bridge did not load. Restart the app.");
    return;
  }
  App.init();
}

window.addEventListener("gmk87-ready", boot);

if (window.gmk87) {
  boot();
} else {
  setTimeout(() => {
    if (!App._started) {
      showBootError("Tauri bridge did not load. Restart the app.");
    }
  }, 5000);
}
