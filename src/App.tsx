import { useCallback, useRef } from "react";
import { Dog } from "./components/Dog/Dog";
import { KeyOverlay } from "./components/KeyBadge/KeyOverlay";
import { useKeyMonitor } from "./hooks/useKeyMonitor";
import { useClickThrough } from "./hooks/useClickThrough";
import { charlieConfig } from "./characters/charlie/config";
import "./App.css";

const { canvasSize } = charlieConfig;

export default function App() {
  const { combos, isTyping } = useKeyMonitor();
  const { updateDogPosition, onDragStart, onDragEnd } = useClickThrough(
    canvasSize.w,
    canvasSize.h
  );

  // Overlay position updater — registered by KeyOverlay, called by Dog
  const positionUpdaterRef = useRef<((x: number, y: number) => void) | null>(null);

  const registerPositionUpdater = useCallback(
    (update: (x: number, y: number) => void) => {
      positionUpdaterRef.current = update;
    },
    []
  );

  const handlePositionChange = useCallback(
    (x: number, y: number) => {
      updateDogPosition(x, y);
      positionUpdaterRef.current?.(x, y);
    },
    [updateDogPosition]
  );

  return (
    <div className="h-screen w-screen select-none" style={{ pointerEvents: "none" }}>
      <Dog
        isTyping={isTyping}
        onPositionChange={handlePositionChange}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <KeyOverlay
        combos={combos}
        isTyping={isTyping}
        registerPositionUpdater={registerPositionUpdater}
      />
    </div>
  );
}
