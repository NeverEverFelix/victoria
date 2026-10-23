"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { usePlaidLink } from "react-plaid-link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { requestUserApi, UserApiError } from "../src/app/client/authenticated-api.js";

interface PlaidNotice {
  readonly version: string;
  readonly purpose: string;
  readonly products: readonly string[];
  readonly dataFields: readonly string[];
  readonly transactionLookbackDays: number;
  readonly retentionDays: number;
  readonly encryptedPlaidTokenStoredForSync: boolean;
  readonly balancesRequested: boolean;
  readonly transfersEnabled: boolean;
}

interface ConsentSnapshot {
  readonly status: "active" | "revoked";
  readonly products: readonly string[];
}

interface ConnectionStatus {
  readonly consent: ConsentSnapshot | null;
  readonly connectedItemCount: number;
  readonly notice: PlaidNotice;
}

interface PublicMemory {
  readonly id: string;
  readonly category: string;
  readonly key: string;
  readonly value: string;
  readonly sourceType: string;
  readonly observedFrom?: string;
  readonly observedThrough?: string;
}

interface MemoryList {
  readonly memories: readonly PublicMemory[];
}

interface PlaidConnectionExperienceProps {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

let browserSupabaseClient: { readonly url: string; readonly key: string; readonly client: SupabaseClient } | null = null;

function getSupabaseClient(url: string, key: string): SupabaseClient {
  if (browserSupabaseClient?.url === url && browserSupabaseClient.key === key) return browserSupabaseClient.client;
  const client = createClient(url, key, {
    auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true }
  });
  browserSupabaseClient = { url, key, client };
  return client;
}

