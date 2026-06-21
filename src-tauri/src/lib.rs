use rdev::{listen, Event, EventType, Key};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

// Returns None for keys we don't want to show (modifiers etc.)
fn special_key_label(key: &Key) -> Option<String> {
    let s = match key {
        Key::Return => "Return",
        Key::Backspace => "Delete",
        Key::Tab => "Tab",
        Key::Escape => "Esc",
        Key::Space => "Space",
        Key::UpArrow => "↑",
        Key::DownArrow => "↓",
        Key::LeftArrow => "←",
        Key::RightArrow => "→",
        Key::ShiftLeft | Key::ShiftRight => "Shift",
        Key::ControlLeft | Key::ControlRight => "Ctrl",
        Key::Alt => "Alt",
        Key::MetaLeft | Key::MetaRight => "Cmd",
        Key::CapsLock => "Caps",
        Key::F1 => "F1",
        Key::F2 => "F2",
        Key::F3 => "F3",
        Key::F4 => "F4",
        Key::F5 => "F5",
        Key::F6 => "F6",
        Key::F7 => "F7",
        Key::F8 => "F8",
        Key::F9 => "F9",
        Key::F10 => "F10",
        Key::F11 => "F11",
        Key::F12 => "F12",
        Key::Delete => "Del",
        Key::Home => "Home",
        Key::End => "End",
        Key::PageUp => "PgUp",
        Key::PageDown => "PgDn",
        _ => return None,
    };
    Some(s.to_string())
}

// Prefer event.name (OS keyboard-layout-aware) for printable chars.
// Fall back to special_key_label for function/modifier/arrow keys.
fn event_label(event: &Event) -> Option<String> {
    if let EventType::KeyPress(ref key) = event.event_type {
        // Use OS-provided char (respects QWERTZ, AZERTY, etc.)
        if let Some(ref uni) = event.unicode {
            if let Some(ref name) = uni.name {
                let ch = name.trim();
                if !ch.is_empty() && ch.chars().all(|c| !c.is_control()) {
                    return Some(ch.to_uppercase());
                }
            }
        }
        // Special / non-printable keys
        return special_key_label(key);
    }
    None
}

static LAST_MOUSE_MS: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// macOS: check Accessibility permission before touching CGEventTap.
// Without it, macOS (14+) sends SIGTERM when rdev tries to create the tap.
#[cfg(target_os = "macos")]
fn has_accessibility_permission() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
}

#[cfg(not(target_os = "macos"))]
fn has_accessibility_permission() -> bool {
    true
}


#[derive(Serialize, Clone)]
struct MousePos {
    x: f64,
    y: f64,
}

fn start_input_listener(app: AppHandle) {
    if !has_accessibility_permission() {
        eprintln!(
            "[heycharlie] Accessibility permission not granted.\n\
             Global key/mouse monitoring disabled.\n\
             Grant it: System Settings → Privacy & Security → Accessibility → add your Terminal or heycharlie"
        );
        // tell frontend to fall back to local (window-focused) key events
        // and keep click-through off so the dog is still draggable
        app.emit("no-accessibility", ()).ok();
        return;
    }

    std::thread::spawn(move || {
        let result = listen(move |event: Event| match event.event_type {
            EventType::KeyPress(_) => {
                if let Some(label) = event_label(&event) {
                    app.emit("key-press", label).ok();
                }
            }
            EventType::MouseMove { x, y } => {
                let now = now_ms();
                let last = LAST_MOUSE_MS.load(Ordering::Relaxed);
                if now.saturating_sub(last) >= 16 {
                    LAST_MOUSE_MS.store(now, Ordering::Relaxed);
                    app.emit("mouse-move", MousePos { x, y }).ok();
                }
            }
            _ => {}
        });
        if let Err(e) = result {
            eprintln!("[heycharlie] rdev listener error: {:?}", e);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let win = app.get_webview_window("main").unwrap();
            // resize window to actual primary monitor size (avoids using fullscreen mode)
            if let Ok(Some(monitor)) = win.current_monitor() {
                let size = monitor.size();
                let pos = monitor.position();
                win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                    width: size.width,
                    height: size.height,
                }))
                .ok();
                win.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: pos.x,
                    y: pos.y,
                }))
                .ok();
            }
            start_input_listener(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
