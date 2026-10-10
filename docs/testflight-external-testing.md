# Sending Pinkslip to external TestFlight testers

## Release the new code

The integration changes are committed locally on `main`; they have not been
pushed or deployed. Build 68 is the earlier launch/swipe release. To include
the new autofill, resume import and session fixes, create a build from the
new main revision after pushing it.

1. In App Store Connect → Pinkslip → Xcode Cloud → Manage Workflows, edit the
   existing workflow. Under Archive - iOS, set **Deployment Preparation** to
   **TestFlight and App Store**. The workspace stays
   `apps/native/ios/Pinkslip.xcworkspace`, scheme `Pinkslip`. Keep the version
   at **1.3.0**; Xcode Cloud increments the required build number. This setting
   allows external testing; it does not automatically publish in the App Store.
2. From Terminal, publish the prepared source and the two Workers:

   ```sh
   cd /Users/alip/dev/pinkslip
   git push origin main
   bunx wrangler deploy --keep-vars
   bun run deploy:web
   ```

   These commands change production. This integration chunk has no schema
   migration, so the direct API deploy avoids the remote-migration step in
   `deploy:backend`. The prepared API configuration enables Fill for admin
   accounts and leaves automatic submission off. Website Apple sign-in stays
   hidden until [its setup](apple-web-sign-in-setup.md) is complete.
3. If the push has not started Xcode Cloud automatically, choose **Start
   Build** for `main` in the existing workflow. Check the commit matches the new
   revision; wait for Archive and TestFlight processing to complete. Install
   internally first and run the phone flows in [port-closeout.md](port-closeout.md).
   Confirm Apply shows the Fill sheet for an admin and that a real job link opens
   the intended job after the API deployment. Stop before submitting an application.
4. Assign that build to the external group using the steps below. If you only
   want to share the already working build 68, skip the terminal commands and
   start below; an internal-only archive still needs a replacement build.

## Assign a build to external testers

The current Xcode Cloud workflow sends builds to an internal group. Internal
groups and external groups have separate build assignments; sending a build to
one does not automatically send it to the other.

1. In App Store Connect → Pinkslip → TestFlight, select the existing group under
   **External Testing**. Choose **Add Builds**, select the desired 1.3.0 build,
   fill in **What to Test**, and choose **Submit Review** or **Start Testing**.
   Enable **Automatically notify testers** if the group should receive it after
   approval. The first external build needs TestFlight App Review; later builds
   of the same version may not need a full review.
2. If the build is marked **Internal** or cannot be selected, check Xcode Cloud
   → Manage Workflows → existing workflow → Archive action. A build archived as
   **TestFlight (Internal Testing Only)** cannot join an external group. Change
   the Archive action's **Deployment Preparation** to **TestFlight and App Store**,
   save, then create a new build. An already uploaded internal-only binary cannot
   be converted by assigning another group.
3. To repeat the distribution automatically, add a **TestFlight External
   Testing** post-action to that workflow and select the external group.
   Keep the internal post-action too if internal testers should still get every
   build. Apple's beta-review requirements still apply.
4. Existing external group members use their existing invitation or public
   link; the approved build appears in their TestFlight app. This process does
   not itself publish Pinkslip in the App Store.

The owner handles App Store Connect; no browser actions were performed by the
agent. Build 68's archive distribution setting has not been inspected, so step
2 is conditional rather than a claim that it was internal-only.

Sources: Apple's [external testing instructions](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/)
and [Xcode Cloud Archive settings](https://developer.apple.com/documentation/xcode/configuring-your-xcode-cloud-workflow-s-actions).
