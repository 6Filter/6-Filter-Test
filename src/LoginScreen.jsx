import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { SUBMITTER_DEPARTMENTS } from "../lib/propositionFields.js";

const SAME_HINT = "We sent a code to your Slack.";

export default function LoginScreen({ onLogin, onSignedIn, initialUser = null, startAtTeam = false }) {
  const finish = onSignedIn || onLogin;
  const [email, setEmail] = useState(initialUser?.email || "");
  const [step, setStep] = useState(startAtTeam || initialUser?.needsTeam ? "team" : "email");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [sessionUser, setSessionUser] = useState(initialUser);
  const [team, setTeam] = useState("");
  const inputs = useRef([]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  async function requestCode(nextEmail = email) {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: nextEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setError(data.error || "Unable to send a sign-in code right now. Try again later.");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Could not request a code.");
        return;
      }
      setInfo(SAME_HINT);
      setStep("code");
      setResendIn(60);
      setDigits(["", "", "", "", "", ""]);
      window.setTimeout(() => inputs.current[0]?.focus(), 50);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from Slack.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Invalid email or code.");
        setDigits(["", "", "", "", "", ""]);
        inputs.current[0]?.focus();
        return;
      }
      const user = data.user;
      if (user?.needsTeam) {
        setSessionUser(user);
        setStep("team");
        return;
      }
      finish?.(user);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTeam() {
    if (!SUBMITTER_DEPARTMENTS.includes(team)) {
      setError("Choose your team.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/set-team", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save team.");
        return;
      }
      finish?.(data.user || sessionUser);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  function applyCodeDigits(raw, startIndex = 0) {
    const chars = String(raw || "").replace(/\D/g, "").slice(0, 6 - startIndex);
    if (!chars) return;
    setDigits((prev) => {
      const next = [...prev];
      for (let j = 0; j < chars.length; j += 1) next[startIndex + j] = chars[j];
      return next;
    });
    const focusAt = Math.min(5, startIndex + chars.length - (chars.length < 6 - startIndex ? 0 : 1));
    window.setTimeout(() => inputs.current[focusAt]?.focus(), 0);
  }

  function onDigit(i, value) {
    const digitsOnly = String(value || "").replace(/\D/g, "");
    if (digitsOnly.length > 1) {
      applyCodeDigits(digitsOnly, i);
      return;
    }
    const v = digitsOnly.slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    if (v && i < 5) inputs.current[i + 1]?.focus();
  }

  function onDigitPaste(i, e) {
    const text = e.clipboardData?.getData("text") || "";
    const digitsOnly = text.replace(/\D/g, "");
    if (!digitsOnly) return;
    e.preventDefault();
    applyCodeDigits(digitsOnly.length >= 6 ? digitsOnly.slice(0, 6) : digitsOnly, digitsOnly.length >= 6 ? 0 : i);
  }

  function onDigitKey(i, e) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
    if (e.key === "Enter") verify();
  }

  return (
    <main className="login-screen">
      <style>{LOGIN_CSS}</style>
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "email") requestCode();
          else if (step === "code") verify();
          else saveTeam();
        }}
      >
        <p className="login-kicker">NPD SCREENING · CAVINKARE</p>
        <h1>Sign in to 6 Filter Test</h1>
        <p className="login-lede">
          {step === "team"
            ? "Choose your team once. Only an admin can change it later."
            : "We will send a one-time code to your CavinKare Slack."}
        </p>

        {step === "email" ? (
          <label className="login-field">
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@cavinkare.com"
              required
              disabled={busy}
            />
          </label>
        ) : null}

        {step === "code" ? (
          <>
            <p className="login-info" role="status">
              {info || SAME_HINT}
            </p>
            <p className="login-email-line mono">{email}</p>
            <div className="login-code-row" role="group" aria-label="Six-digit code">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  className="login-digit"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={i === 0 ? 6 : 1}
                  value={d}
                  onChange={(e) => onDigit(i, e.target.value)}
                  onPaste={(e) => onDigitPaste(i, e)}
                  onKeyDown={(e) => onDigitKey(i, e)}
                  disabled={busy}
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>
          </>
        ) : null}

        {step === "team" ? (
          <label className="login-field">
            Your team
            <select value={team} onChange={(e) => setTeam(e.target.value)} disabled={busy} required>
              <option value="">— select team —</option>
              {SUBMITTER_DEPARTMENTS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? (
          <p className="login-err" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : null}
          {step === "email" ? "Send code" : step === "code" ? "Sign in" : "Continue"}
        </button>

        {step === "code" ? (
          <button
            type="button"
            className="login-link"
            disabled={busy || resendIn > 0}
            onClick={() => requestCode()}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend"}
          </button>
        ) : null}
      </form>
    </main>
  );
}

const LOGIN_CSS = `
.login-screen{
  min-height:100vh;display:grid;place-items:center;padding:24px;
  background:radial-gradient(900px 500px at 20% -10%,#2a1840 0%,#120818 55%);
  font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#f3eaf8;
}
.login-card{
  width:min(420px,100%);background:#1a1024;border:1px solid rgba(243,234,248,.12);
  border-radius:18px;padding:28px 26px 24px;display:flex;flex-direction:column;gap:12px;
}
.login-kicker{margin:0;font-size:11px;letter-spacing:.12em;color:#b9a6c9;text-transform:uppercase;}
.login-card h1{margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:#fff;}
.login-lede{margin:0;font-size:13.5px;line-height:1.45;color:#a89bb8;}
.login-field{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#c6b8d4;}
.login-field input,.login-field select{
  background:#120818;border:1px solid rgba(243,234,248,.18);border-radius:10px;
  color:#f3eaf8;padding:11px 12px;font:inherit;
}
.login-info{margin:0;font-size:13px;color:#d7c6ea;}
.login-email-line{margin:0;font-size:12px;color:#9a8aad;}
.login-code-row{display:flex;gap:8px;justify-content:space-between;}
.login-digit{
  width:44px;height:48px;text-align:center;font-size:20px;font-family:'IBM Plex Mono',monospace;
  background:#120818;border:1px solid rgba(243,234,248,.22);border-radius:10px;color:#fff;
}
.login-err{margin:0;color:#f0a090;font-size:13px;}
.login-submit{
  margin-top:4px;display:inline-flex;align-items:center;justify-content:center;gap:8px;
  background:#d4c0ef;color:#1a1024;border:0;border-radius:12px;padding:12px 14px;
  font-weight:700;cursor:pointer;font:inherit;
}
.login-submit:disabled{opacity:.65;cursor:default;}
.login-link{
  background:none;border:0;color:#c9b6e0;text-decoration:underline;cursor:pointer;
  font:inherit;font-size:13px;padding:4px;
}
.login-link:disabled{opacity:.5;cursor:default;text-decoration:none;}
.spin{animation:login-spin 0.8s linear infinite;}
@keyframes login-spin{to{transform:rotate(360deg);}}
.mono{font-family:'IBM Plex Mono',monospace;}
`;
