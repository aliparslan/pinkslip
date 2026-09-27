<script lang="ts">
  // Owns the auth flows; the parent only needs to reload after a change.
  import { api, type AccountInfo } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import { isNativeIosAuthAvailable, signInWithAppleNative } from "../../lib/native-auth";
  import { syncSessionAccess } from "../../lib/session-access";
  import { clearBootstrapCache } from "../../lib/bootstrap-cache";
  import { clearJobReadCache } from "../../lib/job-read-cache";
  import Modal from "../../components/Modal.svelte";
  import Spinner from "../../components/Spinner.svelte";
  import AppleMark from "../../components/AppleMark.svelte";

  let {
    sessionState,
    account,
    onError,
    onSuccess,
    onReload,
    showHeading = true,
    nativeIos = false,
  }: {
    sessionState: "anonymous" | "guest" | "authenticated";
    account: AccountInfo | null;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    onReload: () => Promise<void>;
    showHeading?: boolean;
    nativeIos?: boolean;
  } = $props();

  let emailLogin: string = $state("");
  let emailLoginInput: HTMLInputElement | null = $state(null);
  let emailLoginError: string | null = $state(null);
  let emailLoginSentTo: string | null = $state(null);
  let sendingEmailLogin: boolean = $state(false);
  let signingInWithApple: boolean = $state(false);
  let signingOut: boolean = $state(false);
  let deletingAccount: boolean = $state(false);
  let showDeleteConfirm: boolean = $state(false);
  let showRestartConfirm: boolean = $state(false);

  function emailAddressesMatch(current: string, sent: string | null): boolean {
    return sent !== null
      && current.trim().toLocaleLowerCase() === sent.toLocaleLowerCase();
  }

  let resendingEmailLogin = $derived(emailAddressesMatch(emailLogin, emailLoginSentTo));

  async function handleAppleLogin() {
    signingInWithApple = true;
    try {
      const credential = await signInWithAppleNative();
      const response = await api.auth.signInWithApple(credential);
      syncSessionAccess(response);
      await onReload();
      onSuccess(`Signed in. Your ${nativeIos ? "Pinkslip" : "pinkslip"} data now syncs across devices.`);
    } catch (e) {
      if ((e as { code?: string })?.code === "CANCELED") return; // user dismissed the sheet — not an error
      onError(errorMessage(e, "Could not complete Sign in with Apple."));
    } finally {
      signingInWithApple = false;
    }
  }

  async function handleEmailLoginStart() {
    if (sendingEmailLogin) return;
    const normalizedEmail = emailLogin.trim();
    emailLogin = normalizedEmail;
    emailLoginError = null;
    if (!normalizedEmail) {
      emailLoginError = "Enter your email address.";
      emailLoginInput?.focus();
      return;
    }
    if (emailLoginInput) emailLoginInput.value = normalizedEmail;
    if (emailLoginInput && !emailLoginInput.validity.valid) {
      emailLoginError = "Enter a valid email address.";
      emailLoginInput.focus();
      return;
    }
    sendingEmailLogin = true;
    try {
      await api.auth.startEmailLogin(normalizedEmail);
      emailLoginSentTo = normalizedEmail;
      onSuccess(`Sign-in link sent to ${normalizedEmail}.`);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      sendingEmailLogin = false;
    }
  }

  async function handleLogout() {
    signingOut = true;
    try {
      await api.auth.logout();
      await clearJobReadCache();
      if (nativeIos) clearBootstrapCache();
      const nextUrl = new URL(window.location.href);
      if (nativeIos) {
        nextUrl.hash = "/";
      } else {
        nextUrl.pathname = "/";
        nextUrl.search = "";
        nextUrl.hash = "";
      }
      window.history.replaceState(window.history.state, "", nextUrl.toString());
      window.location.reload();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      signingOut = false;
    }
  }

  async function handleDeleteAccount() {
    if (deletingAccount) return;
    deletingAccount = true;
    try {
      const response = await api.auth.deleteAccount();
      await clearJobReadCache();
      syncSessionAccess(response);
      showDeleteConfirm = false;
      await onReload();
      onSuccess(response.apple_revoke_required
        ? "Account deleted. Remove Pinkslip in your Apple ID’s Sign in with Apple settings to finish disconnecting it."
        : `Account deleted. You can keep using ${nativeIos ? "Pinkslip" : "pinkslip"} as a guest.`);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      deletingAccount = false;
    }
  }
</script>

