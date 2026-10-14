import type { AppSettings, AudioDeviceInfo } from "../types";
import {
  formatKeySymbol,
  sortKeys,
  parseHotkeyParts,
} from "../lib/keyboardUtils";
import { SettingsGroup, SettingsItem } from "./SettingsList";
import { SettingsPageLayout } from "./SettingsPageLayout";

export function AppSettingsView({
  settings,
  setSettings,
  activationDropdownOpen,
  setActivationDropdownOpen,
  audioDeviceDropdownOpen,
  setAudioDeviceDropdownOpen,
  activationDropdownRef,
  audioDeviceDropdownRef,
  handleOpenDropdown,
  activationModeOptions,
  selectedActivationModeLabel,
  selectedAudioDeviceLabel,
  audioDevices,
  isCapturing,
  recordingKeys,
  canSaveCapture,
  startCapture,
  cancelCapture,
  saveCapture,
  handleResetHotkey,
  defaultHotkey,
  permissions,
  region,
  version,
  onDone,
  onOpenLogs,
}: {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  activationDropdownOpen: boolean;
  setActivationDropdownOpen: (v: boolean) => void;
  audioDeviceDropdownOpen: boolean;
  setAudioDeviceDropdownOpen: (v: boolean) => void;
  activationDropdownRef: React.RefObject<HTMLDivElement | null>;
  audioDeviceDropdownRef: React.RefObject<HTMLDivElement | null>;
  handleOpenDropdown: (d: "languages" | "activation" | "audioDevice") => void;
  activationModeOptions: Array<{
    value: "toggle" | "push-to-talk";
    label: string;
  }>;
  selectedActivationModeLabel: string;
  selectedAudioDeviceLabel: string;
  audioDevices: AudioDeviceInfo[];
  isCapturing: boolean;
  recordingKeys: string[];
  canSaveCapture: boolean;
  startCapture: () => void;
  cancelCapture: () => void;
  saveCapture: () => void;
  handleResetHotkey: () => void;
  defaultHotkey: string;
  permissions: { hotkeyError: string | null };
  region: string;
  version: string;
  onDone: () => void;
  onOpenLogs: () => void;
}) {
  const renderKbdKeys = (keys: string[]) =>
    sortKeys(keys).map((key, i) => (
      <kbd key={i} className="shortcut-kbd">
        {formatKeySymbol(key)}
      </kbd>
    ));

  const regionLabel = region || null;

  const currentHotkeyParts = parseHotkeyParts(settings.hotkey);
  const defaultDevice = audioDevices.find((device) => device.isDefault);
  const builtInDevice = audioDevices.find((device) => device.isBuiltIn);
  const automaticDevice =
    defaultDevice?.transport === "bluetooth"
      ? (builtInDevice ?? defaultDevice)
      : defaultDevice;

  return (
    <SettingsPageLayout
      title="App settings"
      onDone={onDone}
      footer={[
        regionLabel && `Region: ${regionLabel}`,
        version && `v${version}`,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <SettingsGroup title="Dictation">
        <SettingsItem
          label="Trigger key"
          description="Starts a dictation"
          error={permissions.hotkeyError}
          wide
        >
          <div
            className={`shortcut-recorder${isCapturing ? " recording" : ""}`}
          >
            {isCapturing ? (
              <>
                <div className="shortcut-keys recording">
                  {recordingKeys.length > 0 ? (
                    renderKbdKeys(recordingKeys)
                  ) : (
                    <span className="recording-hint">Press shortcut…</span>
                  )}
                </div>
                <div className="shortcut-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={saveCapture}
                    disabled={!canSaveCapture}
                  >
                    Save
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={cancelCapture}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="shortcut-keys">
                  {renderKbdKeys(currentHotkeyParts)}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={startCapture}>
                  Edit
                </button>
                {settings.hotkey !== defaultHotkey && (
                  <button
                    className="hotkey-reset-btn"
                    onClick={handleResetHotkey}
                    title="Reset to Fn / Globe"
                    aria-label="Reset trigger key to Fn / Globe"
                  >
                    <span className="hotkey-reset-icon">↻</span>
                  </button>
                )}
              </>
            )}
          </div>
        </SettingsItem>

        <SettingsItem
          label="Activation mode"
          description="Hold to talk, or press to toggle"
          wide
        >
          <div
            className={`multi-select ${activationDropdownOpen ? "open" : ""}`}
            ref={activationDropdownRef}
          >
            <button
              type="button"
              className="form-input multi-select-trigger"
              onClick={() => {
                if (activationDropdownOpen) {
                  setActivationDropdownOpen(false);
                } else {
                  handleOpenDropdown("activation");
                }
              }}
              aria-haspopup="listbox"
              aria-expanded={activationDropdownOpen}
            >
              <span>{selectedActivationModeLabel}</span>
            </button>
            {activationDropdownOpen && (
              <div className="multi-select-dropdown">
                <div className="multi-select-options" role="listbox">
                  {activationModeOptions.map((option) => {
                    const selected = settings.activationMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`dropdown-option ${selected ? "selected" : ""}`}
                        onClick={() => {
                          setSettings({
                            ...settings,
                            activationMode: option.value,
                          });
                          setActivationDropdownOpen(false);
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SettingsItem>

        <SettingsItem
          label="Microphone"
          description="The built-in microphone works best"
          wide
        >
          <div
            className={`multi-select ${audioDeviceDropdownOpen ? "open" : ""}`}
            ref={audioDeviceDropdownRef}
          >
            <button
              type="button"
              className="form-input multi-select-trigger"
              onClick={() => {
                if (audioDeviceDropdownOpen) {
                  setAudioDeviceDropdownOpen(false);
                } else {
                  handleOpenDropdown("audioDevice");
                }
              }}
              aria-haspopup="listbox"
              aria-expanded={audioDeviceDropdownOpen}
            >
              <span>{selectedAudioDeviceLabel}</span>
            </button>
            {audioDeviceDropdownOpen && (
              <div className="multi-select-dropdown">
                <div className="multi-select-options" role="listbox">
                  <button
                    type="button"
                    className={`dropdown-option ${settings.audioDeviceSelection.mode === "automatic" ? "selected" : ""}`}
                    onClick={() => {
                      setSettings({
                        ...settings,
                        audioDevice: "",
                        audioDeviceSelection: { mode: "automatic" },
                      });
                      setAudioDeviceDropdownOpen(false);
                    }}
                  >
                    Recommended
                    {automaticDevice ? ` (${automaticDevice.name})` : ""}
                  </button>
                  <button
                    type="button"
                    className={`dropdown-option ${settings.audioDeviceSelection.mode === "system_default" ? "selected" : ""}`}
                    onClick={() => {
                      setSettings({
                        ...settings,
                        audioDevice: "",
                        audioDeviceSelection: { mode: "system_default" },
                      });
                      setAudioDeviceDropdownOpen(false);
                    }}
                  >
                    System Default
                    {defaultDevice ? ` (${defaultDevice.name})` : ""}
                  </button>
                  {audioDevices.map((device) => {
                    const selected =
                      settings.audioDeviceSelection.mode === "specific" &&
                      settings.audioDeviceSelection.device_id === device.id;
                    return (
                      <button
                        key={device.id || device.name}
                        type="button"
                        className={`dropdown-option ${selected ? "selected" : ""}`}
                        onClick={() => {
                          setSettings({
                            ...settings,
                            audioDevice: device.name,
                            audioDeviceSelection: {
                              mode: "specific",
                              device_id: device.id,
                              device_name: device.name,
                            },
                          });
                          setAudioDeviceDropdownOpen(false);
                        }}
                      >
                        {device.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SettingsItem>

        <SettingsItem
          label="Copy to clipboard"
          description="Keep the transcript after dictating"
        >
          <label className="toggle-switch" title="Copy to clipboard">
            <input
              type="checkbox"
              checked={settings.copyToClipboard}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  copyToClipboard: e.target.checked,
                })
              }
            />
            <span className="toggle-slider" />
          </label>
        </SettingsItem>
      </SettingsGroup>

      <SettingsGroup title="Advanced" collapsible>
        <SettingsItem
          label="Logs"
          description="Share the log file if transcription fails"
        >
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onOpenLogs}
          >
            Open logs folder
          </button>
        </SettingsItem>
      </SettingsGroup>
    </SettingsPageLayout>
  );
}
