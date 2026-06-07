#!/usr/bin/env node
/** GMK87-specific patches to the VIA source before build. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viaBuildDir = path.join(root, ".via-build");

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n");
}

function patchFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Skip (missing): ${filePath}`);
    return;
  }
  let content = normalizeNewlines(fs.readFileSync(filePath, "utf8"));
  for (const [from, to] of replacements) {
    const normalizedFrom = normalizeNewlines(from);
    const normalizedTo = normalizeNewlines(to);
    const added =
      normalizedTo.startsWith(normalizedFrom)
        ? normalizedTo.slice(normalizedFrom.length).trim()
        : normalizedTo.trim();
    if (
      added.includes("GMK87_VENDOR_PRODUCT_IDS") &&
      content.includes("GMK87_VENDOR_PRODUCT_IDS")
    ) {
      continue;
    }
    const marker = added.slice(0, Math.min(80, added.length));
    if (marker && content.includes(marker)) {
      continue;
    }
    if (!content.includes(normalizedFrom)) {
      console.warn(`Patch skipped in ${path.basename(filePath)}: ${from.slice(0, 50)}…`);
      continue;
    }
    content = content.replace(normalizedFrom, normalizedTo);
  }
  fs.writeFileSync(filePath, content);
}

const gmk87Constants = `const GMK87_VENDOR_PRODUCT_IDS = new Set([839864405, 839864456]);
const isGmk87VendorProductId = (vpid: number) => GMK87_VENDOR_PRODUCT_IDS.has(vpid);
`;

patchFile(path.join(viaBuildDir, "src", "store", "devicesThunks.ts"), [
  [
    `import {loadFirmwareVersion} from './firmwareSlice';`,
    `import {loadFirmwareVersion} from './firmwareSlice';

${gmk87Constants}`,
  ],
  [
    `          requiredDefinitionVersion: protocol >= 11 ? 'v3' : 'v2',`,
    `          requiredDefinitionVersion: isGmk87VendorProductId(
            getVendorProductId(device.vendorId, device.productId),
          )
            ? 'v2'
            : protocol >= 11
              ? 'v3'
              : 'v2',`,
  ],
  [
    "await await dispatch(loadStoredCustomDefinitions",
    "await dispatch(loadStoredCustomDefinitions",
  ],
  [
    "dispatch(loadStoredCustomDefinitions",
    "await dispatch(loadStoredCustomDefinitions",
  ],
]);

patchFile(path.join(viaBuildDir, "src", "utils", "keyboard-api.ts"), [
  [
    `const cache: {[addr: string]: {hid: any}} = {};`,
    `const cache: {[addr: string]: {hid: any}} = {};

const GMK87_VENDOR_PRODUCT_IDS = new Set([839864405, 839864456]);

const isGmk87Hid = (hid: {vendorId?: number; productId?: number}) => {
  const vpid = (hid.vendorId ?? 0) * 65536 + (hid.productId ?? 0);
  return GMK87_VENDOR_PRODUCT_IDS.has(vpid);
};

/** Zuoya GMK87 firmware does not echo full VIA command headers. */
const normalizeGmk87Response = (
  command: Command,
  commandBytes: number[],
  buffer: number[],
): number[] | null => {
  if (command === APICommand.GET_PROTOCOL_VERSION) {
    const ver = buffer[0];
    if (ver >= 7 && ver <= 20) {
      return [0, 0, ver, 0, ...buffer.slice(1)];
    }
  }
  // Reset commands return a non-standard payload (often protocol bytes) on GMK87.
  if (
    command === APICommand.EEPROM_RESET ||
    command === APICommand.DYNAMIC_KEYMAP_MACRO_RESET ||
    command === APICommand.BOOTLOADER_JUMP
  ) {
    return [commandBytes[1], ...buffer.slice(1)];
  }
  if (buffer[0] === commandBytes[1]) {
    if (
      command === APICommand.DYNAMIC_KEYMAP_MACRO_GET_BUFFER ||
      command === APICommand.DYNAMIC_KEYMAP_MACRO_SET_BUFFER
    ) {
      const normalized = [...buffer];
      if (commandBytes.length >= 5) {
        normalized[1] = commandBytes[2];
        normalized[2] = commandBytes[3];
        normalized[3] = commandBytes[4];
      }
      return normalized;
    }
    return buffer;
  }
  return null;
};

