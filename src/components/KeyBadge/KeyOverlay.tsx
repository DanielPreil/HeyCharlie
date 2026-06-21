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
const DOG_HEAD_OFFSET = 85;

export function KeyOverlay({ combos, isTyping, registerPositionUpdater }: Props) {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerPositionUpdater((posX: number, posY: number) => {
      const el = divRef.current;
      if (!el) return;

      const dogCenterX = posX + 108;
      const pad = 8;

      // Start centered over the dog
      el.style.left = `${dogCenterX}px`;
      el.style.top = `${posY + DOG_HEAD_OFFSET}px`;
      el.style.transform = "translateX(-50%)";

      // getBoundingClientRect forces a reflow → gives actual on-screen position
      // then nudge left/right if the badge overflows the screen edge
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        if (rect.left < pad) {
          el.style.left = `${dogCenterX + (pad - rect.left)}px`;
        } else if (rect.right > window.innerWidth - pad) {
          el.style.left = `${dogCenterX - (rect.right - window.innerWidth + pad)}px`;
        }
      }
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
