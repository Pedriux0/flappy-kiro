// Canvas 2D Renderer (design: "Renderer"; layout and palette: ui-mockups.md).
// Reads World and FrameVisual only; never mutates either (R19.4, R20.9).
// Requirements: 1.2, 1.4, 1.5, 5.1, 5.3, 6.3, 7.3, 9.5, 10.1, 11.1–11.3,
// 12.1–12.4, 12.6, 18.1, 18.3, 18.8, 19.1, 19.3, 19.4, 20.9

import { LOGICAL_WIDTH, LOGICAL_HEIGHT, UI_BUTTONS, createPlayArea, displayRect } from './constants.js';
import { formatScoreDisplay } from '../core/format.js';
import { pipeRects } from '../core/collision.js';

/** Palette from ui-mockups.md §1. */
export const COLORS = Object.freeze({
  sky: '#7EC8E3',
  pipe: '#2E8B2E',
  pipeCap: '#1F6B1F',
  ghost: '#FFFFFF',
  cloud: '#FFFFFF',
  scoreBar: '#3A4A5C',
  text: '#FFFFFF',
  backdrop: 'rgba(0, 0, 0, 0.55)',
  panel: '#3A4A5C',
  button: '#1E2A38',
  buttonBorder: '#FFFFFF',
  eyes: '#000000',
  flash: '#FF3030',
});

/** Pixel font stack; no external font is loaded. */
export const FONT_FAMILY = '"Press Start 2P", monospace';

/** Sprite cell size in logical px (R19.1). */
export const GHOST_CELL = 32;
const HALF_CELL = GHOST_CELL / 2;
const PIPE_CAP_HEIGHT = 12;

/** Neutral FrameVisual used when none is supplied. */
export const NEUTRAL_VISUAL = Object.freeze({
  offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1, eyes: 'normal', flash: false,
});

const font = (px) => `${px}px ${FONT_FAMILY}`;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function defaultCreateCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Create the renderer bound to a 2D context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   ghostSprite?: HTMLCanvasElement | null,      // prepared 32×32 cell (or null → white rect)
 *   getConfig?: () => { scoreFontSize?: number },
 *   buttons?: typeof UI_BUTTONS,
 *   getDisplayScale?: () => number,              // CSS px per logical px, for displayRect (R18.8)
 *   createCanvas?: (w: number, h: number) => HTMLCanvasElement | null, // for the one-off flash tint cache
 * }} [options]
 * @returns {{ draw: (world: object, visual?: object) => void, setGhostSprite: (s: HTMLCanvasElement | null) => void }}
 */
