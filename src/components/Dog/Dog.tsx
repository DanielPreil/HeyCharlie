import { useEffect, useRef } from "react";
import { charlieConfig, parseFrames } from "../../characters/charlie/config";
import type { DogState } from "./dogStates";

// ─── Constants derived from character config ───────────────────────────────

const { pixelScale: PX, canvasSize, scales } = charlieConfig;

const WALK_FRAMES = parseFrames(charlieConfig.states.walk.json);
const GRAB_FRAMES = parseFrames(charlieConfig.states.grab.json);

const WALK_W = WALK_FRAMES[0].w * PX;
const WALK_H = WALK_FRAMES[0].h * PX;
const GRAB_W = GRAB_FRAMES[0].w * PX;
const GRAB_H = GRAB_FRAMES[0].h * PX;

const CW = canvasSize.w;
const CH = canvasSize.h;
const CCY = CH / 2;

const WALK_OFF = { x: Math.floor((CW - WALK_W) / 2), y: CH - WALK_H };
const GRAB_OFF = { x: Math.floor((CW - GRAB_W) / 2), y: 0 };

// Y shift so the dog's center stays at the same screen position when
// switching between walk (scale=0.75, tall canvas) and grab (scale=0.65)
const GRAB_SHIFT_Y = Math.round(
  scales.walk * (WALK_OFF.y + WALK_H / 2 - CCY) -
    scales.grab * (GRAB_OFF.y + GRAB_H / 2 - CCY)
);

const MOVE_SPEED = 2;
const GRAVITY = 0.5;
const groundY = () => Math.round(window.innerHeight - CCY * (1 + scales.walk));

// ─── Props ─────────────────────────────────────────────────────────────────

interface Props {
  isTyping: boolean;
  onPositionChange: (x: number, y: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

// ─── Canvas 2D renderer ────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ─── Component ─────────────────────────────────────────────────────────────

export function Dog({ isTyping, onPositionChange, onDragStart, onDragEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isTypingRef = useRef(isTyping);

  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;
    canvas.style.width = `${CW}px`;
    canvas.style.height = `${CH}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.scale(dpr, dpr);

    // Physics state
    let state: DogState = "walk";
    let posX = 0;
    let posY = groundY();
    let dir: 1 | -1 = 1;
    let velY = 0;
    let isDragging = false;
    let grabOffX = 0;
    let grabOffY = 0;
    let rafId = 0;

    // Animation state
    let frameIdx = 0;
    let lastFrameAt = 0;

    const setTransform = (scale: number) => {
      canvas.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    };

    let walkImg: HTMLImageElement | null = null;
    let grabImg: HTMLImageElement | null = null;

    const draw = () => {
      ctx.clearRect(0, 0, CW, CH);

      const isWalkMode = state === "walk" || state === "idle";
      const img = isWalkMode ? walkImg : grabImg;
      if (!img) return;

      const frames = isWalkMode ? WALK_FRAMES : GRAB_FRAMES;
      const frame = frames[frameIdx % frames.length];
      const off = isWalkMode ? WALK_OFF : GRAB_OFF;
      const w = isWalkMode ? WALK_W : GRAB_W;
      const h = isWalkMode ? WALK_H : GRAB_H;

      if (dir === -1 && isWalkMode) {
        ctx.save();
        ctx.translate(off.x + w, off.y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, off.x, off.y, w, h);
      }
    };

    const tick = (t: number) => {
      const typing = isTypingRef.current;

      // State transitions
      if (state === "walk" && typing) { state = "idle"; frameIdx = 0; }
      else if (state === "idle" && !typing) { state = "walk"; frameIdx = 0; lastFrameAt = t; }

      // Physics
      if (state === "walk") {
        posX += MOVE_SPEED * dir;
        const maxX = window.innerWidth - CW;
        if (posX >= maxX) { posX = maxX; dir = -1; }
        if (posX <= 0) { posX = 0; dir = 1; }
        posY = groundY();
        setTransform(scales.walk);
      } else if (state === "idle") {
        posY = groundY();
        setTransform(scales.idle);
      } else if (state === "falling") {
        velY += GRAVITY;
        posY += velY;
        if (posY >= groundY()) {
          posY = groundY();
          state = typing ? "idle" : "walk";
          frameIdx = 0;
          lastFrameAt = t;
          setTransform(scales.walk);
        } else {
          setTransform(scales.falling);
        }
      } else {
        // grab
        setTransform(scales.grab);
      }

      onPositionChange(posX, posY);

      // Frame advancement (skip when idle/frozen)
      const frozen = state === "idle";
      if (!frozen) {
        const isWalkMode = state === "walk" || state === "idle";
        const frames = isWalkMode ? WALK_FRAMES : GRAB_FRAMES;
        const duration = frames[frameIdx % frames.length].duration;
        if (t - lastFrameAt >= duration) {
          frameIdx = (frameIdx + 1) % frames.length;
          lastFrameAt = t;
        }
      }

      draw();
      rafId = requestAnimationFrame(tick);
    };

    // ─── Mouse handlers ────────────────────────────────────────────────────

    const onMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
      isDragging = true;
      grabOffX = e.clientX - posX;
      grabOffY = e.clientY - (posY + GRAB_SHIFT_Y);
      posY += GRAB_SHIFT_Y;
      state = "grab";
      frameIdx = 0;
      canvas.style.cursor = "grabbing";
      onDragStart();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      posX = e.clientX - grabOffX;
      posY = e.clientY - grabOffY;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      frameIdx = 0;
      if (posY >= groundY()) {
        state = "walk";
        posY = groundY();
      } else {
        state = "falling";
        velY = 0;
      }
      canvas.style.cursor = "grab";
      onDragEnd();
    };

    canvas.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    // Load images then start the loop
    Promise.all([
      loadImage(charlieConfig.states.walk.png),
      loadImage(charlieConfig.states.grab.png),
    ]).then(([w, g]) => {
      walkImg = w;
      grabImg = g;
      rafId = requestAnimationFrame(tick);
    }).catch((err) => console.error("[Dog] image load failed:", err));

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
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        cursor: "grab",
        imageRendering: "pixelated",
        pointerEvents: "auto",
        zIndex: 9999,
      }}
    />
  );
}
