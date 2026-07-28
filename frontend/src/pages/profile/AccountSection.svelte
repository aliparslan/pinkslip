<script lang="ts">
  // Account card: guest → sign-in paths, signed-in → session management.
  // Owns the auth flows; the parent only needs to reload after a change.
  import { api, type AccountInfo } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import { isNativeIosAuthAvailable, signInWithAppleNative } from "../../lib/native-auth";
  import { syncSessionAccess } from "../../lib/session-access";
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
  }: {
    sessionState: "anonymous" | "guest" | "authenticated";
    account: AccountInfo | null;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    onReload: () => Promise<void>;
    showHeading?: boolean;
  } = $props();

  let emailLogin: string = $state("");
  let sendingEmailLogin: boolean = $state(false);
  let signingInWithApple: boolean = $state(false);
  let signingOut: boolean = $state(false);
  let deletingAccount: boolean = $state(false);
  let showDeleteConfirm: boolean = $state(false);
  let showRestartConfirm: boolean = $state(false);

  async function handleAppleLogin() {
    signingInWithApple = true;
    try {
      const credential = await signInWithAppleNative();
      const response = await api.auth.signInWithApple(credential);
      syncSessionAccess(response);
      await onReload();
      onSuccess("Signed in. Your pinkslip data now syncs across devices.");
    } catch (e) {
      if ((e as { code?: string })?.code === "CANCELED") return; // user dismissed the sheet — not an error
      onError(errorMessage(e, "Could not complete Sign in with Apple."));
    } finally {
      signingInWithApple = false;
    }
  }

  async function handleEmailLoginStart() {
    if (!emailLogin.trim() || sendingEmailLogin) return;
    sendingEmailLogin = true;
    try {
      await api.auth.startEmailLogin(emailLogin.trim());
      onSuccess("Check your email for a sign-in link.");
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
      const nextUrl = new URL(window.location.href);
      nextUrl.hash = "/";
      window.history.replaceState({}, "", nextUrl.toString());
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
      syncSessionAccess(response);
      showDeleteConfirm = false;
      await onReload();
      onSuccess("Account deleted. You can keep using pinkslip as a guest.");
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      deletingAccount = false;
    }
  }
</script>

<section>
  {#if showHeading}<h2 class="section-eyebrow">Account</h2>{/if}
  <div class="content-card stack-lg">
    {#if sessionState === "authenticated"}
      <div class="split-row start">
        <div class="flex-fill">
          <div class="row-title">Signed in</div>
          <div class="helper-text account-identity">
            {account?.email ?? "Your account is active"}{#if account?.provider} · via {account.provider === "apple" ? "Apple" : "email"}{/if}
          </div>
          <div class="helper-text account-explainer">
            Jobs, profile, preferences, and your synced resume can follow you across devices.
          </div>
        </div>
        <span class="tag">sync on</span>
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
          {#if signingInWithApple}<Spinner />{/if}
          <AppleMark />
          Continue with Apple
        </button>
      {/if}

      <div class="inline-form-row">
        <div>
          <label for="email-login" class="field-label">Continue with email</label>
          <input
            id="email-login"
            type="email"
            class="input-field"
            placeholder="you@example.com"
            bind:value={emailLogin}
            autocapitalize="off"
            autocomplete="email"
            spellcheck="false"
            onkeydown={(event) => event.key === "Enter" && void handleEmailLoginStart()}
          />
        </div>
        <button class="btn-secondary" type="button" onclick={handleEmailLoginStart} disabled={sendingEmailLogin || !emailLogin.trim()}>
          {#if sendingEmailLogin}<Spinner />{/if}
          Send link
        </button>
      </div>

      <button class="text-button" type="button" onclick={() => (showRestartConfirm = true)} disabled={signingOut}>
        Restart onboarding
      </button>
    {/if}
  </div>
</section>

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
