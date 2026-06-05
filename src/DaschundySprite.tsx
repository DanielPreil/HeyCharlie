import { useEffect, useRef } from "react";

const FRAMES = [
  { x: 0, y: 0, w: 30, h: 19, duration: 150 },
  { x: 30, y: 0, w: 30, h: 19, duration: 100 },
];
const SCALE = 8;
const W = FRAMES[0].w;
const H = FRAMES[0].h;

export function DaschundySprite() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = W * SCALE * dpr;
    canvas.height = H * SCALE * dpr;
    canvas.style.width = `${W * SCALE}px`;
    canvas.style.height = `${H * SCALE}px`;
    ctx.imageSmoothingEnabled = false;
    ctx.scale(dpr, dpr);

    const img = new Image();
    img.src = "/Daschundy.png";

    let frameIdx = 0;
    let lastTime = 0;
    let rafId: number;

    const render = (time: number) => {
      const frame = FRAMES[frameIdx];
      if (time - lastTime >= frame.duration) {
        ctx.clearRect(0, 0, W * SCALE, H * SCALE);
        ctx.drawImage(img, frame.x, frame.y, W, H, 0, 0, W * SCALE, H * SCALE);
        frameIdx = (frameIdx + 1) % FRAMES.length;
        lastTime = time;
      }
      rafId = requestAnimationFrame(render);
    };

    img.onload = () => { rafId = requestAnimationFrame(render); };

    return () => cancelAnimationFrame(rafId);
  }, []);

  return <canvas ref={canvasRef} />;
}
