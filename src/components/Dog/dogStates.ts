export type DogState = "walk" | "idle" | "typing" | "grab" | "falling";

/**
 * State machine transitions:
 *
 *  walk ──[typing]──► typing
 *  typing ──[!typing]─► walk
 *  walk/typing ──[mousedown]──► grab
 *  grab ──[mouseup, on ground]──► walk
 *  grab ──[mouseup, in air]────► falling
 *  falling ──[landed, !typing]─► walk
 *  falling ──[landed, typing]──► typing
 */
export const TRANSITIONS: Record<string, { to: DogState; when: string }> = {
  "walk→typing": { to: "typing", when: "isTyping becomes true" },
  "typing→walk": { to: "walk", when: "isTyping becomes false" },
  "walk→grab": { to: "grab", when: "mousedown on canvas" },
  "typing→grab": { to: "grab", when: "mousedown on canvas" },
  "grab→walk": { to: "walk", when: "mouseup AND posY >= groundY" },
  "grab→falling": { to: "falling", when: "mouseup AND posY < groundY" },
  "falling→walk": { to: "walk", when: "landed AND !isTyping" },
  "falling→typing": { to: "typing", when: "landed AND isTyping" },
};
