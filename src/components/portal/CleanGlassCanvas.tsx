"use client";
import { useEffect, useRef } from "react";

const NAVY = "#0A1128";
const DEEP = "#0B2742";

type Bubble = { x: number; y: number; r: number; vy: number; sway: number; phase: number; tint: number; pop: number };
type Glint = { x: number; y: number; size: number; born: number; life: number; warm: boolean };
type Ring = { x: number; y: number; r: number; born: number };

/**
 * Home Care motion, drawn in code. The scene starts behind steamed-up glass; a squeegee stroke clears it on load,
 * then the cursor (or a finger) wipes it clear and leaves sparkle glints while the fog slowly returns.
 * Soap bubbles drift up and pop when touched, and a strip of foam sits along the bottom edge.
 */
export default function CleanGlassCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Fog lives on its own layer. Wiping erases it; every frame a little fog settles back.
    const fog = document.createElement("canvas");
    const fctx = fog.getContext("2d")!;
    // A soft round "cloth" stamp used to erase the fog.
    const stamp = document.createElement("canvas");
    stamp.width = stamp.height = 128;
    {
      const g = stamp.getContext("2d")!;
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.55, "rgba(0,0,0,0.85)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    }
    const sparkle = (rgb: string) => {
      const s = document.createElement("canvas");
      s.width = s.height = 64;
      const g = s.getContext("2d")!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${rgb},1)`);
      grad.addColorStop(0.2, `rgba(${rgb},0.45)`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return s;
    };
    const glowAqua = sparkle("94,234,212");
    const glowLemon = sparkle("255,230,109");

    let w = 0, h = 0, dpr = 1, raf = 0;
    let bubbles: Bubble[] = [];
    const glints: Glint[] = [];
    const rings: Ring[] = [];
    const foam: { x: number; y: number; r: number; phase: number }[] = [];
    const pointer = { x: -9999, y: -9999, lastX: -9999, lastY: -9999, down: false, lastMove: -1e9 };
    // The squeegee: a stroke across the screen on load, and again now and then when nobody is touching it.
    let sweep: { start: number; dur: number; flip: boolean } | null = null;
    let sweepPrev: { x: number; y: number } | null = null;
    let nextSweep = 0;

    const brush = () => (w < 600 ? 62 : 84);

    function wipe(x: number, y: number, size = brush()) {
      fctx.globalCompositeOperation = "destination-out";
      fctx.drawImage(stamp, x - size, y - size, size * 2, size * 2);
      fctx.globalCompositeOperation = "source-over";
    }
    function wipeLine(x0: number, y0: number, x1: number, y1: number, t: number, size = brush(), glintRate = 0.35) {
      const dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / (size * 0.3)));
      for (let i = 1; i <= steps; i++) {
        const x = x0 + (dx * i) / steps, y = y0 + (dy * i) / steps;
        wipe(x, y, size);
        if (Math.random() < glintRate && glints.length < 90) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * size * 0.9;
          glints.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, size: 9 + Math.random() * 15, born: t, life: 600 + Math.random() * 700, warm: Math.random() < 0.4 });
        }
      }
    }

    function drawFogTexture() {
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.clearRect(0, 0, fog.width, fog.height);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.fillStyle = "rgb(205,232,255)";
      fctx.fillRect(0, 0, w, h);
      // Condensation: tiny beads that catch the light.
      const beads = Math.round((w * h) / 2600);
      for (let i = 0; i < beads; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = 0.8 + Math.random() * 2.6;
        fctx.fillStyle = "rgba(255,255,255,0.9)";
        fctx.beginPath(); fctx.arc(x, y, r, 0, Math.PI * 2); fctx.fill();
        fctx.fillStyle = "rgba(120,170,215,0.9)";
        fctx.beginPath(); fctx.arc(x + r * 0.25, y + r * 0.3, r * 0.45, 0, Math.PI * 2); fctx.fill();
      }
    }

    function setup() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas!.width = fog.width = Math.round(w * dpr);
      canvas!.height = fog.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFogTexture();
      const count = Math.max(14, Math.min(34, Math.round((w * h) / 42000)));
      bubbles = Array.from({ length: count }, () => spawnBubble(true));
      foam.length = 0;
      const n = Math.round(w / 14);
      for (let i = 0; i < n; i++) foam.push({ x: (i / n) * w + (Math.random() - 0.5) * 18, y: h - Math.random() * 26 + 6, r: 8 + Math.random() * 20, phase: Math.random() * 6.28 });
    }

    function spawnBubble(anywhere: boolean): Bubble {
      const r = Math.random() < 0.2 ? 30 + Math.random() * 26 : 7 + Math.random() * 20;
      return { x: Math.random() * w, y: anywhere ? Math.random() * h : h + r + Math.random() * 80, r, vy: 0.12 + Math.random() * 0.34 + (30 / (r + 30)) * 0.15, sway: 8 + Math.random() * 22, phase: Math.random() * 6.28, tint: Math.random(), pop: -1 };
    }

    function drawBubble(c: CanvasRenderingContext2D, b: Bubble, x: number, y: number, t: number) {
      const rim = (ang: number, color: string, lw: number) => { c.strokeStyle = color; c.lineWidth = lw; c.beginPath(); c.arc(x, y, b.r, ang, ang + 1.6); c.stroke(); };
      const body = c.createRadialGradient(x - b.r * 0.3, y - b.r * 0.35, b.r * 0.1, x, y, b.r);
      body.addColorStop(0, "rgba(255,255,255,0.10)");
      body.addColorStop(0.7, "rgba(150,215,255,0.05)");
      body.addColorStop(1, b.tint > 0.7 ? "rgba(255,230,109,0.22)" : "rgba(94,234,212,0.22)");
      c.fillStyle = body;
      c.beginPath(); c.arc(x, y, b.r, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = "lighter";
      const spin = t * 0.0002 + b.phase;
      rim(spin, "rgba(94,234,212,0.55)", 1.4);
      rim(spin + 2.1, "rgba(255,150,210,0.4)", 1.2);
      rim(spin + 4.2, "rgba(255,230,109,0.45)", 1.2);
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "rgba(255,255,255,0.8)";
      c.beginPath(); c.ellipse(x - b.r * 0.38, y - b.r * 0.42, b.r * 0.22, b.r * 0.12, -0.7, 0, Math.PI * 2); c.fill();
    }

    function drawStar(c: CanvasRenderingContext2D, g: Glint, t: number) {
      const k = (t - g.born) / g.life;
      if (k < 0 || k > 1) return;
      const a = Math.sin(k * Math.PI);
      const s = g.size * (0.4 + 0.6 * a);
      c.globalAlpha = a;
      c.drawImage(g.warm ? glowLemon : glowAqua, g.x - s * 1.4, g.y - s * 1.4, s * 2.8, s * 2.8);
      c.fillStyle = "#fff";
      c.beginPath();
      c.moveTo(g.x, g.y - s); c.lineTo(g.x + s * 0.13, g.y - s * 0.13); c.lineTo(g.x + s, g.y); c.lineTo(g.x + s * 0.13, g.y + s * 0.13);
      c.lineTo(g.x, g.y + s); c.lineTo(g.x - s * 0.13, g.y + s * 0.13); c.lineTo(g.x - s, g.y); c.lineTo(g.x - s * 0.13, g.y - s * 0.13);
      c.closePath(); c.fill();
      c.globalAlpha = 1;
    }

    // Squeegee path: a long S-curve from one top corner to the opposite bottom corner.
    const sweepAt = (u: number, flip: boolean) => {
      const e = u * u * (3 - 2 * u);
      const x = (flip ? 1 - e : e) * (w + 160) - 80;
      const y = h * (0.12 + 0.78 * e) + Math.sin(e * Math.PI * 2) * h * 0.14;
      return { x, y };
    };

    function frame(t: number) {
      const c = ctx!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalCompositeOperation = "source-over";
      const bg = c.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, NAVY); bg.addColorStop(1, DEEP);
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      const glow = c.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.7);
      glow.addColorStop(0, "rgba(40,120,170,0.30)"); glow.addColorStop(1, "rgba(10,17,40,0)");
      c.fillStyle = glow; c.fillRect(0, 0, w, h);

      // Wiping: the pointer, then the squeegee.
      const recent = t - pointer.lastMove < 140;
      if (recent && pointer.lastX > -999) { wipeLine(pointer.lastX, pointer.lastY, pointer.x, pointer.y, t); pointer.lastX = pointer.x; pointer.lastY = pointer.y; }
      let head: { x: number; y: number } | null = null;
      if (sweep) {
        const u = Math.min(1, (t - sweep.start) / sweep.dur);
        if (u >= 0) {
          head = sweepAt(u, sweep.flip);
          if (sweepPrev) wipeLine(sweepPrev.x, sweepPrev.y, head.x, head.y, t, brush() * 1.5, 0.5); else wipe(head.x, head.y, brush() * 1.5);
          sweepPrev = head;
        }
        if (u >= 1) { sweep = null; sweepPrev = null; nextSweep = t + 9000; }
      } else if (t > nextSweep && t - pointer.lastMove > 4000) {
        sweep = { start: t, dur: 1900, flip: Math.random() < 0.5 }; sweepPrev = null;
      }
      // Fog settles back slowly.
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.fillStyle = "rgba(205,232,255,0.006)";
      fctx.fillRect(0, 0, fog.width, fog.height);

      // Bubbles.
      for (const b of bubbles) {
        if (b.pop >= 0) continue;
        if (!reduce) { b.y -= b.vy; }
        const x = b.x + Math.sin(t * 0.0007 + b.phase) * b.sway;
        for (const p of [pointer.down || recent ? { x: pointer.x, y: pointer.y } : null, head]) {
          if (p && Math.hypot(p.x - x, p.y - b.y) < b.r + 20) { b.pop = t; rings.push({ x, y: b.y, r: b.r, born: t }); for (let i = 0; i < 4; i++) glints.push({ x: x + (Math.random() - 0.5) * b.r, y: b.y + (Math.random() - 0.5) * b.r, size: 5 + Math.random() * 7, born: t, life: 500, warm: Math.random() < 0.5 }); }
        }
        if (b.pop < 0) {
          if (b.y < -b.r - 10) Object.assign(b, spawnBubble(false));
          else drawBubble(c, b, x, b.y, t);
        }
      }
      for (const b of bubbles) if (b.pop >= 0 && t - b.pop > 50) Object.assign(b, spawnBubble(false));
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i], k = (t - r.born) / 420;
        if (k >= 1) { rings.splice(i, 1); continue; }
        c.strokeStyle = `rgba(200,240,255,${0.7 * (1 - k)})`; c.lineWidth = 1.5;
        c.beginPath(); c.arc(r.x, r.y, r.r * (1 + k * 0.7), 0, Math.PI * 2); c.stroke();
      }

      // Fog over the scene, then glints and foam on top.
      c.globalAlpha = 0.2;
      c.drawImage(fog, 0, 0, w, h);
      c.globalAlpha = 1;
      c.globalCompositeOperation = "lighter";
      for (let i = glints.length - 1; i >= 0; i--) { if (t - glints[i].born > glints[i].life) { glints.splice(i, 1); continue; } drawStar(c, glints[i], t); }
      c.globalCompositeOperation = "source-over";

      for (const f of foam) {
        const pulse = 1 + 0.06 * Math.sin(t * 0.0015 + f.phase);
        const r = f.r * pulse;
        const g = c.createRadialGradient(f.x - r * 0.3, f.y - r * 0.35, r * 0.1, f.x, f.y, r);
        g.addColorStop(0, "rgba(255,255,255,0.20)"); g.addColorStop(0.75, "rgba(170,225,255,0.07)"); g.addColorStop(1, "rgba(160,235,230,0.30)");
        c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y, r, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "rgba(220,245,255,0.28)"; c.lineWidth = 1; c.stroke();
      }
    }

    function loop(t: number) { frame(t); raf = requestAnimationFrame(loop); }
    setup();
    if (reduce) {
      // No motion: one still frame with a clear diagonal band, so the scene is visible.
      for (let i = 0; i <= 40; i++) { const p = sweepAt(i / 40, false); wipe(p.x, p.y, brush() * 1.6); }
      for (let i = 0; i < 26; i++) glints.push({ x: Math.random() * w, y: Math.random() * h * 0.8, size: 6 + Math.random() * 10, born: 0, life: 1e9, warm: Math.random() < 0.4 });
      frame(500);
    } else {
      sweep = { start: 450, dur: 2000, flip: false };
      nextSweep = 12000;
      raf = requestAnimationFrame(loop);
    }

    const rel = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onMove = (e: PointerEvent) => {
      const p = rel(e);
      if (pointer.lastX < -999 || performance.now() - pointer.lastMove > 300) { pointer.lastX = p.x; pointer.lastY = p.y; }
      pointer.x = p.x; pointer.y = p.y; pointer.lastMove = performance.now();
    };
    const onDown = (e: PointerEvent) => { pointer.down = true; onMove(e); };
    const onUp = () => { pointer.down = false; };
    const onLeave = () => { pointer.lastX = pointer.lastY = -9999; pointer.x = pointer.y = -9999; };
    const onResize = () => { setup(); if (reduce) { for (let i = 0; i <= 40; i++) { const p = sweepAt(i / 40, false); wipe(p.x, p.y, brush() * 1.6); } frame(500); } };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} style={{ background: NAVY }} />;
}
