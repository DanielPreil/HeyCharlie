import { useRef, useEffect } from "react";
import { KeyBadge } from "./KeyBadge";
import type { KeyCombo } from "../../hooks/useKeyMonitor";

interface Props {
  combos: KeyCombo[];
  isTyping: boolean;
  /** called each render frame — hook calls this to update overlay position */
  registerPositionUpdater: (update: (x: number, y: number) => void) => void;
}

// The dog head is ~137px below posY in screen coords (walk sprite top after scale).
// We sit 36px above the head.
const DOG_HEAD_OFFSET = 101;

export function KeyOverlay({ combos, isTyping, registerPositionUpdater }: Props) {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerPositionUpdater((posX: number, posY: number) => {
      if (!divRef.current) return;
      // CANVAS_W / 2 = 108 → horizontal center of dog
      divRef.current.style.left = `${posX + 108}px`;
      divRef.current.style.top = `${posY + DOG_HEAD_OFFSET}px`;
    });
  }, [registerPositionUpdater]);

  if (!isTyping || combos.length === 0) return null;

  return (
    <div
      ref={divRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 10000,
        pointerEvents: "none",
        transform: "translateX(-50%)",
      }}
    >
      <KeyBadge combos={combos} />
    </div>
  );
}
