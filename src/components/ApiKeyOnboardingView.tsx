import { invoke } from "@tauri-apps/api/core";
import type { ApiBaseUrlSettings } from "../types";
import { ApiKeyField } from "./ApiKeyField";
import { ApiBaseUrlField } from "./ApiBaseUrlField";

const API_KEYS_URL = "https://app.gladia.io/apikeys";

export function ApiKeyOnboardingView({
  displayValue,
  isLocked,
  isTesting,
  onChangeKey,
  onSave,
  error,
  apiBaseUrlSettings,
  onSaveApiBaseUrl,
}: {
  displayValue: string;
  isLocked: boolean;
  isTesting: boolean;
  onChangeKey: (v: string) => void;
  onSave: () => void;
  error: string | null;
  apiBaseUrlSettings: ApiBaseUrlSettings | null;
  onSaveApiBaseUrl: (apiBaseUrl: string | null) => Promise<void>;
}) {
  return (
    <div className="setup-step setup-step-center">
      <h2 className="setup-title">Welcome to Mirioflow</h2>
      <p className="setup-desc">Enter your Gladia API key to get started.</p>
      <div className="setup-form">
        <ApiKeyField
          displayValue={displayValue}
          isLocked={isLocked}
          isTesting={isTesting}
          onChangeKey={onChangeKey}
          onSave={onSave}
          error={error}
          secondaryAction={
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                void invoke("open_external_url", { url: API_KEYS_URL })
              }
            >
              Get your API key ↗
            </button>
          }
        />
      </div>
      {apiBaseUrlSettings && (
        <details
          className="home-api-spoiler onboarding-developer-spoiler"
          open={apiBaseUrlSettings.apiBaseUrl ? true : undefined}
        >
          <summary>Developer settings</summary>
          <ApiBaseUrlField
            apiBaseUrlSettings={apiBaseUrlSettings}
            onSaveApiBaseUrl={onSaveApiBaseUrl}
          />
        </details>
      )}
    </div>
  );
}
