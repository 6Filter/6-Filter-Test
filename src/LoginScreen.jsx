import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const registering = mode === "register";

  async function submit(e) {
    e.preventDefault();
    if (registering && !name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(registering ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          registering
            ? { name: name.trim(), email: email.trim(), password }
            : { email: email.trim(), password }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || (registering ? "Could not create account." : "Could not sign in."));
      if (!data.user) throw new Error(registering ? "Could not create account." : "Could not sign in.");
      onLogin(data.user);
    } catch (err) {
      setError(err.message || (registering ? "Could not create account." : "Could not sign in."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="primus screen-spec login-screen">
      <main className="login-card">
        <p className="login-kicker">NPD screening · CavinKare</p>
        <h1>{registering ? "Create your Primus account" : "Sign in to Primus"}</h1>
        <p className="login-lede">
          {registering
            ? "Register with your work email. After sign-in you pick your team on the idea form — CIA, Sales and Distribution - PPD, and the other departments."
            : "Use the email and password you registered with. Your team on each idea is chosen on the form after you sign in."}
        </p>
        <form onSubmit={submit}>
          {registering ? (
            <label className="login-label">
              Your name
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                placeholder="As it should appear on the Log"
              />
            </label>
          ) : null}
          <label className="login-label">
            Email (username)
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              placeholder="you@cavinkare.com"
            />
          </label>
          <label className="login-label">
            Password
            <input
              type="password"
              autoComplete={registering ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              placeholder={registering ? "At least 8 characters" : ""}
            />
          </label>
          {error ? (
            <div className="login-err">
              <AlertTriangle size={14} /> {error}
            </div>
          ) : null}
          <button type="submit" className="login-submit" disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : null}
            {busy
              ? registering
                ? "Creating account…"
                : "Signing in…"
              : registering
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        <p className="login-switch">
          {registering ? (
            <>
              Already registered?{" "}
              <button
                type="button"
                className="login-link"
                disabled={busy}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button
                type="button"
                className="login-link"
                disabled={busy}
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                Create an account
              </button>
            </>
          )}
        </p>
      </main>
      <style>{LOGIN_CSS}</style>
    </div>
  );
}

const LOGIN_CSS = `
.login-screen{min-height:100vh;display:grid;place-items:center;padding:32px 16px;background:#170C25;color:#F3EAF8;}
.login-card{width:100%;max-width:420px;background:#191919;border:1px solid rgba(243,234,248,.12);border-radius:18px;padding:28px 26px 24px;}
.login-kicker{margin:0 0 8px;font-family:var(--fm);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#C9A0E8;}
.login-card h1{margin:0 0 10px;font-size:28px;letter-spacing:-.4px;}
.login-lede{margin:0 0 22px;font-size:14px;line-height:1.5;color:rgba(243,234,248,.62);}
.login-label{display:flex;flex-direction:column;gap:6px;margin:0 0 14px;font-size:12px;letter-spacing:.04em;color:rgba(243,234,248,.82);font-family:var(--fm);}
.login-label input{background:#22113A;border:1px solid rgba(243,234,248,.14);border-radius:12px;color:#F3EAF8;font-size:15px;padding:11px 13px;outline:none;font-family:var(--fd);}
.login-label input:focus{border-color:#C9AEEF;box-shadow:0 0 0 3px rgba(201,174,239,.18);}
.login-err{display:flex;align-items:center;gap:8px;margin:0 0 14px;color:#E2716B;font-size:13px;}
.login-submit{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#C9AEEF;color:#170C25;border:none;border-radius:999px;padding:12px 18px;font-weight:700;font-size:15px;cursor:pointer;font-family:var(--fd);}
.login-submit:disabled{opacity:.7;cursor:wait;}
.login-switch{margin:16px 0 0;font-size:13px;color:rgba(243,234,248,.55);text-align:center;}
.login-link{background:none;border:none;padding:0;color:#C9AEEF;font:inherit;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:3px;}
.login-link:disabled{opacity:.6;cursor:wait;}
`;
