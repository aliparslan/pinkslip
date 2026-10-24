# Setting up Pro's subscriptions in App Store Connect (2026-10-24)

For the owner. The server side is live (backend inventory, step 9); these
steps let Apple sell Pro. App Store Connect is at
[appstoreconnect.apple.com](https://appstoreconnect.apple.com). Only the
Account Holder can do step 1.

## 1. The Paid Apps agreement, banking and tax

1. On App Store Connect's home page, click **Business** (it used to be
   called "Agreements, Tax, and Banking").
2. On the **Agreements** tab, find the **Paid Apps** row and click **View
   and Agree to Terms**. It may ask for a two-factor code. Read, then
   **Agree**; this can't be undone.
3. In the same row, fill in what it asks for:
   - **Bank account:** add the account payouts go to.
   - **Tax forms:** the U.S. form (W-9) as an individual.
   - **Contacts:** every role (senior management, finance, technical,
     legal, marketing) can be you. Missing contacts keep the agreement
     from going active.
4. The status goes from Processing to **Active**, sometimes after a day.

If there's no Paid Apps row: make sure you're signed in as the Account
Holder. Some developers report it missing or the Agree button failing;
Apple's developer forums have threads on it, and Apple's support fixes it.

**The Small Business Program** (15% instead of 30% in a subscription's first
year) is a separate application at
[developer.apple.com/app-store/small-business-program](https://developer.apple.com/app-store/small-business-program/).

## 2. The subscription group and the two subscriptions

1. **Apps → Pinkslip →** in the sidebar, **Subscriptions** (under
   Monetization).
2. Next to Subscription Groups, click **+** (or **Create**). Reference
   name: `Pinkslip Pro`. Customers don't see reference names.
3. In the group, click **Create** next to Subscriptions. The dialog asks:
   - **Reference Name:** `Pro Weekly` (only you see it).
   - **Product ID:** `dev.alip.pinkslip.pro.weekly`, exactly. The server
     looks for this ID, and Apple never lets an ID be changed or reused.
   - **Subscription Duration:** 1 Week.
4. Create the second the same way: `Pro Monthly`,
   `dev.alip.pinkslip.pro.monthly`, **1 Month**.
5. On each subscription's page:
   - **Availability:** all countries and regions (or the US only).
   - **Subscription Prices → Add Subscription Price:** United States,
     $5.00 for the weekly and $15.00 for the monthly (if a round price
     isn't in the list, $4.99 and $14.99). Apple fills in other countries.
   - **The free trial:** in Subscription Prices, **View all Subscription
     Pricing → Set up Introductory Offer**; all countries; start today, no
     end date; type **Free**, duration **3 Days**. Each person gets one
     introductory offer per group, so the trial is once per person.
   - **App Store Localization → English (U.S.):** display name `Pinkslip
     Pro` (weekly) and `Pinkslip Pro` (monthly), with a short description
     such as "No weekly limits on applying for you and tailoring." This
     shows in Apple's purchase sheet and in Settings → Subscriptions.
   - **Review Information:** a screenshot of the purchase screen and a
     note. This can wait until the app's Plan screens exist; it's needed
     when the subscriptions go to review with that app version.
   - **Family Sharing** off; **Tax Category** as it is.
6. Back on the group: **App Store Localization → English (U.S.)**, display
   name `Pinkslip Pro`. Keep both subscriptions on the same level (same
   Pro, two lengths).

A subscription reads Missing Metadata until its fields are filled, then
Ready to Submit. Sandbox and TestFlight purchases work from Ready to
Submit; the first subscriptions go to review together with the app update
that adds the purchase screens.

## 3. Apple's server notifications

**Apps → Pinkslip → App Information** (under General) → **App Store Server
Notifications**:
- Production Server URL: `https://pinkslip.work/api/v2/apple/notifications`
- Sandbox Server URL: the same
- Version: **Version 2**

## 4. The In-App Purchase key

1. **Users and Access → Integrations** tab → **In-App Purchase** in the list
   on the left → **Generate In-App Purchase Key** (or **+**). Name it
   `Pinkslip Worker`.
2. **Download** the key file (`AuthKey_….p8`). Apple lets you download it
   only once; keep it somewhere safe.
3. Send the **Key ID** (in the key's row) and the **Issuer ID** (at the top
   of the page). They aren't secret; they go in `wrangler.toml`.
4. Put the key on the Worker from the repo (the file never goes in chat):

   ```bash
   cat ~/Downloads/AuthKey_XXXXXXXXXX.p8 | XDG_CONFIG_HOME=$HOME/.config bunx wrangler secret put APPLE_IAP_PRIVATE_KEY
   ```

Then the server can check purchases. The app's side (StoreKit, the Plan
screens) comes next on the frontend.

## Sources

- [Sign and update agreements](https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements) (App Store Connect Help)
- [Set up introductory offers](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions) (App Store Connect Help)
- [Paid Apps row missing (Apple forums)](https://developer.apple.com/forums/thread/837984)
