/**
 * Toast notification system
 */
const Toast = {
  /**
   * Show a success toast
   * @param {string} message
   */
  success(message) {
    this._show(message, "success");
  },

  /**
   * Show an error toast
   * @param {string} message
   */
  error(message) {
    this._show(message, "error");
  },

  /**
   * Show a warning toast
   * @param {string} message
   */
  warn(message) {
    this._show(message, "warn");
  },

  /** @private */
  _show(message, type) {
    const container = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = `toast${type === "error" ? " error" : type === "warn" ? " warn" : ""}`;
    el.textContent = message;
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add("fade-out");
      el.addEventListener("animationend", () => el.remove());
    }, 3000);
  },
};
