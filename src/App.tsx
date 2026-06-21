import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DaschundySprite } from "./DaschundySprite";
import "./App.css";

const CANVAS_W = 216;
const CANVAS_H = 280;
const MOVE_SCALE = 0.75;
const IDLE_TIMEOUT_MS = 1500;

function dogHitbox(posX: number, posY: number) {
  const hw = (CANVAS_W * MOVE_SCALE) / 2;
  const hh = (CANVAS_H * MOVE_SCALE) / 2;
  const cx = posX + CANVAS_W / 2;
  const cy = posY + CANVAS_H / 2;
  return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
}

function App() {
  const [isTyping, setIsTyping] = useState(false);
  const [keys, setKeys] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dogPosRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const isIgnoringRef = useRef(false);
  const hasGlobalMonitorRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const setIgnore = useCallback(async (ignore: boolean) => {
    if (isIgnoringRef.current === ignore) return;
    isIgnoringRef.current = ignore;
    try {
      await getCurrentWindow().setIgnoreCursorEvents(ignore);
    } catch (e) {
      // permission not configured or unsupported — stay interactive
      isIgnoringRef.current = false;
    }
  }, []);

  const triggerKey = useCallback((key: string) => {
    setIsTyping(true);
    setKeys((prev) => [...prev.slice(-3), key]);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsTyping(false);
      setKeys([]);
    }, IDLE_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    // default: start in click-through mode (rdev will handle mouse-based toggle)
    setIgnore(true);

    // global key events via rdev (needs Accessibility permission)
    const unlistenKey = listen<string>("key-press", (e) => triggerKey(e.payload));

    // global mouse position via rdev — toggle hit-testing based on dog hitbox
    const unlistenMouse = listen<{ x: number; y: number }>("mouse-move", (e) => {
      hasGlobalMonitorRef.current = true;
      if (isDraggingRef.current) return;
      const { x, y } = e.payload;
      const box = dogHitbox(dogPosRef.current.x, dogPosRef.current.y);
      const over = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      setIgnore(!over);
    });

    // fallback: Accessibility permission denied
    // → keep window interactive, listen to local key events only
    const unlistenNoAccess = listen("no-accessibility", () => {
      setIgnore(false); // never ignore — dog always draggable
    });

    // local key fallback (only fires when THIS window is focused)
    const onLocalKey = (e: KeyboardEvent) => {
      if (hasGlobalMonitorRef.current) return; // rdev handles it
      triggerKey(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    };
    document.addEventListener("keydown", onLocalKey);

    return () => {
      unlistenKey.then((f) => f());
      unlistenMouse.then((f) => f());
      unlistenNoAccess.then((f) => f());
      document.removeEventListener("keydown", onLocalKey);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [setIgnore, triggerKey]);

  const handlePositionChange = useCallback((x: number, y: number) => {
    dogPosRef.current = { x, y };
    if (overlayRef.current) {
      // dog head is ~137px below posY in screen coords (walk sprite top after scale)
      // overlay sits 36px above the dog's head
      overlayRef.current.style.left = `${x + CANVAS_W / 2}px`;
      overlayRef.current.style.top = `${y + 101}px`;
    }
  }, []);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    setIgnore(false);
  }, [setIgnore]);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    // cursor may no longer be over dog — rdev mouse-move will correct this
    if (hasGlobalMonitorRef.current) setIgnore(true);
  }, [setIgnore]);

  return (
    <div className="h-screen w-screen select-none" style={{ pointerEvents: "none" }}>
      <DaschundySprite
        isTyping={isTyping}
        onPositionChange={handlePositionChange}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />

      {isTyping && keys.length > 0 && (
        <div
          ref={overlayRef}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            display: "flex",
            gap: 4,
            zIndex: 10000,
            pointerEvents: "none",
            transform: "translateX(-50%)",
          }}
        >
          {keys.map((k, i) => (
            <span
              key={i}
              style={{
                background: "rgba(30,30,30,0.85)",
                color: "#fff",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 13,
                fontFamily: "monospace",
                fontWeight: 600,
                backdropFilter: "blur(4px)",
                border: "1px solid rgba(255,255,255,0.15)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                opacity: i === keys.length - 1 ? 1 : 0.4 + i * 0.15,
              }}
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
