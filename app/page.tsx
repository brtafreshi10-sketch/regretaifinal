"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import ResultCard from "@/components/ResultCard";
import TextInput from "@/components/TextInput";

type SupabaseClient = ReturnType<typeof createBrowserClient>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
} else {
  // eslint-disable-next-line no-console
  console.error(
    "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your deployment environment."
  );
}

type Result = {
  id: string;
  title: string;
  immediate: string;
  one_month: string;
  one_year: string;
  regret_score: number;
  advice: string;
  category: "money" | "relationships" | "school" | "health" | "other";
  note?: string;
  createdAt?: string;
};

const CATEGORY_LABELS: Record<Result["category"] | "all", string> = {
  all: "All",
  money: "Money",
  relationships: "Relationships",
  school: "School",
  health: "Health",
  other: "Other",
};

const FREE_DAILY_LIMIT = 5;

const BLOCKED_PATTERNS = [
  /\b(kill|murder|shoot|stab|attack|harm|hurt|assault|beat up|destroy|blow up|bomb|poison|strangle|choke|suffocate|rape|abuse)\b/i,
  /\b(suicide|self.harm|cut myself|end my life|kill myself)\b/i,
  /\b(weapon|gun|knife|explosive|grenade)\b/i,
];

// Simple list of words that are purely conversational greetings or too short to be a decision
const GREETING_PATTERNS = /^\s*(hi|hello|hey|yo|sup|greetings|hola|good morning|good afternoon|good evening|test|testing|please|help)\b\s*$/i;

function checkViolentContent(input: string): boolean {
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(input));
}

const PLANS = [
  {
    name: "Basic",
    price: "$2/mo",
    description: "Great for occasional decision-making with essential AI forecasting.",
    features: ["10 saved decisions", "Standard AI requests", "Email support"],
  },
  {
    name: "Premium",
    price: "$5/mo",
    description: "Best value — unlimited analysis, extended history, and priority results.",
    features: ["50 saved decisions", "Priority AI requests", "Premium support"],
    recommended: true,
  },
  {
    name: "Pro",
    price: "$12/mo",
    description: "For power users who need maximum history, fastest responses, and full export tools.",
    features: ["Unlimited saved decisions", "Fastest AI priority", "Dedicated support", "CSV export of all history"],
  },
];

const PREMIUM_PLAN = PLANS[1];

const EXAMPLES = [
  "Should I accept a lower-paying job with better work-life balance?",
  "Is it smarter to invest my savings instead of buying a new car?",
  "Should I tell my friend how I really feel about our relationship?",
];

