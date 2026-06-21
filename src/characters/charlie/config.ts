import walkPng from "../../sprites/walk.png";
import walkJson from "../../sprites/walk.json";
import grabPng from "../../sprites/grab.png";
import grabJson from "../../sprites/grab.json";
import typingPng from "../../sprites/typing.png";
import typingJson from "../../sprites/typing.json";

export interface FrameData {
  x: number;
  y: number;
  w: number;
  h: number;
  duration: number;
}

export interface SpriteSheetJson {
  frames: { frame: { x: number; y: number; w: number; h: number }; duration: number }[];
}

export interface StateSprite {
  png: string;
  json: SpriteSheetJson;
  /** freeze on frame 0 instead of animating */
  frozen?: boolean;
}

export interface CharacterConfig {
  id: string;
  name: string;
  /** pixel scale multiplier applied to raw sprite pixels */
  pixelScale: number;
  /** CSS scale applied to the canvas element */
  scales: Record<DogState, number>;
  canvasSize: { w: number; h: number };
  states: Record<DogState, StateSprite>;
}

export type DogState = "walk" | "idle" | "typing" | "grab" | "falling";

export const charlieConfig: CharacterConfig = {
  id: "charlie",
  name: "Charlie",
  pixelScale: 8,
  scales: {
    walk: 0.75,
    idle: 0.75,
    typing: 0.75,
    grab: 0.55,
    falling: 0.55,
  },
  canvasSize: { w: 216, h: 280 },
  states: {
    walk: { png: walkPng, json: walkJson },
    idle: { png: walkPng, json: walkJson, frozen: true },
    typing: { png: typingPng, json: typingJson },
    grab: { png: grabPng, json: grabJson },
    falling: { png: grabPng, json: grabJson },
  },
};

export function parseFrames(json: SpriteSheetJson): FrameData[] {
  return json.frames.map((f) => ({
    x: f.frame.x,
    y: f.frame.y,
    w: f.frame.w,
    h: f.frame.h,
    duration: f.duration,
  }));
}
