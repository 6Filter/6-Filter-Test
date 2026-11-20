/** Part 148 D127 — chart tokens (Part 147 palette) and layout for src/LogCharts.jsx. The only place chart colours are defined. */
export const LOG_CHART_CSS = `
.log-page{
  --chart-go:#3f6b2f; --chart-watch:#8a6100; --chart-nogo:#a8432b; --chart-incomplete:#7a6454;
  --chart-bar:#9a5a32; --chart-bar-soft:#f6ebd8; --chart-avg:#3b2a1e;
  --chart-track:#f6ebd8; --chart-grid:#e9dcc5; --chart-text:#3b2a1e; --chart-text-muted:#7a6454;
}
.log-analytics{background:var(--card-bg);border:1px solid var(--card-border);border-radius:18px;padding:18px 22px 20px;display:flex;flex-direction:column;gap:14px;}
.log-analytics-head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;}
.log-tabs{display:flex;gap:6px;flex-wrap:wrap;}
.log-analytics-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.log-analytics-controls select,.log-analytics-controls input[type="date"]{background:#fff;border:1px solid var(--card-border);border-radius:12px;padding:8px 10px;font-family:inherit;font-size:13px;color:var(--ink);}
.log-analytics-note{margin:0;font-size:12px;color:var(--ink-muted-2);line-height:1.45;}
.log-active-filters{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--ink-secondary);}
.log-active-filters button{border:1px solid var(--card-border);background:transparent;border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer;font-family:inherit;color:var(--ink);}
.log-analytics-grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:18px;align-items:stretch;}
.log-analytics-grid > .log-insights{box-sizing:border-box;}
.log-chart{margin:0;min-width:0;}
.log-chart-title{margin:0 0 8px;font-size:15px;font-weight:700;color:var(--ink);}
.log-chart-empty{margin:8px 0;font-size:13px;color:var(--ink-muted);}
.log-chart-legend{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--ink-muted-2);}
.log-chart-legend li{display:inline-flex;align-items:center;gap:6px;}
.log-chart-legend i{width:12px;height:12px;border-radius:3px;display:inline-block;}
.log-chart-legend i.is-hatched{background:repeating-linear-gradient(45deg,var(--chart-bar) 0 2px,var(--chart-bar-soft) 2px 5px);border:1px solid var(--chart-bar);}
.log-chart-legend i.is-dashed{height:0;border-top:2px dashed var(--chart-avg);border-radius:0;width:18px;}
.log-bars{display:flex;flex-direction:column;gap:8px;}
.log-bar-row{display:grid;grid-template-columns:minmax(80px,150px) minmax(0,1fr) auto;gap:10px;align-items:center;border-radius:8px;padding:2px 4px;}
.log-bar-row.is-clickable{cursor:pointer;}
.log-bar-row.is-clickable:hover,.log-bar-row.is-clickable:focus-visible{background:var(--table-row-hover);outline:2px solid var(--chart-bar);outline-offset:1px;}
.log-bar-label{font-size:13px;color:var(--chart-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.log-bar-svg{width:100%;height:20px;display:block;border-radius:6px;overflow:hidden;}
.log-bar-total{font-size:13px;font-weight:700;color:var(--chart-text);white-space:nowrap;}
.log-bar-total small{font-weight:500;color:var(--chart-text-muted);font-size:11px;}
.log-month-scroll{overflow-x:auto;max-width:100%;}
.log-month-svg{display:block;}
.log-svg-text{font-size:12px;font-family:inherit;}
.log-svg-text.is-strong{font-weight:700;}
.log-month-bar.is-clickable{cursor:pointer;outline:none;}
.log-month-bar.is-clickable:focus-visible rect[data-count]{stroke:var(--chart-text);stroke-width:2;}
.log-insights{background:var(--table-header-bg);border:1px solid var(--card-border);border-radius:14px;padding:12px 14px;}
.log-insight-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}
.log-insight{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.45;color:var(--chart-text);}
.log-insight-icon{flex:0 0 auto;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:var(--chart-track);color:var(--chart-text);}
.log-insight.tone-down .log-insight-icon,.log-insight.tone-warn .log-insight-icon{background:var(--chart-nogo);color:#fff;}
.log-insight.tone-up .log-insight-icon{background:var(--chart-go);color:#fff;}
.log-insight-rules{margin-top:10px;font-size:12px;color:var(--ink-secondary);}
.log-insight-rules summary{cursor:pointer;font-weight:600;}
.log-insight-rules ul{margin:6px 0 0;padding-left:18px;line-height:1.5;}
.log-summary-scroll{overflow-x:auto;max-width:100%;}
.log-summary-table{border-collapse:collapse;width:100%;font-size:13px;}
.log-summary-table th,.log-summary-table td{padding:7px 10px;text-align:right;border-bottom:1px solid var(--table-border);white-space:nowrap;}
.log-summary-table th:first-child{text-align:left;font-weight:600;}
.log-summary-table thead th{background:var(--table-header-bg);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-muted-2);}
.log-summary-table tfoot th,.log-summary-table tfoot td{font-weight:700;border-top:2px solid var(--card-border);}
.log-summary-table tr.is-clickable{cursor:pointer;}
.log-summary-table tr.is-clickable:hover,.log-summary-table tr.is-clickable:focus-visible{background:var(--table-row-hover);outline:2px solid var(--chart-bar);outline-offset:-2px;}
.log-summary-empty{text-align:center !important;color:var(--ink-muted);}
@media (max-width:900px){
  .log-analytics-grid{grid-template-columns:minmax(0,1fr);}
  .log-bar-row{grid-template-columns:minmax(70px,110px) minmax(0,1fr) auto;}
}
`;
