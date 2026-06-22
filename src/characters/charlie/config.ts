import walkPng from "../../sprites/walk.png";
import walkJson from "../../sprites/walk.json";
import grabPng from "../../sprites/grab.png";
import grabJson from "../../sprites/grab.json";
import typePng from "../../sprites/type.png";
import typeJson from "../../sprites/type.json";

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
  pixelScale?: number;
}

export interface CharacterConfig {
  /** pixel scale multiplier applied to raw sprite pixels */
  pixelScale: number;
  /** CSS scale applied to the canvas element */
  scales: Record<DogState, number>;
  canvasSize: { w: number; h: number };
  states: Record<"walk" | "type" | "grab", StateSprite>;
}

export type DogState = "walk" | "type" | "grab" | "fall";

export const charlieConfig: CharacterConfig = {
  pixelScale: 8,
  scales: {
    walk: 0.75,
    type: 0.75,
    grab: 0.55,
    fall: 0.55,
  },
  canvasSize: { w: 216, h: 280 },
  states: {
    walk: { png: walkPng, json: walkJson },
    type: { png: typePng, json: typeJson, pixelScale: 6 },
    grab: { png: grabPng, json: grabJson },
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
