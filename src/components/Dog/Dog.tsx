import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { charlieConfig, parseFrames } from "../../characters/charlie/config";
import type { DogState } from "../../characters/charlie/config";

// ─── Constants derived from character config ───────────────────────────────

const { pixelScale: PX, canvasSize, scales } = charlieConfig;

const WALK_FRAMES = parseFrames(charlieConfig.states.walk.json);
const GRAB_FRAMES = parseFrames(charlieConfig.states.grab.json);
const TYPE_FRAMES = parseFrames(charlieConfig.states.type.json);

const WALK_W = WALK_FRAMES[0].w * PX;
const WALK_H = WALK_FRAMES[0].h * PX;
const GRAB_W = GRAB_FRAMES[0].w * PX;
const GRAB_H = GRAB_FRAMES[0].h * PX;
const TYPE_PX = charlieConfig.states.type.pixelScale ?? PX;
const TYPE_W = TYPE_FRAMES[0].w * TYPE_PX;
const TYPE_H = TYPE_FRAMES[0].h * TYPE_PX;

const CW = canvasSize.w;
const CH = canvasSize.h;
const CCY = CH / 2;

const WALK_OFF = { x: Math.floor((CW - WALK_W) / 2), y: CH - WALK_H };
const GRAB_OFF = { x: Math.floor((CW - GRAB_W) / 2), y: 0 };
const TYPE_OFF = { x: Math.floor((CW - TYPE_W) / 2), y: CH - TYPE_H };

const GRAB_SHIFT_Y = Math.round(
  scales.walk * (WALK_OFF.y + WALK_H / 2 - CCY) -
    scales.grab * (GRAB_OFF.y + GRAB_H / 2 - CCY)
);

const MOVE_SPEED = 2;
const GRAVITY = 0.5;
const screenGroundY = () => Math.round(window.innerHeight - CCY * (1 + scales.walk));

// ─── Props ─────────────────────────────────────────────────────────────────

