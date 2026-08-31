import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { DIVISION_NET_MARGIN, REVENUE_TARGET_BY_DIVISION } from "../lib/npdMaster.js";
import {
  FORUM_VERDICT_FIELD,
  OWNER_COLORS,
  PROPOSITION_TOP_FIELDS,
  SIX_FILTERS_FORM,
  VERDICT_NOTE_FIELD,
  f6Unlocked,
  filterStatus,
  mergeProposition,
} from "../lib/propositionFields.js";
import { ADVISORY_LABEL, computeAllAdvisoryChecks, computeF5Revenue } from "../lib/propositionScoring.js";

function OwnerTag({ role }) {
  const c = OWNER_COLORS[role] || { bg: "#333", fg: "#ccc" };
  return (
    <span className="owner-tag" style={{ background: c.bg, color: c.fg }}>
      {role}
    </span>
  );
}

function filterSubtitle(spec, division) {
  if (spec.key === "f2" && spec.subtitleFromDivision) {
    const target = DIVISION_NET_MARGIN[division];
    if (target == null) return "path to the division floor (v4)";
    return spec.subtitleFromDivision(division, target);
  }
  if (spec.key === "f5" && spec.subtitleFromDivision) {
    const row = REVENUE_TARGET_BY_DIVISION[division];
    const target = row?.allChannels;
    if (target == null) return row?.note || "credible path to year-3 revenue (v4)";
    const base = spec.subtitleFromDivision(division, target);
    return row?.note ? `${base} · ${row.note}` : base;
  }
  return spec.subtitle || "";
}

function fieldHelper(field, division) {
  if (typeof field.helperFromDivision === "function") {
    const target = DIVISION_NET_MARGIN[division];
    if (target == null) return "Division floor: per respective division (v4, non-negotiable)";
    return field.helperFromDivision(division, target);
  }
  return field.helper || "";
}

