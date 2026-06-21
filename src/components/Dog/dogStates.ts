export type DogState = "walk" | "idle" | "grab" | "falling";

/**
 * State machine transitions:
 *
 *  walk ──[typing]──► idle
 *  idle ──[!typing]─► walk
 *  walk/idle ──[mousedown]──► grab
 *  grab ──[mouseup, on ground]──► walk
 *  grab ──[mouseup, in air]────► falling
 *  falling ──[landed, !typing]─► walk
 *  falling ──[landed, typing]──► idle
 */
export const TRANSITIONS: Record<string, { to: DogState; when: string }> = {
  "walk→idle": { to: "idle", when: "isTyping becomes true" },
  "idle→walk": { to: "walk", when: "isTyping becomes false" },
  "walk→grab": { to: "grab", when: "mousedown on canvas" },
  "idle→grab": { to: "grab", when: "mousedown on canvas" },
  "grab→walk": { to: "walk", when: "mouseup AND posY >= groundY" },
  "grab→falling": { to: "falling", when: "mouseup AND posY < groundY" },
  "falling→walk": { to: "walk", when: "landed AND !isTyping" },
  "falling→idle": { to: "idle", when: "landed AND isTyping" },
};
