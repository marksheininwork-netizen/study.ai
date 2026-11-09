/* Optional Clerk email-code sign-in with owner-scoped Cloudflare D1 sync. Guest mode stays local. */
(() => {
  "use strict";
  const config = window.MINDSPARK_CONFIG || {};
  const dialog = document.getElementById("accountDialog");
  const status = document.getElementById("accountStatus");
  const signInPanel = document.getElementById("accountSignInPanel");
  const signInButton = document.getElementById("accountStartSignIn");
  const clerkMount = document.getElementById("clerkSignIn");
  const ageConfirm = document.getElementById("accountAgeConfirm");
  const signOutButton = document.getElementById("accountSignOut");
  const deleteCloudButton = document.getElementById("accountDeleteCloud");
  const testAuth = window.__MINDSPARK_TEST_AUTH__ || null;
  const OWNER_KEY = "mindspark-sync-owner";
  const CACHE_PREFIX = "mindspark-account-cache:";
  let clerk = testAuth;
  let clerkPromise = null;
  let user = null;
  let remoteVersion = 0;
  let timer = null;
  let syncing = false;
  let mounted = false;
  let activeOwner = null;

  const setStatus = (message) => { if (status) status.textContent = message; };
  const configured = Boolean(config.clerkPublishableKey && config.clerkPublishableKey.startsWith("pk_")) || Boolean(testAuth);
  if (signInButton) signInButton.disabled = !configured;
  if (signInPanel) signInPanel.classList.toggle("hidden", !configured);
  if (document.getElementById("accountConfigMessage")) {
    document.getElementById("accountConfigMessage").textContent = configured
      ? "Secure email-code accounts are optional. Cloud sync stores only your learning progress; your email stays with the identity provider."
      : "Account sync is not configured for this staging preview. Guest mode stays free and saves on this device.";
  }

  function clerkFrontendApi() {
    try {
      const value = atob(config.clerkPublishableKey.split("_")[2] || "");
      return value.replace(/\$$/, "");
    } catch { return ""; }
  }

  async function getAuth() {
    if (clerk) return clerk;
    if (!configured) throw new Error("Accounts are not configured yet. Guest mode remains available.");
    if (!clerkPromise) clerkPromise = (async () => {
      const frontendApi = clerkFrontendApi();
      if (!frontendApi || !/^[a-zA-Z0-9.-]+$/.test(frontendApi)) throw new Error("Account sign-in configuration is invalid.");
      const loadScript = (src, publishableKey = false) => new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.crossOrigin = "anonymous";
        if (publishableKey) script.dataset.clerkPublishableKey = config.clerkPublishableKey;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Secure sign-in could not be loaded. Guest mode still works."));
        document.head.appendChild(script);
      });
      // Clerk's current JS SDK separates the prebuilt auth components into @clerk/ui.
      // Load it first, as required by Clerk's vanilla JavaScript quickstart.
      if (!window.__internal_ClerkUICtor) await loadScript("https://" + frontendApi + "/npm/@clerk/ui@1/dist/ui.browser.js");
      if (!window.__internal_ClerkUICtor) throw new Error("Secure sign-in components could not be loaded. Guest mode still works.");
      if (!window.Clerk) await loadScript("https://" + frontendApi + "/npm/@clerk/clerk-js@6/dist/clerk.browser.js", true);
      if (!window.Clerk) throw new Error("Secure sign-in could not be loaded. Guest mode still works.");
      clerk = window.Clerk;
      await clerk.load({ publishableKey: config.clerkPublishableKey, ui: { ClerkUI: window.__internal_ClerkUICtor } });
      return clerk;
    })();
    return clerkPromise;
  }

  function snapshotCache(owner = user?.id) {
    if (!owner || !window.mindsparkStore) return;
    try {
      localStorage.setItem(CACHE_PREFIX + owner, JSON.stringify({ data: window.mindsparkStore.read(), version: remoteVersion }));
    } catch {
      throw new Error("This browser cannot safely switch accounts because its storage is full. Export a backup before continuing.");
    }
  }

  function switchLocalOwner(nextOwner) {
    const previousOwner = localStorage.getItem(OWNER_KEY);
    if (previousOwner === nextOwner) {
      activeOwner = nextOwner;
      return;
    }
    if (previousOwner) snapshotCache(previousOwner);
    if (previousOwner) {
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(CACHE_PREFIX + nextOwner) || "null"); }
      catch { cached = null; }
      window.mindsparkStore.replace(cached?.data || null);
      remoteVersion = Number.isSafeInteger(cached?.version) ? cached.version : 0;
    } else {
      // No owner means the current device data is guest progress. Keep it for safe first-login migration.
      remoteVersion = 0;
    }
    localStorage.setItem(OWNER_KEY, nextOwner);
    activeOwner = nextOwner;
  }

  function showSignedIn(nextUser) {
    if (!nextUser?.id) return;
    const changed = user?.id !== nextUser.id;
    user = { id: nextUser.id };
    document.querySelector(".avatar").textContent = "A";
    document.getElementById("accountLabel").textContent = "Account synced";
    signInPanel?.classList.add("hidden");
    signOutButton?.classList.remove("hidden");
    deleteCloudButton?.classList.remove("hidden");
    if (changed) {
      try { switchLocalOwner(user.id); }
      catch (error) { setStatus(error.message); return; }
      syncProgress();
    }
  }

  function showGuest(message) {
    if (user?.id && activeOwner === user.id) {
      try { snapshotCache(user.id); } catch (error) { setStatus(error.message); }
      try { window.mindsparkStore.replace(null); } catch {}
      try { localStorage.removeItem(OWNER_KEY); } catch {}
    }
    user = null;
    activeOwner = null;
    remoteVersion = 0;
    document.querySelector(".avatar").textContent = "G";
    document.getElementById("accountLabel").textContent = "Guest learner";
    signInPanel?.classList.toggle("hidden", !configured);
    signOutButton?.classList.add("hidden");
    deleteCloudButton?.classList.add("hidden");
    if (message) setStatus(message);
  }

  async function requestProgress(method, payload, path = "/api/progress") {
    const auth = await getAuth();
    const token = await auth.session?.getToken();
    if (!token) throw new Error("Your sign-in expired. Sign in again to sync.");
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + token,
        ...(method === "GET" ? {} : { "Content-Type": "application/json" })
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(payload) })
    });
    let body;
    try { body = await response.json(); } catch { body = {}; }
    return { response, body };
  }

  async function syncProgress() {
    if (!user || syncing || !navigator.onLine) return;
    syncing = true;
    try {
      const loaded = await requestProgress("GET");
      if (!loaded.response.ok) throw new Error(loaded.body.error || "Could not load account progress.");
      let record = loaded.body.record;
      if (record?.payload) {
        const currentOwner = localStorage.getItem(OWNER_KEY);
        if (currentOwner !== user.id) switchLocalOwner(user.id);
        window.mindsparkStore.merge(record.payload);
        remoteVersion = record.version;
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const payload = window.mindsparkStore.read();
        const saved = await requestProgress("PUT", { payload, baseVersion: remoteVersion });
        if (saved.response.ok) {
          remoteVersion = saved.body.record.version;
          localStorage.setItem(OWNER_KEY, user.id);
          snapshotCache(user.id);
          setStatus("Progress synced securely to your account.");
          return;
        }
        if (saved.response.status !== 409 || !saved.body.record) throw new Error(saved.body.error || "Could not sync progress.");
        record = saved.body.record;
        window.mindsparkStore.merge(record.payload);
        remoteVersion = record.version;
      }
      throw new Error("Another device is syncing right now. Your local progress is safe; reconnect to retry.");
    } catch (error) {
      setStatus("Sync paused: " + (error?.message || "connection unavailable") + ". Your browser copy is still saved.");
    } finally { syncing = false; }
  }

  async function initializeAuth() {
    if (!configured) return;
    try {
      const auth = await getAuth();
      if (auth.addListener) auth.addListener((state) => {
        const nextUser = state?.user || auth.user;
        if (nextUser?.id) showSignedIn(nextUser);
        else if (user) showGuest("Signed out. Guest progress is still saved on this device.");
      });
      if (auth.user?.id) showSignedIn(auth.user);
    } catch (error) {
      setStatus(error?.message || "Secure account sign-in is unavailable. Guest mode remains available.");
    }
  }

  document.getElementById("accountOpen")?.addEventListener("click", () => dialog?.showModal());
  dialog?.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
  signInButton?.addEventListener("click", async () => {
    if (!ageConfirm?.checked) {
      setStatus("Cloud accounts are currently for people age 16 or older. Under 16, use free guest mode.");
      return;
    }
    setStatus("Loading secure sign-in…");
    try {
      const auth = await getAuth();
      if (!mounted) {
        clerkMount?.classList.remove("hidden");
        auth.mountSignIn(clerkMount, { routing: "hash", signUpForceRedirectUrl: location.origin + "/", signInForceRedirectUrl: location.origin + "/" });
        mounted = true;
      }
      setStatus("Use the secure email-code sign-in form below. Your email is not stored in MindSpark.");
    } catch (error) { setStatus(error?.message || "Could not start secure sign-in."); }
  });

  signOutButton?.addEventListener("click", async () => {
    if (!user) return;
    try {
      snapshotCache(user.id);
      const auth = await getAuth();
      await auth.signOut();
      showGuest("Signed out. This device's account copy is kept in its private local cache.");
    } catch (error) { setStatus(error?.message || "Could not sign out. Your local copy is still saved."); }
  });

  deleteCloudButton?.addEventListener("click", async () => {
    if (!user || window.prompt("This permanently deletes your MindSpark cloud progress and Clerk sign-in identity. This browser's account cache will also be cleared. Other devices may retain local cached copies until cleared there. Type DELETE to confirm.") !== "DELETE") return;
    const deletingUser = user;
    setStatus("Deleting account and cloud progress…");
    try {
      const result = await requestProgress("DELETE", undefined, "/api/account");
      if (!result.response.ok) throw new Error(result.body.error || "Account deletion could not be completed.");
      const auth = await getAuth();
      user = null;
      activeOwner = null;
      remoteVersion = 0;
      try { await auth.signOut(); } catch { /* Clerk has already deleted the identity and revoked its sessions. */ }
      localStorage.removeItem(CACHE_PREFIX + deletingUser.id);
      localStorage.removeItem(OWNER_KEY);
      window.mindsparkStore.replace(null);
      showGuest("Your account and cloud progress were deleted. You are signed out; guest mode is ready.");
    } catch (error) { setStatus(error?.message || "Account deletion could not be completed."); }
  });

  window.addEventListener("mindspark:local-save", () => {
    if (!user || syncing) return;
    clearTimeout(timer);
    timer = setTimeout(syncProgress, 1200);
  });
  window.addEventListener("online", () => { if (user) syncProgress(); });
  initializeAuth();
  window.mindsparkAccount = { signIn: () => signInButton?.click(), sync: syncProgress, signOut: () => signOutButton?.click() };
})();
