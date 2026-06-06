import { useEffect, useRef } from "react";
import moveSheet from "./sprites/walk.json";
import grabSheet from "./sprites/grab.json";
import moveSprite from "./sprites/walk.png";
import grabSprite from "./sprites/grab.png";

// ─── Config ───────────────────────────────────────────────────────────────────

const SCALE = 8;
const MOVE_SPEED = 2;
const GRAVITY = 0.5;
const MOVE_SCALE = 0.75;
const GRAB_SCALE = 0.65;

// ─── Frame data ───────────────────────────────────────────────────────────────

type Frame = { x: number; y: number; w: number; h: number; duration: number };

type SpriteSheet = { frames: { frame: { x: number; y: number; w: number; h: number }; duration: number }[] };

const parseFrames = (sheet: SpriteSheet): Frame[] =>
  sheet.frames.map((f) => ({
    x: f.frame.x,
    y: f.frame.y,
    w: f.frame.w,
    h: f.frame.h,
    duration: f.duration,
  }));

const MOVE_FRAMES = parseFrames(moveSheet);
const GRAB_FRAMES = parseFrames(grabSheet);

// ─── Canvas geometry ──────────────────────────────────────────────────────────

const MOVE_W = MOVE_FRAMES[0].w * SCALE; // 216px
const MOVE_H = MOVE_FRAMES[0].h * SCALE; // 144px
const GRAB_W = GRAB_FRAMES[0].w * SCALE; // 160px
const GRAB_H = GRAB_FRAMES[0].h * SCALE; // 280px

const CANVAS_W = Math.max(MOVE_W, GRAB_W); // 216px
const CANVAS_H = Math.max(MOVE_H, GRAB_H); // 280px
const CANVAS_CY = CANVAS_H / 2; // 140px

const MOVE_OFFSET = { x: Math.floor((CANVAS_W - MOVE_W) / 2), y: CANVAS_H - MOVE_H }; // {0, 136}
const GRAB_OFFSET = { x: Math.floor((CANVAS_W - GRAB_W) / 2), y: 0 }; // {28, 0}

// Visual bottom of walk sprite after CSS scale(MOVE_SCALE) around canvas center
const groundY = () => Math.round(window.innerHeight - CANVAS_CY * (1 + MOVE_SCALE));

// posY shift walk→grab so sprites appear at same viewport position
const GRAB_SHIFT_Y = Math.round(MOVE_SCALE * (MOVE_OFFSET.y + MOVE_H / 2 - CANVAS_CY) - GRAB_SCALE * (GRAB_OFFSET.y + GRAB_H / 2 - CANVAS_CY)); // ≈ 51px

// ─── Component ────────────────────────────────────────────────────────────────

type Mode = "move" | "grab" | "falling";

export function DaschundySprite() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    // ─── State ──────────────────────────────────────────────────────────────

    let mode: Mode = "move";
    let posX = 0;
    let posY = groundY();
    let moveDir = 1; // 1 = right, -1 = left
    let frameIdx = 0;
    let lastFrame = 0;
    let velY = 0;
    let rafId = 0;

    let isDragging = false;
    let grabX = 0;
    let grabY = 0;

    // ─── Helpers ────────────────────────────────────────────────────────────

    const setTransform = (scale: number) => {
      canvas.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    };

    const resetFrame = (t = performance.now()) => {
      frameIdx = 0;
      lastFrame = t;
    };

    // ─── Input ──────────────────────────────────────────────────────────────

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
    };

    canvas.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    // ─── Render loop ─────────────────────────────────────────────────────────

    const render = (t: number) => {
      if (mode === "move") {
        posX += MOVE_SPEED * moveDir;
        const maxX = window.innerWidth - CANVAS_W;
        if (posX >= maxX) {
          posX = maxX;
          moveDir = -1;
        }
        if (posX <= 0) {
          posX = 0;
          moveDir = 1;
        }
        posY = groundY();
        setTransform(MOVE_SCALE);
      } else if (mode === "falling") {
        velY += GRAVITY;
        posY += velY;
        if (posY >= groundY()) {
          posY = groundY();
          mode = "move";
          resetFrame(t);
          setTransform(MOVE_SCALE);
        } else {
          setTransform(GRAB_SCALE);
        }
      } else {
        setTransform(GRAB_SCALE);
      }

      const isMove = mode === "move";
      const frames = isMove ? MOVE_FRAMES : GRAB_FRAMES;
      const img = isMove ? moveImg : grabImg;
      const offset = isMove ? MOVE_OFFSET : GRAB_OFFSET;
      const frame = frames[frameIdx % frames.length];
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

      if (t - lastFrame >= frame.duration) {
        frameIdx = (frameIdx + 1) % frames.length;
        lastFrame = t;
      }

      rafId = requestAnimationFrame(render);
    };

    Promise.all([
      new Promise<void>((res) => {
        moveImg.onload = () => res();
      }),
      new Promise<void>((res) => {
        grabImg.onload = () => res();
      }),
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

  return <canvas ref={canvasRef} onMouseDown={(e) => e.stopPropagation()} style={{ position: "fixed", top: 0, left: 0, cursor: "grab", zIndex: 9999 }} />;
}
