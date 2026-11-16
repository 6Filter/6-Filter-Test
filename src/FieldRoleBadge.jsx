/**
 * Part 143 A/E (D84, D89) — two labels only: Required or Optional.
 * No legend, no "?" toggle, no role note. Display words come from fieldRoleDisplay.js.
 */
import { displayRole, displayRoleKey, requiredEmpty } from "../lib/fieldRoleDisplay.js";

/**
 * One badge per box. data-role is "required" or "optional" only.
 */
export function FieldRoleBadge({ path, doc }) {
  if (!path) return null;
  const role = displayRoleKey(path, doc);
  const label = displayRole(path, doc);
  return (
    <span className="field-role" data-role-wrap={path}>
      <span className="field-role-badge" data-role-for={path} data-role={role}>
        {label}
      </span>
    </span>
  );
}

/** Removed in Part 143 — keep a no-op export so old imports fail loudly if re-added. */
export function FieldRoleLegend() {
  return null;
}

/** Card: one number — Required boxes still empty (D89). */
export function BeforeYouSubmit({ doc }) {
  const left = requiredEmpty(doc);
  return (
    <section className="before-you-submit" data-testid="before-you-submit" aria-label="Before you submit">
      <h2 className="before-you-submit-title">Before you submit</h2>
      <p className="before-you-submit-one">
        <span className="byc-text">Required boxes still empty</span>
        <b className="mono" data-count="required-empty">
          {left.length}
        </b>
      </p>
    </section>
  );
}

/** Styles for the two badges and Before-you-submit card (tokens come from .prop-form-page). */
export const FIELD_ROLE_CSS = `
.field-role{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin-left:8px;min-width:0;max-width:100%;font-family:'Sora',system-ui,sans-serif;letter-spacing:0;}
.field-role-badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:var(--fs-badge,12px);font-weight:500;line-height:1.35;white-space:normal;}
.field-role-badge[data-role="required"]{color:var(--c-required,#f5b562);border:1px solid var(--c-required,#f5b562);background:rgba(245,181,98,.12);}
.field-role-badge[data-role="optional"]{color:var(--c-optional,#b9a9cc);border:1px dashed var(--c-optional,#b9a9cc);background:rgba(185,169,204,.08);}
.hero-label{margin:6px 0 2px;}
.hero-label label{font-weight:600;}
.before-you-submit{padding:12px 16px;border:1px solid rgba(201,160,232,.3);border-radius:12px;background:rgba(25,12,34,.55);color:var(--c-input,#efe8f5);font-size:var(--fs-status,13px);}
.before-you-submit-title{margin:0 0 8px;font-size:15px;font-weight:700;color:var(--c-section,#ddd6fe);}
.before-you-submit-one{margin:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;}
.before-you-submit .byc-text{color:var(--c-placeholder,#9a89ae);}
.before-you-submit .mono{font-size:18px;font-weight:700;color:var(--c-label,#f6eefb);}
@media (max-width:760px){
.field-role{flex:1 1 100%;margin-left:0;margin-top:4px;flex-wrap:wrap;}
}
`;
