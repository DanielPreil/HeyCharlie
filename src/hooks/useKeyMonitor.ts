import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

const MODIFIERS = new Set(["Shift", "Ctrl", "Alt", "Cmd"]);
const IDLE_MS = 1500;
const MAX_COMBOS = 4;

export type KeyCombo = { id: number; keys: string[] };

export function useKeyMonitor() {
  const [combos, setCombos] = useState<KeyCombo[]>([]);
  const [isType, setIsType] = useState(false);
  const [keyPressCount, setKeyPressCount] = useState(0);
  const activeModifiers = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasGlobal = useRef(false);
  const comboId = useRef(0);

  const resetIdle = useCallback(() => {
    setIsType(false);
    setCombos([]);
    activeModifiers.current.clear();
  }, []);

  const onKeyPress = useCallback(
    (key: string) => {
      if (MODIFIERS.has(key)) {
        activeModifiers.current.add(key);
        return;
      }

      const combo: KeyCombo = { id: comboId.current++, keys: [...activeModifiers.current, key] };
      setIsType(true);
      setKeyPressCount((c) => c + 1);
      setCombos((prev) => [...prev.slice(-(MAX_COMBOS - 1)), combo]);

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(resetIdle, IDLE_MS);
    },
    [resetIdle]
  );

  const onModifierRelease = useCallback((key: string) => {
    activeModifiers.current.delete(key);
  }, []);

  useEffect(() => {
    let destroyed = false;

    const unlistenPress = listen<string>("key-press", (e) => {
      hasGlobal.current = true;
      onKeyPress(e.payload);
    });

    const unlistenRelease = listen<string>("key-release", (e) => {
      onModifierRelease(e.payload);
    });

    const handleLocalKey = (e: KeyboardEvent) => {
      if (hasGlobal.current) return;
      const key = localKeyLabel(e);
      if (key) onKeyPress(key);
    };

    const handleLocalKeyUp = (e: KeyboardEvent) => {
      if (hasGlobal.current) return;
      const mod = localModifierLabel(e.key);
      if (mod) onModifierRelease(mod);
    };

    const unlistenNoAccess = listen("no-accessibility", () => {
      if (destroyed) return;
      document.addEventListener("keydown", handleLocalKey);
      document.addEventListener("keyup", handleLocalKeyUp);
    });

    return () => {
      destroyed = true;
      unlistenPress.then((f) => f());
      unlistenRelease.then((f) => f());
      unlistenNoAccess.then((f) => f());
      document.removeEventListener("keydown", handleLocalKey);
      document.removeEventListener("keyup", handleLocalKeyUp);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onKeyPress, onModifierRelease]);

  return { combos, isType, keyPressCount };
}

// ─── Local key helpers (fallback only) ────────────────────────────────────

function localModifierLabel(key: string): string | null {
  const map: Record<string, string> = {
    Shift: "Shift",
    Control: "Ctrl",
    Alt: "Alt",
    Meta: "Cmd",
  };
  return map[key] ?? null;
}

function localKeyLabel(e: KeyboardEvent): string | null {
  const mod = localModifierLabel(e.key);
  if (mod) return mod;
  if (e.key.length === 1) return e.key.toUpperCase();
  const special: Record<string, string> = {
    Enter: "Return",
    Backspace: "Delete",
    Tab: "Tab",
    Escape: "Esc",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    " ": "Space",
  };
  return special[e.key] ?? null;
}
