/**
 * Part 148 D122/D127 — Log charts. React and SVG only (no chart library). Every colour comes from a CSS variable
 * (--chart-*), never a hard-coded value. Each chart has a spoken summary and a hidden table with the same numbers,
 * and every bar is reachable and activated from the keyboard (Tab, then Enter or Space).
 */
import { useId } from "react";

const VERDICT_SEGMENTS = [
  { key: "GO", label: "GO", color: "var(--chart-go)" },
  { key: "WATCH", label: "WATCH", color: "var(--chart-watch)" },
  { key: "NO-GO", label: "NO-GO", color: "var(--chart-nogo)" },
  { key: "INCOMPLETE", label: "INCOMPLETE", color: "var(--chart-incomplete)" },
];

/** Charts count a screened idea: GO, WATCH or NO-GO. Incomplete ideas and drafts are left out. */
const SCREENED_SEGMENTS = VERDICT_SEGMENTS.filter((s) => s.key !== "INCOMPLETE");

function screenedCount(g = {}) {
  if (Number.isFinite(g.verdicted)) return g.verdicted;
  return SCREENED_SEGMENTS.reduce((sum, s) => sum + (g[s.key] || 0), 0);
}

function activate(handler) {
  return {
    onClick: handler,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        handler();
      }
    },
  };
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Top `limit` groups plus one "Others" group that adds up the rest. */
export function topWithOthers(groups = [], limit = 10, othersLabel = "Others") {
  const live = groups.filter((g) => screenedCount(g) > 0);
  if (live.length <= limit) return live.map((g) => ({ ...g }));
  const head = live.slice(0, limit).map((g) => ({ ...g }));
  const rest = live.slice(limit);
  const others = { key: "__others__", label: othersLabel, submitted: 0, drafts: 0, GO: 0, WATCH: 0, "NO-GO": 0, INCOMPLETE: 0, verdicted: 0, aiUsed: 0, isOthers: true, count: rest.length };
  for (const g of rest) {
    for (const k of ["submitted", "drafts", "GO", "WATCH", "NO-GO", "INCOMPLETE", "aiUsed", "verdicted"]) others[k] += g[k] || 0;
  }
  others.verdicted = others.GO + others.WATCH + others["NO-GO"];
  return [...head, others];
}