const extractMacroBufferChunk = (bytes: number[]): number[] => {
  if (bytes.length <= 4) {
    return [];
  }
  const chunkSize = bytes[3] || Math.min(28, bytes.length - 4);
  return bytes.slice(4, 4 + chunkSize);
};`,
  ],
  [
    `    return allBytes.flatMap((bytes) => bytes.slice(4));
  }`,
    `    return allBytes.flatMap((bytes) => extractMacroBufferChunk(bytes));
  }`,
  ],
  [
    `    if (!eqArr(commandBytes.slice(1), bufferCommandBytes)) {
      console.error(
        \`Command for \${this.kbAddr}:\`,
        commandBytes,
        'Bad Resp:',
        buffer,
      );

      const deviceInfo = extractDeviceInfo(this.getHID());
      const commandName = APICommandValueToName[command];
      store.dispatch(
        logKeyboardAPIError({
          commandName,
          commandBytes: commandBytes.slice(1),
          responseBytes: buffer,
          deviceInfo,
        }),
      );

      throw new Error('Receiving incorrect response for command');
    }`,
    `    if (!eqArr(commandBytes.slice(1), bufferCommandBytes)) {
      const hid = this.getHID();
      if (isGmk87Hid(hid)) {
        const normalized = normalizeGmk87Response(command, commandBytes, buffer);
        if (normalized) {
          logCommand(this.kbAddr, commandBytes, normalized);
          return normalized;
        }
      }
      console.error(
        \`Command for \${this.kbAddr}:\`,
        commandBytes,
        'Bad Resp:',
        buffer,
      );

      const deviceInfo = extractDeviceInfo(this.getHID());
      const commandName = APICommandValueToName[command];
      store.dispatch(
        logKeyboardAPIError({
          commandName,
          commandBytes: commandBytes.slice(1),
          responseBytes: buffer,
          deviceInfo,
        }),
      );

      throw new Error('Receiving incorrect response for command');
    }`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "components", "panes", "configure-panes", "macros.tsx"), [
  [
    `      dispatch(saveMacros(selectedDevice, newMacros));
    },`,
    `      await dispatch(saveMacros(selectedDevice, newMacros));
    },`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "components", "panes", "configure-panes", "save-load.tsx"), [
  [
    `      if (macros.isFeatureSupported && saveFile.macros) {
        if (saveFile.macros.length !== expressions.length) {
          setErrorMessage(
            t('Could not import layout: incorrect number of macros.'),
          );
          return;
        }

        dispatch(saveMacros(selectedDevice, saveFile.macros));
      }`,
    `      if (
        macros.isFeatureSupported &&
        saveFile.macros &&
        !GMK87_VENDOR_PRODUCT_IDS.has(selectedDefinition.vendorProductId)
      ) {
        if (saveFile.macros.length !== expressions.length) {
          setErrorMessage(
            t('Could not import layout: incorrect number of macros.'),
          );
          return;
        }

        try {
          await dispatch(saveMacros(selectedDevice, saveFile.macros));
        } catch (err) {
          console.warn('Macro import skipped:', err);
        }
      }`,
  ],
  [
    `import {useTranslation} from 'react-i18next';

const GMK87_VENDOR_PRODUCT_IDS = new Set([839864405, 839864456]);`,
    `import {useTranslation} from 'react-i18next';
import {resetKeyboardLayoutToDefault} from 'src/utils/gmk87-reset-layout-bridge';

const GMK87_VENDOR_PRODUCT_IDS = new Set([839864405, 839864456]);`,
  ],
  [
    `  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);`,
    `  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);`,
  ],
  [
    `    reader.readAsBinaryString(file);
  };

  return (`,
    `    reader.readAsBinaryString(file);
  };

  const resetToDefault = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const confirmed = window.confirm(
      t(
        'Reset the keymap and macros to the factory defaults stored in firmware? Custom remaps will be lost. Save a backup first if needed.',
      ),
    );
    if (!confirmed) {
      return;
    }
    setResetting(true);
    try {
      await resetKeyboardLayoutToDefault(dispatch, api, selectedDevice);
      setSuccessMessage(t('Layout reset to factory defaults.'));
    } catch (err) {
      setErrorMessage(
        t('Could not reset layout: {{error}}', {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setResetting(false);
    }
  };

  return (`,
  ],
  [
    `              <AccentUploadButton onLoad={loadLayout}>
                {t('Load')}
              </AccentUploadButton>
            </Detail>
          </ControlRow>
          {errorMessage ? <ErrorMessage>{errorMessage}</ErrorMessage> : null}`,
    `              <AccentUploadButton onLoad={loadLayout}>
                {t('Load')}
              </AccentUploadButton>
            </Detail>
          </ControlRow>
          <ControlRow>
            <Label>{t('Reset to Factory Default')}</Label>
            <Detail>
              <AccentButton disabled={resetting} onClick={resetToDefault}>
                {resetting ? t('Resetting…') : t('Reset')}
              </AccentButton>
            </Detail>
          </ControlRow>
          {errorMessage ? <ErrorMessage>{errorMessage}</ErrorMessage> : null}`,
  ],
]);

patchFile(
  path.join(
    viaBuildDir,
    "src",
    "components",
    "panes",
    "configure-panes",
    "submenus",
    "macros",
    "macro-recorder.tsx",
  ),
  [
    [
      `      if (isRecording) {
        await navigator.keyboard.lock();
        setKeycodeSequence([]);`,
      `      if (isRecording) {
        try {
          if (navigator.keyboard?.lock) {
            await navigator.keyboard.lock();
          }
        } catch (err) {
          console.warn('Keyboard lock unavailable:', err);
        }
        window.parent.postMessage({type: 'gmk87-via-recording', active: true}, '*');
        window.focus();
        setKeycodeSequence([]);`,
    ],
    [
      `      } else {
        navigator.keyboard.unlock();`,
      `      } else {
        window.parent.postMessage({type: 'gmk87-via-recording', active: false}, '*');
        try {
          navigator.keyboard?.unlock?.();
        } catch (err) {
          console.warn('Keyboard unlock failed:', err);
        }`,
    ],
  ],
);

patchFile(path.join(viaBuildDir, "src", "utils", "use-keycode-recorder.ts"), [
  [
    `          const keycode = keycodes.find((k) => k.code === mapEvtToKeycode(evt));
          const currTime = Date.now();
          const keycodeLabel = keycode?.code;`,
    `          let keycodeLabel = mapEvtToKeycode(evt);
          if (!keycodeLabel && evt.key === ' ') {
            keycodeLabel = 'KC_SPC';
          }
          const currTime = Date.now();`,
  ],
  [
    `    if (enableRecording) {
      window.addEventListener('keydown', downHandler);
      window.addEventListener('keyup', upHandler);
    }
    // Remove event listeners on cleanup
    return () => {
      heldKeys = {};
      window.removeEventListener('keydown', downHandler);
      window.removeEventListener('keyup', upHandler);
    };
  }, [enableRecording]);`,
    `    const onForwardedKey = (evt: MessageEvent) => {
      if (!enableRecording || evt.data?.type !== 'gmk87-forward-key') {
        return;
      }
      const {eventType, props} = evt.data;
      const keyEvt = new KeyboardEvent(eventType, {
        key: props.key,
        code: props.code,
        location: props.location ?? 0,
        ctrlKey: !!props.ctrlKey,
        shiftKey: !!props.shiftKey,
        altKey: !!props.altKey,
        metaKey: !!props.metaKey,
        repeat: !!props.repeat,
        bubbles: true,
        cancelable: true,
      });
      if (eventType === 'keydown') {
        downHandler(keyEvt);
      } else if (eventType === 'keyup') {
        upHandler(keyEvt);
      }
    };
    if (enableRecording) {
      window.addEventListener('keydown', downHandler, true);
      window.addEventListener('keyup', upHandler, true);
      window.addEventListener('message', onForwardedKey);
    }
    return () => {
      heldKeys = {};
      window.removeEventListener('keydown', downHandler, true);
      window.removeEventListener('keyup', upHandler, true);
      window.removeEventListener('message', onForwardedKey);
    };
  }, [enableRecording, downHandler, upHandler]);`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "components", "panes", "grid.tsx"), [
  [
    `import getIconColor from '../icons/get-icon-color';
import styled from 'styled-components';`,
    `import getIconColor from '../icons/get-icon-color';
import styled from 'styled-components';
import {isGmk87Embedded} from 'src/utils/gmk87-embed';`,
  ],
  [
    `export const CategoryIconContainer = styled.span<{$selected?: boolean}> \`
  position: relative;
  color: var(--color_inside-accent);
  height: 35px;`,
    `export const CategoryIconContainer = styled.span<{$selected?: boolean}> \`
  position: relative;
  color: \${(props) =>
    props.$selected
      ? 'var(--color_inside-accent)'
      : isGmk87Embedded()
        ? 'var(--color_light-grey)'
        : 'var(--color_inside-accent)'};
  height: 35px;`,
  ],
  [
    `export const OverflowCell = styled(Cell)\`
  border-top: 1px solid var(--border_color_cell);
  overflow: \${isGmk87Embedded() ? 'hidden' : 'auto'};
\`;`,
    `export const OverflowCell = styled(Cell)\`
  border-top: 1px solid var(--border_color_cell);
  overflow: auto;
\`;`,
  ],
  [
    `export const SpanOverflowCell = styled(Cell)\`
  border-top: 1px solid var(--border_color_cell);
  overflow: \${isGmk87Embedded() ? 'hidden' : 'auto'};
  grid-column: span 2;
\`;`,
    `export const SpanOverflowCell = styled(Cell)\`
  border-top: 1px solid var(--border_color_cell);
  overflow: auto;
  grid-column: span 2;
\`;`,
  ],
  [
    `export const SubmenuOverflowCell = styled(SubmenuCell)\`
  min-width: 80px;
  overflow: \${isGmk87Embedded() ? 'hidden' : 'auto'};
  overflow-x: hidden; /* Override just the horizontal part */
\`;`,
    `export const SubmenuOverflowCell = styled(SubmenuCell)\`
  min-width: 80px;
  overflow: auto;
  overflow-x: hidden; /* Override just the horizontal part */
\`;`,
  ],
  [
    `export const ConfigureFlexCell = styled(SinglePaneFlexCell)\`
  pointer-events: none;
  height: \${isGmk87Embedded() ? '460px' : '500px'};
\`;`,
    `export const ConfigureFlexCell = styled(SinglePaneFlexCell)\`
  pointer-events: none;
  height: 500px;
\`;`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "components", "icons", "get-icon-color.ts"), [
  [
    `export default function getIconColor(isSelected: boolean) {
  return {
    style: {
      color: isSelected ? 'var(--bg_icon-highlighted)' : 'var(--bg_control)',
    },
  };
}`,
    `export default function getIconColor(isSelected: boolean) {
  const unselected =
    window.parent !== window ? 'var(--color_light-grey)' : 'var(--bg_control)';
  return {
    style: {
      color: isSelected ? 'var(--bg_icon-highlighted)' : unselected,
    },
  };
}`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "Routes.tsx"), [
  [
    `import {Route} from 'wouter';`,
    `import {Route, Router} from 'wouter';
import useHashLocation from './utils/use-hash-location';`,
  ],
  [
    `import {getRenderMode} from './store/settingsSlice';`,
    `import {getRenderMode} from './store/settingsSlice';
import {Gmk87ResetLayoutBridge} from './utils/gmk87-reset-layout-bridge';`,
  ],
  [
    `import {Gmk87ResetLayoutBridge} from './utils/gmk87-reset-layout-bridge';
import {Gmk87ResetLayoutBridge} from './utils/gmk87-reset-layout-bridge';`,
    `import {Gmk87ResetLayoutBridge} from './utils/gmk87-reset-layout-bridge';`,
  ],
  [
    `  return (
    <>
        <TestContext.Provider value={testContextState}>`,
    `  return (
    <Router hook={useHashLocation}>
        <TestContext.Provider value={testContextState}>`,
  ],
  [
    `        <GlobalStyle />
        {hasHIDSupport && <UnconnectedGlobalMenu />}`,
    `        <GlobalStyle />
        <Gmk87ResetLayoutBridge />
        <Gmk87HostBridge />
        {hasHIDSupport && <UnconnectedGlobalMenu />}`,
  ],
  [
    `        <Gmk87ResetLayoutBridge />
        {hasHIDSupport && <UnconnectedGlobalMenu />}`,
    `        <Gmk87ResetLayoutBridge />
        <Gmk87HostBridge />
        {hasHIDSupport && <UnconnectedGlobalMenu />}`,
  ],
  [
    `        </TestContext.Provider>
    </>
  );`,
    `        </TestContext.Provider>
    </Router>
  );`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "utils", "macro-api", "macro-api.common.ts"), [
  [
    `const mapCharToShiftedChar = Object.values(mapKeycodeToCharacterStream).reduce(
  (p, [n, m]) => {
    return {...p, [n]: m};
  },
  {} as Record<string, string>,
);

// Convert all down actions of characters (i.e. letters, numbers, punctuation)`,
    `const mapCharToShiftedChar = Object.values(mapKeycodeToCharacterStream).reduce(
  (p, [n, m]) => {
    return {...p, [n]: m};
  },
  {} as Record<string, string>,
);

/** GMK87 firmware only types a-z and 0-9 reliably as raw character-stream bytes. */
export function shouldKeepInCharacterStream(ch: string): boolean {
  return /^[a-z0-9]$/.test(ch);
}

export function characterToExplicitKeycodes(
  ch: string,
): RawKeycodeSequenceItem[] {
  if (ch === ' ') {
    return [[RawKeycodeSequenceAction.Tap, 'KC_SPC']];
  }
  for (const [keycode, [unshifted, shifted]] of Object.entries(
    mapKeycodeToCharacterStream,
  )) {
    if (ch === unshifted) {
      return [[RawKeycodeSequenceAction.Tap, keycode]];
    }
    if (ch === shifted && shifted !== unshifted) {
      return [
        [RawKeycodeSequenceAction.Down, 'KC_LSFT'],
        [RawKeycodeSequenceAction.Tap, keycode],
        [RawKeycodeSequenceAction.Up, 'KC_LSFT'],
      ];
    }
  }
  return [[RawKeycodeSequenceAction.CharacterStream, ch]];
}

export function expandUnreliableCharacterStreams(
  sequence: RawKeycodeSequence,
): RawKeycodeSequence {
  const out: RawKeycodeSequence = [];
  for (const item of sequence) {
    if (item[0] !== RawKeycodeSequenceAction.CharacterStream) {
      out.push(item);
      continue;
    }
    let run = '';
    for (const ch of item[1] as string) {
      if (shouldKeepInCharacterStream(ch)) {
        run += ch;
        continue;
      }
      if (run) {
        out.push([RawKeycodeSequenceAction.CharacterStream, run]);
        run = '';
      }
      out.push(...characterToExplicitKeycodes(ch));
    }
    if (run) {
      out.push([RawKeycodeSequenceAction.CharacterStream, run]);
    }
  }
  return out;
}

export function appendCharToMacroBytes(
  char: string,
  bytes: number[],
  basicKeyToByte: Record<string, number>,
): void {
  if (shouldKeepInCharacterStream(char)) {
    bytes.push(char.charCodeAt(0));
    return;
  }
  for (const item of characterToExplicitKeycodes(char)) {
    switch (item[0]) {
      case RawKeycodeSequenceAction.Tap:
        bytes.push(KeyAction.Tap, basicKeyToByte[item[1] as string]);
        break;
      case RawKeycodeSequenceAction.Down:
        bytes.push(KeyAction.Down, basicKeyToByte[item[1] as string]);
        break;
      case RawKeycodeSequenceAction.Up:
        bytes.push(KeyAction.Up, basicKeyToByte[item[1] as string]);
        break;
      case RawKeycodeSequenceAction.CharacterStream:
        bytes.push((item[1] as string).charCodeAt(0));
        break;
    }
  }
}

const GMK87_MODIFIER_KEYCODES = new Set([
  'KC_LSFT',
  'KC_RSFT',
  'KC_LCTL',
  'KC_RCTL',
  'KC_LALT',
  'KC_RALT',
  'KC_LGUI',
  'KC_RGUI',
]);

function charToTapKeycode(ch: string): RawKeycodeSequenceItem | null {
  for (const [keycode, [unshifted]] of Object.entries(
    mapKeycodeToCharacterStream,
  )) {
    if (ch === unshifted) {
      return [RawKeycodeSequenceAction.Tap, keycode];
    }
  }
  return null;
}

/** GMK87 drops the first character-stream byte after a modifier key-up. */
export function splitStreamAfterModifierUp(
  sequence: RawKeycodeSequence,
): RawKeycodeSequence {
  const out: RawKeycodeSequence = [];
  for (let i = 0; i < sequence.length; i++) {
    const item = sequence[i];
    if (
      item[0] === RawKeycodeSequenceAction.Up &&
      GMK87_MODIFIER_KEYCODES.has(item[1] as string) &&
      i + 1 < sequence.length &&
      sequence[i + 1][0] === RawKeycodeSequenceAction.CharacterStream
    ) {
      out.push(item);
      const text = sequence[i + 1][1] as string;
      if (text.length > 0) {
        const firstItem =
          charToTapKeycode(text[0]) ??
          characterToExplicitKeycodes(text[0])[0] ??
          [RawKeycodeSequenceAction.CharacterStream, text[0]];
        out.push(firstItem);
        if (text.length > 1) {
          out.push([
            RawKeycodeSequenceAction.CharacterStream,
            text.slice(1),
          ]);
        }
      }
      i += 1;
      continue;
    }
    out.push(item);
  }
  return out;
}

// Convert all down actions of characters (i.e. letters, numbers, punctuation)`,
  ],
  [
    `  return seq3;
}

export function sequenceToExpression(`,
    `  return expandUnreliableCharacterStreams(seq3);
}

export function sequenceToExpression(`,
  ],
  [
    `      const newChars = mapKeycodeToCharacterStream[n[1]][0];
      if (
        p[p.length - 1] !== undefined &&
        p[p.length - 1][0] === RawKeycodeSequenceAction.CharacterStream
      ) {`,
    `      const newChars = mapKeycodeToCharacterStream[n[1]][0];
      // Keep space as an explicit keycode — GMK87 / QMK handles {KC_SPC} reliably.
      if (newChars === ' ') {
        return [...p, [RawKeycodeSequenceAction.Tap, 'KC_SPC']];
      }
      if (
        p[p.length - 1] !== undefined &&
        p[p.length - 1][0] === RawKeycodeSequenceAction.CharacterStream
      ) {`,
  ],
  [
    `}

// Convert all down actions of characters (i.e. letters, numbers, punctuation)
// into tap actions and throw away the up actions.
export function convertCharacterTaps(`,
    `}

const GMK87_MODIFIER_KEYCODES = new Set([
  'KC_LSFT',
  'KC_RSFT',
  'KC_LCTL',
  'KC_RCTL',
  'KC_LALT',
  'KC_RALT',
  'KC_LGUI',
  'KC_RGUI',
]);

function charToTapKeycode(ch: string): RawKeycodeSequenceItem | null {
  for (const [keycode, [unshifted]] of Object.entries(
    mapKeycodeToCharacterStream,
  )) {
    if (ch === unshifted) {
      return [RawKeycodeSequenceAction.Tap, keycode];
    }
  }
  return null;
}

/** GMK87 drops the first character-stream byte after a modifier key-up. */
export function splitStreamAfterModifierUp(
  sequence: RawKeycodeSequence,
): RawKeycodeSequence {
  const out: RawKeycodeSequence = [];
  for (let i = 0; i < sequence.length; i++) {
    const item = sequence[i];
    if (
      item[0] === RawKeycodeSequenceAction.Up &&
      GMK87_MODIFIER_KEYCODES.has(item[1] as string) &&
      i + 1 < sequence.length &&
      sequence[i + 1][0] === RawKeycodeSequenceAction.CharacterStream
    ) {
      out.push(item);
      const text = sequence[i + 1][1] as string;
      if (text.length > 0) {
        const firstItem =
          charToTapKeycode(text[0]) ??
          characterToExplicitKeycodes(text[0])[0] ??
          [RawKeycodeSequenceAction.CharacterStream, text[0]];
        out.push(firstItem);
        if (text.length > 1) {
          out.push([
            RawKeycodeSequenceAction.CharacterStream,
            text.slice(1),
          ]);
        }
      }
      i += 1;
      continue;
    }
    out.push(item);
  }
  return out;
}

// Convert all down actions of characters (i.e. letters, numbers, punctuation)
// into tap actions and throw away the up actions.
export function convertCharacterTaps(`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "shims", "node-hid.ts"), [
  [
    `  devices: async (requestAuthorize = false) => {
    let devices = await ExtendedHID.getFilteredDevices();
    // TODO: This is a hack to avoid spamming the requestDevices popup
    if (devices.length === 0 || requestAuthorize) {
      try {
        await ExtendedHID.requestDevice();
      } catch (e) {
        // The request seems to fail when the last authorized device is disconnected.
        return [];
      }
      devices = await ExtendedHID.getFilteredDevices();
    }
    return devices.map(tagDevice);
  },`,
    `  waitForFilteredDevices: async (timeoutMs = 10000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const devices = await ExtendedHID.getFilteredDevices();
      if (devices.length > 0) {
        return devices;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return [];
  },
  devices: async (requestAuthorize = false) => {
    let devices = await ExtendedHID.getFilteredDevices();
    // TODO: This is a hack to avoid spamming the requestDevices popup
    if (devices.length === 0 || requestAuthorize) {
      try {
        await ExtendedHID.requestDevice();
      } catch (e) {
        // Picker may be active elsewhere or dismissed — wait for authorization.
        devices = await ExtendedHID.waitForFilteredDevices();
        if (devices.length === 0) {
          return [];
        }
        return devices.map(tagDevice);
      }
      devices = await ExtendedHID.getFilteredDevices();
    }
    return devices.map(tagDevice);
  },`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "utils", "macro-api", "macro-api.ts"), [
  [
    `  MacroTerminator,
} from './macro-api.common';`,
    `  MacroTerminator,
  appendCharToMacroBytes,
  splitStreamAfterModifierUp,
} from './macro-api.common';`,
  ],
  [
    `          case RawKeycodeSequenceAction.CharacterStream:
            bytes.push(
              ...(element[1] as string)
                .split('')
                .map((char) => char.charCodeAt(0)),
            );
            break;`,
    `          case RawKeycodeSequenceAction.CharacterStream:
            (element[1] as string)
              .split('')
              .forEach((char) =>
                appendCharToMacroBytes(char, bytes, this.basicKeyToByte),
              );
            break;`,
  ],
  [
    `      sequence.forEach((element) => {
        switch (element[0]) {
          case RawKeycodeSequenceAction.Tap:
            bytes.push(KeyAction.Tap, this.basicKeyToByte[element[1]]);`,
    `      splitStreamAfterModifierUp(sequence).forEach((element) => {
        switch (element[0]) {
          case RawKeycodeSequenceAction.Tap:
            bytes.push(KeyAction.Tap, this.basicKeyToByte[element[1]]);`,
  ],
  [
    `  appendCharToMacroBytes,
} from './macro-api.common';`,
    `  appendCharToMacroBytes,
  splitStreamAfterModifierUp,
} from './macro-api.common';`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "utils", "macro-api", "macro-api.v11.ts"), [
  [
    `  IMacroAPI,
} from './macro-api.common';`,
    `  IMacroAPI,
  appendCharToMacroBytes,
  splitStreamAfterModifierUp,
} from './macro-api.common';`,
  ],
  [
    `          case RawKeycodeSequenceAction.CharacterStream:
            bytes.push(
              ...(element[1] as string)
                .split('')
                .map((char) => char.charCodeAt(0)),
            );
            break;`,
    `          case RawKeycodeSequenceAction.CharacterStream:
            (element[1] as string)
              .split('')
              .forEach((char) =>
                appendCharToMacroBytes(char, bytes, this.basicKeyToByte),
              );
            break;`,
  ],
  [
    `      sequence.forEach((element) => {
        switch (element[0]) {
          case RawKeycodeSequenceAction.Tap:
            bytes.push(
              KeyActionPrefix,
              KeyAction.Tap,
              this.basicKeyToByte[element[1]],
            );`,
    `      splitStreamAfterModifierUp(sequence).forEach((element) => {
        switch (element[0]) {
          case RawKeycodeSequenceAction.Tap:
            bytes.push(
              KeyActionPrefix,
              KeyAction.Tap,
              this.basicKeyToByte[element[1]],
            );`,
  ],
  [
    `  appendCharToMacroBytes,
} from './macro-api.common';`,
    `  appendCharToMacroBytes,
  splitStreamAfterModifierUp,
} from './macro-api.common';`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "utils", "device-store.ts"), [
  [
    `const hash = await (await fetch('/definitions/hash.json')).json();`,
    `const hash = document.getElementById('definition_hash')?.dataset.hash || '';`,
  ],
  [
    `    const response = await fetch('/definitions/supported_kbs.json', {`,
    `    const response = await fetch('./definitions/supported_kbs.json', {`,
  ],
  [
    `    const response = await fetch('../definitions/supported_kbs.json', {`,
    `    const response = await fetch('./definitions/supported_kbs.json', {`,
  ],
  [
    `  const url = \`/definitions/\${version}/\${vpid}.json\`;
  const response = await fetch(url);
  const json: DefinitionVersionMap[K] = await response.json();`,
    `  const url = \`./definitions/\${version}/\${vpid}.json\`;
  const response = await fetch(url);
  const raw = await response.json();
  const json: DefinitionVersionMap[K] = raw;`,
  ],
  [
    `  const url = \`../definitions/\${version}/\${vpid}.json\`;
  const response = await fetch(url);
  const raw = await response.json();
  const json: DefinitionVersionMap[K] = raw;`,
    `  const url = \`./definitions/\${version}/\${vpid}.json\`;
  const response = await fetch(url);
  const raw = await response.json();
  const json: DefinitionVersionMap[K] = raw;`,
  ],
  [
    `    themeName: 'OLIVIA_DARK',`,
    `    themeName: 'BLACK',`,
  ],
]);

patchFile(path.join(viaBuildDir, "src", "utils", "color-math.ts"), [
  [
    `import {THEMES} from 'src/utils/themes';

export const updateCSSVariables = (themeName: keyof typeof THEMES) => {
  const selectedTheme = THEMES[themeName] || THEMES['OLIVIA_DARK'];

  document.documentElement.style.setProperty(
    '--color_accent',
    selectedTheme.accent.c,
  );
  document.documentElement.style.setProperty(
    '--color_inside-accent',
    selectedTheme.accent.t,
  );
};`,
    `import {THEMES} from 'src/utils/themes';
import {
  GMK87_UI_ACCENT,
  GMK87_UI_ACCENT_FG,
  isGmk87Embedded,
} from 'src/utils/gmk87-embed';

export const updateCSSVariables = (themeName: keyof typeof THEMES) => {
  const selectedTheme = THEMES[themeName] || THEMES['OLIVIA_DARK'];

  if (isGmk87Embedded()) {
    document.documentElement.style.setProperty(
      '--color_accent',
      GMK87_UI_ACCENT,
    );
    document.documentElement.style.setProperty(
      '--color_inside-accent',
      GMK87_UI_ACCENT_FG,
    );
    return;
  }

  document.documentElement.style.setProperty(
    '--color_accent',
    selectedTheme.accent.c,
  );
  document.documentElement.style.setProperty(
    '--color_inside-accent',
    selectedTheme.accent.t,
  );
};`,
  ],
]);

const embeddedGlowBlock = `const stageGlowPulse = keyframes\`
  0%, 100% {
    opacity: 0.42;
  }
  50% {
    opacity: 0.78;
  }
\`;

const stageGlowDrift = keyframes\`
  0%, 100% {
    transform: scale(1) translate(0, 0);
  }
  50% {
    transform: scale(1.03) translate(0, -1%);
  }
\`;

const keyboardHaloPulse = keyframes\`
  0%, 100% {
    opacity: 0.28;
    transform: translate(-50%, -50%) scale(0.94);
  }
  50% {
    opacity: 0.52;
    transform: translate(-50%, -50%) scale(1.06);
  }
\`;

const EmbeddedStageBG = styled.div\`
  position: absolute;
  inset: 0;
  background: \${GMK87_STAGE_BG};
\`;

const EmbeddedStageGlow = styled.div\`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(
      ellipse 70% 52% at 50% 58%,
      rgba(255, 255, 255, 0.028) 0%,
      rgba(255, 255, 255, 0.008) 46%,
      transparent 78%
    ),
    radial-gradient(
      ellipse 38% 28% at 50% 62%,
      rgba(255, 255, 255, 0.018) 0%,
      transparent 72%
    );
  animation:
    \${stageGlowPulse} 8s ease-in-out infinite,
    \${stageGlowDrift} 16s ease-in-out infinite;
  will-change: opacity, transform;
\`;

const EmbeddedKeyboardHalo = styled.div\`
  position: absolute;
  left: 50%;
  top: 56%;
  width: min(92%, 760px);
  height: 200px;
  pointer-events: none;
  z-index: 1;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 255, 255, 0.045) 0%,
    rgba(255, 255, 255, 0.014) 42%,
    transparent 74%
  );
  filter: blur(10px);
  animation: \${keyboardHaloPulse} 7s ease-in-out infinite;
  will-change: opacity, transform;
\`;

const EmbeddedKeyboardGlow = styled.div\`
  position: relative;
  z-index: 2;
  height: 100%;
  width: 100%;
  filter: drop-shadow(0 0 16px rgba(255, 255, 255, 0.025))
    drop-shadow(0 6px 32px rgba(255, 255, 255, 0.015));
\`;`;

patchFile(path.join(viaBuildDir, "src", "components", "two-string", "canvas-router.tsx"), [
  [
    `import styled from 'styled-components';`,
    `import styled, {keyframes} from 'styled-components';`,
  ],
  [
    `import {getDarkenedColor} from 'src/utils/color-math';
import {OVERRIDE_HID_CHECK} from 'src/utils/override';`,
    `import {getDarkenedColor} from 'src/utils/color-math';
import {
  GMK87_STAGE_BG,
  isGmk87Embedded,
} from 'src/utils/gmk87-embed';
import {OVERRIDE_HID_CHECK} from 'src/utils/override';`,
  ],
  [
    `  opacity: \${(props) => (props.$visible ? 1 : 0)};
\`;

const KeyboardRouteGroup = styled.div<{
`,
    `  opacity: \${(props) => (props.$visible ? 1 : 0)};
\`;

${embeddedGlowBlock}

const KeyboardRouteGroup = styled.div<{
`,
  ],
  [
    `const EmbeddedStageBG = styled.div\`
  position: absolute;
  inset: 0;
  background: \${GMK87_STAGE_BG};
\`;

const EmbeddedStageGlow = styled.div\`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse 60% 50% at 50% 58%,
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0.025) 38%,
    transparent 72%
  );
\`;

const EmbeddedKeyboardGlow = styled.div\`
  position: relative;
  z-index: 2;
  height: 100%;
  width: 100%;
  filter: drop-shadow(0 0 28px rgba(255, 255, 255, 0.07))
    drop-shadow(0 10px 56px rgba(255, 255, 255, 0.04));
\`;`,
    embeddedGlowBlock,
  ],
  [
    `                <EmbeddedStageBG onClick={terrainOnClick} />
                <EmbeddedStageGlow />
              </>`,
    `                <EmbeddedStageBG onClick={terrainOnClick} />
                <EmbeddedStageGlow />
                <EmbeddedKeyboardHalo />
              </>`,
  ],
  [
    `  const hideTerrainBG = showLoader;

  return (`,
    `  const hideTerrainBG = showLoader;
  const embedded = isGmk87Embedded();

  return (`,
  ],
  [
    `            <KeyboardBG
              onClick={terrainOnClick}
              $color={accentColor}
              $visible={!hideTerrainBG}
            />
            <KeyboardGroup
              containerDimensions={containerDimensions}
              configureKeyboardIsSelectable={configureKeyboardIsSelectable}
              loadProgress={loadProgress}
            />`,
    `            {embedded ? (
              <>
                <EmbeddedStageBG onClick={terrainOnClick} />
                <EmbeddedStageGlow />
                <EmbeddedKeyboardHalo />
              </>
            ) : (
              <KeyboardBG
                onClick={terrainOnClick}
                $color={accentColor}
                $visible={!hideTerrainBG}
              />
            )}
            {embedded ? (
              <EmbeddedKeyboardGlow>
                <KeyboardGroup
                  containerDimensions={containerDimensions}
                  configureKeyboardIsSelectable={configureKeyboardIsSelectable}
                  loadProgress={loadProgress}
                />
              </EmbeddedKeyboardGlow>
            ) : (
              <KeyboardGroup
                containerDimensions={containerDimensions}
                configureKeyboardIsSelectable={configureKeyboardIsSelectable}
                loadProgress={loadProgress}
              />
            )}`,
  ],
]);

const hashLocationPath = path.join(viaBuildDir, "src", "utils", "use-hash-location.ts");
fs.writeFileSync(
  hashLocationPath,
  `import {useCallback, useSyncExternalStore} from 'react';

const relativePath = (base = '', path: string) =>
  !path.toLowerCase().indexOf(base.toLowerCase())
    ? path.slice(base.length) || '/'
    : '~' + path;

const absolutePath = (to: string, base = '') =>
  to[0] === '~' ? to.slice(1) : base + to;

const getHashPath = () => {
  const hash = location.hash.replace(/^#/, '');
  if (!hash) return '/';
  return hash.startsWith('/') ? hash : '/' + hash;
};

const subscribe = (callback: () => void) => {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
};

/** wouter location hook that reads/writes \`location.hash\` (for iframe file:// paths). */
export default function useHashLocation(opts: {base?: string} = {}) {
  const path = useSyncExternalStore(subscribe, getHashPath, () => '/');
  const navigate = useCallback(
    (to: string, {replace = false}: {replace?: boolean} = {}) => {
      const target = absolutePath(to, opts.base);
      const hash = target.startsWith('#') ? target : '#' + target;
      if (replace) {
        location.replace(hash);
      } else {
        location.hash = hash;
      }
    },
    [opts.base],
  );
  return [relativePath(opts.base, path), navigate] as const;
}
`,
);

const resetLayoutBridgePath = path.join(
  viaBuildDir,
  "src",
  "utils",
  "gmk87-reset-layout-bridge.tsx",
);
fs.writeFileSync(
  resetLayoutBridgePath,
  `import {useEffect} from 'react';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import {
  getSelectedConnectedDevice,
  getSelectedKeyboardAPI,
} from 'src/store/devicesSlice';
import {loadKeymapFromDevice} from 'src/store/keymapSlice';
import {loadMacros} from 'src/store/macrosSlice';
import type {KeyboardAPI} from './keyboard-api';
import type {ConnectedDevice} from 'src/types/types';

export async function resetKeyboardLayoutToDefault(
  dispatch: ReturnType<typeof useAppDispatch>,
  api: KeyboardAPI,
  device: ConnectedDevice,
) {
  await api.resetEEPROM();
  await api.timeout(400);
  await dispatch(loadKeymapFromDevice(device));
  try {
    await dispatch(loadMacros(device));
  } catch (err) {
    console.warn('Macro reload after EEPROM reset skipped:', err);
  }
}

/** Listens for reset requests from the GMK87 host app (parent window). */
export const Gmk87ResetLayoutBridge = () => {
  const dispatch = useAppDispatch();
  const device = useAppSelector(getSelectedConnectedDevice);
  const api = useAppSelector(getSelectedKeyboardAPI);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'gmk87-reset-layout') {
        return;
      }
      if (!device || !api) {
        window.parent.postMessage(
          {type: 'gmk87-reset-layout-result', ok: false, error: 'not_connected'},
          '*',
        );
        return;
      }
      try {
        await resetKeyboardLayoutToDefault(dispatch, api, device);
        window.parent.postMessage(
          {type: 'gmk87-reset-layout-result', ok: true},
          '*',
        );
      } catch (err) {
        window.parent.postMessage(
          {
            type: 'gmk87-reset-layout-result',
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          },
          '*',
        );
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [dispatch, device, api]);

  return null;
};
`,
);

const hostBridgePath = path.join(
  viaBuildDir,
  "src",
  "utils",
  "gmk87-host-bridge.tsx",
);
fs.writeFileSync(
  hostBridgePath,
  `import {useEffect} from 'react';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import {getSelectedConnectedDevice} from 'src/store/devicesSlice';
import {loadKeymapFromDevice} from 'src/store/keymapSlice';

/** Host window finished resizing — refresh canvas layout and keymap. */
export const Gmk87HostBridge = () => {
  const dispatch = useAppDispatch();
  const device = useAppSelector(getSelectedConnectedDevice);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'gmk87-host-layout-ready') {
        return;
      }
      window.dispatchEvent(new Event('resize'));
      if (device) {
        void dispatch(loadKeymapFromDevice(device));
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [dispatch, device]);

  return null;
};
`,
);

fs.writeFileSync(
  path.join(viaBuildDir, "src", "utils", "gmk87-embed.ts"),
  `export const isGmk87Embedded = (): boolean =>
  typeof window !== 'undefined' && window.parent !== window;

export const GMK87_STAGE_BG = '#09090b';

export const GMK87_UI_ACCENT = '#fafafa';
export const GMK87_UI_ACCENT_FG = '#09090b';
`,
);

console.log("Applied GMK87 patches to .via-build");
