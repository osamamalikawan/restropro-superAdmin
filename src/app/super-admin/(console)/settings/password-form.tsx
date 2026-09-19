"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit() {
    setError("");
    setSuccess(false);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    setPassword("");
    setConfirm("");
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5 max-w-md">
      <h2 className="font-display text-lg font-semibold mb-4">Change password</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm"
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-crimson-500 text-xs">{error}</p>}
        {success && <p className="text-basil-500 text-xs">Password updated.</p>}
        <button onClick={submit} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
          {saving ? "Saving…" : "Update password"}
        </button>
      </div>
    </div>
  );
}