export function PlaidConnectionExperience({
  supabaseUrl,
  supabasePublishableKey
}: PlaidConnectionExperienceProps) {
  const supabase = useMemo<SupabaseClient | null>(() => {
    if (!supabaseUrl || !supabasePublishableKey) return null;
    return getSupabaseClient(supabaseUrl, supabasePublishableKey);
  }, [supabaseUrl, supabasePublishableKey]);

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createAccount, setCreateAccount] = useState(false);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [connectionLoadFailed, setConnectionLoadFailed] = useState(false);
  const [profileMemories, setProfileMemories] = useState<readonly PublicMemory[]>([]);
  const [consentChecked, setConsentChecked] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ readonly kind: "success" | "error"; readonly text: string } | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) {
        setConnection(null);
        setProfileMemories([]);
      }
      setAuthReady(true);
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => applySession(nextSession));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const accessToken = session?.access_token ?? null;

  const loadConnection = useCallback(async (token: string) => {
    const current = await requestUserApi<ConnectionStatus>(token, "/api/plaid/consent");
    setConnection(current);
    setConnectionLoadFailed(false);
    const hasTransactionsConsent = current.consent?.status === "active" && current.consent.products.includes("transactions");
    if (hasTransactionsConsent || current.connectedItemCount > 0) {
      const result = await requestUserApi<MemoryList>(token, "/api/memories?limit=100");
      setProfileMemories(result.memories.filter((memory) =>
        memory.category === "financial_pattern" && memory.sourceType === "plaid_transaction_profile" &&
        memory.key.startsWith("financial_profile:")
      ));
    } else {
      setProfileMemories([]);
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    // The async loader synchronizes connection state only after its authenticated API response returns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConnection(accessToken).then(() => {
      if (active) setNotice(null);
    }).catch((error: unknown) => {
      if (!active) return;
      setConnection(null);
      setProfileMemories([]);
      setConnectionLoadFailed(true);
      setNotice({
        kind: "error",
        text: error instanceof UserApiError && error.status === 503
          ? "Transaction linking is not enabled in this environment yet. Your sign-in is working; no bank data was requested."
          : "Victoria could not load your connection status. Please try again."
      });
    });
    return () => { active = false; };
  }, [accessToken, loadConnection]);

  const beginLink = useCallback(async () => {
    if (!accessToken || !connection) return;
    setBusy(true);
    setNotice(null);
    try {
      const consentIsActive = connection.consent?.status === "active" &&
        connection.consent.products.length === 1 && connection.consent.products[0] === "transactions";
      if (!consentIsActive) {
        if (!consentChecked) throw new Error("Review the notice and confirm before continuing.");
        await requestUserApi(accessToken, "/api/plaid/consent", {
          method: "POST",
          body: { action: "grant", confirmed: true, consentVersion: connection.notice.version }
        });
      }
      const result = await requestUserApi<{ linkToken: string }>(accessToken, "/api/plaid/link-token", { method: "POST" });
      setLinkToken(result.linkToken);
    } catch (error) {
      setNotice({ kind: "error", text: safeErrorMessage(error, "Victoria could not start the secure bank-link flow.") });
    } finally {
      setBusy(false);
    }
  }, [accessToken, connection, consentChecked]);

  const handleLinkSuccess = useCallback(async (publicToken: string) => {
    if (!accessToken) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await requestUserApi<{ connected: boolean; profileSync: "complete" | "deferred" | "pending" }>(
        accessToken,
        "/api/plaid/token-exchange",
        { method: "POST", body: { public_token: publicToken } }
      );
      await loadConnection(accessToken);
      setNotice({
        kind: "success",
        text: result.profileSync === "complete"
          ? "Your transaction profile is connected and ready for Victoria to use within this consent."
          : "Your connection is saved securely. The first transaction profile sync is still processing."
      });
    } catch (error) {
      setNotice({ kind: "error", text: safeErrorMessage(error, "Victoria could not finish connecting this account.") });
    } finally {
      setLinkToken(null);
      setBusy(false);
    }
  }, [accessToken, loadConnection]);

  const handleLinkExit = useCallback(() => {
    setLinkToken(null);
    setBusy(false);
    setNotice({ kind: "success", text: "The bank-link window was closed. No new account was connected." });
  }, []);

  const handleLinkFailure = useCallback(() => {
    setLinkToken(null);
    setBusy(false);
    setNotice({ kind: "error", text: "Plaid Link could not load. No account was connected; please try again later." });
  }, []);

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setNotice(null);
    try {
      if (createAccount) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        setNotice(data.session
          ? { kind: "success", text: "Your account is ready. You can review the transaction data notice before connecting." }
          : { kind: "success", text: "Check your email to confirm your account, then sign in here." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setPassword("");
      }
    } catch {
      setNotice({ kind: "error", text: "We could not sign you in with those details. Check them and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function disconnectAndDelete() {
    if (!accessToken) return;
    setBusy(true);
    setNotice(null);
    try {
      await requestUserApi(accessToken, "/api/plaid/disconnect", { method: "POST", body: { action: "delete_all" } });
      await loadConnection(accessToken);
      setConfirmDelete(false);
      setNotice({ kind: "success", text: "Victoria stopped using this connection and removed its local transaction data and profile facts. Plaid revocation may still be processing." });
    } catch (error) {
      setNotice({ kind: "error", text: safeErrorMessage(error, "Victoria could not disconnect this account yet.") });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) setNotice({ kind: "error", text: "Victoria could not end this session. Please try again." });
  }

  const hasActiveConsent = connection?.consent?.status === "active" &&
    connection.consent.products.length === 1 && connection.consent.products[0] === "transactions";
  const hasSafeNotice = Boolean(connection && connection.notice.products.length === 1 &&
    connection.notice.products[0] === "transactions" && connection.notice.balancesRequested === false &&
    connection.notice.transfersEnabled === false);
  const isSignedIn = Boolean(session?.access_token);
  const isAuthReady = authReady || !supabase;

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Victoria home"><span className="brand-mark">V</span> victoria</Link>
        {isSignedIn && <button className="quiet-button" type="button" onClick={() => void signOut()} disabled={busy}>Sign out</button>}
      </header>

      <section className="intro">
        <p className="eyebrow">YOUR FINANCIAL COMPANION</p>
        <h1>Make room for the things that matter.</h1>
        <p className="intro-copy">Victoria can use a little transaction history to make spending conversations more personal. You choose what to share, and you can disconnect whenever you want.</p>
        <p className="environment-note"><span className="environment-dot" /> Plaid connection is currently limited to sandbox testing</p>
      </section>

      {notice && <div className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}
      {linkToken && <PlaidLinkLauncher
        token={linkToken}
        onSuccess={(publicToken) => {
          if (publicToken) void handleLinkSuccess(publicToken);
          else setNotice({ kind: "error", text: "Plaid did not return a connection token. No account was connected." });
        }}
        onExit={handleLinkExit}
        onError={handleLinkFailure}
      />}

      {!isAuthReady ? <section className="card loading-card" aria-live="polite">Checking your sign-in…</section> : !isSignedIn ? (
        <section className="card auth-card">
          <div className="card-heading">
            <span className="step">01</span>
            <div><h2>{createAccount ? "Create your Victoria account" : "Sign in to Victoria"}</h2><p>Your transaction data stays tied to your own signed-in account.</p></div>
          </div>
          {!supabase ? <p className="inline-error">Sign-in is not configured for this deployment.</p> : (
            <form className="auth-form" onSubmit={(event) => void submitAuth(event)}>
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <label htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete={createAccount ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
              <button className="primary-button full-width" type="submit" disabled={busy}>{busy ? "Please wait…" : createAccount ? "Create account" : "Sign in"}<span aria-hidden="true">→</span></button>
            </form>
          )}
          <button className="text-button" type="button" onClick={() => { setCreateAccount((current) => !current); setNotice(null); }}>
            {createAccount ? "Already have an account? Sign in" : "New to Victoria? Create an account"}
          </button>
        </section>
      ) : (
        <section className="card connection-card">
          <div className="signed-in-row">
            <div className="card-heading">
              <span className="step">01</span>
              <div><h2>Your transaction connection</h2><p>Signed in as {session?.user.email ?? "your Victoria account"}</p></div>
            </div>
            <span className={`status-pill ${connection?.connectedItemCount ? "connected" : "not-connected"}`}>
              <span /> {connection?.connectedItemCount ? `${connection.connectedItemCount} connected` : "Not connected"}
            </span>
          </div>

          {connection ? (
            <>
              <div className="data-notice">
                <div className="notice-title-row"><span className="step">02</span><div><h3>What Victoria can access</h3><p>Review this before starting the secure Plaid window.</p></div></div>
                <div className="data-grid">
                  <div><span>Purpose</span><strong>Personalized financial profile</strong></div>
                  <div><span>Data</span><strong>{connection.notice.products.join(", ")} only</strong></div>
                  <div><span>History window</span><strong>Last {connection.notice.transactionLookbackDays} days</strong></div>
                  <div><span>Retention</span><strong>Transaction rows up to {connection.notice.retentionDays} days</strong></div>
                  <div className="wide"><span>Fields</span><strong>{connection.notice.dataFields.join(", ")}</strong></div>
                </div>
                <ul className="safety-list">
                  <li>{connection.notice.balancesRequested ? "Balance access is included in this notice." : "No balances, identity data, or account numbers are requested."}</li>
                  <li>{connection.notice.transfersEnabled ? "Transfer or payment capabilities are enabled in this configuration." : "No transfers or payments are available."}</li>
                  <li>{connection.notice.encryptedPlaidTokenStoredForSync ? "A connection token is encrypted on Victoria’s server for authorized sync." : "No Plaid connection token is retained."}</li>
                </ul>
                {!hasSafeNotice && <p className="inline-error" role="alert">This connection configuration does not meet Victoria’s Transactions-only safety boundary, so Plaid linking is unavailable.</p>}
              </div>

              {!hasActiveConsent && hasSafeNotice && (
                <label className="consent-check">
                  <input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} />
                  <span>I have reviewed this notice and authorize Victoria to access my Transactions data for this financial profile.</span>
                </label>
              )}

              {confirmDelete ? (
                <div className="delete-confirm" role="group" aria-label="Confirm disconnect and delete">
                  <div><strong>Disconnect and delete transaction data?</strong><p>Victoria will stop future access and remove locally stored transaction rows and derived profile facts. Plaid revocation may take time to finish.</p></div>
                  <div className="button-row"><button className="danger-button" type="button" onClick={() => void disconnectAndDelete()} disabled={busy}>Confirm disconnect</button><button className="quiet-button" type="button" onClick={() => setConfirmDelete(false)} disabled={busy}>Keep connected</button></div>
                </div>
              ) : (
                <div className="action-row">
                  <button className="primary-button" type="button" onClick={() => void beginLink()} disabled={busy || !connection || !hasSafeNotice || (!hasActiveConsent && !consentChecked)}>
                    {busy ? "Working…" : hasActiveConsent ? (connection.connectedItemCount ? "Connect another account" : "Continue to secure bank link") : "Authorize and continue"}<span aria-hidden="true">→</span>
                  </button>
                  {connection.connectedItemCount > 0 && <button className="danger-text-button" type="button" onClick={() => setConfirmDelete(true)} disabled={busy}>Disconnect and delete data</button>}
                </div>
              )}

              {profileMemories.length > 0 && (
                <div className="profile-section">
                  <div className="notice-title-row"><span className="step">03</span><div><h3>Your saved profile summaries</h3><p>Derived summaries, not a list of individual purchases.</p></div></div>
                  <ul className="profile-list">
                    {profileMemories.map((memory) => <li key={memory.id}>
                      <p>{memory.value}</p>
                      {memory.observedFrom && memory.observedThrough && <span>Observed {memory.observedFrom}–{memory.observedThrough}</span>}
                    </li>)}
                  </ul>
                </div>
              )}
            </>
          ) : connectionLoadFailed ? (
            <div className="loading-card"><p>Victoria could not load your data-use notice.</p><button className="quiet-button" type="button" onClick={() => accessToken && void loadConnection(accessToken).then(() => { setConnectionLoadFailed(false); setNotice(null); }).catch(() => setNotice({ kind: "error", text: "Victoria could not load your connection status. Please try again." }))}>Try again</button></div>
          ) : <div className="loading-card" aria-live="polite">Loading your data-use notice…</div>}
        </section>
      )}

      <footer className="footer"><span>Private by design</span><span>Transactions only · No money movement</span><span>Disconnect any time</span></footer>
    </main>
  );
}

function safeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof UserApiError)) return fallback;
  if (error.status === 401) return "Your session expired. Sign in again to continue.";
  if (error.code === "active_connection_consent_required") return "Review and confirm the data-use notice before opening Plaid Link.";
  return fallback;
}

function PlaidLinkLauncher({
  token,
  onSuccess,
  onExit,
  onError
}: {
  readonly token: string;
  readonly onSuccess: (publicToken: string | null) => void;
  readonly onExit: () => void;
  readonly onError: () => void;
}) {
  const opened = useRef(false);
  const { open, ready, error } = usePlaidLink({ token, onSuccess, onExit });

  useEffect(() => {
    if (!ready || opened.current) return;
    opened.current = true;
    open();
  }, [ready, open]);

  useEffect(() => {
    if (error) onError();
  }, [error, onError]);

  return null;
}