interface Props {
  isType: boolean;
  keyPressCount: number;
  onPositionChange: (x: number, y: number, scale: number) => void;
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

export function Dog({ isType, keyPressCount, onPositionChange, onDragStart, onDragEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isTypeRef = useRef(isType);
  const keyPressCountRef = useRef(keyPressCount);

  useEffect(() => { isTypeRef.current = isType; }, [isType]);
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

    // Constrained window: when dog is dropped into another app's window.
    // pid identifies the owning app — used to detect when a different app's window
    // moves in front (Cmd+Tab), so we can release rather than switching constraint.
    let constrainedBounds: { x: number; y: number; w: number; h: number; pid: number } | null = null;

    // Physics bounds — switch to window bounds when constrained
    const getGroundY = () => constrainedBounds
      ? Math.round(constrainedBounds.y + constrainedBounds.h - CCY * (1 + scales.walk))
      : screenGroundY();
    const getMinX = () => constrainedBounds?.x ?? 0;
    const getMaxX = () => constrainedBounds
      ? constrainedBounds.x + constrainedBounds.w - CW
      : window.innerWidth - CW;

    // Physics state
    let state: DogState = "walk";
    let posX = 0;
    let posY = getGroundY();
    let dir: 1 | -1 = 1;
    let velY = 0;
    let isDragging = false;
    let grabOffX = 0;
    let grabOffY = 0;
    let rafId = 0;

    // Walk/grab animation state
    let frameIdx = 0;
    let lastFrameAt = 0;

    // Constrained-bounds tracking: re-probe target window position every ~1s
    let constraintRefreshTick = 0;
    let constraintRefreshPending = false;
    // Incremented by onMouseUp to invalidate any in-flight refresh probe.
    let constraintGen = 0;
    // True if the mouse moved during the current drag — prevents accidental
    // clicks (e.g. clicking to switch back to the app) from re-establishing
    // a window constraint without an intentional drag.
    let dragMoved = false;

    // ── Type animation state ────────────────────────────────────────────────
    // Frame layout: 0=neutral, 1=left-strike, 2=neutral, 3=right-strike
    // pairIdx 0 = left paw (frames 0→1), pairIdx 1 = right paw (frames 2→3)
    // phase -1 = rest/neutral  (frame = pairIdx*2)
    // phase  0 = strike        (frame = pairIdx*2 + 1)
    // Each keypress: immediately show strike, then recover to neutral
    let typePairIdx = 0;
    let typePhase = -1;
    let pendingSwings = 0;
    let typeFrameDuration = 200; // ms per strike, dynamically adjusted
    let lastTypeFrameAt = 0;
    let lastKeyAt = 0;
    let lastSeenKeyCount = 0;

    const typeDisplayFrame = () =>
      typePairIdx * 2 + (typePhase === 0 ? 1 : 0);

    const resetType = (t: number) => {
      typePairIdx = 0;
      typePhase = 0; // start with immediate strike
      pendingSwings = 0;
      typeFrameDuration = 200;
      lastTypeFrameAt = t;
      lastKeyAt = t;
      lastSeenKeyCount = keyPressCountRef.current;
    };
    // ───────────────────────────────────────────────────────────────────────

    const setTransform = (scale: number) => {
      canvas.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    };

    let walkImg: HTMLImageElement | null = null;
    let grabImg: HTMLImageElement | null = null;
    let typeImg: HTMLImageElement | null = null;

    const draw = () => {
      ctx.clearRect(0, 0, CW, CH);

      if (state === "type") {
        if (!typeImg) return;
        const frame = TYPE_FRAMES[typeDisplayFrame() % TYPE_FRAMES.length];
        ctx.drawImage(typeImg, frame.x, frame.y, frame.w, frame.h, TYPE_OFF.x, TYPE_OFF.y, TYPE_W, TYPE_H);
        return;
      }

      const isWalkMode = state === "walk";
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
      const isType = isTypeRef.current;

      // State transitions
      if (state === "walk" && isType) {
        state = "type";
        resetType(t);
      } else if (state === "type" && !isType) {
        state = "walk";
        frameIdx = 0;
        lastFrameAt = t;
      }

      // Physics + transform
      if (state === "walk") {
        posX += MOVE_SPEED * dir;
        const maxX = getMaxX();
        const minX = getMinX();
        if (posX >= maxX) { posX = maxX; dir = -1; }
        if (posX <= minX) { posX = minX; dir = 1; }
        posY = getGroundY();
        setTransform(scales.walk);
      } else if (state === "type") {
        // Detect new keypresses → update speed, trigger or queue a swing
        const count = keyPressCountRef.current;
        if (count !== lastSeenKeyCount) {
          if (lastKeyAt > 0) {
            typeFrameDuration = Math.max(40, Math.min(200, (t - lastKeyAt) / 2));
          }
          lastKeyAt = t;
          lastSeenKeyCount = count;
          if (typePhase === -1) {
            typePhase = 0; // start strike immediately
            lastTypeFrameAt = t;
          } else {
            pendingSwings = Math.min(pendingSwings + 1, 4);
          }
        }

        // After strike duration: recover to neutral, start next swing if queued
        if (typePhase === 0 && t - lastTypeFrameAt >= typeFrameDuration) {
          typePairIdx = (typePairIdx + 1) % 2;
          if (pendingSwings > 0) {
            pendingSwings--;
            lastTypeFrameAt = t; // stay in phase 0, start next strike
          } else {
            typePhase = -1; // rest at neutral
          }
        }

        posY = getGroundY();
        setTransform(scales.type);
      } else if (state === "fall") {
        velY += GRAVITY;
        posY += velY;
        if (posY >= getGroundY()) {
          posY = getGroundY();
          if (isType) {
            state = "type";
            resetType(t);
          } else {
            state = "walk";
            frameIdx = 0;
            lastFrameAt = t;
          }
          setTransform(scales.walk);
        } else {
          setTransform(scales.fall);
        }
      } else {
        // grab
        setTransform(scales.grab);
      }

      // Re-probe the constrained window center every ~60 frames (~1 s) so the
      // physics bounds stay in sync when the user moves the target window.
      if (constrainedBounds && !isDragging && !constraintRefreshPending) {
        if (++constraintRefreshTick >= 60) {
          constraintRefreshTick = 0;
          constraintRefreshPending = true;
          const px = constrainedBounds.x + constrainedBounds.w / 2;
          const py = constrainedBounds.y + constrainedBounds.h / 2;
          const gen = constraintGen;
          invoke<[number, number, number, number, number] | null>("get_window_at_position", { x: px, y: py })
            .then((r) => {
              constraintRefreshPending = false;
              if (gen !== constraintGen) return;
              if (r) {
                const [bx, by, bw, bh, pid] = r;
                // PID mismatch: a different app's window is now topmost at the probe point.
                // This means the constrained window went behind (e.g. user Cmd+Tabbed away).
                // Release rather than silently switching constraint to the new window.
                if (constrainedBounds && pid !== constrainedBounds.pid) {
                  constrainedBounds = null;
                } else {
                  constrainedBounds = { x: bx, y: by, w: bw, h: bh, pid };
                }
              } else {
                constrainedBounds = null;
              }
              if (state === "walk" || state === "type") {
                const gnd = getGroundY();
                if (posY < gnd - 1) {
                  state = "fall"; velY = 0;
                } else if (posY > gnd + 1) {
                  // Dog is below the window's ground — window moved up or constraint race.
                  // Release rather than teleporting up.
                  constrainedBounds = null;
                  if (posY < screenGroundY() - 1) { state = "fall"; velY = 0; }
                }
              }
            })
            .catch(() => { constraintRefreshPending = false; });
        }
      }

      onPositionChange(posX, posY, scales[state]);

      // Time-based frame advancement (walk/grab only — type is keypress-driven)
      if (state === "walk" || state === "grab" || state === "fall") {
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
      dragMoved = false;
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
      dragMoved = true;
      posX = e.clientX - grabOffX;
      posY = e.clientY - grabOffY;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      frameIdx = 0;

      // Walk-equivalent Y: undo the GRAB_SHIFT_Y added in onMouseDown.
      // Raw posY during grab is offset from walk posY, so comparing it directly
      // to getGroundY() (a walk-mode value) produces wrong walk/fall decisions
      // and causes the dog to snap back when dragged horizontally to the edge.
      const walkY = posY - GRAB_SHIFT_Y;

      // Release constraint if dog's walk-equivalent position is outside the window.
      // Check X using walk canvas bounds (same bounds the walk tick would clamp to).
      // Check Y with a tolerance — 60px below floor = dog dragged below the window.
      if (constrainedBounds) {
        const minX = getMinX();
        const maxX = getMaxX();
        const groundY = getGroundY();
        const outsideX = posX < minX || posX > maxX;
        const outsideY = walkY < constrainedBounds.y || walkY > groundY + 60;
        if (outsideX || outsideY) {
          constrainedBounds = null;
        }
      }

      // Probe at visual center of dog (corrected Y: CH/2, not CH * scales.grab)
      const probeX = posX + CW / 2;
      const probeY = posY + CH / 2;

      // Walk/fall decision using walkY (not raw posY) against the current ground
      const gnd = getGroundY();
      if (walkY >= gnd) {
        state = "walk";
        posY = gnd;
      } else {
        state = "fall";
        velY = 0;
      }
      canvas.style.cursor = "grab";
      onDragEnd();

      // Only probe for a new window constraint if the dog was actually dragged.
      // A bare click (no movement) — e.g. clicking to bring a window back to front —
      // must not re-establish a constraint the dog already fell out of.
      if (dragMoved) {
        constraintGen++;
        const gen = constraintGen;
        invoke<[number, number, number, number, number] | null>("get_window_at_position", {
          x: probeX,
          y: probeY,
        }).then((result) => {
          if (gen !== constraintGen) return;
          if (result) {
            const [bx, by, bw, bh, pid] = result;
            const minW = CW * scales.walk * 1.5;
            const minH = CH * scales.walk * 1.5;
            constrainedBounds = bw >= minW && bh >= minH ? { x: bx, y: by, w: bw, h: bh, pid } : null;
          } else {
            constrainedBounds = null;
          }
          if (state === "walk" || state === "type") {
            if (posY < getGroundY() - 1) {
              state = "fall";
              velY = 0;
            }
          }
        }).catch(() => { constrainedBounds = null; });
      }
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
      loadImage(charlieConfig.states.type.png),
    ]).then(([w, g, ty]) => {
      if (destroyed) return;
      walkImg = w;
      grabImg = g;
      typeImg = ty;
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
