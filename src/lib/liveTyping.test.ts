import { describe, expect, it } from "vitest";
import { hotkeyHoldsModifier, liveTypingWaitsForRelease } from "./liveTyping";

describe("hotkeyHoldsModifier", () => {
  it("detects modifiers alone, side-qualified, and in combos", () => {
    for (const hotkey of [
      "Ctrl",
      "CtrlLeft",
      "Ctrl+Space",
      "Alt+D",
      "Cmd+Shift+D",
      "ShiftRight",
    ]) {
      expect(hotkeyHoldsModifier(hotkey)).toBe(true);
    }
  });

  it("ignores keys without a modifier", () => {
    for (const hotkey of ["Fn", "F8", "CapsLock"]) {
      expect(hotkeyHoldsModifier(hotkey)).toBe(false);
    }
  });
});

describe("liveTypingWaitsForRelease", () => {
  it("waits only for a held modifier hotkey on Windows", () => {
    expect(liveTypingWaitsForRelease("windows", "push-to-talk", "Ctrl")).toBe(
      true,
    );
    expect(liveTypingWaitsForRelease("windows", "toggle", "Ctrl")).toBe(false);
    expect(liveTypingWaitsForRelease("windows", "push-to-talk", "F8")).toBe(
      false,
    );
    expect(liveTypingWaitsForRelease("macos", "push-to-talk", "Ctrl")).toBe(
      false,
    );
  });
});