function FieldControl({ field, value, onChange, division }) {
  const helper = fieldHelper(field, division);
  const owners = Array.isArray(field.owners) ? field.owners : [];
  const full = field.type === "textarea" || field.type === "checkbox" || field.type === "computed";

  if (field.type === "computed") {
    return (
      <div className={`prop-field span-2`}>
        <div className="prop-label">
          {field.label}
          {owners.map((role) => (
            <OwnerTag key={role} role={role} />
          ))}
        </div>
        {helper ? <p className="prop-helper">{helper}</p> : null}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="prop-check span-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          {field.label}
          {owners.map((role) => (
            <OwnerTag key={role} role={role} />
          ))}
        </span>
      </label>
    );
  }

  const input =
    field.type === "select" ? (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {(field.options || []).map((opt) => (
          <option key={`${opt.v}::${opt.l}`} value={opt.v}>
            {opt.l}
          </option>
        ))}
      </select>
    ) : field.type === "textarea" ? (
      <textarea
        rows={3}
        value={value ?? ""}
        placeholder={field.placeholder || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    ) : (
      <input
        type={field.type === "number" ? "number" : "text"}
        step={field.type === "number" ? "any" : undefined}
        value={value ?? ""}
        placeholder={field.placeholder || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );

  return (
    <label className={`prop-field${full ? " span-2" : ""}`}>
      <span className="prop-label">
        {field.label}
        {owners.map((role) => (
          <OwnerTag key={role} role={role} />
        ))}
      </span>
      {input}
      {helper ? <span className="prop-helper">{helper}</span> : null}
    </label>
  );
}

function ComputedRevenue({ f5, division }) {
  const cr = computeF5Revenue(f5);
  const row = REVENUE_TARGET_BY_DIVISION[division];
  const target = row?.allChannels ?? null;
  if (cr == null) {
    return <div className="prop-computed is-empty">Fill all five factors to compute year-3 revenue.</div>;
  }
  const shown = Math.round(cr * 10) / 10;
  const clears = target != null && cr >= target;
  return (
    <div className="prop-computed">
      <strong>₹{shown} Cr</strong>
      {target != null ? (
        <>
          <span> vs target ₹{target} Cr</span>
          <span className={clears ? "tone-pass" : "tone-watch"}>{clears ? "clears target" : "below target"}</span>
        </>
      ) : row?.note ? (
        <span> · {row.note}</span>
      ) : null}
    </div>
  );
}

function advisoryCopy(overall) {
  return ADVISORY_LABEL[overall] || "Advisory: not enough entered yet";
}

function AdvisoryCoveragePanel({ advisoryChecks }) {
  const rows = SIX_FILTERS_FORM.map((f) => ({
    num: f.num,
    title: f.title,
    checked: advisoryChecks[f.key]?.checked || [],
    notScored: advisoryChecks[f.key]?.notScored || [],
  }));
  return (
    <div className="panel advisory-coverage">
      <div className="panel-tab">Automated check coverage</div>
      <p className="about-lede">
        These are the only things checked automatically, against the v4 numeric
        floors. Everything else is a Forum judgment call — the list below names
        exactly what, per filter, so nobody mistakes a clean number for a cleared
        filter.
      </p>
      {rows.map((r) => (
        <div key={r.num} className="advisory-row">
          <div className="advisory-row-title">{r.num} — {r.title}</div>
          {r.checked.length > 0 && (
            <ul className="advisory-checked-list">
              {r.checked.map((c, i) => (
                <li key={i} data-pass={String(c.pass)}>
                  {c.rule}{c.value != null ? ` — ${c.value}` : ""} {c.pass ? "✓" : "✗"}
                  {c.note ? <span className="advisory-check-note"> {c.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {r.checked.length === 0 && <p className="advisory-none">Nothing entered yet to check automatically.</p>}
          <ul className="advisory-not-scored-list">
            {r.notScored.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function formatSavedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PropositionForm({
  initial,
  onSave,
  onDelete,
  saving,
  savedFlash,
  error,
}) {
  const [doc, setDoc] = useState(() => mergeProposition(initial));

  useEffect(() => {
    setDoc(mergeProposition(initial));
  }, [initial?.id, initial?.version]);

  const division = doc.division || "";
  const unlocked = f6Unlocked(doc);
  const advisoryChecks = computeAllAdvisoryChecks(doc);

  function setTop(key, value) {
    setDoc((prev) => ({ ...prev, [key]: value }));
  }

  function setFilter(filterKey, fieldKey, value) {
    setDoc((prev) => ({
      ...prev,
      [filterKey]: { ...prev[filterKey], [fieldKey]: value },
    }));
  }

  return (
    <main className="prop-page">
      <style>{PROP_CSS}</style>

      <section className="prop-top">
        <div className="prop-top-meta">
          <p className="prop-kicker">Overall record · BH Forum</p>
          <p className="prop-version">
            {Number(doc.version) > 1
              ? `v${doc.version} · last saved ${formatSavedAt(doc.updatedAt)}`
              : "v1 · not yet saved for the team"}
          </p>
        </div>
        <p className="prop-overall-note">
          This is the overall verdict for the proposition, separate from the six per-filter forum verdicts below.
          Clearing the filters is not approval — final validation is at CKR level (v4).
        </p>
        <div className="prop-grid">
          {PROPOSITION_TOP_FIELDS.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={doc[field.key]}
              division={division}
              onChange={(v) => setTop(field.key, v)}
            />
          ))}
        </div>
        {error ? <div className="prop-err">{error}</div> : null}
        <AdvisoryCoveragePanel advisoryChecks={advisoryChecks} />
        <div className="prop-actions">
          <button
            type="button"
            className="prop-save"
            disabled={saving}
            onClick={() => onSave(doc)}
          >
            {saving ? <Loader2 size={15} className="spin" /> : null}
            {savedFlash ? "Saved" : saving ? "Saving…" : "Save for the team"}
          </button>
          <button
            type="button"
            className="prop-delete"
            disabled={saving}
            onClick={() => onDelete(doc)}
          >
            <Trash2 size={14} /> Delete proposition
          </button>
        </div>
      </section>

      {SIX_FILTERS_FORM.map((spec) => {
        const values = doc[spec.key] || {};
        const status = filterStatus(spec.key, values, values.forumVerdict, spec.key === "f6" ? unlocked : true);
        const check = advisoryChecks[spec.key] || { overallAdvisory: "insufficient-evidence" };
        const locked = spec.key === "f6" && !unlocked;
        return (
          <section
            key={spec.key}
            className={`prop-filter${locked ? " is-locked" : ""}`}
            style={{ borderLeftColor: spec.accentBg }}
          >
            <div className="prop-filter-h">
              <span className="prop-badge" style={{ background: spec.accentBg, color: spec.accentFg }}>
                {spec.num}
              </span>
              <div>
                <h2 className="prop-filter-title" style={{ color: spec.accentFg }}>
                  {spec.title}
                </h2>
                <p className="prop-filter-sub">{filterSubtitle(spec, division)}</p>
              </div>
              <div className="prop-status-wrap">
                <span className={`prop-status tone-${status.tone}`}>{status.label}</span>
                <span className="advisory-note" data-advisory={check.overallAdvisory}>
                  {advisoryCopy(check.overallAdvisory)}
                </span>
              </div>
            </div>

            <div className="prop-grid">
              {spec.fields.map((field) =>
                field.type === "computed" ? (
                  <div key={field.key} className="prop-field span-2">
                    <div className="prop-label">{field.label}</div>
                    <ComputedRevenue f5={doc.f5} division={division} />
                  </div>
                ) : (
                  <FieldControl
                    key={field.key}
                    field={field}
                    value={values[field.key]}
                    division={division}
                    onChange={(v) => setFilter(spec.key, field.key, v)}
                  />
                )
              )}
            </div>

            {spec.crossCheckNote ? (
              <div className="prop-cross">
                {spec.crossCheckNote}
              </div>
            ) : null}

            <div className="prop-forum">
              <FieldControl
                field={FORUM_VERDICT_FIELD}
                value={values.forumVerdict}
                division={division}
                onChange={(v) => setFilter(spec.key, "forumVerdict", v)}
              />
              <FieldControl
                field={VERDICT_NOTE_FIELD}
                value={values.verdictNote}
                division={division}
                onChange={(v) => setFilter(spec.key, "verdictNote", v)}
              />
            </div>
          </section>
        );
      })}
    </main>
  );
}

const PROP_CSS = `
.prop-page{max-width:1080px;margin:0 auto;padding:0 28px 72px;color:#F3EAF8;}
.owner-tag{font-family:var(--fm);font-size:10px;font-weight:700;letter-spacing:.04em;
  padding:3px 9px;border-radius:999px;margin-left:8px;display:inline-block;vertical-align:middle;}
.prop-top{background:#191919;border:1px solid rgba(243,234,248,.12);
  border-radius:16px;padding:18px 20px 16px;margin:0 0 22px;box-shadow:0 12px 32px rgba(8,4,16,.35);}
.prop-top-meta{display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap;}
.prop-kicker{font-family:var(--fm);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#C9A0E8;margin:0;}
.prop-version{font-family:var(--fm);font-size:11px;color:rgba(243,234,248,.55);margin:0;}
.prop-overall-note{margin:8px 0 14px;font-size:13px;line-height:1.5;color:rgba(243,234,248,.62);}
.prop-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;}
.prop-field{display:flex;flex-direction:column;gap:6px;margin:0;}
.prop-field.span-2,.prop-check.span-2{grid-column:1 / -1;}
.prop-label{font-family:var(--fm);font-size:11px;letter-spacing:.04em;color:rgba(243,234,248,.82);display:flex;align-items:center;flex-wrap:wrap;gap:4px 0;}
.prop-helper{font-size:11.5px;color:rgba(243,234,248,.48);line-height:1.4;}
.prop-page input,.prop-page select,.prop-page textarea{
  width:100%;background:#22113A;border:1px solid rgba(243,234,248,.14);border-radius:12px;
  color:#F3EAF8;font-family:var(--fd);font-size:14.5px;padding:11px 13px;outline:none;}
.prop-page textarea{min-height:84px;resize:vertical;}
.prop-page input:focus,.prop-page select:focus,.prop-page textarea:focus{
  border-color:#C9AEEF;box-shadow:0 0 0 3px rgba(201,174,239,.18);}
.prop-check{display:flex;align-items:flex-start;gap:10px;font-size:13.5px;line-height:1.45;cursor:pointer;color:#F3EAF8;}
.prop-check input{width:auto;margin-top:3px;accent-color:#C9A0E8;}
.prop-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}
.prop-save{display:inline-flex;align-items:center;gap:8px;background:#C9AEEF;color:#170C25;border:none;
  border-radius:999px;padding:10px 18px;font-weight:700;font-size:14px;cursor:pointer;font-family:var(--fd);}
.prop-save:disabled{opacity:.7;cursor:wait;}
.prop-delete{display:inline-flex;align-items:center;gap:8px;background:transparent;color:#E2716B;
  border:1px solid rgba(226,113,107,.4);border-radius:999px;padding:10px 16px;font-weight:600;font-size:13.5px;cursor:pointer;font-family:var(--fd);}
.prop-err{margin:10px 0 0;color:#E2716B;font-size:13px;}
.prop-filter{background:#191919;border:1px solid rgba(243,234,248,.1);border-left-width:5px;border-left-style:solid;
  border-radius:16px;padding:18px 20px 16px;margin:0 0 16px;}
.prop-filter.is-locked{opacity:.78;}
.prop-filter-h{display:flex;align-items:flex-start;gap:12px;margin:0 0 14px;}
.prop-badge{width:42px;height:42px;border-radius:10px;display:grid;place-items:center;font-family:var(--fm);
  font-size:13px;font-weight:700;flex-shrink:0;}
.prop-filter-title{margin:0;font-size:18px;letter-spacing:-.3px;}
.prop-filter-sub{margin:4px 0 0;font-size:12.5px;color:rgba(243,234,248,.55);}
.prop-status{font-family:var(--fm);font-size:10px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;padding:5px 10px;border-radius:999px;white-space:nowrap;}
.prop-status-wrap{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;}
.advisory-note{font-size:11px;font-family:var(--fm);text-align:right;max-width:220px;line-height:1.35;}
.advisory-note[data-advisory="meets-floor"]{color:var(--pass);}
.advisory-note[data-advisory="below-floor"]{color:var(--fail);}
.advisory-note[data-advisory="insufficient-evidence"],
.advisory-note[data-advisory="not-started"]{color:var(--muted-3);}
.advisory-note[data-advisory="exempt"]{color:var(--watch);}
.advisory-coverage{background:#191919;border:1px solid rgba(243,234,248,.12);border-radius:14px;padding:22px 18px 8px;margin:14px 0 0;position:relative;}
.advisory-coverage .about-lede{font-size:13px;line-height:1.5;color:rgba(243,234,248,.62);margin:8px 0 4px;}
.advisory-row{padding:14px 0;}
.advisory-row + .advisory-row{border-top:1px solid rgba(243,234,248,.12);}
.advisory-row-title{font-weight:600;color:#F3EAF8;margin-bottom:6px;font-size:13.5px;}
.advisory-checked-list{list-style:none;margin:0 0 8px;padding:0;font-size:13px;}
.advisory-checked-list li[data-pass="true"]{color:var(--pass);}
.advisory-checked-list li[data-pass="false"]{color:var(--fail);}
.advisory-check-note{display:block;font-size:12px;color:rgba(243,234,248,.5);font-weight:400;margin:2px 0 0;}
.advisory-not-scored-list{list-style:disc;margin:0;padding-left:18px;font-size:12px;color:rgba(243,234,248,.45);}
.advisory-none{font-size:12.5px;color:rgba(243,234,248,.45);margin:0 0 8px;}
.prop-status.tone-pass{color:var(--pass);background:rgba(var(--pass-rgb),.16);}
.prop-status.tone-fail{color:var(--fail);background:rgba(var(--fail-rgb),.16);}
.prop-status.tone-watch{color:var(--watch);background:rgba(232,181,99,.16);}
.prop-cross{margin:12px 0 4px;padding:8px 12px;border-radius:10px;font-size:12.5px;
  background:rgba(232,181,99,.1);color:#E8B563;border:1px dashed rgba(232,181,99,.4);}
.prop-cross.is-flag{background:rgba(226,113,107,.12);color:#E2716B;border-color:rgba(226,113,107,.45);}
.prop-forum{margin-top:16px;padding-top:14px;border-top:1px dashed rgba(243,234,248,.2);
  display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;}
.prop-computed{background:#22113A;border:1px solid rgba(243,234,248,.14);border-radius:12px;padding:12px 14px;
  display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline;}
.prop-computed.is-empty{color:rgba(243,234,248,.45);font-size:13.5px;}
.prop-computed .tone-pass{color:var(--pass);font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;}
.prop-computed .tone-watch{color:var(--watch);font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;}
@media (max-width:760px){
  .prop-grid,.prop-forum{grid-template-columns:1fr;}
  .prop-top{position:static;}
  .prop-page{padding:0 16px 56px;}
}
`;
