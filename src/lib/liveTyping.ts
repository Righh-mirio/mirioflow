import type { ActivationMode } from "../types";

const MODIFIER_KEYS = new Set([
  "ctrl",
  "control",
  "alt",
  "option",
  "shift",
  "cmd",
  "command",
  "meta",
  "super",
  "win",
]);

/** Mirrors `live_typing::hotkey_holds_modifier` in the Rust backend. */
export function hotkeyHoldsModifier(hotkey: string): boolean {
  return hotkey.split("+").some((key) => {
    const base = key
      .trim()
      .toLowerCase()
      .replace(/(left|right)$/, "");
    return MODIFIER_KEYS.has(base);
  });
}

/**
 * On Windows, keys sent while a held modifier is down combine with it, so
 * live typing waits until a held trigger key with a modifier is released.
 */
export function liveTypingWaitsForRelease(
  platform: string,
  activationMode: ActivationMode,
  hotkey: string,
): boolean {
  return (
    platform === "windows" &&
    activationMode === "push-to-talk" &&
    hotkeyHoldsModifier(hotkey)
  );
}
