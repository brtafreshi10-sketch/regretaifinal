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
  originalInput?: string;
  actualRegret?: number;
  checkinAt?: string;
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
const STREAK_MILESTONE = 7; 
const STREAK_BONUS_ANALYSES = 1; 
const CHECKIN_ELIGIBLE_DAYS = 30; 

const BLOCKED_PATTERNS = [
  /\b(murder|shoot someone|stab someone|attack someone|harm (him|her|them|myself)|hurt (him|her|them|myself)|assault|beat (him|her|them) up|blow up|bomb|poison (him|her|them)|strangle|choke (him|her|them)|suffocate|rape|sexually abuse)\b/i,
  /\b(suicide|self.harm|cut myself|end my life|kill myself|kill (him|her|them))\b/i,
  /\b(buy a gun|get a weapon|use a knife on|build (a|an) (bomb|explosive))\b/i,
];

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

function RegretTrendChart({ points }: { points: Result[] }) {
  if (points.length < 2) {
    return (
      <div className="emptyState">Save a few more decisions to see your regret trend over time.</div>
    );
  }

  const width = 720;
  const height = 160;
  const padX = 16;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const xStep = points.length > 1 ? innerW / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = padX + i * xStep;
    const y = padY + innerH - (Math.max(0, Math.min(100, p.regret_score)) / 100) * innerH;
    return { x, y, point: p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(padY + innerH).toFixed(1)} L${coords[0].x.toFixed(1)},${(padY + innerH).toFixed(1)} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="trendChartSvg"
      role="img"
      aria-label="Line chart of regret score over time across saved decisions"
    >
      {[0, 25, 50, 75, 100].map((v) => {
        const y = padY + innerH - (v / 100) * innerH;
        return (
          <g key={v}>
            <line x1={padX} y1={y} x2={width - padX} y2={y} className="trendGridLine" />
            <text x={2} y={y + 3} className="trendAxisLabel">{v}</text>
          </g>
        );
      })}
      <path d={areaPath} className="trendArea" />
      <path d={linePath} className="trendLine" />
      {coords.map((c, i) => (
        <circle key={c.point.id ?? i} cx={c.x} cy={c.y} r={3.5} className="trendDot">
          <title>{`${c.point.title} — ${c.point.regret_score}%`}</title>
        </circle>
      ))}
    </svg>
  );
}

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
  const [streakCount, setStreakCount] = useState(0);
  const [lastAnalysisDate, setLastAnalysisDate] = useState<string | null>(null);
  const [streakBonusGrantedDate, setStreakBonusGrantedDate] = useState<string | null>(null);
  const [streakBonusActiveToday, setStreakBonusActiveToday] = useState(false);
  const [streakToast, setStreakToast] = useState<string | null>(null);
  const [checkinTarget, setCheckinTarget] = useState<Result | null>(null);
  const [checkinValue, setCheckinValue] = useState(50);
  const [checkinDismissedIds, setCheckinDismissedIds] = useState<string[]>([]);

  // ── Auto-Scroll Mechanics for responsive viewing ──
  useEffect(() => {
    if (loading && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading]);

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

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
        loadStreakFromMetadata(user.user_metadata);
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
          loadStreakFromMetadata(user.user_metadata);
          loadHistory(user.id);
          loadDailyUsage(user.id);
        } else {
          setHistory([]);
          setDailyUsage(0);
          setStreakCount(0);
          setLastAnalysisDate(null);
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
      const rows: Result[] = (data ?? []).map((row: Record<string, any>) => ({
        id: row.id,
        title: row.title,
        immediate: row.immediate,
        one_month: row.one_month,
        one_year: row.one_year,
        regret_score: typeof row.regret_score === "number" ? row.regret_score : 0,
        advice: row.advice,
        category: row.category,
        note: row.note ?? undefined,
        createdAt: row.created_at,
        originalInput: row.original_input ?? undefined,
        actualRegret: typeof row.actual_regret === "number" ? row.actual_regret : undefined,
        checkinAt: row.checkin_at ?? undefined,
      }));
      setHistory(rows);
      reconcileDailyUsage(userId, rows);
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

  function reconcileDailyUsage(userId: string, rows: Result[]) {
    const today = new Date().toISOString().slice(0, 10);
    const todaysCount = rows.filter((r) => (r.createdAt ?? "").slice(0, 10) === today).length;
    setDailyUsage((prev) => {
      const next = Math.max(prev, todaysCount);
      saveDailyUsage(userId, next);
      return next;
    });
  }

  // ── Streaks ──
  function loadStreakFromMetadata(metadata: Record<string, any> | undefined) {
    const count = typeof metadata?.streakCount === "number" ? metadata.streakCount : 0;
    const lastDate = typeof metadata?.lastAnalysisDate === "string" ? metadata.lastAnalysisDate : null;
    const bonusGrantedDate = typeof metadata?.streakBonusGrantedDate === "string" ? metadata.streakBonusGrantedDate : null;

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const isLapsed = lastDate !== null && lastDate !== today && lastDate !== yesterday;
    setStreakCount(isLapsed ? 0 : count);
    setLastAnalysisDate(lastDate);
    setStreakBonusGrantedDate(bonusGrantedDate);
    setStreakBonusActiveToday(bonusGrantedDate === today);
  }

  async function registerStreakProgress(userId: string): Promise<{ newStreak: number; bonusGranted: boolean }> {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (lastAnalysisDate === today) {
      return { newStreak: streakCount, bonusGranted: false };
    }

    const continuing = lastAnalysisDate === yesterday;
    const newStreak = continuing ? streakCount + 1 : 1;
    const earnsBonus = newStreak > 0 && newStreak % STREAK_MILESTONE === 0 && streakBonusGrantedDate !== today;

    setStreakCount(newStreak);
    setLastAnalysisDate(today);
    if (earnsBonus) {
      setStreakBonusGrantedDate(today);
      setStreakBonusActiveToday(true);
    }

    if (supabase) {
      await supabase.auth.updateUser({
        data: {
          streakCount: newStreak,
          lastAnalysisDate: today,
          ...(earnsBonus ? { streakBonusGrantedDate: today } : {}),
        },
      });
    }

    return { newStreak, bonusGranted: earnsBonus };
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
      original_input: item.originalInput ?? null,
      actual_regret: item.actualRegret ?? null,
      checkin_at: item.checkinAt ?? null,
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
    
    if (GREETING_PATTERNS.test(cleanValue) || cleanValue.length < 8) {
      setError("This choice cannot be forecasted. Please write a specific scenario or a question (e.g., 'Should I take option A or option B?').");
      setResult(null);
      return;
    }

    const effectiveLimit = FREE_DAILY_LIMIT + (streakBonusActiveToday ? STREAK_BONUS_ANALYSES : 0);
    if (!currentUserPaid && dailyUsage >= effectiveLimit) {
      setError(
        streakBonusActiveToday
          ? "You've used today's streak bonus too — that's the daily cap for free accounts. Upgrade to Premium for unlimited analysis."
          : "Your free daily limit is reached. Upgrade to Premium for unlimited analysis."
      );
      return;
    }
    if (checkViolentContent(cleanValue)) { setBlockedWarning(true); return; }

    setError(""); setBlockedWarning(false); setLoading(true); setResult(null); setNote(""); setNoteStatus("");

    // Dismiss active mobile software keyboards to optimize visible viewport estate
    try { (document.activeElement as HTMLElement)?.blur(); } catch {}

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanValue }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error ?? "Unable to analyze your decision.");

      const withId: Result = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), originalInput: cleanValue };
      setResult(withId);
      await saveHistory(withId);

      if (!currentUserPaid && currentUserId) {
        const next = dailyUsage + 1;
        setDailyUsage(next);
        saveDailyUsage(currentUserId, next);
      }

      if (currentUserId) {
        const { newStreak, bonusGranted } = await registerStreakProgress(currentUserId);
        if (bonusGranted) {
          setStreakToast(`🔥 ${newStreak}-day streak! You earned 1 bonus analysis for today.`);
        }
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

  // ── Auth Methods ──
  async function signup() {
    if (loading) return;
    setError("");
    if (!supabase) { setError("Authentication is not configured."); return; }
    const email = authEmail.trim().toLowerCase();
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return; }
    if (authName.trim().length < 2 || authName.trim().length > 30) { setError("Display name must be 2–30 characters."); return; }
    if (authPassword.length < 8 || !/[A-Z]/.test(authPassword) || !/[a-z]/.test(authPassword) || !/\d/.test(authPassword)) {
      setError("Password must be 8+ characters with upper/lowercase letters and a number."); return;
    }
    if (authPassword !== authConfirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
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
    setLoading(false);

    if (signUpError) { setError(signUpError.message ?? JSON.stringify(signUpError)); return; }
    if (data?.user && data.user.identities && data.user.identities.length === 0) {
      setError("An account with this email already exists. Please log in instead.");
      return;
    }
    setVerificationStep(true);
  }

  async function verifyEmailOtp() {
    if (loading) return;
    setError("");
    if (!supabase) { setError("Authentication is not configured."); return; }
    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: authEmail.trim().toLowerCase(),
      token: authOtp.trim(),
      type: "signup",
    });
    setLoading(false);
    if (verifyError) { setError(verifyError.message); return; }
    setAuthModal(null);
    setVerificationStep(false);
    setAuthEmail(""); setAuthPassword(""); setAuthName(""); setAuthConfirmPassword(""); setAuthOtp("");
  }

  async function login() {
    if (loading) return;
    setError("");
    if (!supabase) { setError("Authentication is not configured."); return; }
    const email = authEmail.trim().toLowerCase();
    if (!email) { setError("Please enter your email."); return; }
    if (!authPassword) { setError("Please enter your password."); return; }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: authPassword });
    setLoading(false);
    if (signInError) {
      setError(signInError.message === "Invalid login credentials" ? "Incorrect email or password." : signInError.message);
      return;
    }
    setAuthModal(null);
    setAuthEmail(""); setAuthPassword(""); setAuthName(""); setAuthConfirmPassword("");
  }

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    setProfileMenuOpen(false);
    setResult(null);
    setNote("");
  }

  async function sendResetEmail() {
    if (loading) return;
    setError("");
    if (!supabase) { setError("Authentication is not configured."); return; }
    const email = authEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return; }
    const cleanOrigin = window.location.origin.replace(/\/$/, "");

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
     redirectTo: `${cleanOrigin}/reset-password`,
    });
    setLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setResetEmailSent(true);
  }

  async function handleFinalPasswordReset() {
    setError("");
    if (!supabase) return;
    if (authPassword.length < 8 || !/[A-Z]/.test(authPassword) || !/[a-z]/.test(authPassword) || !/\d/.test(authPassword)) {
      setError("Password must be 8+ characters with upper/lowercase letters and a number."); return;
    }
    if (authPassword !== authConfirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: authPassword });
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

  // ── Misc Helpers ──
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

  function openCheckin(item: Result) {
    setCheckinTarget(item);
    setCheckinValue(item.regret_score);
  }

  function dismissCheckin(id: string) {
    setCheckinDismissedIds((prev) => [...prev, id]);
    setCheckinTarget(null);
  }

  async function submitCheckin() {
    if (!checkinTarget) return;
    const updated: Result = { ...checkinTarget, actualRegret: checkinValue, checkinAt: new Date().toISOString() };
    if (result?.id === updated.id) setResult(updated);
    await saveHistory(updated);
    setCheckinTarget(null);
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

  function csvEscape(value: string) {
    const needsQuotes = /[",\n]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  }

  function downloadHistoryCsv() {
    if (history.length === 0) return;
    const headers = ["Date", "Title", "Category", "Regret Score", "Immediate", "1 Month", "1 Year", "Advice", "Note"];
    const rows = history.map((item) => [
      item.createdAt ? new Date(item.createdAt).toISOString() : "",
      item.title,
      CATEGORY_LABELS[item.category],
      String(item.regret_score),
      item.immediate,
      item.one_month,
      item.one_year,
      item.advice,
      item.note ?? "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `regretai-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  // Helper template for clean SVG gear icon
  function SettingsIcon() {
    return (
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="svgSettingsGear"
        style={{ width: 18, height: 18 }}
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
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

  const trendPoints = useMemo(() => {
    const sorted = [...history]
      .filter((item) => typeof item.regret_score === "number" && item.createdAt)
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
    return sorted.slice(-30);
  }, [history]);

  const pendingCheckins = useMemo(() => {
    const cutoff = Date.now() - CHECKIN_ELIGIBLE_DAYS * 86400000;
    return history.filter((item) => {
      if (item.checkinAt) return false;
      if (checkinDismissedIds.includes(item.id)) return false;
      if (!item.createdAt) return false;
      return new Date(item.createdAt).getTime() <= cutoff;
    });
  }, [history, checkinDismissedIds]);

  const predictionAccuracy = useMemo(() => {
    const checkedIn = history.filter((item) => typeof item.actualRegret === "number");
    if (checkedIn.length < 3) return null;
    const avgDelta =
      checkedIn.reduce((sum, item) => sum + Math.abs(item.regret_score - (item.actualRegret as number)), 0) /
      checkedIn.length;
    return { count: checkedIn.length, avgDelta: Math.round(avgDelta) };
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
                <strong>Safety Disclaimer:</strong> RegretAI is an automated simulation tool designed for personal evaluation and reflection. It is not managed by professionals, does not provide clinical or legal counsel, and cannot evaluate crisis or self-harm situations. If you are experiencing an emergency or immediate distress, please stop using this tool and contact standard localized health services or crisis hotlines immediately.
              </div>
            </div>
            <button className="disclaimerDismiss" onClick={() => setDisclaimerDismissed(true)}>Got it</button>
          </div>
        )}

        {/* ── Header ── */}
        <header className="topbar">
          <div>
            <h1 className="title"><span className="titleEmoji" aria-hidden="true">💀</span>RegretAI</h1>
            <p className="subtitle">See how your choices will impact you in a day, month, or year!</p>
          </div>
          <div className="topbarActionGroup" style={{ display: "flex", gap: 10, alignItems: "center", position: "relative" }}>
            {currentUserEmail && streakCount > 0 && (
              <span className="streakBadge" title={`${streakCount}-day streak — analyze again before midnight to keep it going`}>
                🔥 {streakCount}
              </span>
            )}
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
            
            {/* Modernized Settings Icon Button */}
            <button 
              className={`modernSettingsBtn ${activeTab === "settings" ? "settingsActive" : ""}`}
              onClick={() => setActiveTab("settings")}
              aria-label="Open App Settings"
              title="Settings"
            >
              <SettingsIcon />
            </button>
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
            {streakToast && (
              <section className="status success streakToast" style={{ marginTop: 20 }}>
                {streakToast}
                <button className="dismissInline" type="button" onClick={() => setStreakToast(null)} aria-label="Dismiss">✕</button>
              </section>
            )}
            {pendingCheckins.length > 0 && !checkinTarget && (
              <section className="checkinBanner" role="status">
                <div>
                  <strong>How did "{pendingCheckins[0].title}" actually turn out?</strong>
                  <p className="sectionDescription">
                    You analyzed this {formatDate(pendingCheckins[0].createdAt)}. A quick check-in helps us see how accurate the forecast was.
                    {pendingCheckins.length > 1 && ` (${pendingCheckins.length - 1} more waiting.)`}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="primaryBtn" type="button" onClick={() => openCheckin(pendingCheckins[0])}>Check in</button>
                  <button className="secondaryBtn" type="button" onClick={() => dismissCheckin(pendingCheckins[0].id)}>Not now</button>
                </div>
              </section>
            )}
            <div className="mainLayout analyzeLayout">
              {/* LEFT COLUMN */}
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
                        onClick={() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
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
                
                {/* On desktop viewports, advice tips show on the left; on mobile they shift below results */}
                <section className="tipsCard desktopOnlyTips">
                  <h3 className="sectionTitle">💡 Tips for a clearer analysis</h3>
                  <ul className="tipsList">
                    <li><strong>Be specific about the trade-off.</strong> Instead of "Should I move?", try "Should I move from Dallas to Austin for a $15k raise but leave my support network?"</li>
                    <li><strong>Include your time horizon.</strong> Mention whether this is urgent or long-term.</li>
                    <li><strong>Name what you value.</strong> Context like "stability matters more to me than income."</li>
                    <li><strong>State the alternative.</strong> Every decision has an option B — include it.</li>
                  </ul>
                </section>
              </div>

              {/* RIGHT COLUMN */}
              <div className="resultColumn" ref={resultRef}>
                {result ? (
                  <section className="resultSection">
                    <div className="resultActions">
                      <button className="primaryBtn" onClick={copyAnalysis}>Copy</button>
                      <button className="secondaryBtn" type="button" onClick={downloadAnalysis}>Download</button>
                      <button className="secondaryBtn" type="button" onClick={shareAnalysis}>Share</button>
                      <button className="secondaryBtn" type="button" onClick={() => analyze(result.originalInput ?? result.title)}>Re-run</button>
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

                {/* Mobile Responsive Structural Reordering: tips show here on mobile views */}
                <section className="tipsCard mobileOnlyTips" style={{ marginTop: "20px" }}>
                  <h3 className="sectionTitle">💡 Tips for a clearer analysis</h3>
                  <ul className="tipsList">
                    <li><strong>Be specific about the trade-off.</strong> Instead of "Should I move?", try "Should I move from Dallas to Austin for a $15k raise but leave my support network?"</li>
                    <li><strong>Include your time horizon.</strong> Mention whether this is urgent or long-term.</li>
                    <li><strong>Name what you value.</strong> Context like "stability matters more to me than income."</li>
                    <li><strong>State the alternative.</strong> Every decision has an option B — include it.</li>
                  </ul>
                </section>
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
              
              {/* Modernized Prediction / Delta Card */}
              <article className="statCard accuracyCard">
                <span className="statLabel">Forecast accuracy</span>
                {predictionAccuracy ? (
                  <>
                    <strong className="accuracyValue">±{predictionAccuracy.avgDelta}%</strong>
                    <span className="hintText">Average variance across {predictionAccuracy.count} check-ins</span>
                  </>
                ) : (
                  <div className="accuracyLockBadge">
                    <span className="lockIcon">🔒</span>
                    <span className="lockText">Complete 3+ structural outcome check-ins to unlock delta scoring</span>
                  </div>
                )}
              </article>
            </section>
            
            <section className="historyPanel trendPanel">
              <div className="historyHeader">
                <div>
                  <h3>Regret over time</h3>
                  <p className="historyMeta">Each point is a saved decision, oldest to newest.</p>
                </div>
              </div>
              <RegretTrendChart points={trendPoints} />
            </section>
            
            <section className="historyPanel">
              <div className="historyHeader">
                <div>
                  <h3>Recent decisions</h3>
                  <p className="historyMeta">Filter, search, and reopen any saved analysis.</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {currentUserPaid ? (
                    <button className="secondaryBtn" type="button" onClick={downloadHistoryCsv} disabled={history.length === 0}>⬇️ Export CSV</button>
                  ) : (
                    <button className="secondaryBtn" type="button" onClick={() => setActiveTab("plans")} title="CSV export is a paid feature">⬇️ Export CSV ★</button>
                  )}
                  <button className="secondaryBtn" type="button" onClick={clearHistory} disabled={history.length === 0}>🗑️ Clear all</button>
                </div>
              </div>
              
              {/* Search input is now directly side-by-side with filter pills */}
              <div className="filterRow modernizedFilterGrid">
                <div className="buttonGroup categoryButtonGroup">
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <button 
                      key={key} 
                      type="button" 
                      className={`pill ${categoryFilter === key ? "active" : ""}`} 
                      onClick={() => setCategoryFilter(key as typeof categoryFilter)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="searchWrapper flexGrowSearch">
                  <input 
                    type="search" 
                    className="searchInput" 
                    placeholder="Search past history..." 
                    value={historySearch} 
                    onChange={(e) => setHistorySearch(e.target.value)} 
                  />
                </div>
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
                          <div className="historyMeta">
                            {CATEGORY_LABELS[item.category]} · {formatDate(item.createdAt)}
                            {typeof item.actualRegret === "number" && (
                              <span className="checkinTag"> · actually felt like {item.actualRegret}%</span>
                            )}
                          </div>
                        </div>
                      </button>
                      <div className="historyItemActions">
                        {!item.checkinAt && (
                          <button type="button" className="secondaryBtn checkinSmallBtn" onClick={() => openCheckin(item)}>Check in</button>
                        )}
                        <button type="button" className="deleteBtn" aria-label={`Delete ${item.title}`} onClick={() => deleteItem(item.id)}>✕</button>
                      </div>
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
                    <p className="sectionDescription">See how your choices will impact you in a day, month, or year -For informational purposes only — not a substitute for professional advice.</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ── Auth Modals ── */}
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
                    <button className="primaryBtn" onClick={verifyEmailOtp} disabled={loading}>{loading ? "Verifying..." : "Verify code"}</button>
                    <button className="secondaryBtn" onClick={() => { setVerificationStep(false); setAuthOtp(""); setError(""); }} disabled={loading}>Back</button>
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
                        <button className="primaryBtn" onClick={sendResetEmail} disabled={loading}>{loading ? "Sending..." : "Send reset link"}</button>
                        <button className="secondaryBtn" onClick={() => { setAuthModal("login"); setError(""); }} disabled={loading}>Back</button>
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
                    <button className="primaryBtn" style={{ flex: 1 }} onClick={() => authModal === "signup" ? signup() : login()} disabled={loading}>
                      {loading ? (authModal === "signup" ? "Signing up..." : "Logging in...") : (authModal === "signup" ? "Sign up" : "Log in")}
                    </button>
                    <button className="secondaryBtn" onClick={() => { setAuthModal(null); setError(""); }} disabled={loading}>Cancel</button>
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

        {/* ── Billing Modals ── */}
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

        {/* ── Check-in Modals ── */}
        {checkinTarget && (
          <div className="authOverlay" role="dialog" aria-modal="true">
            <div className="authModal checkinModal">
              <h3>How did it actually feel?</h3>
              <p className="authHint">
                You analyzed <strong>"{checkinTarget.title}"</strong> and we predicted <strong>{checkinTarget.regret_score}% regret</strong>.
                Looking back now, how much do you actually regret it?
              </p>
              <div className="checkinSliderRow">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={checkinValue}
                  onChange={(e) => setCheckinValue(Number(e.target.value))}
                  className="checkinSlider"
                  aria-label="Actual regret percentage"
                />
                <div className="checkinSliderValue">{checkinValue}%</div>
              </div>
              <div className="checkinQuickPicks">
                {[0, 25, 50, 75, 100].map((v) => (
                  <button key={v} type="button" className={`pill ${checkinValue === v ? "active" : ""}`} onClick={() => setCheckinValue(v)}>{v}%</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
                <button className="primaryBtn" style={{ flex: 1 }} onClick={submitCheckin}>Save my answer</button>
                <button className="secondaryBtn" onClick={() => dismissCheckin(checkinTarget.id)}>Not now</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}