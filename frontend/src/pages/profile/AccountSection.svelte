<script lang="ts">
  // Account card: guest → sign-in paths, signed-in → session management.
  // Owns the auth flows; the parent only needs to reload after a change.
  import { api, type AccountInfo } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import { isNativeIosAuthAvailable, signInWithAppleNative } from "../../lib/native-auth";
  import Modal from "../../components/Modal.svelte";

  let {
    sessionState,
    account,
    onError,
    onSuccess,
    onReload,
  }: {
    sessionState: "guest" | "authenticated";
    account: AccountInfo | null;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    onReload: () => Promise<void>;
  } = $props();

  let emailLogin: string = $state("");
  let sendingEmailLogin: boolean = $state(false);
  let signingInWithApple: boolean = $state(false);
  let signingOut: boolean = $state(false);
  let deletingAccount: boolean = $state(false);
  let showDeleteConfirm: boolean = $state(false);

  async function handleAppleLogin() {
    signingInWithApple = true;
    try {
      const credential = await signInWithAppleNative();
      await api.auth.signInWithApple(credential);
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
      await onReload();
      onSuccess("Signed out. You’re back in guest mode on this device.");
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
      await api.auth.deleteAccount();
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
  <h2 class="section-eyebrow">Account</h2>
  <div class="surface-card" style="padding: 18px; display: flex; flex-direction: column; gap: 14px;">
    {#if sessionState === "authenticated"}
      <div style="display: flex; justify-content: space-between; gap: 12px; align-items: start;">
        <div>
          <div style="font-size: var(--fs-base); font-weight: 600;">Signed in</div>
          <div style="font-size: var(--fs-sm); color: var(--color-ink-3); margin-top: 4px;">
            {account?.email ?? "Your account is active"}{#if account?.provider} · via {account.provider === "apple" ? "Apple" : "email"}{/if}
          </div>
          <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 8px;">
            Jobs, profile, preferences, and your synced resume can follow you across devices.
          </div>
        </div>
        <span class="tag">sync on</span>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        <button class="btn-secondary" type="button" onclick={handleLogout} disabled={signingOut}>
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
        <button class="btn-secondary btn-danger" type="button" onclick={() => (showDeleteConfirm = true)} disabled={deletingAccount}>
          Delete account
        </button>
      </div>
    {:else}
      <div style="display: flex; justify-content: space-between; gap: 12px; align-items: start;">
        <div>
          <div style="font-size: var(--fs-base); font-weight: 600;">Using pinkslip as guest on this device</div>
          <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 8px;">
            Create an account to sync your jobs, profile, and resume across devices.
          </div>
        </div>
        <span class="tag">guest</span>
      </div>

      {#if isNativeIosAuthAvailable()}
        <button
          class="btn-primary btn-accent"
          type="button"
          onclick={handleAppleLogin}
          disabled={signingInWithApple}
        >
          {signingInWithApple ? "Connecting..." : "Continue with Apple"}
        </button>
      {/if}

      <div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end;">
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
          {sendingEmailLogin ? "Sending..." : "Send link"}
        </button>
      </div>
    {/if}
  </div>
</section>

{#if showDeleteConfirm}
  <Modal
    title="Delete your account?"
    subtitle="Your account and synced data will be permanently deleted. This cannot be undone. Data saved on this device stays until you clear it."
    busy={deletingAccount}
    maxWidth={340}
    onclose={() => (showDeleteConfirm = false)}
  >
    <div class="action-row">
      <button class="btn-secondary" onclick={() => (showDeleteConfirm = false)} disabled={deletingAccount}>Cancel</button>
      <button class="btn-secondary btn-danger" style="flex: 1;" onclick={handleDeleteAccount} disabled={deletingAccount}>
        {deletingAccount ? "Deleting..." : "Delete account"}
      </button>
    </div>
  </Modal>
{/if}
