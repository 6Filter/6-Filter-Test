/**
 * Part 146 — text size as a minus, a percentage and a plus (1% to 100%).
 *
 * The control sits OUTSIDE the scaled page (the wrapper marked `data-text-scale-target`), in fixed-size
 * text with 44 px buttons, so a person who goes down to 1% can always press plus.
 *
 *  - Click moves to the next multiple of 5 in that direction (78 → 80 → 85 … 100; 5 → 1).
 *  - Shift-click moves by exactly 1. Press and hold repeats. Buttons disable at 1% and at 100%.
 *  - The percentage is the Reset button (back to the default, 78% = what people always saw first).
 *  - The choice is remembered in localStorage under `primus.textSizePct`.
 *
 * Use it controlled (`value` + `onChange`) or on its own: on its own it keeps its own state and writes
 * `data-text-scale` and `--text-scale` onto the `[data-text-scale-target]` wrapper.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

export const TEXT_SIZE_MIN = 1;
export const TEXT_SIZE_MAX = 100;
/** 78% is the old "Compact" (what people see first); 100% is the old "Large". */
export const TEXT_SIZE_DEFAULT = 78;
export const TEXT_SIZE_STORAGE_KEY = "primus.textSizePct";
export const TEXT_SIZE_STEP = 5;

const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 90;

/** Whole percentage in [1, 100]. Missing or non-numeric gives the default; 0 or less gives 1; over 100 gives 100. */
export function clampTextSize(raw) {
  if (raw === null || raw === undefined) return TEXT_SIZE_DEFAULT;
  if (typeof raw === "string" && raw.trim() === "") return TEXT_SIZE_DEFAULT;
  if (typeof raw === "boolean") return TEXT_SIZE_DEFAULT;
  const n = Number(raw);
  if (Number.isNaN(n)) return TEXT_SIZE_DEFAULT;
  const whole = Math.round(n);
  if (whole < TEXT_SIZE_MIN) return TEXT_SIZE_MIN;
  if (whole > TEXT_SIZE_MAX) return TEXT_SIZE_MAX;
  return whole;
}

/** The next percentage in a direction (+1 or -1): the next multiple of 5, or exactly 1 with `fine`. */
export function nextTextSize(current, direction, fine = false) {
  const cur = clampTextSize(current);
  const dir = direction < 0 ? -1 : 1;
  if (fine) return clampTextSize(cur + dir);
  const next = dir > 0 ? (Math.floor(cur / TEXT_SIZE_STEP) + 1) * TEXT_SIZE_STEP : (Math.ceil(cur / TEXT_SIZE_STEP) - 1) * TEXT_SIZE_STEP;
  return clampTextSize(next);
}

export function readStoredTextSize() {
  try {
    return clampTextSize(globalThis.localStorage?.getItem(TEXT_SIZE_STORAGE_KEY));
  } catch {
    return TEXT_SIZE_DEFAULT;
  }
}

export function storeTextSize(pct) {
  try {
    globalThis.localStorage?.setItem(TEXT_SIZE_STORAGE_KEY, String(clampTextSize(pct)));
  } catch {
    /* storage unavailable: nothing breaks */
  }
}

