# Website Apple sign-in setup

The owner chose a redirect to Apple on 2026-10-10. The code is ready locally;
the website button stays hidden until the Services ID and server credentials
are configured. The native app's identifier is `dev.alip.pinkslip`. An Apple
private-relay email is an account address, not an app or Services ID.

## Apple Developer portal (owner)

1. Open Certificates, Identifiers & Profiles → Identifiers → + → Services ID.
   Description: Pinkslip website. Suggested identifier: `dev.alip.pinkslip.web`.
   If that identifier is unavailable, use another unique identifier and tell
   the implementing agent its exact value.
2. Enable Sign in with Apple → Configure. Select the existing Pinkslip primary
   App ID, `dev.alip.pinkslip`. This groups the website with the iOS app so the
   same Apple account can resolve to the existing Pinkslip identity.
3. Add domain `pinkslip.work` and this exact return URL:
   `https://pinkslip.work/api/v2/auth/apple/web/callback`.
   To support the old hostname directly too, add `pinkslip.alip.dev` and
   `https://pinkslip.alip.dev/api/v2/auth/apple/web/callback`.
4. Save. Create or reuse a **Sign in with Apple** key associated with the
   primary App ID. Record its Key ID and retain the downloaded `.p8` file.
   The APNs key is a different capability and is not a substitute.

Apple's [Services ID instructions](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web)
and [private-key instructions](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key)
describe this association. The portal does not require an uploaded domain
verification file.

## Server configuration (after owner authorizes configuration/deployment)

The existing `APPLE_APP_ID` and native `APPLE_SIGN_IN_CLIENT_ID` remain
`dev.alip.pinkslip`; `APPLE_TEAM_ID` is `KV876H8952`. Add these bindings to the
`pinkslip` API Worker, not the web Worker:

| Binding | Value |
| --- | --- |
| `APPLE_WEB_CLIENT_ID` | Exact Services ID from step 1 |
| `APPLE_SIGN_IN_KEY_ID` | Sign in with Apple key's Key ID |
| `APPLE_SIGN_IN_PRIVATE_KEY` | Entire `.p8` PEM, stored as a Cloudflare secret |
| `APPLE_TOKEN_ENCRYPTION_KEY` | 32 random bytes encoded as base64url, stored as a secret |

The identifier and Key ID can be ordinary bindings. If entering them through
Wrangler's secret commands is easier, secret bindings also work. From the
repository root, commands that prompt for values are:

```sh
bunx wrangler secret put APPLE_WEB_CLIENT_ID
bunx wrangler secret put APPLE_SIGN_IN_KEY_ID
```

For the downloaded key, redirect the file into Wrangler rather than displaying
or pasting the private key in chat. Replace the filename below with its real
absolute path:

```sh
bunx wrangler secret put APPLE_SIGN_IN_PRIVATE_KEY < /absolute/path/AuthKey_KEYID.p8
```

Only create the encryption key if it is absent. Changing an existing key makes
previously stored refresh tokens unreadable.

```sh
bun -e 'process.stdout.write(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"))' | bunx wrangler secret put APPLE_TOKEN_ENCRYPTION_KEY
```

These commands mutate production bindings and need the owner's go-ahead. The
code needs an API deployment and web deployment too. No database migration is
required. Configuring the shared server credentials also enables authorization
code exchange and token revocation for subsequent native Apple sign-ins.

## Implementation and local checks

Hono owns both endpoints. Account posts to `/api/v2/auth/apple/web/start`; Apple
form-posts to the callback. A ten-minute encrypted `__Host-` cookie binds state,
nonce, website origin, Services ID, invite-code grant and the live guest session.
The callback checks both Apple identity tokens, links only verified emails,
rotates the Pinkslip session, and returns to Account. It never trusts Apple's
unsigned `user.email` field. Refresh-token storage records the issuing client
inside the encrypted value so deletion uses the matching client credentials;
existing native token rows remain readable.

1. Run `bun test tests/apple-web.test.ts tests/apple-oauth.test.ts` from the
   repository root. Expect protocol, cancellation, state/expiry, token mismatch,
   verified-email protection, guest merge and revocation checks to pass.
2. Run `bun run dev` only if no web dev server is running, then
   `cd apps/webapp && bunx playwright test you.pw.ts`. At
   `http://localhost:3000/you/account`, the button is absent without config;
   fixture tests exercise its POST and return messages without contacting Apple.
3. After approved configuration and deployment, open
   `https://pinkslip.work/you/account` as a guest. Cancel Apple sign-in once:
   return to Account with the guest intact. Then complete sign-in using the same
   Apple account as the phone. Expect the same saved jobs and admin role.
   Reload and open a second tab to check the cookie session.
4. Use a disposable account to check deletion and Apple revocation. Do not
   delete the owner's admin account for testing.

The actual Apple portal flow remains an owner check; local tokens and fixture
tests cannot prove that a Services ID or key is configured correctly in Apple.
