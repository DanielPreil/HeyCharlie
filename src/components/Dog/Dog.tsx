import { useEffect, useRef } from "react";
import { charlieConfig, parseFrames } from "../../characters/charlie/config";
import type { DogState } from "./dogStates";

// ─── Constants derived from character config ───────────────────────────────

const { pixelScale: PX, canvasSize, scales } = charlieConfig;

const WALK_FRAMES = parseFrames(charlieConfig.states.walk.json);
const GRAB_FRAMES = parseFrames(charlieConfig.states.grab.json);
const TYPING_FRAMES = parseFrames(charlieConfig.states.typing.json);

const WALK_W = WALK_FRAMES[0].w * PX;
const WALK_H = WALK_FRAMES[0].h * PX;
const GRAB_W = GRAB_FRAMES[0].w * PX;
const GRAB_H = GRAB_FRAMES[0].h * PX;
const TYPING_PX = 6;
const TYPING_W = TYPING_FRAMES[0].w * TYPING_PX;
const TYPING_H = TYPING_FRAMES[0].h * TYPING_PX;

const CW = canvasSize.w;
const CH = canvasSize.h;
const CCY = CH / 2;

const WALK_OFF = { x: Math.floor((CW - WALK_W) / 2), y: CH - WALK_H };
const GRAB_OFF = { x: Math.floor((CW - GRAB_W) / 2), y: 0 };
const TYPING_OFF = { x: Math.floor((CW - TYPING_W) / 2), y: CH - TYPING_H };

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
  keyPressCount: number;
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

export function Dog({ isTyping, keyPressCount, onPositionChange, onDragStart, onDragEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isTypingRef = useRef(isTyping);
  const keyPressCountRef = useRef(keyPressCount);

  useEffect(() => { isTypingRef.current = isTyping; }, [isTyping]);
  useEffect(() => { keyPressCountRef.current = keyPressCount; }, [keyPressCount]);

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

    // Walk/grab animation state
    let frameIdx = 0;
    let lastFrameAt = 0;

    // ── Typing animation state ──────────────────────────────────────────────
    // Frame layout: 0=neutral, 1=left-strike, 2=neutral, 3=right-strike
    // pairIdx 0 = left paw (frames 0→1), pairIdx 1 = right paw (frames 2→3)
    // phase -1 = rest/neutral  (frame = pairIdx*2)
    // phase  0 = strike        (frame = pairIdx*2 + 1)
    // Each keypress: immediately show strike, then recover to neutral
    let typingPairIdx = 0;
    let typingPhase = -1;
    let pendingSwings = 0;
    let typingFrameDuration = 200; // ms per strike, dynamically adjusted
    let lastTypingFrameAt = 0;
    let lastKeyAt = 0;
    let lastSeenKeyCount = 0;

    const typingDisplayFrame = () =>
      typingPairIdx * 2 + (typingPhase === 0 ? 1 : 0);

    const resetTyping = (t: number) => {
      typingPairIdx = 0;
      typingPhase = 0; // start with immediate strike
      pendingSwings = 0;
      typingFrameDuration = 200;
      lastTypingFrameAt = t;
      lastKeyAt = t;
      lastSeenKeyCount = keyPressCountRef.current;
    };
    // ───────────────────────────────────────────────────────────────────────

    const setTransform = (scale: number) => {
      canvas.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    };

    let walkImg: HTMLImageElement | null = null;
    let grabImg: HTMLImageElement | null = null;
    let typingImg: HTMLImageElement | null = null;

    const draw = () => {
      ctx.clearRect(0, 0, CW, CH);

      if (state === "typing") {
        if (!typingImg) return;
        const frame = TYPING_FRAMES[typingDisplayFrame() % TYPING_FRAMES.length];
        ctx.drawImage(typingImg, frame.x, frame.y, frame.w, frame.h, TYPING_OFF.x, TYPING_OFF.y, TYPING_W, TYPING_H);
        return;
      }

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
      if ((state === "walk" || state === "idle") && typing) {
        state = "typing";
        resetTyping(t);
      } else if (state === "typing" && !typing) {
        state = "walk";
        frameIdx = 0;
        lastFrameAt = t;
      }

      // Physics + transform
      if (state === "walk") {
        posX += MOVE_SPEED * dir;
        const maxX = window.innerWidth - CW;
        if (posX >= maxX) { posX = maxX; dir = -1; }
        if (posX <= 0) { posX = 0; dir = 1; }
        posY = groundY();
        setTransform(scales.walk);
      } else if (state === "typing") {
        // Detect new keypresses → update speed, trigger or queue a swing
        const count = keyPressCountRef.current;
        if (count !== lastSeenKeyCount) {
          if (lastKeyAt > 0) {
            typingFrameDuration = Math.max(40, Math.min(200, (t - lastKeyAt) / 2));
          }
          lastKeyAt = t;
          lastSeenKeyCount = count;
          if (typingPhase === -1) {
            typingPhase = 0; // start strike immediately
            lastTypingFrameAt = t;
          } else {
            pendingSwings = Math.min(pendingSwings + 1, 4);
          }
        }

        // After strike duration: recover to neutral, start next swing if queued
        if (typingPhase === 0 && t - lastTypingFrameAt >= typingFrameDuration) {
          typingPairIdx = (typingPairIdx + 1) % 2;
          if (pendingSwings > 0) {
            pendingSwings--;
            lastTypingFrameAt = t; // stay in phase 0, start next strike
          } else {
            typingPhase = -1; // rest at neutral
          }
        }

        posY = groundY();
        setTransform(scales.typing);
      } else if (state === "idle") {
        posY = groundY();
        setTransform(scales.idle);
      } else if (state === "falling") {
        velY += GRAVITY;
        posY += velY;
        if (posY >= groundY()) {
          posY = groundY();
          if (typing) {
            state = "typing";
            resetTyping(t);
          } else {
            state = "walk";
            frameIdx = 0;
            lastFrameAt = t;
          }
          setTransform(scales.walk);
        } else {
          setTransform(scales.falling);
        }
      } else {
        // grab
        setTransform(scales.grab);
      }

      onPositionChange(posX, posY);

      // Time-based frame advancement (walk/grab only — typing is keypress-driven)
      if (state === "walk" || state === "grab" || state === "falling") {
        const isWalkMode = state === "walk";
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

    // destroyed guards against React StrictMode's double-invoke: the cleanup
    // runs before images finish loading, so without this flag the old Promise
    // would start a second "ghost" RAF loop (posX=0) that overwrites dogBounds
    // every frame — making the click-through hitbox always wrong.
    let destroyed = false;

    Promise.all([
      loadImage(charlieConfig.states.walk.png),
      loadImage(charlieConfig.states.grab.png),
      loadImage(charlieConfig.states.typing.png),
    ]).then(([w, g, ty]) => {
      if (destroyed) return;
      walkImg = w;
      grabImg = g;
      typingImg = ty;
      rafId = requestAnimationFrame(tick);
    }).catch((err) => console.error("[Dog] image load failed:", err));

    return () => {
      destroyed = true;
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
