import { useRef, useEffect } from "react";
import { KeyBadge } from "./KeyBadge";
import type { KeyCombo } from "../../hooks/useKeyMonitor";
import { charlieConfig } from "../../characters/charlie/config";

interface Props {
  combos: KeyCombo[];
  isType: boolean;
  registerPositionUpdater: (update: (x: number, y: number) => void) => void;
}

const CANVAS_HALF_W = charlieConfig.canvasSize.w / 2;

// Badge sits above the dog's head. posY is the canvas top-left (CSS translate Y).
// At walk scale (0.75), the visual top edge is posY + canvasH*(1-0.75)/2 ≈ posY+35.
// 85px below posY lands roughly at ear level — a comfortable distance above the head.
const DOG_BADGE_OFFSET_Y = 85;

export function KeyOverlay({ combos, isType, registerPositionUpdater }: Props) {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerPositionUpdater((posX: number, posY: number) => {
      const el = divRef.current;
      if (!el) return;

      const dogCenterX = posX + CANVAS_HALF_W;
      const pad = 8;

      el.style.left = `${dogCenterX}px`;
      el.style.top = `${posY + DOG_BADGE_OFFSET_Y}px`;
      el.style.transform = "translateX(-50%)";

      // getBoundingClientRect forces a reflow → gives actual on-screen position,
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

  if (!isType || combos.length === 0) return null;

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
