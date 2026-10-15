import { useEffect, useState } from "react";
import type { ApiBaseUrlSettings } from "../types";
import { SettingsItem } from "./SettingsList";

export function ApiBaseUrlField({
  apiBaseUrlSettings,
  onSaveApiBaseUrl,
}: {
  apiBaseUrlSettings: ApiBaseUrlSettings;
  /** Persists the URL (`null` = default); rejects with a user-facing message. */
  onSaveApiBaseUrl: (apiBaseUrl: string | null) => Promise<void>;
}) {
  const savedUrl = apiBaseUrlSettings.apiBaseUrl ?? "";
  const [urlDraft, setUrlDraft] = useState(savedUrl);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setUrlDraft(savedUrl);
  }, [savedUrl]);

  const save = async (apiBaseUrl: string | null) => {
    setIsSaving(true);
    setError(null);
    try {
      await onSaveApiBaseUrl(apiBaseUrl);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const isDirty = urlDraft.trim() !== savedUrl;

  return (
    <SettingsItem
      label="Gladia API URL"
      htmlFor="api-base-url"
      description={
        savedUrl ? "Custom endpoint in use" : "Leave empty for production"
      }
      error={error}
      wide
    >
      <input
        id="api-base-url"
        type="url"
        className={`form-input${error ? " form-input--error" : ""}`}
        value={urlDraft}
        placeholder={apiBaseUrlSettings.defaultApiBaseUrl}
        disabled={isSaving}
        onChange={(e) => {
          setUrlDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && isDirty) {
            e.preventDefault();
            save(urlDraft.trim() || null);
          }
        }}
        autoCorrect="off"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
      />
      {isDirty || !savedUrl ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!isDirty || isSaving}
          onClick={() => save(urlDraft.trim() || null)}
        >
          Save
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isSaving}
          onClick={() => save(null)}
        >
          Reset
        </button>
      )}
    </SettingsItem>
  );
}
