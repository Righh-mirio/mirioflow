//! Synthetic keyboard input into the focused app: the paste keystroke used for
//! final transcripts, and the Backspace and text input used by live typing.
//! Requires Accessibility permission on macOS.

/// Simulate the paste keystroke into the focused app (Cmd+V on macOS, Ctrl+V
/// elsewhere).
pub fn send_paste() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        cg::simulate_cmd_v()
    }
    #[cfg(target_os = "windows")]
    {
        use enigo::{Direction, Enigo, Key, Keyboard, Settings};
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
        enigo
            .key(Key::Control, Direction::Press)
            .map_err(|e| e.to_string())?;
        enigo
            .key(Key::Unicode('v'), Direction::Click)
            .map_err(|e| e.to_string())?;
        enigo
            .key(Key::Control, Direction::Release)
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(())
    }
}

/// Press Backspace `backspaces` times, then type `text`, without going through
/// the clipboard.
pub fn type_edit(backspaces: usize, text: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        cg::type_edit(backspaces, text)
    }
    #[cfg(target_os = "windows")]
    {
        use enigo::{Direction, Enigo, Key, Keyboard, Settings};
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
        for _ in 0..backspaces {
            enigo
                .key(Key::Backspace, Direction::Click)
                .map_err(|e| e.to_string())?;
        }
        if !text.is_empty() {
            enigo.text(text).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (backspaces, text);
        Ok(())
    }
}

/// Identifies what has keyboard focus: the frontmost app's process id on
/// macOS, the foreground window handle on Windows. Live typing stops
/// correcting text once it changes, so Backspace never lands in another app.
pub fn focus_owner() -> Option<u64> {
    #[cfg(target_os = "macos")]
    {
        use objc2::msg_send;
        use objc2::runtime::{AnyClass, AnyObject};

        objc2::rc::autoreleasepool(|_| unsafe {
            let workspace: *mut AnyObject =
                msg_send![AnyClass::get("NSWorkspace")?, sharedWorkspace];
            if workspace.is_null() {
                return None;
            }
            let app: *mut AnyObject = msg_send![workspace, frontmostApplication];
            if app.is_null() {
                return None;
            }
            let pid: i32 = msg_send![app, processIdentifier];
            u64::try_from(pid).ok()
        })
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        let window = unsafe { GetForegroundWindow() };
        (!window.is_null()).then_some(window as u64)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

/// CoreGraphics keyboard-event simulation. Posting synthetic key events
/// directly is faster than `osascript` and — crucially — only needs
/// Accessibility, not the separate "control System Events" Automation
/// permission an AppleScript prompts for.
#[cfg(target_os = "macos")]
mod cg {
    use std::ffi::c_void;
    use std::time::Duration;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceCreate(state_id: i32) -> *mut c_void;
        fn CGEventCreateKeyboardEvent(
            source: *const c_void,
            keycode: u16,
            key_down: bool,
        ) -> *mut c_void;
        fn CGEventSetFlags(event: *mut c_void, flags: u64);
        fn CGEventKeyboardSetUnicodeString(event: *mut c_void, length: usize, string: *const u16);
        fn CGEventPost(tap: u32, event: *mut c_void);
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(cf: *const c_void);
    }

    const KCG_HID_EVENT_TAP: u32 = 0;
    const KCG_EVENT_SOURCE_STATE_PRIVATE: i32 = -1;
    const KVK_V: u16 = 9;
    const KVK_DELETE: u16 = 51;
    const KCG_EVENT_FLAG_MASK_COMMAND: u64 = 1 << 20;
    /// Most UTF-16 units one keyboard event carries.
    const MAX_UNITS_PER_EVENT: usize = 20;
    /// Pause after each key so the target app keeps up.
    const KEY_INTERVAL: Duration = Duration::from_millis(2);

    /// Post a synthetic Cmd+V into the focused app.
    pub fn simulate_cmd_v() -> Result<(), String> {
        unsafe {
            let key_down = CGEventCreateKeyboardEvent(std::ptr::null(), KVK_V, true);
            if key_down.is_null() {
                return Err("Failed to create key-down event".into());
            }
            CGEventSetFlags(key_down, KCG_EVENT_FLAG_MASK_COMMAND);
            CGEventPost(KCG_HID_EVENT_TAP, key_down);
            CFRelease(key_down as *const c_void);

            std::thread::sleep(std::time::Duration::from_millis(20));

            let key_up = CGEventCreateKeyboardEvent(std::ptr::null(), KVK_V, false);
            if key_up.is_null() {
                return Err("Failed to create key-up event".into());
            }
            CGEventSetFlags(key_up, KCG_EVENT_FLAG_MASK_COMMAND);
            CGEventPost(KCG_HID_EVENT_TAP, key_up);
            CFRelease(key_up as *const c_void);
        }
        Ok(())
    }

    /// Splits text into keyboard-event payloads, never inside a surrogate pair.
    fn utf16_chunks(text: &str) -> Vec<Vec<u16>> {
        let mut chunks: Vec<Vec<u16>> = Vec::new();
        let mut buf = [0u16; 2];
        for c in text.chars() {
            let units = c.encode_utf16(&mut buf);
            match chunks.last_mut() {
                Some(chunk) if chunk.len() + units.len() <= MAX_UNITS_PER_EVENT => {
                    chunk.extend_from_slice(units)
                }
                _ => chunks.push(units.to_vec()),
            }
        }
        chunks
    }

    /// Posts a key press and release with no modifier flags, from a private
    /// event source: the dictation hotkey may still be held (Fn turns
    /// Backspace into Forward Delete, Option into word delete) and must not
    /// change what these keys do.
    unsafe fn post_key(source: *const c_void, keycode: u16, text: &[u16]) -> Result<(), String> {
        for key_down in [true, false] {
            let event = CGEventCreateKeyboardEvent(source, keycode, key_down);
            if event.is_null() {
                return Err("Failed to create keyboard event".into());
            }
            CGEventSetFlags(event, 0);
            if !text.is_empty() {
                CGEventKeyboardSetUnicodeString(event, text.len(), text.as_ptr());
            }
            CGEventPost(KCG_HID_EVENT_TAP, event);
            CFRelease(event as *const c_void);
        }
        std::thread::sleep(KEY_INTERVAL);
        Ok(())
    }

    pub fn type_edit(backspaces: usize, text: &str) -> Result<(), String> {
        unsafe {
            let source = CGEventSourceCreate(KCG_EVENT_SOURCE_STATE_PRIVATE);
            if source.is_null() {
                return Err("Failed to create event source".into());
            }
            let result = (|| {
                for _ in 0..backspaces {
                    post_key(source, KVK_DELETE, &[])?;
                }
                for chunk in utf16_chunks(text) {
                    post_key(source, 0, &chunk)?;
                }
                Ok(())
            })();
            CFRelease(source as *const c_void);
            result
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn chunks_hold_at_most_twenty_units_and_keep_surrogate_pairs() {
            let text = format!("{}😀{}", "a".repeat(19), "b".repeat(25));
            let chunks = utf16_chunks(&text);
            assert!(chunks
                .iter()
                .all(|chunk| chunk.len() <= MAX_UNITS_PER_EVENT));
            assert_eq!(chunks[0].len(), 19, "the emoji does not fit after 19 units");
            let rebuilt: Vec<u16> = chunks.concat();
            assert_eq!(String::from_utf16(&rebuilt).unwrap(), text);
            assert!(utf16_chunks("").is_empty());
        }
    }
}
