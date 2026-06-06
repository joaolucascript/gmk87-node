/**
 * Tauri bridge — same API surface as the Electron preload (window.gmk87)
 * Uses window.__TAURI__ (withGlobalTauri) — no bundler required.
 */
(function () {
  function buildBridge() {
    const tauri = window.__TAURI__;
    if (!tauri?.core?.invoke) {
      return false;
    }

    const invoke = tauri.core.invoke.bind(tauri.core);
    const listen = tauri.event?.listen?.bind(tauri.event);

    window.gmk87 = {
      getInfo: async () => {
        try {
          const data = await invoke("keyboard_get_info");
          return { success: true, data };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },

      readConfig: async () => {
        try {
          const data = await invoke("keyboard_read_config");
          return { success: true, data };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },

      uploadImage: async (opts) => {
        if (!listen) {
          try {
            await invoke("keyboard_upload_image", {
              slot0File: opts.slot0File || null,
              slot1File: opts.slot1File || null,
              frameDuration: opts.frameDuration ?? null,
            });
            return { success: true };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        }

        return new Promise(async (resolve) => {
          let settled = false;
          let unlistenFinished = () => {};

          const finish = (result) => {
            if (settled) return;
            settled = true;
            unlistenFinished();
            resolve(result);
          };

          unlistenFinished = await listen("upload:finished", (event) => {
            const payload = event.payload;
            finish({
              success: Boolean(payload.success),
              error: payload.error || undefined,
            });
          });

          invoke("keyboard_upload_image", {
            slot0File: opts.slot0File || null,
            slot1File: opts.slot1File || null,
            frameDuration: opts.frameDuration ?? null,
          }).catch((error) => finish({ success: false, error: String(error) }));
        });
      },

      onUploadProgress: (callback) => {
        if (!listen) {
          return () => {};
        }
        let unlisten = () => {};
        listen("upload:progress", (event) => {
          callback(event.payload);
        }).then((fn) => {
          unlisten = fn;
        });
        return () => unlisten();
      },

      setLighting: async (changes) => {
        try {
          await invoke("keyboard_set_lighting", { changes });
          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },

      applyPreset: async (name) => {
        try {
          await invoke("keyboard_apply_preset", { presetName: name });
          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },

      getPresets: async () => {
        try {
          const data = await invoke("keyboard_get_presets");
          return { success: true, data };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },

      showSlot: async (slot) => {
        try {
          await invoke("keyboard_show_slot", { slot });
          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },

      syncTime: async () => {
        try {
          await invoke("keyboard_sync_time");
          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },

      openFile: async () => {
        try {
          const selected = await invoke("plugin:dialog|open", {
            options: {
              multiple: false,
              filters: [
                { name: "Images", extensions: ["png", "jpg", "jpeg", "bmp", "gif"] },
              ],
            },
          });
          if (!selected) {
            return { success: true, data: null };
          }
          return { success: true, data: selected };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },

      openExternal: async (url) => {
        try {
          await invoke("plugin:opener|open_url", { url });
          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },

      getVersion: async () => {
        try {
          return await invoke("app_get_version");
        } catch {
          return "?";
        }
      },
    };

    window.dispatchEvent(new Event("gmk87-ready"));
    return true;
  }

  function tryInit(attempt) {
    if (buildBridge()) {
      return;
    }
    if (attempt >= 200) {
      console.error("Tauri API not available after waiting");
      return;
    }
    setTimeout(() => tryInit(attempt + 1), 25);
  }

  tryInit(0);
})();