<section class="account-section">
  {#if showHeading}
    <h2 class="section-eyebrow">Account</h2>
  {:else if nativeIos}
    <h2 class="account-section-title">Sign-in and data</h2>
  {/if}
  <div class="content-card stack-lg account-content">
    {#if sessionState === "authenticated"}
      <div class="split-row start">
        <div class="flex-fill">
          <div class="row-title">Signed in</div>
          <div class="helper-text account-identity">
            {account?.email ?? "Your account is active"}{#if account?.provider} · via {account.provider === "apple" ? "Apple" : "email"}{/if}
          </div>
          {#if !nativeIos}
            <div class="helper-text account-explainer">
              Jobs, profile, preferences, and your synced resume can follow you across devices.
            </div>
          {/if}
        </div>
        {#if !nativeIos}<span class="tag">sync on</span>{/if}
      </div>

      <div class="action-grid">
        <button class="btn-secondary" type="button" onclick={() => (showRestartConfirm = true)} disabled={signingOut}>
          Log out
        </button>
        <button class="btn-secondary btn-danger" type="button" onclick={() => (showDeleteConfirm = true)} disabled={deletingAccount}>
          Delete account
        </button>
      </div>
    {:else}
      <div class="split-row start">
        <div class="flex-fill">
          <div class="row-title">Browsing as a guest</div>
          <div class="helper-text account-explainer">
            Sign in to sync your jobs, preferences, and resume across devices.
          </div>
        </div>
      </div>

      {#if isNativeIosAuthAvailable()}
        <button
          class="btn-primary btn-apple full-width"
          type="button"
          onclick={handleAppleLogin}
          disabled={signingInWithApple}
        >
          {#if signingInWithApple}<span class="btn-apple-spinner"><Spinner /></span>{/if}
          <AppleMark />
          Continue with Apple
        </button>
      {/if}

      <form
        class="inline-form-row email-login-form"
        novalidate
        aria-busy={sendingEmailLogin}
        onsubmit={(event) => {
          event.preventDefault();
          void handleEmailLoginStart();
        }}
      >
        <div class="email-login-field">
          <label for="email-login" class="field-label">Continue with email</label>
          <input
            bind:this={emailLoginInput}
            id="email-login"
            name="email"
            type="email"
            class="input-field"
            placeholder="you@example.com"
            bind:value={emailLogin}
            required
            autocapitalize="off"
            autocomplete="email"
            inputmode="email"
            spellcheck="false"
            aria-invalid={emailLoginError ? "true" : undefined}
            aria-describedby={emailLoginError
              ? "email-login-error"
              : emailLoginSentTo
                ? "email-login-status"
                : undefined}
            oninput={() => (emailLoginError = null)}
          />
        </div>
        <button class="btn-secondary" type="submit" disabled={sendingEmailLogin}>
          {#if sendingEmailLogin}<Spinner />{/if}
          {resendingEmailLogin ? "Resend link" : "Send link"}
        </button>
        {#if emailLoginError}
          <div id="email-login-error" class="alert alert-error email-login-feedback" role="alert">
            {emailLoginError}
          </div>
        {:else if emailLoginSentTo}
          <div id="email-login-status" class="alert alert-success email-login-feedback">
            Link sent to <strong>{emailLoginSentTo}</strong>. Open it on this device to finish signing in.
          </div>
        {/if}
      </form>

      <button class="text-button" type="button" onclick={() => (showRestartConfirm = true)} disabled={signingOut}>
        Restart onboarding
      </button>
    {/if}
  </div>
</section>

<style>
  .account-section-title {
    margin: 0 0 var(--space-3);
    color: var(--color-ink);
    font-family: var(--font-display);
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.3;
  }

  .email-login-field { min-width: 0; }

  .email-login-feedback {
    grid-column: 1 / -1;
    margin-top: var(--space-1);
    overflow-wrap: anywhere;
  }

</style>

{#if showRestartConfirm}
  <Modal
    title={sessionState === "authenticated" ? "Log out?" : "Restart onboarding?"}
    subtitle={sessionState === "authenticated"
      ? "You’ll be signed out on this device. Your account data stays saved."
      : "This starts a new guest profile. The jobs and preferences in this guest session will no longer be accessible."}
    busy={signingOut}
    maxWidth={340}
    onclose={() => (showRestartConfirm = false)}
  >
    <div class="action-row">
      <button class="btn-secondary flex-fill" onclick={() => (showRestartConfirm = false)} disabled={signingOut}>Cancel</button>
      <button class="btn-primary btn-accent flex-fill" onclick={handleLogout} disabled={signingOut}>
        {#if signingOut}<Spinner />{/if}
        {sessionState === "authenticated" ? "Log out" : "Restart"}
      </button>
    </div>
  </Modal>
{/if}

{#if showDeleteConfirm}
  <Modal
    title="Delete your account?"
    subtitle="Your account and synced data will be permanently deleted. This cannot be undone. Data saved on this device stays until you clear it."
    busy={deletingAccount}
    maxWidth={340}
    onclose={() => (showDeleteConfirm = false)}
  >
    <div class="action-row">
      <button class="btn-secondary flex-fill" onclick={() => (showDeleteConfirm = false)} disabled={deletingAccount}>Cancel</button>
      <button class="btn-secondary btn-danger flex-fill" onclick={handleDeleteAccount} disabled={deletingAccount}>
        {#if deletingAccount}<Spinner />{/if}
        Delete account
      </button>
    </div>
  </Modal>
{/if}
