/** Shared UI helpers */
const Stage = {
  statGrid(items) {
    return `
      <div class="stat-grid">
        ${items
          .map(
            (item) => `
          <div class="stat-tile">
            <span class="stat-label">${item.label}</span>
            <span class="stat-value">${item.value}</span>
          </div>`
          )
          .join("")}
      </div>`;
  },

  hexFromRgb(rgb) {
    if (!rgb) return "#444";
    const { red: r, green: g, blue: b } = rgb;
    return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c | 0)).toString(16).padStart(2, "0")).join("")}`;
  },
};
