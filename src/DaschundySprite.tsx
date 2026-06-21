import { useEffect, useRef } from "react";
import moveSheet from "./sprites/walk.json";
import grabSheet from "./sprites/grab.json";
import moveSprite from "./sprites/walk.png";
import grabSprite from "./sprites/grab.png";

const SCALE = 8;
const MOVE_SPEED = 2;
const GRAVITY = 0.5;
const MOVE_SCALE = 0.75;
const GRAB_SCALE = 0.65;

type Frame = { x: number; y: number; w: number; h: number; duration: number };
type SpriteSheet = { frames: { frame: { x: number; y: number; w: number; h: number }; duration: number }[] };

const parseFrames = (sheet: SpriteSheet): Frame[] =>
  sheet.frames.map((f) => ({ x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h, duration: f.duration }));

const MOVE_FRAMES = parseFrames(moveSheet);
const GRAB_FRAMES = parseFrames(grabSheet);

const MOVE_W = MOVE_FRAMES[0].w * SCALE;
const MOVE_H = MOVE_FRAMES[0].h * SCALE;
const GRAB_W = GRAB_FRAMES[0].w * SCALE;
const GRAB_H = GRAB_FRAMES[0].h * SCALE;

const CANVAS_W = Math.max(MOVE_W, GRAB_W);
const CANVAS_H = Math.max(MOVE_H, GRAB_H);
const CANVAS_CY = CANVAS_H / 2;

const MOVE_OFFSET = { x: Math.floor((CANVAS_W - MOVE_W) / 2), y: CANVAS_H - MOVE_H };
const GRAB_OFFSET = { x: Math.floor((CANVAS_W - GRAB_W) / 2), y: 0 };

const groundY = () => Math.round(window.innerHeight - CANVAS_CY * (1 + MOVE_SCALE));
const GRAB_SHIFT_Y = Math.round(
  MOVE_SCALE * (MOVE_OFFSET.y + MOVE_H / 2 - CANVAS_CY) -
    GRAB_SCALE * (GRAB_OFFSET.y + GRAB_H / 2 - CANVAS_CY)
);

type Mode = "move" | "grab" | "falling" | "idle";

interface Props {
  isTyping: boolean;
  onPositionChange: (x: number, y: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function DaschundySprite({ isTyping, onPositionChange, onDragStart, onDragEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isTypingRef = useRef(isTyping);

  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const moveImg = Object.assign(new Image(), { src: moveSprite });
    const grabImg = Object.assign(new Image(), { src: grabSprite });

    let mode: Mode = "move";
    let posX = 0;
    let posY = groundY();
    let moveDir = 1;
    let frameIdx = 0;
    let lastFrame = 0;
    let velY = 0;
    let rafId = 0;

    let isDragging = false;
    let grabX = 0;
    let grabY = 0;

    const setTransform = (scale: number) => {
      canvas.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    };

    const resetFrame = (t = performance.now()) => {
      frameIdx = 0;
      lastFrame = t;
    };

    const onMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
      isDragging = true;
      grabX = e.clientX - posX;
      grabY = e.clientY - (posY + GRAB_SHIFT_Y);
      posY += GRAB_SHIFT_Y;
      mode = "grab";
      resetFrame();
      setTransform(GRAB_SCALE);
      canvas.style.cursor = "grabbing";
      onDragStart?.();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      posX = e.clientX - grabX;
      posY = e.clientY - grabY;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      resetFrame();
      if (posY >= groundY()) {
        mode = "move";
        posY = groundY();
        setTransform(MOVE_SCALE);
      } else {
        mode = "falling";
        velY = 0;
        setTransform(GRAB_SCALE);
      }
      canvas.style.cursor = "grab";
      onDragEnd?.();
    };

    canvas.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    const render = (t: number) => {
      const typing = isTypingRef.current;

      if (mode === "move" && typing) {
        mode = "idle";
        frameIdx = 0;
      } else if (mode === "idle" && !typing) {
        mode = "move";
        resetFrame(t);
      }

      if (mode === "move") {
        posX += MOVE_SPEED * moveDir;
        const maxX = window.innerWidth - CANVAS_W;
        if (posX >= maxX) { posX = maxX; moveDir = -1; }
        if (posX <= 0) { posX = 0; moveDir = 1; }
        posY = groundY();
        setTransform(MOVE_SCALE);
      } else if (mode === "idle") {
        posY = groundY();
        setTransform(MOVE_SCALE);
      } else if (mode === "falling") {
        velY += GRAVITY;
        posY += velY;
        if (posY >= groundY()) {
          posY = groundY();
          mode = typing ? "idle" : "move";
          resetFrame(t);
          setTransform(MOVE_SCALE);
        } else {
          setTransform(GRAB_SCALE);
        }
      } else {
        setTransform(GRAB_SCALE);
      }

      onPositionChange(posX, posY);

      const isMove = mode === "move" || mode === "idle";
      const frames = isMove ? MOVE_FRAMES : GRAB_FRAMES;
      const img = isMove ? moveImg : grabImg;
      const offset = isMove ? MOVE_OFFSET : GRAB_OFFSET;

      // freeze on frame 0 when idle
      const currentIdx = mode === "idle" ? 0 : frameIdx % frames.length;
      const frame = frames[currentIdx];
      const sw = frame.w * SCALE;
      const sh = frame.h * SCALE;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      if (isMove && moveDir === -1) {
        ctx.save();
        ctx.translate(offset.x + sw, offset.y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, 0, 0, sw, sh);
        ctx.restore();
      } else {
        ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, offset.x, offset.y, sw, sh);
      }

      if (mode !== "idle" && t - lastFrame >= frame.duration) {
        frameIdx = (frameIdx + 1) % frames.length;
        lastFrame = t;
      }

      rafId = requestAnimationFrame(render);
    };

    Promise.all([
      new Promise<void>((res) => { moveImg.onload = () => res(); }),
      new Promise<void>((res) => { grabImg.onload = () => res(); }),
    ]).then(() => {
      rafId = requestAnimationFrame(render);
    });

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: "fixed", top: 0, left: 0, cursor: "grab", zIndex: 9999, pointerEvents: "auto" }}
    />
  );
}
