"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const supabase = createBrowserClient(supabaseUrl!, supabaseAnonKey!);

  useEffect(() => {
    // Ensure the user actually arrived via a recovery link link
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setError("Invalid or expired password reset link.");
      }
    });
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      setError("Password must be 8+ characters with upper/lowercase letters and a number.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push("/"); // Send them back to your main page to log in
      }, 3000);
    }
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 20 }}>
      <div style={{ maxWidth: 400, width: "100%", background: "#fff", padding: 24, borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
        <h2 style={{ marginBottom: 8 }}>Set New Password</h2>
        <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>Enter your new secure password below.</p>

        {error && <div style={{ color: "red", marginBottom: 12, fontSize: 14 }}>{error}</div>}
        {success && <div style={{ color: "green", marginBottom: 12, fontSize: 14 }}>Password updated successfully! Redirecting...</div>}

        <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            New Password
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••" 
              required 
              style={{ padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            Confirm New Password
            <input 
              type="password" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              placeholder="••••••••" 
              required 
              style={{ padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </label>

          <button 
            type="submit" 
            disabled={loading || success} 
            style={{ padding: 10, background: "#6366f1", color: "white", border: "none", borderRadius: 4, cursor: "pointer", marginTop: 8 }}
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}p