/** Write the scale onto the page wrapper. */
export function applyTextScale(el, pct) {
  if (!el) return;
  const p = clampTextSize(pct);
  el.setAttribute("data-text-scale", String(p));
  el.style.setProperty("--text-scale", String(p / 100));
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function TextSizeControl({ value, onChange, className = "" }) {
  const [own, setOwn] = useState(() => readStoredTextSize());
  const controlled = value !== undefined && value !== null;
  const pct = controlled ? clampTextSize(value) : own;
  const pctRef = useRef(pct);
  pctRef.current = pct;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const holdRef = useRef({ timer: null, interval: null, pointerHandled: false });

  const commit = useCallback((next) => {
    const p = clampTextSize(next);
    if (p === pctRef.current) return;
    pctRef.current = p;
    setOwn(p);
    storeTextSize(p);
    onChangeRef.current?.(p);
  }, []);

  // Stand-alone: scale the page wrapper ourselves.
  useIsoLayoutEffect(() => {
    if (controlled || typeof document === "undefined") return;
    applyTextScale(document.querySelector("[data-text-scale-target]"), pct);
  }, [controlled, pct]);

  const stopHold = useCallback(() => {
    const h = holdRef.current;
    if (h.timer) clearTimeout(h.timer);
    if (h.interval) clearInterval(h.interval);
    h.timer = null;
    h.interval = null;
  }, []);
  useEffect(() => stopHold, [stopHold]);

  const step = useCallback(
    (dir, fine) => {
      commit(nextTextSize(pctRef.current, dir, fine));
    },
    [commit]
  );

  function pointerDown(dir) {
    return (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const h = holdRef.current;
      h.pointerHandled = true;
      step(dir, e.shiftKey);
      if (e.shiftKey) return;
      stopHold();
      h.timer = setTimeout(() => {
        h.interval = setInterval(() => step(dir, false), HOLD_REPEAT_MS);
      }, HOLD_DELAY_MS);
    };
  }
  function click(dir) {
    return (e) => {
      const h = holdRef.current;
      if (h.pointerHandled) {
        h.pointerHandled = false; // the press already stepped; this click is its echo
        return;
      }
      step(dir, e.shiftKey);
    };
  }

  const atMin = pct <= TEXT_SIZE_MIN;
  const atMax = pct >= TEXT_SIZE_MAX;
  return (
    <div className={`text-size-control ${className}`.trim()} role="group" aria-label="Text size" data-testid="text-size-control">
      <style>{TEXT_SIZE_CSS}</style>
      <button
        type="button"
        className="text-size-btn"
        data-testid="text-size-minus"
        aria-label="Decrease text size"
        title="Smaller (Shift: 1%)"
        disabled={atMin}
        onPointerDown={pointerDown(-1)}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        onClick={click(-1)}
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="text-size-pct"
        data-testid="text-size-reset"
        aria-label={`Reset text size to ${TEXT_SIZE_DEFAULT}%`}
        title="Reset"
        onClick={() => commit(TEXT_SIZE_DEFAULT)}
      >
        <span aria-live="polite" data-testid="text-size-value">
          {pct}%
        </span>
      </button>
      <button
        type="button"
        className="text-size-btn"
        data-testid="text-size-plus"
        aria-label="Increase text size"
        title="Larger (Shift: 1%)"
        disabled={atMax}
        onPointerDown={pointerDown(1)}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        onClick={click(1)}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Fixed pixel sizes on purpose: nothing here reads --text-scale, so the control never shrinks with the page.
 */
export const TEXT_SIZE_CSS = `
.text-size-control{display:inline-flex;align-items:center;gap:6px;margin:0 0 12px;padding:4px;max-width:100%;box-sizing:border-box;
  border:1px solid rgba(201,160,232,.3);border-radius:12px;background:rgba(26,15,37,.72);color:#efe8f5;
  font-family:'Sora',system-ui,sans-serif;font-size:14px;line-height:1;}
.text-size-btn,.text-size-pct{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;
  min-width:44px;min-height:44px;height:44px;margin:0;padding:0 10px;border:1px solid rgba(201,160,232,.35);border-radius:10px;
  background:transparent;color:inherit;font:600 14px/1 'Sora',system-ui,sans-serif;cursor:pointer;}
.text-size-btn{width:44px;padding:0;}
.text-size-pct{min-width:64px;}
.text-size-btn:disabled{opacity:.4;cursor:not-allowed;}
.text-size-btn:focus-visible,.text-size-pct:focus-visible{outline:2px solid #c4b5fd;outline-offset:2px;}
.text-size-btn{touch-action:manipulation;user-select:none;-webkit-user-select:none;}
`;