export function createRenderer(ctx, {
  ghostSprite = null,
  getConfig = () => ({}),
  buttons = UI_BUTTONS,
  getDisplayScale = () => 1,
  createCanvas = defaultCreateCanvas,
} = {}) {
  let sprite = ghostSprite;
  let flashSprite; // undefined = not built yet; null = unavailable

  /** Build the red-tinted copy of the cached cell once (never per frame). */
  function getFlashSprite() {
    if (flashSprite !== undefined) return flashSprite;
    flashSprite = null;
    if (!sprite) return flashSprite;
    try {
      const c = createCanvas(GHOST_CELL, GHOST_CELL);
      const g = c && c.getContext && c.getContext('2d');
      if (g) {
        g.imageSmoothingEnabled = false;
        g.drawImage(sprite, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.globalAlpha = 0.6;
        g.fillStyle = COLORS.flash;
        g.fillRect(0, 0, GHOST_CELL, GHOST_CELL);
        flashSprite = c;
      }
    } catch {
      flashSprite = null;
    }
    return flashSprite;
  }

  function text(str, x, y, px, align = 'center') {
    ctx.font = font(px);
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(str, x, y);
  }

  function drawSky() {
    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  }

  function drawClouds(clouds) {
    if (!Array.isArray(clouds)) return;
    for (const cloud of clouds) {
      const w = num(cloud.width, 64 * num(cloud.scale, 1));
      const h = Math.round(w * 0.4);
      const x = Math.round(cloud.x);
      const y = Math.round(cloud.y);
      ctx.save();
      ctx.globalAlpha = clamp(num(cloud.opacity, 0.5), 0, 1);
      ctx.fillStyle = COLORS.cloud;
      // Blocky pixel cloud: a wide base plus two bumps.
      ctx.fillRect(x, y + Math.round(h * 0.5), Math.round(w), Math.round(h * 0.5));
      ctx.fillRect(x + Math.round(w * 0.15), y + Math.round(h * 0.2), Math.round(w * 0.4), Math.round(h * 0.4));
      ctx.fillRect(x + Math.round(w * 0.45), y, Math.round(w * 0.35), Math.round(h * 0.6));
      ctx.restore();
    }
  }

  function drawPipes(pipes, playArea) {
    if (!Array.isArray(pipes)) return;
    for (const pipe of pipes) {
      const [top, bottom] = pipeRects(pipe, playArea);
      ctx.fillStyle = COLORS.pipe;
      ctx.fillRect(Math.round(top.x), Math.round(top.y), Math.round(top.width), Math.round(top.height));
      ctx.fillRect(Math.round(bottom.x), Math.round(bottom.y), Math.round(bottom.width), Math.round(bottom.height));
      // Darker rims at the gap edges.
      ctx.fillStyle = COLORS.pipeCap;
      const capTop = Math.min(PIPE_CAP_HEIGHT, Math.max(0, top.height));
      const capBottom = Math.min(PIPE_CAP_HEIGHT, Math.max(0, bottom.height));
      ctx.fillRect(Math.round(top.x), Math.round(top.y + top.height - capTop), Math.round(top.width), Math.round(capTop));
      ctx.fillRect(Math.round(bottom.x), Math.round(bottom.y), Math.round(bottom.width), Math.round(capBottom));
    }
  }

  function drawGhost(ghost, visual) {
    if (!ghost) return;
    const left = Math.round(ghost.x - HALF_CELL);
    const top = Math.round(ghost.y - HALF_CELL);
    const cx = left + HALF_CELL;
    const cy = top + HALF_CELL;
    const v = visual || NEUTRAL_VISUAL;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = clamp(num(v.opacity, 1), 0, 1);
    ctx.translate(Math.round(num(v.offsetX, 0)), Math.round(num(v.offsetY, 0)));
    // Rotate and scale about the cell centre; drawImage keeps absolute coords.
    ctx.translate(cx, cy);
    ctx.rotate((num(v.rotationDeg, 0) * Math.PI) / 180);
    ctx.scale(num(v.scaleX, 1), num(v.scaleY, 1));
    ctx.translate(-cx, -cy);

    const img = v.flash ? getFlashSprite() || sprite : sprite;
    if (img) {
      ctx.drawImage(img, left, top, GHOST_CELL, GHOST_CELL);
    } else {
      ctx.fillStyle = COLORS.ghost;
      ctx.fillRect(left, top, GHOST_CELL, GHOST_CELL);
    }

    if (v.eyes === 'cross') {
      // Cover the normal eyes (right of centre) and draw "x x".
      ctx.fillStyle = COLORS.ghost;
      ctx.fillRect(left + 16, top + 9, 5, 7);
      ctx.fillRect(left + 22, top + 9, 5, 7);
      ctx.strokeStyle = COLORS.eyes;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const ex of [left + 16, left + 22]) {
        ctx.moveTo(ex, top + 10);
        ctx.lineTo(ex + 5, top + 15);
        ctx.moveTo(ex + 5, top + 10);
        ctx.lineTo(ex, top + 15);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawScoreBar(world, playArea) {
    const barTop = playArea.groundY;
    const barHeight = LOGICAL_HEIGHT - barTop;
    ctx.fillStyle = COLORS.scoreBar;
    ctx.fillRect(0, barTop, LOGICAL_WIDTH, barHeight);
    const cfg = (getConfig && getConfig()) || {};
    const px = clamp(Math.round(num(cfg.scoreFontSize, 20)), 16, 48);
    text(formatScoreDisplay(world.score, world.highScore), LOGICAL_WIDTH / 2, barTop + barHeight / 2, px);
  }

  function drawBackdrop(playArea) {
    ctx.fillStyle = COLORS.backdrop;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, playArea.groundY);
  }

  function drawPanel(x, y, w, h) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.buttonBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function drawButtons(world) {
    const s = num(getDisplayScale && getDisplayScale(), 1);
    for (const button of Object.values(buttons)) {
      if (!button.visibleIn(world)) continue;
      const r = displayRect(button, s);
      ctx.fillStyle = COLORS.button;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeStyle = COLORS.buttonBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.width, r.height);
      // Pixel font advance ≈ 1em per glyph; shrink long labels to fit.
      const px = Math.max(10, Math.min(20, Math.floor((r.width - 16) / Math.max(1, button.label.length))));
      text(button.label, r.x + r.width / 2, r.y + r.height / 2, px);
    }
  }

  function drawOverlay(world, playArea) {
    const cx = LOGICAL_WIDTH / 2;
    switch (world.state) {
      case 'Main_Menu':
        if (world.menu?.bestScoreOpen) {
          drawBackdrop(playArea);
          drawPanel(120, 200, 240, 220);
          text('BEST SCORE', cx, 240, 20);
          text(String(world.highScore), cx, 292, 32);
        } else {
          text('FLAPPY KIRO', cx, 150, 32);
          text(`High Score: ${world.highScore}`, cx, 200, 14);
          text('Click, tap or press Space', cx, 562, 14);
        }
        break;
      case 'Paused':
        drawBackdrop(playArea);
        drawPanel(100, 200, 280, 220);
        text('PAUSED', cx, 240, 32);
        text('Press P to resume', cx, 295, 14);
        break;
      case 'Game_Over':
        drawBackdrop(playArea);
        drawPanel(40, 150, 400, 330);
        text('GAME OVER', cx, 195, 32);
        text(`Score: ${world.score}`, cx, 255, 20);
        text(`Best: ${world.highScore}`, cx, 295, 20);
        text('Click, tap or press Space', cx, 457, 14);
        break;
      default:
        break;
    }
  }

  /**
   * Draw one frame. Does not mutate `world` or `visual`.
   * @param {object} world
   * @param {object} [visual] FrameVisual; neutral when omitted
   */
  function draw(world, visual) {
    const canvas = ctx.canvas || { width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT };
    const sx = canvas.width / LOGICAL_WIDTH;
    const sy = canvas.height / LOGICAL_HEIGHT;
    const playArea = world.playArea || createPlayArea();

    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;

    drawSky();
    drawClouds(world.clouds);
    drawPipes(world.pipes, playArea);
    drawGhost(world.ghost, visual || NEUTRAL_VISUAL);
    drawOverlay(world, playArea);
    drawButtons(world);
    drawScoreBar(world, playArea);
  }

  return {
    draw,
    /** Swap in a late-prepared sprite (e.g. the fallback after a load timeout). */
    setGhostSprite(next) {
      sprite = next;
      flashSprite = undefined;
    },
  };
}
