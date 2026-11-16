# ContextLens for #BuildHybridAI

ContextLens groups posts about the same specific trend so viewers can decide when to pause repeated exposure. Its new caption mode uses Firebase AI Logic to compare the current post caption with up to eight recent target captions. It counts unique posts or accounts using the existing controls. Ambiguous captions leave the count unchanged.

## What changed

- The Meta hackathon version used sampled video frames and a local Node bridge for visual analysis.
- The new mode compares caption text in an extension tab using Firebase AI Logic and Chrome's on-device model. Opting in to fallback uses the SDK's on-device preference with Gemini in the cloud when the on-device route is unavailable. The UI displays the inference source reported by Firebase.
- Caption groups are compared only with other caption groups. They reuse the existing local counters, deduplication, blur, pause and reveal controls.
- The application accepts a match only for a candidate it supplied and only when the model quotes text found in both captions. Quoted text checks do not validate semantic accuracy. Only recent named targets are compared, so older targets can be missed. Captions can be misleading or underspecified.

## Run the extension and demo

1. Use Node 22.13+ and desktop Chrome 139+. Follow [Firebase hybrid setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started) and enable the required Chrome capabilities. Chrome may download the local model on first use.
2. Enable Firebase AI Logic with the Gemini Developer API in a Firebase project and register a Web app. Copy `hybrid/firebase.config.example.json` to `hybrid/firebase.config.local.json` and fill in the Web app configuration. For a private test build, register a debug token for the Web app in Firebase App Check and enter it in `appCheckDebugToken`. Treat the token as a secret. Keep the local config and generated JS bundle out of commits, public archives and demo recordings, and revoke the debug token after testing.
3. Run `npm ci` and `npm run build:hybrid`. Open `chrome://extensions`, enable Developer mode, and load the repository's `extension/` directory. Rebuild and reload after changing Firebase configuration.
4. Open **Hybrid AI setup** from the extension popup. On a supported device, select **Prepare and test on-device inference** and wait until Firebase confirms on-device execution. Keep the setup tab open.
5. Enable **Compare captions with Firebase AI Logic**, choose unique posts and set the threshold to 2. Save settings. The Firebase mode does not need the old Meta bridge.
6. Run `npm run feed` and open <http://127.0.0.1:8765/?hybrid>. Scroll through the four fictional posts. Expected: the second Moonwalk Slide post reaches 2/2 and pauses with a blur, the Umbrella Spin post starts a separate count, and the vague caption remains visible.
7. Verify fallback in a separate Chrome environment where the local model is unavailable. After configuring App Check, enable **Allow cloud fallback** and repeat with fresh counts. Check for the **Cloud** badge. With cloud permission off in that environment, the caption comparison should report unavailable and leave counts unchanged.

The demo uses synthetic media and captions. Cloud fallback sends the current caption and candidate captions to Google. The mode does not attach video frames, account fields or post URL fields, but caption text can itself include personal information. App Check debug builds are for limited testing. A public test distribution needs a suitable App Check setup and test access without publishing credentials.

## Three-minute demo outline

- **0:00–0:25** Show two creators describing the same challenge with different wording. Explain that the viewer chooses when repeated posts pause.
- **0:25–1:30** Demonstrate **On device**, a 2/2 pause, **Show video**, and how a different challenge or vague caption stays visible.
- **1:30–2:25** On an environment without a usable local model, show consent and the **Cloud** result for the same scenario. Show the unavailable state with consent off.
- **2:25–3:00** Explain the Firebase routing and the retained ContextLens controls. Disclose the earlier prototype and this event's additions.

## Submission readiness

Record both live inference routes before treating the above expected outcomes as results. Prepare the public YouTube demo and a public source repository with an open-source license covering the code being submitted. Confirm contributor rights before including or licensing existing collaborative code. The Chrome demo uses ContextLens's repeat controls and does not require OriginTrace.