function ChartTable({ caption, columns, rows }) {
  return (
    <table className="sr-only log-chart-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={j}>{cell}</td>
              )
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChartLegend() {
  return (
    <ul className="log-chart-legend" aria-label="Chart colour key">
      {VERDICT_SEGMENTS.map((s) => (
        <li key={s.key}>
          <i style={{ background: s.color }} aria-hidden="true" /> {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Horizontal stacked bars of screened ideas (GO, WATCH, NO-GO). Incomplete ideas and drafts are not in the bar.
 * Bar length is proportional to screened ideas (the longest bar fills the track).
 */
export function StackedBars({ title, groups = [], onSelect, unit = "ideas", emptyText = "No screened ideas in this period yet." }) {
  const uid = useId();
  const shown = groups.filter((g) => screenedCount(g) > 0);
  const max = Math.max(0, ...shown.map((g) => screenedCount(g)));
  const summaryText = shown.length
    ? `${title}: ${shown.map((g) => `${g.label} ${screenedCount(g)}`).join(", ")}. Total ${shown.reduce((s, g) => s + screenedCount(g), 0)} screened.`
    : `${title}: no screened ideas.`;
  return (
    <figure className="log-chart" aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-d`}>
      <figcaption id={`${uid}-t`} className="log-chart-title">
        {title}
      </figcaption>
      <p id={`${uid}-d`} className="sr-only">
        {summaryText}
      </p>
      {shown.length === 0 ? (
        <p className="log-chart-empty">{emptyText}</p>
      ) : (
        <>
          <ul className="log-chart-legend" aria-label="Chart colour key">
            {SCREENED_SEGMENTS.map((s) => (
              <li key={s.key}>
                <i style={{ background: s.color }} aria-hidden="true" /> {s.label}
              </li>
            ))}
          </ul>
          <div className="log-bars">
            {shown.map((g) => {
              const clickable = typeof onSelect === "function" && !g.isOthers && g.filterValue !== "";
              const total = screenedCount(g);
              const widthPct = max > 0 ? (100 * total) / max : 0;
              let x = 0;
              const parts = SCREENED_SEGMENTS.map((s) => `${s.label} ${g[s.key] || 0}`).join(", ");
              const label = `${g.label}: ${plural(total, "screened idea", "screened ideas")}. ${parts}.${clickable ? " Press Enter to filter the list." : ""}`;
              const interactive = clickable ? { role: "button", tabIndex: 0, ...activate(() => onSelect(g)) } : { role: "group" };
              return (
                <div key={g.key} className={`log-bar-row${clickable ? " is-clickable" : ""}`} aria-label={label} {...interactive}>
                  <span className="log-bar-label" title={g.label}>
                    {g.label}
                    {g.isOthers ? ` (${g.count})` : ""}
                  </span>
                  <svg
                    className="log-bar-svg"
                    viewBox="0 0 100 10"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <title>{`${g.label} — ${parts} (${total} ${unit} screened)`}</title>
                    <rect x="0" y="0" width="100" height="10" style={{ fill: "var(--chart-track)" }} />
                    {total > 0
                      ? SCREENED_SEGMENTS.map((s) => {
                          const n = g[s.key] || 0;
                          if (!n) return null;
                          const w = (widthPct * n) / total;
                          const rect = (
                            <rect key={s.key} data-verdict={s.key} data-count={n} x={x} y="0" width={w} height="10" style={{ fill: s.color }}>
                              <title>{`${g.label}: ${s.label} ${n}`}</title>
                            </rect>
                          );
                          x += w;
                          return rect;
                        })
                      : null}
                  </svg>
                  <span className="log-bar-total mono">{total}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      <ChartTable
        caption={title}
        columns={["Name", "Screened", "Drafts", "GO", "WATCH", "NO-GO", "INCOMPLETE"]}
        rows={shown.map((g) => [g.label, screenedCount(g), g.drafts, g.GO, g.WATCH, g["NO-GO"], g.INCOMPLETE])}
      />
    </figure>
  );
}

function changeLabel(m) {
  if (m.inProgress) return "in progress";
  if (m.change == null) return "";
  const sign = m.change > 0 ? "+" : m.change < 0 ? "−" : "±";
  const abs = Math.abs(m.change);
  return m.changePercent == null ? `${sign}${abs}` : `${sign}${abs} (${sign}${Math.abs(m.changePercent)}%)`;
}

/**
 * Screened ideas per month. Above each bar: the change against the previous month. A dashed line shows the
 * three-month average. The month in progress is hatched, labelled "in progress", and shows no change.
 */
export function MonthTrendChart({ title = "Ideas screened by month", months = [], onSelect }) {
  const uid = useId();
  const patternId = `${uid.replace(/[^A-Za-z0-9_-]/g, "")}-hatch`;
  const step = 84;
  const left = 36;
  const top = 44;
  const plotH = 150;
  const bottom = 30;
  const width = left + Math.max(1, months.length) * step + 12;
  const height = top + plotH + bottom;
  const max = Math.max(1, ...months.map((m) => screenedCount(m)));
  const yOf = (v) => top + plotH - (plotH * v) / max;
  const summaryText = months.length
    ? `${title}: ${months.map((m) => `${m.label} ${screenedCount(m)}${m.inProgress ? " (in progress)" : ""}`).join(", ")}.`
    : `${title}: no ideas.`;
  const avgPoints = months
    .map((m, i) => (m.average == null ? null : `${left + i * step + step / 2},${yOf(m.average)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <figure className="log-chart" aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-d`}>
      <figcaption id={`${uid}-t`} className="log-chart-title">
        {title}
      </figcaption>
      <p id={`${uid}-d`} className="sr-only">
        {summaryText}
      </p>
      {months.length === 0 ? (
        <p className="log-chart-empty">No ideas in this period yet.</p>
      ) : (
        <>
          <ul className="log-chart-legend" aria-label="Chart key">
            <li>
              <i style={{ background: "var(--chart-bar)" }} aria-hidden="true" /> Screened
            </li>
            <li>
              <i className="is-hatched" aria-hidden="true" /> Month in progress
            </li>
            <li>
              <i className="is-dashed" aria-hidden="true" /> Three-month average
            </li>
          </ul>
          <div className="log-month-scroll">
            <svg className="log-month-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="presentation" focusable="false">
              <defs>
                <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" style={{ fill: "var(--chart-bar-soft)" }} />
                  <line x1="0" y1="0" x2="0" y2="6" strokeWidth="3" style={{ stroke: "var(--chart-bar)" }} />
                </pattern>
              </defs>
              <line x1={left} y1={top + plotH} x2={width - 6} y2={top + plotH} strokeWidth="1" style={{ stroke: "var(--chart-grid)" }} />
              <text x={left - 6} y={top + 4} textAnchor="end" className="log-svg-text" style={{ fill: "var(--chart-text-muted)" }}>
                {max}
              </text>
              <text x={left - 6} y={top + plotH} textAnchor="end" className="log-svg-text" style={{ fill: "var(--chart-text-muted)" }}>
                0
              </text>
              {months.map((m, i) => {
                const x = left + i * step + 10;
                const w = step - 20;
                const count = screenedCount(m);
                const h = (plotH * count) / max;
                const y = top + plotH - h;
                const label = `${m.label}: ${plural(count, "screened idea", "screened ideas")}${changeLabel(m) ? `, ${changeLabel(m)}` : ""}. Press Enter to filter the list to this month.`;
                const handler = typeof onSelect === "function" ? () => onSelect(m) : undefined;
                return (
                  <g
                    key={m.key}
                    className={`log-month-bar${handler ? " is-clickable" : ""}`}
                    data-month={m.key}
                    data-partial={m.inProgress ? "true" : undefined}
                    {...(handler ? { role: "button", tabIndex: 0, "aria-label": label, ...activate(handler) } : { role: "group", "aria-label": label })}
                  >
                    <title>{`${m.label}: ${count} screened${changeLabel(m) ? ` — ${changeLabel(m)}` : ""}`}</title>
                    <rect x={x - 8} y={top - 36} width={w + 16} height={plotH + 36 + bottom - 6} fill="transparent" />
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={Math.max(h, count > 0 ? 1 : 0)}
                      data-count={count}
                      style={m.inProgress ? { fill: `url(#${patternId})`, stroke: "var(--chart-bar)", strokeWidth: 1 } : { fill: "var(--chart-bar)" }}
                    />
                    <text x={x + w / 2} y={y - 4} textAnchor="middle" className="log-svg-text is-strong" style={{ fill: "var(--chart-text)" }}>
                      {count}
                    </text>
                    {changeLabel(m) ? (
                      <text
                        x={x + w / 2}
                        y={y - 18}
                        textAnchor="middle"
                        className="log-svg-text"
                        data-change={m.inProgress ? "in-progress" : m.change > 0 ? "up" : m.change < 0 ? "down" : "same"}
                        style={{ fill: m.inProgress ? "var(--chart-text-muted)" : m.change < 0 ? "var(--chart-nogo)" : m.change > 0 ? "var(--chart-go)" : "var(--chart-text-muted)" }}
                      >
                        {changeLabel(m)}
                      </text>
                    ) : null}
                    <text x={x + w / 2} y={top + plotH + 18} textAnchor="middle" className="log-svg-text" style={{ fill: "var(--chart-text)" }}>
                      {m.label}
                    </text>
                  </g>
                );
              })}
              {avgPoints.includes(" ") || avgPoints ? (
                <polyline className="log-month-avg" points={avgPoints} fill="none" strokeWidth="2" strokeDasharray="5 4" style={{ stroke: "var(--chart-avg)" }} />
              ) : null}
            </svg>
          </div>
        </>
      )}
      <ChartTable
        caption={title}
        columns={["Month", "Screened", "Drafts", "Change on previous month", "Three-month average"]}
        rows={months.map((m) => [m.label, screenedCount(m), m.drafts, changeLabel(m) || "—", m.average == null ? "—" : m.average])}
      />
    </figure>
  );
}

/** Simple horizontal bars for one number per group (used for the admin "AI usage by team" chart). */
export function SimpleBars({ title, items = [], unit = "", emptyText = "Nothing to show yet." }) {
  const uid = useId();
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <figure className="log-chart" aria-labelledby={`${uid}-t`}>
      <figcaption id={`${uid}-t`} className="log-chart-title">
        {title}
      </figcaption>
      {items.length === 0 ? (
        <p className="log-chart-empty">{emptyText}</p>
      ) : (
        <div className="log-bars">
          {items.map((it) => (
            <div key={it.key} className="log-bar-row" role="group" aria-label={`${it.label}: ${it.value} ${unit}`.trim()}>
              <span className="log-bar-label" title={it.label}>
                {it.label}
              </span>
              <svg className="log-bar-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <rect x="0" y="0" width="100" height="10" style={{ fill: "var(--chart-track)" }} />
                <rect x="0" y="0" width={max > 0 ? (100 * it.value) / max : 0} height="10" style={{ fill: "var(--chart-bar)" }} />
              </svg>
              <span className="log-bar-total mono">{it.display ?? it.value}</span>
            </div>
          ))}
        </div>
      )}
      <ChartTable caption={title} columns={["Name", unit || "Value"]} rows={items.map((i) => [i.label, i.display ?? i.value])} />
    </figure>
  );
}

/** The fixed-rule insights, each with its numbers. */
export function InsightsList({ insights = [], rules = [] }) {
  return (
    <section className="log-insights" aria-label="Insights">
      <h3 className="log-chart-title">Insights</h3>
      {insights.length === 0 ? (
        <p className="log-chart-empty">Nothing stands out yet. Small numbers are not reported as trends.</p>
      ) : (
        <ul className="log-insight-list">
          {insights.map((ins) => (
            <li key={`${ins.id}-${ins.text}`} className={`log-insight tone-${ins.tone}`}>
              <span className="log-insight-icon" aria-hidden="true">
                {ins.icon}
              </span>
              <span>{ins.text}</span>
            </li>
          ))}
        </ul>
      )}
      {rules.length ? (
        <details className="log-insight-rules">
          <summary>How this is worked out</summary>
          <ul>
            {rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** The summary table for a tab. A row is a button that sets the matching Log filter. */
export function SummaryTable({ summary, columnLabel, onSelect, newestFirst = false }) {
  const groups = newestFirst ? [...(summary?.groups || [])].reverse() : summary?.groups || [];
  const t = summary?.totals;
  return (
    <div className="log-summary-scroll">
      <table className="log-summary-table">
        <caption className="sr-only">{`Ideas by ${columnLabel.toLowerCase()}`}</caption>
        <thead>
          <tr>
            <th scope="col">{columnLabel}</th>
            <th scope="col">Submitted</th>
            <th scope="col">Drafts</th>
            <th scope="col">GO</th>
            <th scope="col">WATCH</th>
            <th scope="col">NO-GO</th>
            <th scope="col">INCOMPLETE</th>
            <th scope="col">AI used</th>
            <th scope="col">GO rate</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const clickable = typeof onSelect === "function" && g.filterValue !== "" && g.filterValue != null;
            return (
              <tr
                key={g.key}
                className={clickable ? "is-clickable" : undefined}
                {...(clickable ? { tabIndex: 0, "aria-label": `${g.label}: show these ideas in the list`, ...activate(() => onSelect(g)) } : {})}
              >
                <th scope="row">{g.label}</th>
                <td>{g.submitted}</td>
                <td>{g.drafts}</td>
                <td>{g.GO}</td>
                <td>{g.WATCH}</td>
                <td>{g["NO-GO"]}</td>
                <td>{g.INCOMPLETE}</td>
                <td>{g.aiUsed}</td>
                <td>{g.goRate == null ? "—" : `${g.goRate}%`}</td>
              </tr>
            );
          })}
          {groups.length === 0 ? (
            <tr>
              <td colSpan={9} className="log-summary-empty">
                No ideas in this period yet.
              </td>
            </tr>
          ) : null}
        </tbody>
        {t ? (
          <tfoot>
            <tr>
              <th scope="row">All</th>
              <td>{t.submitted}</td>
              <td>{t.drafts}</td>
              <td>{t.GO}</td>
              <td>{t.WATCH}</td>
              <td>{t["NO-GO"]}</td>
              <td>{t.INCOMPLETE}</td>
              <td>{t.aiUsed}</td>
              <td>{t.goRate == null ? "—" : `${t.goRate}%`}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
