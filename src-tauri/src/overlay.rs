//! Floating dictation pill: a small always-on-top window that shows the live
//! voice waveform over whatever app the user is dictating into. It can be
//! dragged anywhere; the position is remembered between launches.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub const OVERLAY_LABEL: &str = "overlay";
const OVERLAY_WIDTH: f64 = 132.0;
const OVERLAY_HEIGHT: f64 = 44.0;
// Distance from the bottom of the usable screen area (above the Dock).
const DEFAULT_BOTTOM_MARGIN: f64 = 24.0;
const SAVE_DEBOUNCE: Duration = Duration::from_millis(400);

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
struct SavedPosition {
    x: f64,
    y: f64,
}

fn position_file() -> PathBuf {
    crate::config::get_config_path().with_file_name("overlay.json")
}

fn load_position() -> Option<SavedPosition> {
    let raw = std::fs::read_to_string(position_file()).ok()?;
    serde_json::from_str(&raw).ok()
}

fn save_position(position: SavedPosition) {
    let path = position_file();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match serde_json::to_string(&position) {
        Ok(json) => {
            if let Err(error) = std::fs::write(&path, json) {
                log::warn!("[overlay] failed to save position: {error}");
            }
        }
        Err(error) => log::warn!("[overlay] failed to encode position: {error}"),
    }
}

/// Logical rectangle (x, y, width, height).
type Rect = (f64, f64, f64, f64);

/// True when the pill's center lies inside one of the given screen areas, so a
/// position saved on a now-disconnected monitor is not restored off-screen.
fn is_visible_on(position: SavedPosition, screens: &[Rect]) -> bool {
    let cx = position.x + OVERLAY_WIDTH / 2.0;
    let cy = position.y + OVERLAY_HEIGHT / 2.0;
    screens
        .iter()
        .any(|&(x, y, w, h)| cx >= x && cx <= x + w && cy >= y && cy <= y + h)
}

/// Bottom center of the given screen area.
fn default_position(screen: Rect) -> SavedPosition {
    let (x, y, w, h) = screen;
    SavedPosition {
        x: x + (w - OVERLAY_WIDTH) / 2.0,
        y: y + h - OVERLAY_HEIGHT - DEFAULT_BOTTOM_MARGIN,
    }
}

fn logical_work_area(monitor: &tauri::Monitor) -> Rect {
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    (
        area.position.x as f64 / scale,
        area.position.y as f64 / scale,
        area.size.width as f64 / scale,
        area.size.height as f64 / scale,
    )
}

fn initial_position(app: &AppHandle) -> Option<SavedPosition> {
    let screens: Vec<Rect> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(logical_work_area)
        .collect();
    if let Some(saved) = load_position() {
        if is_visible_on(saved, &screens) {
            return Some(saved);
        }
    }
    let primary = app.primary_monitor().ok().flatten()?;
    Some(default_position(logical_work_area(&primary)))
}

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let mut builder = WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("index.html".into()))
        .title("Mirioflow Pill")
        .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        // Never take keyboard focus: the text must keep going into the app
        // the user is dictating into.
        .focused(false)
        .focusable(false)
        .accept_first_mouse(true)
        .visible(false);
    if let Some(position) = initial_position(app) {
        builder = builder.position(position.x, position.y);
    }
    let window = builder.build()?;

    // Remember where the user drags the pill, debounced so a drag does not
    // write the file on every frame.
    let generation = Arc::new(AtomicU64::new(0));
    let moved_window = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Moved(physical) = event {
            let scale = moved_window.scale_factor().unwrap_or(1.0);
            let logical: LogicalPosition<f64> = physical.to_logical(scale);
            let this_move = generation.fetch_add(1, Ordering::SeqCst) + 1;
            let generation = generation.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(SAVE_DEBOUNCE).await;
                if generation.load(Ordering::SeqCst) == this_move {
                    save_position(SavedPosition {
                        x: logical.x,
                        y: logical.y,
                    });
                }
            });
            crate::overlay::focus::restore_dictation_target();
        }
    });

    window.show()?;
    Ok(window)
}

/// Mirrors the tray activity ("idle", "starting", "recording", "finalizing")
/// to the pill so it can expand while dictating.
pub fn set_activity(app: &AppHandle, activity: &str) {
    if activity == "starting" || activity == "recording" {
        focus::remember_dictation_target();
    }
    let Some(window) = app.get_webview_window(OVERLAY_LABEL) else {
        return;
    };
    let _ = window.emit_to(OVERLAY_LABEL, "overlay-activity", activity);
}

/// Clicking a window on macOS activates its app, which would pull focus away
/// from the app being dictated into. After the pill is dragged we hand focus
/// back to the app that was frontmost when dictation started.
#[cfg(target_os = "macos")]
pub mod focus {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send, msg_send_id};
    use std::sync::Mutex;

    static TARGET_PID: Mutex<Option<i32>> = Mutex::new(None);

    fn frontmost_app() -> Option<Retained<AnyObject>> {
        unsafe {
            let workspace: Retained<AnyObject> =
                msg_send_id![class!(NSWorkspace), sharedWorkspace];
            msg_send_id![&workspace, frontmostApplication]
        }
    }

    pub fn remember_dictation_target() {
        let Some(app) = frontmost_app() else { return };
        let pid: i32 = unsafe { msg_send![&app, processIdentifier] };
        if pid != std::process::id() as i32 {
            *TARGET_PID.lock().unwrap() = Some(pid);
        }
    }

    pub fn restore_dictation_target() {
        let Some(target) = *TARGET_PID.lock().unwrap() else {
            return;
        };
        let Some(front) = frontmost_app() else { return };
        let front_pid: i32 = unsafe { msg_send![&front, processIdentifier] };
        if front_pid != std::process::id() as i32 {
            return;
        }
        unsafe {
            let app: Option<Retained<AnyObject>> = msg_send_id![
                class!(NSRunningApplication),
                runningApplicationWithProcessIdentifier: target
            ];
            if let Some(app) = app {
                // NSApplicationActivateIgnoringOtherApps = 1 << 1
                let _: objc2::runtime::Bool = msg_send![&app, activateWithOptions: 2usize];
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub mod focus {
    pub fn remember_dictation_target() {}
    pub fn restore_dictation_target() {}
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Rect = (0.0, 25.0, 1440.0, 800.0);

    #[test]
    fn default_position_is_bottom_center_of_work_area() {
        let position = default_position(SCREEN);
        assert_eq!(position.x, (1440.0 - OVERLAY_WIDTH) / 2.0);
        assert_eq!(
            position.y,
            25.0 + 800.0 - OVERLAY_HEIGHT - DEFAULT_BOTTOM_MARGIN
        );
        assert!(is_visible_on(position, &[SCREEN]));
    }

    #[test]
    fn position_on_disconnected_monitor_is_not_visible() {
        let on_second_screen = SavedPosition { x: 2000.0, y: 400.0 };
        assert!(!is_visible_on(on_second_screen, &[SCREEN]));
        assert!(is_visible_on(
            on_second_screen,
            &[SCREEN, (1440.0, 0.0, 1920.0, 1080.0)]
        ));
    }

    #[test]
    fn saved_position_round_trips_through_json() {
        let position = SavedPosition { x: 12.5, y: 700.0 };
        let json = serde_json::to_string(&position).unwrap();
        assert_eq!(serde_json::from_str::<SavedPosition>(&json).unwrap(), position);
    }
}
