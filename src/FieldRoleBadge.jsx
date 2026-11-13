/**
 * Part 139 B–D — the role label on every box, the legend, and the Before-you-submit card.
 * Every word about a role comes from lib/fieldRoles.js; nothing here invents its own wording.
 */
import { useState } from "react";
import {
  ROLE_KEYS,
  ROLE_LABEL,
  ROLE_MEANING,
  effectiveRole,
  getFieldRole,
  roleMeaning,
  roleNote,
  submitChecklist,
} from "../lib/fieldRoles.js";

export const FIELD_ROLE_LEGEND_STORAGE_KEY = "primus.fieldRoleLegendCollapsed";

function safeStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage || null : null;
  } catch {
    return null;
  }
}

export function readLegendCollapsed() {
  try {
    return safeStorage()?.getItem(FIELD_ROLE_LEGEND_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeLegendCollapsed(collapsed) {
  try {
    const s = safeStorage();
    if (!s) return;
    if (collapsed) s.setItem(FIELD_ROLE_LEGEND_STORAGE_KEY, "1");
    else s.removeItem(FIELD_ROLE_LEGEND_STORAGE_KEY);
  } catch {
    /* storage can be blocked — the legend still works for this visit */
  }
}

/**
 * The words are always visible text (never colour alone). Tap the "?" button to open the
 * plain-words meaning — it is not hover-only, so it works on a phone.
 */
export function FieldRoleBadge({ path, doc }) {
  const [open, setOpen] = useState(false);
  if (!getFieldRole(path)) return null;
  const role = effectiveRole(path, doc);
  if (!role) return null;
  const label = ROLE_LABEL[role];
  const meaning = roleMeaning(path, doc);
  const note = roleNote(path, doc);
  return (
    <span className="field-role" data-role-wrap={path}>
      <span
        className="field-role-badge"
        data-role-for={path}
        data-role={role}
        title={meaning}
        aria-description={meaning}
      >
        {label}
      </span>
      <button
        type="button"
        className="field-role-toggle"
        aria-expanded={open}
        aria-label={`What does "${label}" mean?`}
        onClick={(e) => {
          // The badge sits inside <label> elements — a tap here must not click the box.
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {note ? <span className="field-role-note">{note}</span> : null}
      {open ? (
        <span className="field-role-meaning" data-open="true" role="note">
          {meaning}
        </span>
      ) : null}
    </span>
  );
}

/** "What the labels mean" — open on the first visit, remembers when it is collapsed. */
export function FieldRoleLegend() {
  const [open, setOpen] = useState(() => !readLegendCollapsed());
  return (
    <details
      className="field-role-legend"
      data-testid="field-role-legend"
      open={open}
      onToggle={(e) => {
        const next = Boolean(e.currentTarget.open);
        if (next === open) return;
        setOpen(next);
        writeLegendCollapsed(!next);
      }}
    >
      <summary>What the labels mean</summary>
      <ul className="field-role-legend-list">
        {ROLE_KEYS.map((key) => (
          <li key={key} data-role-legend={key}>
            <span className="field-role-badge" data-role={key}>
              {ROLE_LABEL[key]}
            </span>
            <span className="field-role-legend-meaning">{ROLE_MEANING[key]}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Card shown while editing: what is still empty, and what can safely be skipped. */
export function BeforeYouSubmit({ doc }) {
  const c = submitChecklist(doc);
  return (
    <section className="before-you-submit" data-testid="before-you-submit" aria-label="Before you submit">
      <h2 className="before-you-submit-title">Before you submit</h2>
      <ul className="before-you-submit-counts">
        <li>
          <span className="field-role-badge" data-role="required">{ROLE_LABEL.required}</span>
          <span className="byc-text">boxes left:</span>
          <b className="mono" data-count="required-left">{c.requiredLeftCount}</b>
        </li>
        <li>
          <span className="field-role-badge" data-role="scored">{ROLE_LABEL.scored}</span>
          <span className="byc-text">boxes still empty:</span>
          <b className="mono" data-count="scored-empty">{c.scoredEmptyCount}</b>
        </li>
        <li>
          <span className="field-role-badge" data-role="needed-for-verdict">{ROLE_LABEL["needed-for-verdict"]}</span>
          <span className="byc-text">boxes still empty:</span>
          <b className="mono" data-count="verdict-empty">{c.verdictEmptyCount}</b>
        </li>
      </ul>
      {c.skippableSummary ? (
        <p className="before-you-submit-skip" data-skippable>
          <span className="field-role-badge" data-role="optional">{ROLE_LABEL.optional}</span>
          <span className="byc-text">You can skip:</span> {c.skippableSummary}
        </p>
      ) : null}
    </section>
  );
}


/** Styles for the role badge, legend and Before-you-submit card (shared by the form and the spec page). */
export const FIELD_ROLE_CSS = `n.field-role{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin-left:8px;min-width:0;max-width:100%;font-family:'Sora',system-ui,sans-serif;letter-spacing:0;}
.field-role-badge{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid rgba(201,160,232,.55);background:rgba(201,160,232,.14);color:#F3EAF8;font-size:11px;font-weight:600;line-height:1.35;white-space:normal;}
.field-role-badge[data-role="required"]{border-color:#E8B563;background:rgba(232,181,99,.16);}
.field-role-badge[data-role="needed-for-verdict"]{border-color:#93c5fd;background:rgba(147,197,253,.14);}
.field-role-badge[data-role="scored"]{border-color:#C9A0E8;}
.field-role-badge[data-role="filled-by-ai"]{border-style:dashed;}
.field-role-badge[data-role="optional"]{border-style:dashed;border-color:rgba(243,234,248,.45);background:rgba(243,234,248,.06);}
.field-role-badge[data-role="changes-checks"]{border-color:#7dd3b0;background:rgba(125,211,176,.12);}
.field-role-badge[data-role="not-in-score"]{border-style:dotted;border-color:rgba(243,234,248,.45);background:rgba(243,234,248,.06);}
.field-role-toggle{display:inline-flex;align-items:center;justify-content:center;min-width:28px;min-height:28px;padding:0 6px;margin:0;border-radius:999px;border:1px solid rgba(243,234,248,.45);background:transparent;color:#F3EAF8;font-size:12px;font-weight:700;line-height:1;cursor:pointer;font-family:inherit;}
.field-role-toggle:focus-visible{outline:2px solid #C9A0E8;outline-offset:2px;}
.field-role-note{flex:1 1 100%;font-size:11.5px;font-weight:400;line-height:1.4;color:rgba(243,234,248,.78);white-space:normal;}
.field-role-meaning{flex:1 1 100%;display:block;padding:6px 10px;border-radius:8px;border:1px solid rgba(201,160,232,.4);background:rgba(25,12,34,.9);color:#F3EAF8;font-size:12px;font-weight:400;line-height:1.45;white-space:normal;}
.hero-label{margin:6px 0 2px;}
.hero-label label{font-weight:600;}
.field-role-legend{margin:0;padding:10px 14px;border:1px solid rgba(201,160,232,.3);border-radius:12px;background:rgba(25,12,34,.55);color:#F3EAF8;font-size:13px;}
.field-role-legend summary{cursor:pointer;font-weight:700;color:#E8D5F5;min-height:28px;}
.field-role-legend-list{list-style:none;margin:10px 0 2px;padding:0;display:flex;flex-direction:column;gap:8px;}
.field-role-legend-list li{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;}
.field-role-legend-meaning{flex:1 1 220px;min-width:0;line-height:1.45;color:rgba(243,234,248,.88);}
.before-you-submit{padding:12px 16px;border:1px solid rgba(201,160,232,.3);border-radius:12px;background:rgba(25,12,34,.55);color:#F3EAF8;font-size:13px;}
.before-you-submit-title{margin:0 0 8px;font-size:15px;font-weight:700;color:#E8D5F5;}
.before-you-submit-counts{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px 18px;}
.before-you-submit-counts li{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;}
.before-you-submit .byc-text{color:rgba(243,234,248,.88);}
.before-you-submit-skip{margin:10px 0 0;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;line-height:1.45;}
@media (max-width:760px){
.field-role{flex:1 1 100%;margin-left:0;margin-top:4px;flex-wrap:wrap;}
}
`;
