import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../types";
import { TranscriptionSettingsView } from "./TranscriptionSettingsView";

const SETTINGS: AppSettings = {
  apiKey: "",
  languages: ["en"],
  activationMode: "push-to-talk",
  audioDevice: "",
  audioDeviceSelection: { mode: "automatic" },
  hotkey: "Fn",
  codeSwitching: false,
  copyToClipboard: false,
  liveTyping: false,
  endpointing: 0.1,
  customVocabulary: [],
};

const render = (settings: AppSettings, liveTypingWaitsForRelease = false) =>
  renderToStaticMarkup(
    <TranscriptionSettingsView
      settings={settings}
      setSettings={vi.fn()}
      languageDropdownOpen={false}
      setLanguageDropdownOpen={vi.fn()}
      languageDropdownRef={createRef<HTMLDivElement>()}
      handleOpenDropdown={vi.fn()}
      handleLanguageToggle={vi.fn()}
      languageSearch=""
      setLanguageSearch={vi.fn()}
      filteredLanguageOptions={[]}
      selectedLanguageSummary="English"
      modelDropdownOpen={false}
      setModelDropdownOpen={vi.fn()}
      modelDropdownRef={createRef<HTMLDivElement>()}
      liveModel={null}
      liveModelOptions={{ status: "loading" }}
      apiHost="api.gladia.io"
      onSelectLiveModel={vi.fn()}
      liveTypingWaitsForRelease={liveTypingWaitsForRelease}
      onDone={vi.fn()}
    />,
  );

const liveTypingCheckbox = (html: string) =>
  html.match(
    /<label class="toggle-switch" title="Live typing"><input[^>]*>/,
  )?.[0];

describe("TranscriptionSettingsView live typing", () => {
  it("shows the toggle off when the setting is off", () => {
    const html = render(SETTINGS);
    expect(html).toContain("Type words as you speak, then correct them");
    expect(liveTypingCheckbox(html)).toBeDefined();
    expect(liveTypingCheckbox(html)).not.toContain("checked");
  });

  it("shows the toggle on when the setting is on", () => {
    expect(
      liveTypingCheckbox(render({ ...SETTINGS, liveTyping: true })),
    ).toContain("checked");
  });

  it("says when text waits for the trigger key's release", () => {
    expect(render(SETTINGS, true)).toContain(
      "Text appears when you release the trigger key",
    );
  });
});
