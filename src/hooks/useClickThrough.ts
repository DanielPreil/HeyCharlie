import { useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface DogBounds {
  posX: number;
  posY: number;
  canvasW: number;
  canvasH: number;
  scale: number;
}

function isOverDog(mx: number, my: number, { posX, posY, canvasW, canvasH, scale }: DogBounds) {
  const hw = (canvasW * scale) / 2;
  const hh = (canvasH * scale) / 2;
  const cx = posX + canvasW / 2;
  const cy = posY + canvasH / 2;
  return mx >= cx - hw && mx <= cx + hw && my >= cy - hh && my <= cy + hh;
}

export function useClickThrough(canvasW: number, canvasH: number) {
  const isIgnoring = useRef(false);
  const isDragging = useRef(false);
  const dogBounds = useRef<DogBounds>({ posX: 0, posY: 0, canvasW, canvasH, scale: 0.75 });

  const setIgnore = useCallback(async (ignore: boolean) => {
    if (isIgnoring.current === ignore) return;
    isIgnoring.current = ignore;
    try {
      await getCurrentWindow().setIgnoreCursorEvents(ignore);
    } catch {
      // permission not configured — stay interactive
      isIgnoring.current = false;
    }
  }, []);

  // Called every frame from Dog's onPositionChange
  const updateDogPosition = useCallback((posX: number, posY: number, scale = 0.75) => {
    dogBounds.current = { ...dogBounds.current, posX, posY, scale };
  }, []);

  const onDragStart = useCallback(() => {
    isDragging.current = true;
    setIgnore(false);
  }, [setIgnore]);

  const onDragEnd = useCallback(() => {
    isDragging.current = false;
    // rdev mouse-move will correct this on next event
    setIgnore(true);
  }, [setIgnore]);

  useEffect(() => {
    // Start in click-through mode
    setIgnore(true);

    // rdev sends global mouse position — toggle hit-testing based on dog hitbox
    const unlistenMouse = listen<{ x: number; y: number }>("mouse-move", (e) => {
      if (isDragging.current) return;
      const over = isOverDog(e.payload.x, e.payload.y, dogBounds.current);
      setIgnore(!over);
    });

    // No Accessibility → never ignore (dog always draggable, no click-through)
    const unlistenNoAccess = listen("no-accessibility", () => {
      setIgnore(false);
    });

    return () => {
      unlistenMouse.then((f) => f());
      unlistenNoAccess.then((f) => f());
    };
  }, [setIgnore]);

  return { updateDogPosition, onDragStart, onDragEnd };
}