export default function Home() {
  const resultRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(false);
  const [error, setError] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authModal, setAuthModal] = useState<null | "login" | "signup" | "reset-password">(null);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [verificationStep, setVerificationStep] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [authOtp, setAuthOtp] = useState("");
  const [currentUserPaid, setCurrentUserPaid] = useState(false);
  const [billingModal, setBillingModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(PLANS[1]);
  const [paymentError, setPaymentError] = useState("");
  const [billingProcessing, setBillingProcessing] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | Result["category"]>("all");
  const [historySearch, setHistorySearch] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [note, setNote] = useState("");
  const [noteStatus, setNoteStatus] = useState("");
  const [dailyUsage, setDailyUsage] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(false);
  const [blockedWarning, setBlockedWarning] = useState(false);
  const [activeTab, setActiveTab] = useState<"analyze" | "history" | "plans" | "settings">("analyze");
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Theme init ──
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const htmlClass = document.documentElement.classList;
    const isDark = savedTheme === "dark" || (!savedTheme && prefersDark);
    setDark(isDark);
    htmlClass.toggle("dark", isDark);
    setHydrated(true);
  }, []);

  // ── Theme color meta tag ──
  useEffect(() => {
    try {
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f172a" : "#6366f1");
      document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute("content", dark ? "black-translucent" : "default");
    } catch {}
  }, [dark]);

  // ── Supabase auth listener ──
  useEffect(() => {
    if (!supabase) {
      console.error("Supabase client is not initialized. Check your environment variables.");
      return;
    }

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      const user = data.session?.user;
      if (user) {
        setCurrentUserId(user.id);
        setCurrentUserEmail(user.email ?? null);
        setCurrentUserName(user.user_metadata?.displayName ?? null);
        setCurrentUserPaid(Boolean(user.user_metadata?.isPaid));
        loadHistory(user.id);
        loadDailyUsage(user.id);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        const user = session?.user ?? null;
        setCurrentUserId(user?.id ?? null);
        setCurrentUserEmail(user?.email ?? null);
        setCurrentUserName(user?.user_metadata?.displayName ?? null);
        setCurrentUserPaid(Boolean(user?.user_metadata?.isPaid));
        
        if (_event === "PASSWORD_RECOVERY") {
          setIsRecoveringPassword(true);
          setAuthModal("reset-password");
          setVerificationStep(false);
        }

        if (user) {
          loadHistory(user.id);
          loadDailyUsage(user.id);
        } else {
          setHistory([]);
          setDailyUsage(0);
        }
      }
    );

    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js").catch(console.warn);
      } else {
        navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      }
    }

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (sessionId) verifyCheckout(sessionId);

    return () => { listener.subscription.unsubscribe(); };
  }, []);

  // ── Load history from Supabase ──
  async function loadHistory(userId: string) {
    if (!supabase) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("decisions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setHistory(
        (data ?? []).map((row: Record<string, any>) => ({
          id: row.id,
          title: row.title,
          immediate: row.immediate,
          one_month: row.one_month,
          one_year: row.one_year,
          regret_score: row.regret_score,
          advice: row.advice,
          category: row.category,
          note: row.note ?? undefined,
          createdAt: row.created_at,
        }))
      );
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  function getUsageKey(userId: string) {
    return `regret-daily-usage-${userId}`;
  }

  function loadDailyUsage(userId: string) {
    const key = getUsageKey(userId);
    const raw = localStorage.getItem(key);
    const today = new Date().toISOString().slice(0, 10);
    if (!raw) { setDailyUsage(0); return; }
    try {
      const parsed = JSON.parse(raw);
      setDailyUsage(parsed?.date === today && typeof parsed.count === "number" ? parsed.count : 0);
    } catch { setDailyUsage(0); }
  }

  function saveDailyUsage(userId: string, count: number) {
    localStorage.setItem(getUsageKey(userId), JSON.stringify({ date: new Date().toISOString().slice(0, 10), count }));
  }

  // ── Save a decision to Supabase ──
  async function saveHistory(item: Result) {
    if (!currentUserId || !supabase) return;
    const row = {
      id: item.id,
      user_id: currentUserId,
      title: item.title,
      immediate: item.immediate,
      one_month: item.one_month,
      one_year: item.one_year,
      regret_score: item.regret_score,
      advice: item.advice,
      category: item.category,
      note: item.note ?? null,
      created_at: item.createdAt ?? new Date().toISOString(),
    };
    const { error } = await supabase.from("decisions").upsert(row);
    if (error) console.error("Failed to save decision:", error);
    setHistory((prev) => [item, ...prev.filter((h) => h.id !== item.id)]);
  }

  // ── Delete a decision ──
  async function deleteItem(id: string) {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (result?.id === id) { setResult(null); setNote(""); setNoteStatus(""); }
    if (!supabase) return;
    await supabase.from("decisions").delete().eq("id", id);
  }

  // ── Clear all history ──
  async function clearHistory() {
    if (!currentUserId || !supabase) return;
    setHistory([]);
    await supabase.from("decisions").delete().eq("user_id", currentUserId);
  }

  // ── Analyze ──
  async function analyze(input?: string) {
    const value = input ?? text;
    const cleanValue = value.trim();

    if (!currentUserEmail) { setError("Please sign in to analyze decisions."); return; }
    if (!cleanValue) { setError("Please describe a decision before analyzing."); return; }
    
    // Check if prompt is a conversational placeholder (e.g. "hi", "hello") or way too vague to evaluate
    if (GREETING_PATTERNS.test(cleanValue) || cleanValue.length < 8) {
      setError("This choice cannot be forecasted. Please write a specific scenario or a question (e.g., 'Should I take option A or option B?').");
      setResult(null);
      return;
    }

    if (!currentUserPaid && dailyUsage >= FREE_DAILY_LIMIT) {
      setError("Your free daily limit is reached. Upgrade to Premium for unlimited analysis.");
      return;
    }
    if (checkViolentContent(cleanValue)) { setBlockedWarning(true); return; }

    setError(""); setBlockedWarning(false); setLoading(true); setResult(null); setNote(""); setNoteStatus("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanValue }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error ?? "Unable to analyze your decision.");

      const withId: Result = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      setResult(withId);
      await saveHistory(withId);

      if (!currentUserPaid && currentUserId) {
        const next = dailyUsage + 1;
        setDailyUsage(next);
        saveDailyUsage(currentUserId, next);
      }
      setText(value);
      setCopyStatus("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected analysis error.");
    } finally {
      setLoading(false);
    }
  }

  // ── Auth: Sign up ──
  async function signup() {
    setError("");
    if (!supabase) { setError("Authentication is not configured."); return; }
    const email = authEmail.trim().toLowerCase();
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return; }
    if (authName.trim().length < 2 || authName.trim().length > 30) { setError("Display name must be 2–30 characters."); return; }
    if (authPassword.length < 8 || !/[A-Z]/.test(authPassword) || !/[a-z]/.test(authPassword) || !/\d/.test(authPassword)) {
      setError("Password must be 8+ characters with upper/lowercase letters and a number."); return;
    }
    if (authPassword !== authConfirmPassword) { setError("Passwords do not match."); return; }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password: authPassword,
      options: { 
        data: { 
          displayName: authName.trim(), 
          isPaid: false
        } 
      },
    });

    if (signUpError) { setError(signUpError.message ?? JSON.stringify(signUpError)); return; }
    
    if (data?.user && data.user.identities && data.user.identities.length === 0) {
      setError("An account with this email already exists. Please log in instead.");
      return;
    }

    setVerificationStep(true);
  }

  // ── Auth: Verify Email OTP ──
  async function verifyEmailOtp() {
    setError("");
    if (!supabase) { setError("Authentication is not configured."); return; }
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: authEmail.trim().toLowerCase(),
      token: authOtp.trim(),
      type: "signup",
    });
    if (verifyError) { setError(verifyError.message); return; }
    setAuthModal(null);
    setVerificationStep(false);
    setAuthEmail(""); setAuthPassword(""); setAuthName(""); setAuthConfirmPassword(""); setAuthOtp("");
  }

  // ── Auth: Log in ──
  async function login() {
    setError("");
    if (!supabase) { setError("Authentication is not configured."); return; }
    const email = authEmail.trim().toLowerCase();
    if (!email) { setError("Please enter your email."); return; }
    if (!authPassword) { setError("Please enter your password."); return; }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: authPassword });
    if (signInError) {
      setError(signInError.message === "Invalid login credentials"
        ? "Incorrect email or password."
        : signInError.message);
      return;
    }
    setAuthModal(null);
    setAuthEmail(""); setAuthPassword(""); setAuthName(""); setAuthConfirmPassword("");
  }

  // ── Auth: Log out ──
  async function logout() {
    if (supabase) await supabase.auth.signOut();
    setProfileMenuOpen(false);
    setResult(null);
    setNote("");
  }

  // ── Auth: Reset password ──
  async function sendResetEmail() {
    setError("");
    if (!supabase) { setError("Authentication is not configured."); return; }
    const email = authEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return; }
    
    const cleanOrigin = window.location.origin.replace(/\/$/, "");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${cleanOrigin}/`,
    });
    if (resetError) { setError(resetError.message); return; }
    setResetEmailSent(true);
  }

  // ── Auth: Execute Final Password Update ──
  async function handleFinalPasswordReset() {
    setError("");
    if (!supabase) return;
    if (authPassword.length < 8 || !/[A-Z]/.test(authPassword) || !/[a-z]/.test(authPassword) || !/\d/.test(authPassword)) {
      setError("Password must be 8+ characters with upper/lowercase letters and a number."); return;
    }
    if (authPassword !== authConfirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: authPassword,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setIsRecoveringPassword(false);
      setResetEmailSent(false);
      setAuthModal(null);
      setAuthPassword("");
      setAuthConfirmPassword("");
      setError("");
      alert("Password updated successfully! Welcome back.");
    }
  }

  // ── Billing ──
  function openBillingModal() { setBillingModal(true); setPaymentError(""); setCheckoutMessage(null); }
  function closeBillingModal() { setBillingModal(false); setPaymentError(""); setBillingProcessing(false); }

  async function startCheckout() {
    if (!currentUserEmail) { setPaymentError("Please sign in before upgrading."); return; }
    setPaymentError(""); setBillingProcessing(true);
    try {
      const response = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: currentUserEmail,
          successUrl: `${window.location.origin}/?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: window.location.origin,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to start checkout.");
      if (!data.url) throw new Error("Stripe checkout session failed to create.");
      window.location.href = data.url;
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Unable to start payment.");
    } finally {
      setBillingProcessing(false);
    }
  }

  async function verifyCheckout(sessionId: string) {
    if (!supabase) return;
    try {
      const response = await fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`);
      const data = await response.json();
      if (!response.ok || !data.success) { setPaymentError(data?.error || "Unable to verify payment session."); return; }

      await supabase.auth.updateUser({ data: { isPaid: true, subscriptionDate: new Date().toISOString() } });
      setCurrentUserPaid(true);
      setCheckoutMessage("Your Premium subscription is now active.");
      window.history.replaceState({}, "", window.location.pathname);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Unable to verify checkout.");
    }
  }

  // ── Misc helpers ──
  function handleHistorySelect(item: Result) {
    setResult(item); setText(item.title); setNote(item.note ?? ""); setCopyStatus(""); setNoteStatus("");
    setActiveTab("analyze");
  }

  async function saveNote() {
    if (!result) return;
    const updated = { ...result, note: note.trim() };
    setResult(updated);
    await saveHistory(updated);
    setNoteStatus("Note saved.");
  }

  function downloadAnalysis() {
    if (!result) return;
    const payload = `RegretAI Decision Report\n\nTitle: ${result.title}\nCategory: ${CATEGORY_LABELS[result.category]}\nRegret: ${result.regret_score}%\n\nNow:\n${result.immediate}\n\n1 Month:\n${result.one_month}\n\n1 Year:\n${result.one_year}\n\nAdvice:\n${result.advice}\n\nNote:\n${result.note ?? "(none)"}\n`;
    const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `regret-report-${result.id}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  function clearInput() { setText(""); setError(""); }

  function formatDate(value?: string) {
    if (!value) return "";
    return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  async function copyAnalysis() {
    if (!result) return;
    const summary = `RegretAI analysis for: ${result.title}\nNow: ${result.immediate}\n1 Month: ${result.one_month}\n1 Year: ${result.one_year}\nAdvice: ${result.advice}`;
    try { await navigator.clipboard.writeText(summary); setCopyStatus("Copied!"); }
    catch { setCopyStatus("Unable to copy on this browser."); }
  }

  function shareAnalysis() {
    if (!result) return;
    const summary = `RegretAI analysis for: ${result.title}\nNow: ${result.immediate}\n1 Month: ${result.one_month}\n1 Year: ${result.one_year}\nAdvice: ${result.advice}`;
    if (navigator.share) { navigator.share({ title: `RegretAI: ${result.title}`, text: summary }); }
    else { setCopyStatus("Share not supported in this browser."); }
  }

  const filteredHistory = useMemo(() => history.filter((item) => {
    const matchCategory = categoryFilter === "all" || item.category === categoryFilter;
    const matchSearch = !historySearch.trim() || item.title.toLowerCase().includes(historySearch.trim().toLowerCase());
    return matchCategory && matchSearch;
  }), [categoryFilter, history, historySearch]);

  const stats = useMemo(() => {
    const total = history.length;
    const average = total ? Math.round(history.reduce((s, i) => s + i.regret_score, 0) / total) : 0;
    return { total, average, latest: history[0]?.createdAt };
  }, [history]);

  return (
    <div className={`page ${dark ? "dark" : ""}`}>
      <div className="center">

        {/* ── Disclaimer ── */}
        {!disclaimerDismissed && (
          <div className="disclaimerBanner" role="alert">
            <div className="disclaimerContent">
              <span className="disclaimerIcon" aria-hidden="true">⚠️</span>
              <div>
                <strong>For informational purposes only.</strong> RegretAI uses AI to simulate how decisions might feel over time. It is not a substitute for professional advice. Do not use for crisis situations — contact emergency services instead.
              </div>
            </div>
            <button className="disclaimerDismiss" onClick={() => setDisclaimerDismissed(true)}>Got it</button>
          </div>
        )}

        {/* ── Header ── */}
        <header className="topbar">
          <div>
            <h1 className="title"><span className="titleEmoji" aria-hidden="true">💀</span>RegretAI</h1>
            <p className="subtitle">Simulate how a decision feels today, in one month, and in one year.</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
            {currentUserEmail ? (
              <>
                <button className="secondaryBtn" onClick={() => setProfileMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={profileMenuOpen}>
                  {currentUserName ? `Hi, ${currentUserName}` : currentUserEmail}{currentUserPaid ? " ★" : ""}
                </button>
                {profileMenuOpen && (
                  <div className="profileMenu" role="menu">
                    <div className="profileMenuHeader">{currentUserEmail}</div>
                    <div className="profileMenuStatus">
                      <span>{currentUserPaid ? "Premium member ★" : "Free account"}</span>
                      {!currentUserPaid && (
                        <button className="primaryBtn upgradeBtn" type="button" onClick={() => { setActiveTab("plans"); setProfileMenuOpen(false); }}>
                          Upgrade to Premium
                        </button>
                      )}
                    </div>
                    <div className="profileMenuDivider" />
                    <button className="profileMenuItem" type="button" onClick={logout}>Log out</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <button className="secondaryBtn" onClick={() => setAuthModal("login")}>Log in</button>
                <button className="primaryBtn" onClick={() => setAuthModal("signup")}>Sign up</button>
              </>
            )}
            <button className="settingsBtn" onClick={() => setActiveTab("settings")}>⚙️</button>
          </div>
        </header>

        {/* ── Tab nav ── */}
        <nav className="tabNav">
          <button className={`tabBtn ${activeTab === "analyze" ? "tabBtnActive" : ""}`} onClick={() => setActiveTab("analyze")}>
            🔮 Analyze
          </button>
          <button className={`tabBtn ${activeTab === "history" ? "tabBtnActive" : ""}`} onClick={() => setActiveTab("history")}>
            📋 History {history.length > 0 && <span className="tabBadge">{history.length}</span>}
          </button>
          <button className={`tabBtn ${activeTab === "plans" ? "tabBtnActive" : ""}`} onClick={() => setActiveTab("plans")}>
            ⭐ Plans
          </button>
          <button className={`tabBtn ${activeTab === "settings" ? "tabBtnActive" : ""}`} onClick={() => setActiveTab("settings")}>
            ⚙️ Settings
          </button>
        </nav>

        {/* ══════════════ ANALYZE TAB ══════════════ */}
        {activeTab === "analyze" && (
          <>
            {checkoutMessage && <section className="status success checkoutMessage" style={{ marginTop: 20 }}>{checkoutMessage}</section>}
            <div className="mainLayout analyzeLayout">
              {/* LEFT */}
              <div className="inputColumn">
                <section className="inputCard">
                  <div className="inputHeader">
                    <div>
                      <h2 className="sectionTitle">Describe your decision</h2>
                      <p className="sectionDescription">Write your choice clearly and get a fast regret forecast plus actionable advice.</p>
                    </div>
                    <span className="counter">{text.length}/300</span>
                  </div>
                  <TextInput
                    placeholder="Example: Should I quit my job and try freelancing?"
                    value={text} setValue={setText} maxLength={300} rows={6}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); analyze(); } }}
                  />
                  <div className="row actionRow">
                    <button className="primaryBtn" disabled={!text.trim() || loading || !currentUserEmail} onClick={() => analyze()}>
                      {loading ? "Analyzing..." : "Analyze decision"}
                    </button>
                    <button className="secondaryBtn" type="button" onClick={clearInput}>Clear</button>
                    
                    {result && (
                      <button 
                        className="secondaryBtn jumpBtn" 
                        type="button" 
                        onClick={() => resultRef.current?.scrollIntoView({ behavior: "smooth" })}
                      >
                        View Regret Score 👇
                      </button>
                    )}
                  </div>
                  <div className="buttonGroup">
                    {EXAMPLES.map((example) => (
                      <button key={example} type="button" className="chip" onClick={() => analyze(example)} disabled={!currentUserEmail}>{example}</button>
                    ))}
                  </div>
                  {!currentUserEmail ? (
                    <div className="status warning">Sign in to access free daily analysis and saved history.</div>
                  ) : !currentUserPaid ? (
                    <div className="status warning">
                      Free users get {dailyUsage}/{FREE_DAILY_LIMIT} analyses today.{" "}
                      <button className="linkButton" type="button" onClick={() => setActiveTab("plans")}>Upgrade to Premium</button>
                    </div>
                  ) : null}
                  {blockedWarning && (
                    <div className="status error" role="alert">
                      <strong>🚫 This request can't be analyzed.</strong> RegretAI is for everyday life decisions — not requests involving violence or self-harm. If you're in crisis, contact the <a href="https://988lifeline.org" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>988 Suicide &amp; Crisis Lifeline</a>.
                    </div>
                  )}
                  {error && !blockedWarning && <div className="status error">{error}</div>}
                </section>
                <section className="tipsCard">
                  <h3 className="sectionTitle">💡 Tips for a clearer analysis</h3>
                  <ul className="tipsList">
                    <li><strong>Be specific about the trade-off.</strong> Instead of "Should I move?", try "Should I move from Dallas to Austin for a $15k raise but leave my support network?"</li>
                    <li><strong>Include your time horizon.</strong> Mention whether this is urgent or long-term.</li>
                    <li><strong>Name what you value.</strong> Add context like "stability matters more to me than income."</li>
                    <li><strong>State the alternative.</strong> Every decision has an option B — include it.</li>
                  </ul>
                </section>
              </div>

              {/* RIGHT */}
              <div className="resultColumn" ref={resultRef}>
                {result ? (
                  <section className="resultSection">
                    <div className="resultActions">
                      <button className="primaryBtn" onClick={copyAnalysis}>Copy</button>
                      <button className="secondaryBtn" type="button" onClick={downloadAnalysis}>Download</button>
                      <button className="secondaryBtn" type="button" onClick={shareAnalysis}>Share</button>
                      <button className="secondaryBtn" type="button" onClick={() => analyze(result.title)}>Re-run</button>
                    </div>
                    {copyStatus && <div className="status success">{copyStatus}</div>}
                    <div className="noteSection">
                      <h3 className="sectionTitle">Personal note</h3>
                      <TextInput className="noteTextarea" placeholder="Write a follow-up thought or reminder." value={note} setValue={setNote} rows={3} />
                      <div className="row actionRow">
                        <button className="primaryBtn" disabled={!result} onClick={saveNote}>Save note</button>
                        {noteStatus && <span className="status success">{noteStatus}</span>}
                      </div>
                    </div>
                    <ResultCard data={result} />
                  </section>
                ) : (
                  <div className="resultPlaceholder">
                    <div className="resultPlaceholderInner">
                      <span className="resultPlaceholderIcon">{loading ? "⏳" : "🔮"}</span>
                      <p>{loading ? "Analyzing your decision…" : "Your regret forecast will appear here after you analyze a decision."}</p>
                      {!loading && (
                        <button className="secondaryBtn" disabled={!text.trim() || !currentUserEmail} onClick={() => analyze()}>Analyze now</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ══════════════ HISTORY TAB ══════════════ */}
        {activeTab === "history" && (
          <div className="tabContent">
            <section className="statsGrid">
              <article className="statCard">
                <span className="statLabel">Decisions tracked</span>
                <strong>{hydrated ? stats.total : 0}</strong>
              </article>
              <article className="statCard">
                <span className="statLabel">Average regret</span>
                <strong>{hydrated ? `${stats.average}%` : "0%"}</strong>
              </article>
              <article className="statCard">
                <span className="statLabel">Most recent</span>
                <strong>{hydrated ? (stats.latest ? formatDate(stats.latest) : "None yet") : "Loading…"}</strong>
              </article>
            </section>
            <section className="historyPanel">
              <div className="historyHeader">
                <div>
                  <h3>Recent decisions</h3>
                  <p className="historyMeta">Filter, search, and reopen any saved analysis.</p>
                </div>
                <button className="secondaryBtn" type="button" onClick={clearHistory} disabled={history.length === 0}>🗑️ Clear all</button>
              </div>
              <div className="filterRow">
                <div className="buttonGroup">
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <button key={key} type="button" className={`pill ${categoryFilter === key ? "active" : ""}`} onClick={() => setCategoryFilter(key as typeof categoryFilter)}>{label}</button>
                  ))}
                </div>
                <input type="search" className="searchInput" placeholder="Search history..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
              </div>
              <div className="historyList">
                {historyLoading ? (
                  <div className="emptyState">Loading your decisions…</div>
                ) : filteredHistory.length === 0 ? (
                  <div className="emptyState">{currentUserEmail ? "No saved decisions match your filters." : "Sign in to see your saved decisions."}</div>
                ) : (
                  filteredHistory.map((item) => (
                    <div key={item.id} className="historyItem">
                      <button type="button" className="historyLink" onClick={() => handleHistorySelect(item)}>
                        <div>
                          <strong>{item.title}</strong>
                          <div className="historyMeta">{CATEGORY_LABELS[item.category]} · {formatDate(item.createdAt)}</div>
                        </div>
                      </button>
                      <button type="button" className="deleteBtn" aria-label={`Delete ${item.title}`} onClick={() => deleteItem(item.id)}>✕</button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {/* ══════════════ PLANS TAB ══════════════ */}
        {activeTab === "plans" && (
          <div className="tabContent">
            {checkoutMessage && <section className="status success checkoutMessage" style={{ marginBottom: 20 }}>{checkoutMessage}</section>}
            {currentUserEmail && currentUserPaid ? (
              <section className="billingPromoCard premiumActive">
                <h3>Premium account active ★</h3>
                <p>You have full access to analysis and extended history. Thank you for subscribing.</p>
                <div className="billingPlanSummary">
                  <strong>{PREMIUM_PLAN.price}</strong>
                  <span>{PREMIUM_PLAN.description}</span>
                </div>
              </section>
            ) : (
              <section className="billingPromoCard">
                <h3>Choose Your Plan</h3>
                <p style={{ color: "var(--text-muted)", margin: "8px 0 4px" }}>Unlock unlimited analysis, extended history, and priority results. Cancel anytime.</p>
                <div className="planGrid">
                  {PLANS.map((plan) => (
                    <div
                      key={plan.name}
                      className={`planCard ${selectedPlan.name === plan.name ? "planCardSelected" : ""} ${plan.recommended ? "planCardRecommended" : ""}`}
                      onClick={() => setSelectedPlan(plan)} role="button" tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && setSelectedPlan(plan)}
                    >
                      {plan.recommended && <div className="planBadge">Most Popular</div>}
                      <strong className="planName">{plan.name}</strong>
                      <div className="planPrice">{plan.price}</div>
                      <p className="planDesc">{plan.description}</p>
                      <ul className="billingFeatures">{plan.features.map((f) => <li key={f}>{f}</li>)}</ul>
                    </div>
                  ))}
                </div>
                {!currentUserEmail && <div className="status warning" style={{ marginBottom: 12 }}>You need to be signed in to upgrade.</div>}
                <button className="primaryBtn" type="button" onClick={openBillingModal} disabled={!currentUserEmail} style={{ width: "100%", marginTop: 8 }}>
                  Continue with {selectedPlan.name} — {selectedPlan.price}
                </button>
              </section>
            )}
          </div>
        )}

        {/* ══════════════ SETTINGS TAB ══════════════ */}
        {activeTab === "settings" && (
          <div className="tabContent">
            <section className="inputCard">
              <h2 className="sectionTitle">Settings</h2>
              <div className="settingsGroup">
                <div className="settingsRow">
                  <div>
                    <strong>Theme</strong>
                    <p className="sectionDescription">Switch between light and dark mode.</p>
                  </div>
                  <button className="secondaryBtn" onClick={toggleTheme}>{dark ? "☀️ Switch to Light" : "🌙 Switch to Dark"}</button>
                </div>
              </div>
              <div className="settingsGroup">
                <h3 className="settingsGroupLabel">Account</h3>
                {currentUserEmail ? (
                  <>
                    <div className="settingsRow">
                      <div>
                        <strong>{currentUserName ?? currentUserEmail}</strong>
                        <p className="sectionDescription">{currentUserEmail} · {currentUserPaid ? "Premium ★" : "Free account"}</p>
                      </div>
                      <button className="secondaryBtn" onClick={logout}>Log out</button>
                    </div>
                    {!currentUserPaid && (
                      <div className="settingsRow">
                        <div>
                          <strong>Upgrade to Premium</strong>
                          <p className="sectionDescription">Unlock unlimited analyses, extended history, and more.</p>
                        </div>
                        <button className="primaryBtn" onClick={() => setActiveTab("plans")}>View Plans</button>
                      </div>
                    )}
                    <div className="settingsRow">
                      <div>
                        <strong>Daily usage</strong>
                        <p className="sectionDescription">{currentUserPaid ? "Unlimited analyses" : `${dailyUsage} of ${FREE_DAILY_LIMIT} free analyses used today`}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="settingsRow">
                    <div>
                      <strong>Not signed in</strong>
                      <p className="sectionDescription">Sign in to save history and access analysis.</p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="secondaryBtn" onClick={() => setAuthModal("login")}>Log in</button>
                      <button className="primaryBtn" onClick={() => setAuthModal("signup")}>Sign up</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="settingsGroup">
                <h3 className="settingsGroupLabel">Data</h3>
                <div className="settingsRow">
                  <div>
                    <strong>Decision history</strong>
                    <p className="sectionDescription">{history.length} saved {history.length === 1 ? "decision" : "decisions"} stored in the cloud.</p>
                  </div>
                  <button className="secondaryBtn" onClick={clearHistory} disabled={history.length === 0}>🗑️ Clear all</button>
                </div>
              </div>
              <div className="settingsGroup">
                <h3 className="settingsGroupLabel">About</h3>
                <div className="settingsRow">
                  <div>
                    <strong>RegretAI</strong>
                    <p className="sectionDescription">Simulate how a decision feels today, in one month, and in one year. For informational purposes only — not a substitute for professional advice.</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ── ════════════ AUTH MODAL ══════════════ */}
        {authModal && (
          <div className="authOverlay" role="dialog" aria-modal="true">
            <div className="authModal">
              {verificationStep ? (
                <>
                  <h3>Verify your email</h3>
                  <p className="authHint">Enter the 6-digit verification code sent to <strong>{authEmail}</strong>.</p>
                  <label>Verification code<input value={authOtp} onChange={(e) => setAuthOtp(e.target.value)} type="text" placeholder="123456" maxLength={6} /></label>
                  {error && <div className="status error" role="alert">{error}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="primaryBtn" onClick={verifyEmailOtp}>Verify code</button>
                    <button className="secondaryBtn" onClick={() => { setVerificationStep(false); setAuthOtp(""); setError(""); }}>Back</button>
                  </div>
                </>
              ) : authModal === "reset-password" ? (
                <>
                  <h3>Reset password</h3>
                  {isRecoveringPassword ? (
                    <>
                      <div className="authFormFields">
                        <p className="authHint" style={{ marginBottom: 12 }}>A recovery session is active. Please type your chosen new password below.</p>
                        <label>New Password<input value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} type="password" placeholder="••••••••" /></label>
                        <label>Confirm New Password<input value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)} type="password" placeholder="••••••••" /></label>
                      </div>
                      {error && <div className="status error" role="alert">{error}</div>}
                      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
                        <button className="primaryBtn" style={{ flex: 1 }} onClick={handleFinalPasswordReset} disabled={loading}>
                          {loading ? "Updating..." : "Update Password"}
                        </button>
                        <button className="secondaryBtn" onClick={() => { setIsRecoveringPassword(false); setAuthModal(null); setError(""); }}>Cancel</button>
                      </div>
                    </>
                  ) : resetEmailSent ? (
                    <>
                      <p className="authHint">A password reset link was sent to <strong>{authEmail}</strong>. Check your inbox.</p>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="primaryBtn" onClick={() => { setResetEmailSent(false); setAuthModal("login"); }}>Back to login</button>
                        <button className="secondaryBtn" onClick={() => { setResetEmailSent(false); setAuthModal(null); }}>Close</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="authHint">Enter your email and we'll send you a reset link.</p>
                      <label>Email<input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} type="email" placeholder="you@example.com" /></label>
                      {error && <div className="status error" role="alert">{error}</div>}
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="primaryBtn" onClick={sendResetEmail}>Send reset link</button>
                        <button className="secondaryBtn" onClick={() => { setAuthModal("login"); setError(""); }}>Back</button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <h3>{authModal === "signup" ? "Create an account" : "Log in"}</h3>
                  
                  <div className="authFormFields">
                    {authModal === "signup" && (
                      <label>Display name<input value={authName} onChange={(e) => setAuthName(e.target.value)} type="text" placeholder="Alex" /></label>
                    )}
                    <label>Email<input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} type="email" placeholder="you@example.com" /></label>
                    
                    <label>Password<input value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} type="password" placeholder="••••••••" /></label>
                    
                    {authModal === "signup" && (
                      <label>Confirm password<input value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)} type="password" placeholder="••••••••" /></label>
                    )}
                  </div>

                  {error && <div className="status error" role="alert">{error}</div>}
                  
                  <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
                    <button className="primaryBtn" style={{ flex: 1 }} onClick={() => authModal === "signup" ? signup() : login()}>
                      {authModal === "signup" ? "Sign up" : "Log in"}
                    </button>
                    <button className="secondaryBtn" onClick={() => { setAuthModal(null); setError(""); }}>Cancel</button>
                  </div>
                  
                  <div className="authLinksBox">
                    {authModal === "signup"
                      ? <p className="authHint">Password must be 8+ characters with upper/lowercase letters and a number.</p>
                      : (
                        <div className="authLinkGroup">
                          <span>No account? <button className="linkButton" onClick={() => { setAuthModal("signup"); setError(""); }}>Sign up</button></span>
                          <span>Forgot your password? <button className="linkButton" onClick={() => { setAuthModal("reset-password"); setError(""); }}>Reset it</button></span>
                        </div>
                      )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ BILLING MODAL ══════════════ */}
        {billingModal && (
          <div className="authOverlay" role="dialog" aria-modal="true">
            <div className="billingModal">
              <h3>Choose your plan</h3>
              <p className="billingDescription">Pick the plan that works best for you. Cancel anytime.</p>
              <div className="planGrid">
                {PLANS.map((plan) => (
                  <div
                    key={plan.name}
                    className={`planCard ${selectedPlan.name === plan.name ? "planCardSelected" : ""} ${plan.recommended ? "planCardRecommended" : ""}`}
                    onClick={() => setSelectedPlan(plan)} role="button" tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedPlan(plan)}
                  >
                    {plan.recommended && <div className="planBadge">Most Popular</div>}
                    <strong className="planName">{plan.name}</strong>
                    <div className="planPrice">{plan.price}</div>
                    <p className="planDesc">{plan.description}</p>
                    <ul className="billingFeatures">{plan.features.map((f) => <li key={f}>{f}</li>)}</ul>
                  </div>
                ))}
              </div>
              <p className="billingNotice">You will be redirected to Stripe Checkout to complete your purchase securely.</p>
              {paymentError && <div className="status error">{paymentError}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="primaryBtn" type="button" onClick={startCheckout} disabled={billingProcessing}>
                  {billingProcessing ? "Starting checkout..." : `Start ${selectedPlan.name} — ${selectedPlan.price}`}
                </button>
                <button className="secondaryBtn" type="button" onClick={closeBillingModal} disabled={billingProcessing}>Cancel</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}