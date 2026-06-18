"use client";

import { useEffect, useMemo, useState } from "react";
import ResultCard from "@/components/ResultCard";
import TextInput from "@/components/TextInput";

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

type UserRecord = {
  password: string;
  createdAt: string;
  displayName: string;
  isPaid: boolean;
  subscriptionDate?: string;
};

type UserSummary = {
  email: string;
  displayName: string;
  createdAt: string;
  isPaid: boolean;
  subscriptionDate?: string;
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

const PLANS = [
  {
    name: "Basic",
    price: "$2/mo",
    description: "Great for occasional decision-making with essential AI forecasting.",
    features: [
      "10 saved decisions",
      "Standard AI requests",
      "Email support",
    ],
  },
  {
    name: "Premium",
    price: "$5/mo",
    description: "Best value — unlimited analysis, extended history, and priority results.",
    features: [
      "50 saved decisions",
      "Priority AI requests",
      "Premium support",
    ],
    recommended: true,
  },
  {
    name: "Pro",
    price: "$12/mo",
    description: "For power users who need maximum history, fastest responses, and full export tools.",
    features: [
      "Unlimited saved decisions",
      "Fastest AI priority",
      "Dedicated support",
      "CSV export of all history",
    ],
  },
];

const PREMIUM_PLAN = PLANS[1];

const EXAMPLES = [
  "Should I accept a lower-paying job with better work-life balance?",
  "Is it smarter to invest my savings instead of buying a new car?",
  "Should I tell my friend how I really feel about our relationship?",
];

export default function Home() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(false);
  const [error, setError] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [authModal, setAuthModal] = useState<null | "login" | "signup">(null);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [verificationStep, setVerificationStep] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [currentUserPaid, setCurrentUserPaid] = useState(false);
  const [billingModal, setBillingModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(PLANS[1]);
  const [paymentError, setPaymentError] = useState("");
  const [billingProcessing, setBillingProcessing] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | Result["category"]>("all");
  const [historySearch, setHistorySearch] = useState("");
  const [profiles, setProfiles] = useState<UserSummary[]>([]);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [note, setNote] = useState("");
  const [noteStatus, setNoteStatus] = useState("");
  const [dailyUsage, setDailyUsage] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const savedUser = localStorage.getItem("regret-current-user");
    if (savedUser) setCurrentUserEmail(savedUser);
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedUsers = getUsers();
    const userList = Object.entries(savedUsers).map(([email, data]) => ({
      email,
      displayName: data.displayName,
      createdAt: data.createdAt,
      isPaid: Boolean(data.isPaid),
      subscriptionDate: data.subscriptionDate,
    }));
    setProfiles(userList);

    if (savedUser && savedUsers[savedUser]) {
      setCurrentUserName(savedUsers[savedUser].displayName);
      setCurrentUserPaid(Boolean(savedUsers[savedUser].isPaid));
      loadDailyUsage(savedUser);
    }

    const historyKey = `regret-history-${savedUser ?? "public"}`;
    const savedHistory = localStorage.getItem(historyKey);

    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((error) => console.warn("Service worker registration failed:", error));
    } else {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
    }

    window.requestAnimationFrame(() => {
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory);
          if (Array.isArray(parsed)) {
            setHistory(parsed);
          }
        } catch {
          localStorage.removeItem("regret-history");
        }
      }

      const htmlClass = document.documentElement.classList;
      if (savedTheme === 'dark' || savedTheme === 'light') {
        const isDark = savedTheme === "dark";
        setDark(isDark);
        if (isDark) {
          htmlClass.add('dark');
        } else {
          htmlClass.remove('dark');
        }
      } else {
        setDark(prefersDark);
        if (prefersDark) {
          htmlClass.add('dark');
        } else {
          htmlClass.remove('dark');
        }
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    // Update mobile/browser UI color for theme
    try {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', dark ? '#0f172a' : '#6366f1');
      }
      const apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (apple) {
        apple.setAttribute('content', dark ? 'black-translucent' : 'default');
      }
    } catch (e) {
      // ignore in SSR or restricted contexts
    }
  }, [dark]);

  function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  function getUsers(): Record<string, UserRecord> {
    try {
      const raw = localStorage.getItem("regret-users");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveUsers(u: Record<string, UserRecord>) {
    localStorage.setItem("regret-users", JSON.stringify(u));
  }

  function getUsageKey(email: string | null) {
    return `regret-daily-usage-${email ?? "public"}`;
  }

  function loadHistoryForUser(email: string | null) {
    if (typeof window === "undefined") return;
    const key = `regret-history-${email ?? "public"}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      setHistory([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setHistory(Array.isArray(parsed) ? parsed : []);
    } catch {
      setHistory([]);
    }
  }

  function loadDailyUsage(email: string | null) {
    if (typeof window === "undefined") return;
    const key = getUsageKey(email);
    const raw = localStorage.getItem(key);
    const today = new Date().toISOString().slice(0, 10);
    if (!raw) {
      setDailyUsage(0);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.date === today && typeof parsed.count === "number") {
        setDailyUsage(parsed.count);
      } else {
        setDailyUsage(0);
      }
    } catch {
      setDailyUsage(0);
    }
  }

  function saveDailyUsage(email: string | null, count: number) {
    if (typeof window === "undefined") return;
    const key = getUsageKey(email);
    localStorage.setItem(key, JSON.stringify({ date: new Date().toISOString().slice(0, 10), count }));
  }

  function saveHistory(item: Result) {
    const entry = {
      ...item,
      createdAt: item.createdAt ?? new Date().toISOString(),
    };

    setHistory((current) => {
      const maxEntries = currentUserPaid ? 50 : 10;
      const next = [entry, ...current.filter((historyItem) => historyItem.id !== entry.id)].slice(0, maxEntries);
      if (typeof window !== "undefined") {
        const key = `regret-history-${currentUserEmail ?? "public"}`;
        localStorage.setItem(key, JSON.stringify(next));
      }
      return next;
    });
  }

  async function analyze(input?: string) {
    const value = input ?? text;
    if (!currentUserEmail) {
      setError("Please sign in to analyze decisions.");
      return;
    }
    if (!value.trim()) {
      setError("Please describe a decision before analyzing.");
      return;
    }
    if (!currentUserPaid && dailyUsage >= FREE_DAILY_LIMIT) {
      setError("Your free daily limit is reached. Upgrade to Premium for unlimited analysis.");
      return;
    }

    setError("");
    setLoading(true);
    setResult(null);
    setNote("");
    setNoteStatus("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });

      const data = await res.json();
      if (!res.ok || data?.error) {
        throw new Error(data?.error ?? "Unable to analyze your decision.");
      }

      const withId: Result = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      setResult(withId);
      saveHistory(withId);
      if (!currentUserPaid) {
        const nextUsage = dailyUsage + 1;
        setDailyUsage(nextUsage);
        saveDailyUsage(currentUserEmail, nextUsage);
      }
      setText(value);
      setCopyStatus("");
      setNote("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected analysis error.";
      setError(message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function deleteItem(id: string) {
    setHistory((current) => {
      const next = current.filter((item) => item.id !== id);
      if (typeof window !== "undefined") {
        const key = `regret-history-${currentUserEmail ?? "public"}`;
        localStorage.setItem(key, JSON.stringify(next));
      }
      return next;
    });
    if (result?.id === id) {
      setResult(null);
      setNote("");
      setNoteStatus("");
    }
  }

  function clearHistory() {
    setHistory([]);
    if (typeof window !== "undefined") {
      const key = `regret-history-${currentUserEmail ?? "public"}`;
      localStorage.removeItem(key);
    }
  }

  function validateEmail(email: string) {
    const normalized = normalizeEmail(email);
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(normalized);
  }

  function validatePassword(password: string) {
    return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
  }

  function validateDisplayName(name: string) {
    return name.trim().length >= 2 && name.trim().length <= 30;
  }

  function refreshProfiles() {
    const users = getUsers();
    const list = Object.entries(users).map(([email, data]) => ({
      email,
      displayName: data.displayName,
      createdAt: data.createdAt,
      isPaid: Boolean(data.isPaid),
      subscriptionDate: data.subscriptionDate,
    }));
    setProfiles(list);
  }

  async function signup() {
    setError("");
    const email = normalizeEmail(authEmail);
    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!validateDisplayName(authName)) {
      setError("Display name must be 2 to 30 characters.");
      return;
    }
    if (!validatePassword(authPassword)) {
      setError("Password must be at least 8 characters and include upper/lowercase letters and a number.");
      return;
    }
    if (authPassword !== authConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const users = getUsers();
    if (users[email]) {
      setError("An account with this email already exists.");
      return;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setVerificationCode(code);
    setEnteredCode("");
    setVerificationError("");
    setVerificationStep(true);

    await fetch("/api/send-verification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        code,
      }),
    });

    return;
  }

  async function confirmVerificationCode() {
    setError("");
    setVerificationError("");

    if (!verificationCode || enteredCode.trim() !== verificationCode) {
      setVerificationError("Incorrect code. Please try again.");
      return;
    }

    const email = normalizeEmail(authEmail);
    const users = getUsers();
    if (users[email]) {
      setVerificationError("An account with this email already exists.");
      return;
    }

    users[email] = {
      password: authPassword,
      createdAt: new Date().toISOString(),
      displayName: authName.trim(),
      isPaid: false,
    };

    saveUsers(users);
    refreshProfiles();
    localStorage.setItem("regret-current-user", email);
    setCurrentUserEmail(email);
    setCurrentUserName(authName.trim());
    setCurrentUserPaid(false);
    setVerificationStep(false);
    setVerificationCode("");
    setEnteredCode("");
    setAuthModal(null);
    setAuthEmail("");
    setAuthPassword("");
    setAuthConfirmPassword("");
    setAuthName("");
    loadHistoryForUser(email);
    loadDailyUsage(email);
  }

  function login() {
    setError("");
    const email = normalizeEmail(authEmail);
    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!authPassword) {
      setError("Please enter your password.");
      return;
    }
    const users = getUsers();
    const user = users[email];
    if (!user || user.password !== authPassword) {
      setError("Invalid email or password.");
      return;
    }
    localStorage.setItem("regret-current-user", email);
    setCurrentUserEmail(email);
    setCurrentUserName(user.displayName);
    setCurrentUserPaid(Boolean(user.isPaid));
    setAuthModal(null);
    setAuthEmail("");
    setAuthPassword("");
    setAuthConfirmPassword("");
    setAuthName("");
    loadHistoryForUser(email);
    loadDailyUsage(email);
  }

  function logout() {
    localStorage.removeItem("regret-current-user");
    setCurrentUserEmail(null);
    setCurrentUserName(null);
    setCurrentUserPaid(false);
    setHistory([]);
    setProfileMenuOpen(false);
  }

  function switchProfile(email: string) {
    const users = getUsers();
    const user = users[email];
    if (!user) return;
    localStorage.setItem("regret-current-user", email);
    setCurrentUserEmail(email);
    setCurrentUserName(user.displayName);
    setCurrentUserPaid(Boolean(user.isPaid));
    setProfileMenuOpen(false);
    loadHistoryForUser(email);
    loadDailyUsage(email);
  }

  function openBillingModal() {
    setBillingModal(true);
    setPaymentError("");
    setCheckoutMessage(null);
  }

  function closeBillingModal() {
    setBillingModal(false);
    setPaymentError("");
    setBillingProcessing(false);
  }

  async function startCheckout() {
    if (!currentUserEmail) {
      setPaymentError("Please sign in before upgrading.");
      return;
    }

    setPaymentError("");
    setBillingProcessing(true);

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
      if (!response.ok) {
        throw new Error(data?.error || "Unable to start checkout.");
      }

      if (!data.url) {
        throw new Error("Stripe checkout session failed to create.");
      }

      window.location.href = data.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start payment.";
      setPaymentError(message);
    } finally {
      setBillingProcessing(false);
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (!sessionId || !currentUserEmail) return;

    const verifyCheckout = async () => {
      try {
        const response = await fetch(
          `/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          setPaymentError(
            data?.error || "Unable to verify payment session."
          );
          return;
        }

        if (data.customer_email !== currentUserEmail) {
          setPaymentError(
            "The checked-out account does not match the current user."
          );
          return;
        }

        const users = getUsers();
        const user = users[currentUserEmail];

        if (!user) {
          setPaymentError("User not found.");
          return;
        }

        users[currentUserEmail] = {
          ...user,
          isPaid: true,
          subscriptionDate: new Date().toISOString(),
        };

        saveUsers(users);

        setCurrentUserPaid(true);
        refreshProfiles();
        setCheckoutMessage("Your Premium subscription is now active.");

        // clean URL
        window.history.replaceState({}, "", window.location.pathname);
      } catch (error) {
        setPaymentError(
          error instanceof Error
            ? error.message
            : "Unable to verify checkout."
        );
      }
    };

    verifyCheckout();
  }, [hydrated, currentUserEmail]);

  function handleHistorySelect(item: Result) {
    setResult(item);
    setText(item.title);
    setNote(item.note ?? "");
    setCopyStatus("");
    setNoteStatus("");
  }

  function saveNote() {
    if (!result) return;

    const updated = {
      ...result,
      note: note.trim(),
    };

    setResult(updated);
    saveHistory(updated);
    setNoteStatus("Note saved to history.");
  }

  function downloadAnalysis() {
    if (!result) return;

    const payload = `RegretAI Decision Report\n\nTitle: ${result.title}\nCategory: ${CATEGORY_LABELS[result.category]}\nRegret: ${result.regret_score}%\n\nNow:\n${result.immediate}\n\n1 Month:\n${result.one_month}\n\n1 Year:\n${result.one_year}\n\nAdvice:\n${result.advice}\n\nNote:\n${result.note ?? "(none)"}\n`;
    const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `regret-report-${result.id}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    if (typeof window !== "undefined") {
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
    }
  }

  function clearInput() {
    setText("");
    setError("");
  }

  function formatDate(value?: string) {
    if (!value) return "";
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchCategory = categoryFilter === "all" || item.category === categoryFilter;
      const matchSearch = historySearch.trim().length === 0 || item.title.toLowerCase().includes(historySearch.trim().toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [categoryFilter, history, historySearch]);

  const stats = useMemo(() => {
    const total = history.length;
    const average = total ? Math.round(history.reduce((sum, item) => sum + item.regret_score, 0) / total) : 0;
    const latest = history[0]?.createdAt;
    return { total, average, latest };
  }, [history]);

  async function copyAnalysis() {
    if (!result) return;
    const summary = `RegretAI analysis for: ${result.title}\nNow: ${result.immediate}\n1 Month: ${result.one_month}\n1 Year: ${result.one_year}\nAdvice: ${result.advice}`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopyStatus("Copied to clipboard!");
    } catch {
      setCopyStatus("Unable to copy on this browser.");
    }
  }

  function shareAnalysis() {
    if (!result || typeof navigator === "undefined") return;
    const summary = `RegretAI analysis for: ${result.title}\nNow: ${result.immediate}\n1 Month: ${result.one_month}\n1 Year: ${result.one_year}\nAdvice: ${result.advice}`;
    if (navigator.share) {
      navigator.share({
        title: `RegretAI analysis: ${result.title}`,
        text: summary,
      });
    } else {
      setCopyStatus("Share is not supported in this browser.");
    }
  }

  return (
    <div className={`page ${dark ? "dark" : ""}`}>
      <div className="center">
        <header className="topbar">
          <div>
            <h1 className="title">
              <span className="titleEmoji" aria-hidden="true">💀</span>
              RegretAI
            </h1>
            <p className="subtitle">
              Simulate how a decision feels today, in one month, and in one year.
            </p>
          </div>

          <div style={{display: 'flex', gap: 8, alignItems: 'center', position: 'relative'}}>
            {currentUserEmail ? (
              <>
                <button
                  className="secondaryBtn"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                >
                  {currentUserName ? `Hi, ${currentUserName}` : currentUserEmail}
                  {currentUserPaid ? " ★" : ""}
                </button>
                {profileMenuOpen && (
                  <div className="profileMenu" role="menu">
                    <div className="profileMenuHeader">Profiles</div>
                    {profiles.map((profile) => (
                      <button
                        key={profile.email}
                        type="button"
                        className="profileMenuItem"
                        role="menuitem"
                        onClick={() => switchProfile(profile.email)}
                      >
                        <strong>{profile.displayName}</strong>
                        <span>{profile.email} {profile.isPaid ? "· Premium" : ""}</span>
                      </button>
                    ))}
                    <div className="profileMenuDivider" />
                    <div className="profileMenuStatus">
                      <span>{currentUserPaid ? "Premium member" : "Free account"}</span>
                      {!currentUserPaid && (
                        <button className="primaryBtn upgradeBtn" type="button" onClick={openBillingModal}>
                          Upgrade to Premium
                        </button>
                      )}
                    </div>
                    <button className="profileMenuItem" type="button" onClick={logout}>
                      Log out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <button className="secondaryBtn" onClick={() => setAuthModal('login')}>Log in</button>
                <button className="primaryBtn" onClick={() => setAuthModal('signup')}>Sign up</button>
              </>
            )}
            <button className="settingsBtn" onClick={toggleTheme}>
              {dark ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </header>

        <section className="inputCard">
          <div className="inputHeader">
            <div>
              <h2 className="sectionTitle">Describe your decision</h2>
              <p className="sectionDescription">
                Write your choice clearly and get a fast regret forecast plus actionable advice.
              </p>
            </div>
            <span className="counter">{text.length}/300</span>
          </div>

          <TextInput
            placeholder="Example: Should I quit my job and try freelancing?"
            value={text}
            setValue={setText}
            maxLength={300}
            rows={6}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                analyze();
              }
            }}
          />

          <div className="row actionRow">
            <button
              className="primaryBtn"
              disabled={!text.trim() || loading || !currentUserEmail}
              onClick={() => analyze()}
            >
              {loading ? "Analyzing..." : "Analyze decision"}
            </button>
            <button className="secondaryBtn" type="button" onClick={clearInput}>
              Clear input
            </button>
          </div>

          <div className="buttonGroup">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="chip"
                onClick={() => analyze(example)}
                disabled={!currentUserEmail}
              >
                {example}
              </button>
            ))}
          </div>

          {!currentUserEmail ? (
            <div className="status warning">
              Sign in to access free daily analysis and saved history.
            </div>
          ) : !currentUserPaid ? (
            <div className="status warning">
              Free users get {dailyUsage}/{FREE_DAILY_LIMIT} analyses today. Upgrade to Premium for unlimited analysis and extended history.              <button className="linkButton" type="button" onClick={openBillingModal}>
                View plans
              </button>
            </div>
          ) : null}

          {error && <div className="status error">{error}</div>}
        </section>

        <section className="infoCard">
          <h3>How this app works</h3>
          <p>
            RegretAi uses AI to help you think through outcomes and see what your decision may feel like over time. Use the history tools to compare past ideas and improve your decision process.
          </p>
        </section>

        {currentUserEmail && !currentUserPaid && (
         <section className="billingPromoCard">
  <h3>Choose Your Plan</h3>

  <div className="planGrid">
    {PLANS.map((plan) => (
      <div
        key={plan.name}
        className={`planCard ${
          selectedPlan.name === plan.name ? "planCardSelected" : ""
        } ${plan.recommended ? "planCardRecommended" : ""}`}
        onClick={() => setSelectedPlan(plan)}
      >
        {plan.recommended && (
          <div className="planBadge">Most Popular</div>
        )}

        <strong className="planName">{plan.name}</strong>

        <div className="planPrice">{plan.price}</div>

        <p className="planDesc">{plan.description}</p>

        <ul className="billingFeatures">
          {plan.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>
    ))}
  </div>

  <button
    className="primaryBtn"
    type="button"
    onClick={openBillingModal}
    style={{ width: "100%", marginTop: 20 }}
  >
    Continue with {selectedPlan.name}
  </button>
</section>
        )}

        {currentUserEmail && currentUserPaid && (
          <section className="billingPromoCard premiumActive">
            <div>
              <h3>Premium account active</h3>
              <p>You have full access to analysis and extended history. Thank you for subscribing.</p>
              <div className="billingPlanSummary">
                <strong>{PREMIUM_PLAN.price}</strong>
                <span>{PREMIUM_PLAN.description}</span>
              </div>
            </div>
          </section>
        )}

        {checkoutMessage && (
          <section className="status success checkoutMessage">
            {checkoutMessage}
          </section>
        )}

        {result && (
          <section className="resultSection">
            <div className="resultActions">
              <button className="primaryBtn" onClick={copyAnalysis}>Copy result</button>
              <button className="secondaryBtn" type="button" onClick={downloadAnalysis}>Download report</button>
              <button className="secondaryBtn" type="button" onClick={shareAnalysis}>Share</button>
              <button className="secondaryBtn" type="button" onClick={() => analyze(result.title)}>
                Re-run
              </button>
            </div>
            {copyStatus && <div className="status success">{copyStatus}</div>}
            <div className="noteSection">
              <h3 className="sectionTitle">Personal note</h3>
              <TextInput
                className="noteTextarea"
                placeholder="Write a follow-up thought, reminder, or why this decision matters to you."
                value={note}
                setValue={setNote}
                rows={4}
              />
              <div className="row actionRow">
                <button className="primaryBtn" disabled={!result} onClick={saveNote}>
                  Save note
                </button>
                {noteStatus && <span className="status success">{noteStatus}</span>}
              </div>
            </div>
            <ResultCard data={result} />
          </section>
        )}

        {authModal && (
          <div className="authOverlay" role="dialog" aria-modal="true">
            <div className="authModal">
              {verificationStep ? (
                <>
                  <h3>Verify your email</h3>
                  <p className="authHint">A 6-digit code was sent to <strong>{authEmail}</strong>. Enter it below to complete sign up.</p>
                  <label>
                    Verification code
                    <input
                      value={enteredCode}
                      onChange={(e) => setEnteredCode(e.target.value)}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                    />
                  </label>
                  {verificationError && <div className="status error" role="alert">{verificationError}</div>}
                  <div style={{display: 'flex', gap: 8, marginTop: 12}}>
                    <button className="primaryBtn" onClick={confirmVerificationCode}>Verify &amp; create account</button>
                    <button className="secondaryBtn" onClick={() => { setVerificationStep(false); setVerificationError(""); }}>Back</button>
                  </div>
                </>
              ) : (
                <>
                  <h3>{authModal === 'signup' ? 'Create an account' : 'Log in'}</h3>
                  {authModal === 'signup' && (
                    <label>
                      Display name
                      <input value={authName} onChange={(e) => setAuthName(e.target.value)} type="text" />
                    </label>
                  )}
                  <label>
                    Email
                    <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} type="email" />
                  </label>
                  <label>
                    Password
                    <input value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} type="password" />
                  </label>
                  {authModal === 'signup' && (
                    <label>
                      Confirm password
                      <input value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)} type="password" />
                    </label>
                  )}
                  {error && <div className="status error" role="alert">{error}</div>}
                  <div style={{display: 'flex', gap: 8, marginTop: 12}}>
                    <button className="primaryBtn" onClick={() => (authModal === 'signup' ? signup() : login())}>
                      {authModal === 'signup' ? 'Send verification code' : 'Log in'}
                    </button>
                    <button className="secondaryBtn" onClick={() => setAuthModal(null)}>Cancel</button>
                  </div>
                  {authModal === 'signup' ? (
                    <p className="authHint">Password must be 8+ characters, and include upper/lowercase letters plus a number.</p>
                  ) : (
                    <p className="authHint">Use the email and password you registered with.</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

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
                    onClick={() => setSelectedPlan(plan)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedPlan(plan)}
                  >
                    {plan.recommended && <div className="planBadge">Most Popular</div>}
                    <strong className="planName">{plan.name}</strong>
                    <div className="planPrice">{plan.price}</div>
                    <p className="planDesc">{plan.description}</p>
                    <ul className="billingFeatures">
                      {plan.features.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="billingNotice">
                You will be redirected to Stripe Checkout to complete your purchase securely.
              </p>
              {paymentError && <div className="status error">{paymentError}</div>}
              <div style={{display: 'flex', gap: 8, marginTop: 12}}>
                <button className="primaryBtn" type="button" onClick={startCheckout} disabled={billingProcessing}>
                  {billingProcessing ? "Starting checkout..." : `Start ${selectedPlan.name} — ${selectedPlan.price}`}
                </button>
                <button className="secondaryBtn" type="button" onClick={closeBillingModal} disabled={billingProcessing}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

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
            <button className="secondaryBtn" type="button" onClick={clearHistory}>
              🗑️ Clear history
            </button>
          </div>

          <div className="filterRow">
            <div className="buttonGroup">
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
            <input
              type="search"
              className="searchInput"
              placeholder="Search history..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
          </div>

          <div className="historyList">
            {filteredHistory.length === 0 ? (
              <div className="emptyState">No saved decisions match your filters.</div>
            ) : (
              filteredHistory.map((item) => (
                <div key={item.id} className="historyItem">
                  <button
                    type="button"
                    className="historyLink"
                    onClick={() => handleHistorySelect(item)}
                  >
                    <div>
                      <strong>{item.title}</strong>
                      <div className="historyMeta">{CATEGORY_LABELS[item.category]} · {formatDate(item.createdAt)}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="deleteBtn"
                    aria-label={`Delete ${item.title}`}
                    onClick={() => deleteItem(item.id)}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}