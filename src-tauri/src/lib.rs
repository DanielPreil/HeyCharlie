use rdev::{listen, Event, EventType, Key};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
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

// Physical key → label fallback for when modifiers suppress the unicode char.
// Cmd+C on macOS gives unicode \x03 (control char) — this recovers "C".
fn key_char(key: &Key) -> Option<&'static str> {
    match key {
        Key::KeyA => Some("A"), Key::KeyB => Some("B"), Key::KeyC => Some("C"),
        Key::KeyD => Some("D"), Key::KeyE => Some("E"), Key::KeyF => Some("F"),
        Key::KeyG => Some("G"), Key::KeyH => Some("H"), Key::KeyI => Some("I"),
        Key::KeyJ => Some("J"), Key::KeyK => Some("K"), Key::KeyL => Some("L"),
        Key::KeyM => Some("M"), Key::KeyN => Some("N"), Key::KeyO => Some("O"),
        Key::KeyP => Some("P"), Key::KeyQ => Some("Q"), Key::KeyR => Some("R"),
        Key::KeyS => Some("S"), Key::KeyT => Some("T"), Key::KeyU => Some("U"),
        Key::KeyV => Some("V"), Key::KeyW => Some("W"), Key::KeyX => Some("X"),
        Key::KeyY => Some("Y"), Key::KeyZ => Some("Z"),
        Key::Num0 => Some("0"), Key::Num1 => Some("1"), Key::Num2 => Some("2"),
        Key::Num3 => Some("3"), Key::Num4 => Some("4"), Key::Num5 => Some("5"),
        Key::Num6 => Some("6"), Key::Num7 => Some("7"), Key::Num8 => Some("8"),
        Key::Num9 => Some("9"),
        _ => None,
    }
}

fn event_label(event: &Event) -> Option<String> {
    if let EventType::KeyPress(ref key) = event.event_type {
        // OS-provided char (respects QWERTZ, AZERTY, etc.) — works for normal typing
        if let Some(ref uni) = event.unicode {
            if let Some(ref name) = uni.name {
                let ch = name.trim();
                if !ch.is_empty() && ch.chars().all(|c| !c.is_control()) {
                    return Some(ch.to_uppercase());
                }
            }
        }
        // Modifier held (e.g. Cmd+C) → unicode becomes a control char and is filtered above.
        // Recover the letter/digit from the physical key enum.
        if let Some(label) = key_char(key) {
            return Some(label.to_string());
        }
        // Arrows, F-keys, special keys
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
            EventType::KeyRelease(ref key) => {
                // Only emit release for modifier keys so frontend can track combos
                if let Some(label) = special_key_label(key) {
                    let is_modifier = matches!(
                        label.as_str(),
                        "Shift" | "Ctrl" | "Alt" | "Cmd"
                    );
                    if is_modifier {
                        app.emit("key-release", label).ok();
                    }
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
            // Remove from Cmd+Tab switcher and Dock — heycharlie is a background overlay,
            // not a regular app. Tray icon still works with Accessory policy.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

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
            // System tray: right-click → Quit
            let quit = MenuItem::with_id(app, "quit", "Quit heycharlie", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;

            start_input_listener(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
