/* Optional Supabase account sync. Guest mode never loads the SDK or contacts a server. */
(() => {
  "use strict";
  const config = window.MINDSPARK_CONFIG || {};
  const dialog = document.getElementById("accountDialog");
  const status = document.getElementById("accountStatus");
  const emailForm = document.getElementById("accountEmailForm");
  const codeForm = document.getElementById("accountCodeForm");
  const signOut = document.getElementById("accountSignOut");
  let client = window.__MINDSPARK_TEST_SUPABASE_CLIENT__ || null;
  let user = null;
  let timer = null;
  let syncing = false;
  let configured = Boolean(config.url && config.publishableKey) || Boolean(client);
  const OWNER_KEY = "mindspark-sync-owner";
  const CACHE_PREFIX = "mindspark-account-cache:";
  const setStatus = (message) => { if (status) status.textContent = message; };
  const setSignedIn = (nextUser) => {
    user = nextUser || null;
    document.getElementById("accountLabel").textContent = user ? (user.email || "Account synced") : "Guest learner";
    emailForm?.classList.toggle("hidden", Boolean(user));
    codeForm?.classList.add("hidden");
    signOut?.classList.toggle("hidden", !user);
    if (user) setStatus("Signed in. Your progress syncs when you are online.");
  };
  async function getClient() {
    if (client) return client;
    if (!configured) throw new Error("Accounts are not configured for this preview yet. Guest mode remains available.");
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm");
    client = createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    return client;
  }
  async function syncProgress() {
    if (!user || syncing) return;
    syncing = true;
    try {
      const api = await getClient();
      // Optimistic concurrency: if another device updates at the same time, reload and merge again.
      // Guest state is merged before every write, so account creation never replaces local progress.
      const owner = localStorage.getItem(OWNER_KEY);
      if (owner !== user.id) {
        if (owner) localStorage.setItem(CACHE_PREFIX + owner, JSON.stringify(window.mindsparkStore.read()));
        const cached = localStorage.getItem(CACHE_PREFIX + user.id);
        window.mindsparkStore.replace(cached ? JSON.parse(cached) : null);
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: row, error: readError } = await api.from("mindspark_progress").select("payload,updated_at").eq("user_id", user.id).maybeSingle();
        if (readError) throw readError;
        const merged = row?.payload ? window.mindsparkStore.merge(row.payload) : window.mindsparkStore.read();
        const updatedAt = new Date().toISOString();
        if (!row) {
          const { error } = await api.from("mindspark_progress").insert({ user_id: user.id, payload: merged, updated_at: updatedAt });
          if (!error) { localStorage.setItem(OWNER_KEY, user.id); localStorage.removeItem(CACHE_PREFIX + user.id); setStatus("Progress synced securely to your account."); return; }
          if (error.code === "23505") continue; // another device created the first row
          throw error;
        }
        const { data: saved, error } = await api.from("mindspark_progress").update({ payload: merged, updated_at: updatedAt }).eq("user_id", user.id).eq("updated_at", row.updated_at).select("updated_at").maybeSingle();
        if (error) throw error;
        if (saved) { localStorage.setItem(OWNER_KEY, user.id); localStorage.removeItem(CACHE_PREFIX + user.id); setStatus("Progress synced securely to your account."); return; }
      }
      throw new Error("Another device is syncing right now. Your local progress is safe; reconnect to retry.");
    } catch (error) {
      setStatus("Sync paused: " + (error?.message || "connection unavailable") + ". Your browser copy is still saved.");
    } finally { syncing = false; }
  }
  document.getElementById("accountOpen")?.addEventListener("click", () => dialog?.showModal());
  emailForm?.classList.toggle("hidden", !configured);
  document.getElementById("accountConfigMessage").textContent = configured ? "Sign in with a one-time email code. Your guest progress will be combined with account progress." : "Cloud sync is not configured for this preview. Guest mode works fully on this device.";
  emailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Sending a sign-in code…");
    try {
      const api = await getClient();
      const email = document.getElementById("accountEmail").value.trim();
      const { error } = await api.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error;
      emailForm.classList.add("hidden"); codeForm?.classList.remove("hidden");
      setStatus("Check your inbox for a one-time code. Your guest progress is unchanged.");
    } catch (error) { setStatus(error?.message || "Could not send a code. Check the address and try again."); }
  });
  codeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Verifying your code…");
    try {
      const api = await getClient();
      const email = document.getElementById("accountEmail").value.trim();
      const token = document.getElementById("accountCode").value.trim();
      const { data, error } = await api.auth.verifyOtp({ email, token, type: "email" });
      if (error) throw error;
      setSignedIn(data.user);
      await syncProgress();
    } catch (error) { setStatus(error?.message || "That code could not be verified. Request a new code and try again."); }
  });
  signOut?.addEventListener("click", async () => {
    try { const api = await getClient(); const { error } = await api.auth.signOut(); if (error) throw error; setSignedIn(null); setStatus("Signed out. This browser's guest progress is still here."); }
    catch (error) { setStatus(error?.message || "Could not sign out right now."); }
  });
  window.addEventListener("mindspark:local-save", () => {
    if (!user || syncing) return;
    clearTimeout(timer);
    timer = setTimeout(syncProgress, 1200);
  });
  window.addEventListener("online", () => { if (user) syncProgress(); });
  if (configured) getClient().then((api) => api.auth.getSession()).then(({ data, error }) => { if (error) throw error; if (data.session?.user) { setSignedIn(data.session.user); syncProgress(); } }).catch(() => setStatus("Could not restore your account session. Guest progress remains available."));
  window.mindsparkAccount = { signIn: (email) => client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }), verify: async (email, token) => { const result = await client.auth.verifyOtp({ email, token, type: "email" }); if (result.data?.user) { setSignedIn(result.data.user); await syncProgress(); } return result; }, sync: syncProgress };
})();
