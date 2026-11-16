import { useEffect, useState } from "react";
import { ArrowRight, ArrowUp } from "lucide-react";
import {
  DATA_SPINE,
  SCOREBOARD_CLOSING,
  SCOREBOARD_INTRO,
  SCOREBOARD_KPIS,
  SIX_FILTERS_SPEC,
  SPEC_FILTERS_NAV,
} from "./specContent.js";
import { FIELD_ROLE_CSS } from "./FieldRoleBadge.jsx";

function FilterSpecSection({ spec }) {
  const { key, num, title, accentBg, accentFg, v4Test, howToThink, modelAndAi, steps } = spec;
  return (
    <section
      id={key}
      className="spec-filter"
      style={{ borderLeft: `5px solid ${accentFg}` }}
    >
      <div className="spec-filter-h">
        <span className="spec-badge" style={{ background: accentBg, color: accentFg }}>
          {num}
        </span>
        <h2 className="spec-filter-title" style={{ color: accentFg }}>
          {title}
        </h2>
      </div>
      <p className="spec-lead">
        <strong>The test:</strong> {v4Test}
      </p>
      <h3 className="spec-subh">HOW TO THINK ABOUT THIS FILTER</h3>
      <p className="spec-copy">{howToThink}</p>
      <h3 className="spec-subh">THE MODEL AND THE AI FOR THIS FILTER</h3>
      <ul className="spec-bullets">
        {modelAndAi.map((item) => (
          <li key={item.slice(0, 48)}>{item}</li>
        ))}
      </ul>
      <div className="spec-table-wrap">
        <table className="spec-table">
          <thead style={{ background: accentBg, color: accentFg }}>
            <tr>
              <th>Step</th>
              <th>What</th>
              <th>Input</th>
              <th>By</th>
              <th>Validation</th>
              <th>Output / KPI</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((row, i) => (
              <tr key={row.n} className={i % 2 === 0 ? "odd" : "even"}>
                <td className="spec-step-n">{row.n}</td>
                <td>{row.step}</td>
                <td>{row.input}</td>
                <td>{row.by}</td>
                <td>{row.validation}</td>
                <td>{row.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function SpecPage({ onEnterProposition }) {
  const [active, setActive] = useState("f1");
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const ids = SPEC_FILTERS_NAV.map((n) => n.key);
    const sync = () => {
      const sticky = document.querySelector(".spec-pills");
      const line = (sticky?.getBoundingClientRect().bottom || 72) + 24;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
      setShowTop(window.scrollY > 420);
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, []);

  return (
    <div className="spec-page">
      <style>{SPEC_CSS}</style>
      <style>{FIELD_ROLE_CSS}</style>
      <div className="spec-cta-banner">
        <button type="button" className="spec-cta-btn" onClick={onEnterProposition}>
          Enter your proposition here <ArrowRight size={18} strokeWidth={2.4} />
        </button>
        <p className="spec-cta-text">
          This page is the reference. Inputs go into the screening platform — one evidence form,
          filled over time, with a forum verdict on each filter.
        </p>
      </div>

      <nav className="spec-pills" aria-label="Filter sections">
        {SPEC_FILTERS_NAV.map((item) => {
          const isActive = active === item.key;
          return (
            <a
              key={item.key}
              href={`#${item.key}`}
              className={`spec-pill${isActive ? " active" : ""}`}
              style={{
                background: item.bg,
                color: item.fg,
                borderColor: isActive ? item.fg : "transparent",
                boxShadow: isActive ? `0 0 0 1px ${item.fg}, 0 0 14px ${item.fg}55` : "none",
              }}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="spec-body">
        <section className="spec-spine" aria-labelledby="data-spine-h">
          <h2 id="data-spine-h" className="spec-spine-h">
            THE DATA SPINE — WHO PROVIDES WHAT, IN ONE VIEW
          </h2>
          <div className="spec-table-wrap">
            <table className="spec-table spec-spine-table">
              <thead>
                <tr>
                  <th>Function</th>
                  <th>Provides</th>
                </tr>
              </thead>
              <tbody>
                {DATA_SPINE.map((row, i) => (
                  <tr key={row.fn} className={i % 2 === 0 ? "odd" : "even"}>
                    <td className="spec-fn">{row.fn}</td>
                    <td>{row.provides}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {SIX_FILTERS_SPEC.map((spec) => (
          <FilterSpecSection key={spec.key} spec={spec} />
        ))}

        <section id="scoreboard" className="spec-filter spec-scoreboard">
          <div className="spec-filter-h">
            <span className="spec-badge" style={{ background: "#311B4C", color: "#A8A2B5" }}>
              KPIs
            </span>
            <h2 className="spec-filter-title" style={{ color: "#C9AEEF" }}>
              Scoreboard
            </h2>
          </div>
          <p className="spec-copy">{SCOREBOARD_INTRO}</p>
          <div className="spec-table-wrap">
            <table className="spec-table spec-spine-table">
              <thead>
                <tr>
                  <th>Process KPI</th>
                  <th>Definition</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {SCOREBOARD_KPIS.map((row, i) => (
                  <tr key={row.kpi} className={i % 2 === 0 ? "odd" : "even"}>
                    <td className="spec-fn">{row.kpi}</td>
                    <td>{row.def}</td>
                    <td>{row.from}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="spec-closing">{SCOREBOARD_CLOSING}</p>
        </section>
      </div>

      {showTop && (
        <button
          type="button"
          className="spec-scroll-top"
          aria-label="Scroll to top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUp size={20} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

const SPEC_CSS = `
.spec-page{background:#170C25;color:#F3EAF8;margin:0 -28px -48px;min-height:calc(100vh - 88px);}
.screen-spec .spec-page{margin:0;}
.spec-cta-banner{
  background:linear-gradient(120deg,#3D0A6E 0%,#6A1260 100%);
  padding:28px 32px;
  display:flex;
  align-items:center;
  gap:28px;
}
.spec-cta-btn{
  background:#fff;color:#1A0E2E;border:2px solid #1A0E2E;
  border-radius:999px;padding:14px 28px;font-weight:700;font-size:16px;
  display:inline-flex;align-items:center;gap:10px;white-space:nowrap;
  font-family:inherit;cursor:pointer;flex-shrink:0;
}
.spec-cta-btn:hover{background:#F4EEF8;}
.spec-cta-text{color:rgba(255,255,255,.92);font-size:14px;line-height:1.5;max-width:640px;margin:0;}
.spec-pills{
  position:sticky;top:0;z-index:30;
  display:flex;flex-wrap:wrap;gap:8px;
  padding:12px 28px;
  background:#170C25;
  border-bottom:1px solid rgba(201,174,239,.12);
}
.spec-pill{
  display:inline-flex;align-items:center;
  border-radius:999px;padding:7px 14px;
  font-size:12.5px;font-weight:600;text-decoration:none;
  border:1.5px solid transparent;
  opacity:.82;transition:opacity .15s,box-shadow .15s,border-color .15s;
}
.spec-pill:hover{opacity:1;}
.spec-pill.active{opacity:1;}
.spec-body{max-width:1180px;margin:0 auto;padding:36px 28px 88px;}
.spec-spine{margin-bottom:42px;}
.spec-spine-h{
  font-size:13px;letter-spacing:.14em;text-transform:uppercase;
  color:#C9AEEF;font-weight:700;margin:0 0 16px;
}
.spec-filter{
  background:rgba(34,17,58,.45);
  border-radius:16px;
  padding:28px 28px 22px;
  margin:0 0 28px;
  scroll-margin-top:72px;
}
.spec-scoreboard{border-left:5px solid #A8A2B5;box-shadow:inset 5px 0 0 #A8A2B5;}
.spec-filter-h{display:flex;align-items:center;gap:14px;margin-bottom:16px;}
.spec-badge{
  display:inline-flex;align-items:center;justify-content:center;
  min-width:42px;height:42px;padding:0 8px;
  border-radius:8px;font-weight:800;font-size:14px;letter-spacing:.04em;
  font-family:var(--fm);
}
.spec-filter-title{margin:0;font-size:22px;font-weight:700;letter-spacing:-.3px;line-height:1.25;}
.spec-lead,.spec-copy{font-size:14.5px;line-height:1.65;color:rgba(243,234,248,.9);margin:0 0 16px;}
.spec-lead strong{color:#fff;margin-right:6px;}
.spec-subh{
  font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  color:rgba(243,234,248,.55);font-weight:700;margin:22px 0 10px;
}
.spec-bullets{margin:0 0 22px;padding:0 0 0 18px;color:rgba(243,234,248,.88);font-size:14px;line-height:1.6;}
.spec-bullets li{margin:0 0 10px;}
.spec-table-wrap{overflow-x:auto;border-radius:10px;border:1px solid rgba(201,174,239,.14);}
.spec-table{width:100%;border-collapse:collapse;font-size:12.5px;line-height:1.45;}
.spec-table th{
  text-align:left;padding:11px 12px;font-weight:700;font-size:11px;
  letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;
}
.spec-table td{padding:11px 12px;vertical-align:top;color:rgba(243,234,248,.88);}
.spec-table tbody tr.odd{background:#22113A;}
.spec-table tbody tr.even{background:#2A1841;}
.spec-spine-table thead{background:#28183F;color:#C9AEEF;}
.spec-step-n,.spec-fn{font-weight:700;color:#fff;white-space:nowrap;font-family:var(--fm);font-size:12px;}
.spec-closing{margin:22px 0 0;font-size:14.5px;line-height:1.65;color:rgba(243,234,248,.88);}
.spec-scroll-top{
  position:fixed;right:28px;bottom:28px;
  width:48px;height:48px;border-radius:999px;
  background:#7C4DBE;color:#fff;
  display:flex;align-items:center;justify-content:center;
  border:none;cursor:pointer;z-index:50;
  box-shadow:0 8px 24px rgba(0,0,0,.35);
}
.spec-scroll-top:hover{background:#8B5ED0;}
@media(max-width:820px){
  .spec-cta-banner{flex-direction:column;align-items:flex-start;gap:16px;padding:22px 20px;}
  .spec-cta-btn{white-space:normal;}
  .spec-pills{padding:10px 16px;}
  .spec-body{padding:24px 16px 80px;}
  .spec-filter{padding:20px 16px 16px;}
  .spec-filter-title{font-size:18px;}
}
`;
