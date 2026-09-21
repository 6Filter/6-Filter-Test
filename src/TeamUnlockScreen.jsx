import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { LOG_UNLOCK_OPTIONS } from "../lib/departmentAuthConstants.js";

/**
 * Platform entry gate — same team password as the Log unlock (Part 87/90),
 * now required before Proposition Form / NPD Screen / Log are reachable.
 */
export default function TeamUnlockScreen({ onUnlock, title = "Unlock Primus.AI" }) {
  const [selectedDept, setSelectedDept] = useState("");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  async function handleUnlock(e) {
    e?.preventDefault?.();
    if (!selectedDept || !password || unlocking) return;
    setUnlocking(true);
    setUnlockError("");
    try {
      const res = await fetch("/api/department-auth/unlock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department: selectedDept, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not unlock.");
      onUnlock?.({ department: data.department, unlockedAt: Date.now() });
    } catch (err) {
      setUnlockError(err.message || "Could not unlock.");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <main className="log-page team-unlock-page">
      <form className="log-lock-screen" onSubmit={handleUnlock}>
        <p className="mono log-stat-kicker">Team session</p>
        <h2 className="log-title">{title}</h2>
        <p className="log-sub">
          Enter your department password to open the platform. Research calls bill that
          team's Anthropic account for this browser session — not the form's department dropdown.
        </p>
        <label className="log-lock-label">
          Department
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            disabled={unlocking}
            required
          >
            <option value="">Select your department</option>
            {LOG_UNLOCK_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="log-lock-label">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={unlocking}
            required
          />
        </label>
        {unlockError ? (
          <div className="log-err" role="alert">
            <AlertTriangle size={14} /> {unlockError}
          </div>
        ) : null}
        <button type="submit" className="log-btn" disabled={unlocking || !selectedDept || !password}>
          {unlocking ? <Loader2 size={15} className="spin" /> : null}
          Unlock
        </button>
      </form>
    </main>
  );
}
