# ContextLens for #BuildHybridAI

ContextLens groups posts about the same specific trend so viewers can decide when to pause repeated exposure. The Firebase mode compares the current caption with up to eight recent target captions and reuses ContextLens’s counters, repeat limit, and reveal control. An ambiguous caption leaves the count unchanged.

## What changed during the submission period

- The earlier ContextLens prototype used sampled video frames and a local bridge. The new mode uses Firebase AI Logic and prefers Chrome’s on-device Gemini Nano model. If cloud fallback is enabled and the local route is unavailable, Firebase AI Logic can use Gemini 3.5 Flash-Lite with App Check.
- Both routes request the same structured response. A returned candidate must come from the supplied shortlist, and the quoted excerpts must appear in the current and reference captions. The app displays the SDK-reported inference source. A saved result can be reused without a new inference call.
- The extension and the web demo share the Firebase client, match acceptance, and counting helpers. The web demo supplies fictional posts and locally generated clips, with no extension installation required.
- Text evidence supports a possible shared target. Captions can be misleading and a limited shortlist can miss older targets. Test outputs do not establish recognition accuracy.

## Set up Firebase

1. Open the [Firebase console](https://console.firebase.google.com/). Create a dedicated demo project or select the dedicated project you already have.
2. In the project, open **AI Services → AI Logic** and select **Get started**. Use the **Gemini Developer API** backend and register a **Web app**. The standard setup can start on Firebase’s no-cost Spark plan, subject to model and project usage limits.
3. Under **Project settings → General → Your apps**, find the Web app’s Firebase configuration. The app needs the public Web SDK values `apiKey`, `appId`, and `projectId` from that configuration. Under **Security → App Check → APIs**, check that Firebase AI Logic is enforced.

See [Firebase’s Web setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started).

## Run the extension on a Mac or PC

Use Node.js 22.13 or newer and a current desktop Chrome. Review the [Chrome model requirements](https://developer.chrome.com/docs/ai/prompt-api) if the built-in model does not appear.

```sh
git clone --branch buildhybridai https://github.com/reusahn/Contextlens.git ContextLens-Hybrid
cd ContextLens-Hybrid
npm ci
cp hybrid/firebase.config.example.json hybrid/firebase.config.local.json
```

Enter the Firebase Web configuration in the local JSON file. For local cloud testing in the extension, register an App Check debug token for the Web app and enter it in `appCheckDebugToken` in that file. Keep this local file and the generated `extension/hybrid.bundle.js` private. Give each private tester their own setup. The hosted demo below uses a Web App Check provider.

```sh
npm run build:hybrid
npm run feed
```

1. In `chrome://extensions`, turn on **Developer mode** and **Load unpacked** from the new folder’s `extension/` directory.
2. Open the extension popup and choose **Open Hybrid AI setup**. Click **Prepare and test on-device inference**. Keep the tab open after it reports that Firebase AI Logic ran on this device. Chrome may need to download the model.
3. In the popup, enable **Compare captions with Firebase AI Logic**. Set the count to **Unique posts** and the threshold to **2**, then save. Keep **Allow cloud fallback** off for the first test.
4. Open <http://127.0.0.1:8765/?hybrid>. Scroll through the four synthetic posts. The new Firebase mode can run without the Meta bridge. Close or disable other copies of the extension during the demo to avoid two overlays.

If setup reports that the model is unavailable, check `chrome://on-device-internals`, the model and Chrome setup links above, and the operating system, RAM and storage requirements. Use a Chrome machine that supports Nano for the local recording.

## Host the judge demo

1. In the dedicated Firebase project, set up a Firebase Hosting site such as `PROJECT_ID.web.app`. In the Google Cloud console create a score-based reCAPTCHA Enterprise Web key for that hostname. Then register the Web app under **Security → App Check → Apps** with that site key. Keep Firebase AI Logic enforcement on.
2. Copy `hybrid/firebase.config.web.example.json` to `hybrid/firebase.config.web.json`. Enter the Firebase Web configuration and the public reCAPTCHA Enterprise site key in `appCheckSiteKey`. The hosted build rejects any App Check debug token.
3. From the repository root, build and deploy to the dedicated demo project:

```sh
npm run build:demo
npx firebase-tools login
npx firebase-tools deploy --only hosting --project PROJECT_ID
```

Use the actual project ID in the last command. The included `firebase.json` serves only the compiled web demo. The test page at `/fallback.html` uses a Chrome Permissions Policy header to make the local model unavailable for a controlled test. The comparison still uses the same SDK path, and the cloud result still requires consent and live App Check.

For a static layout preview before you configure Firebase, run `npm run build:demo -- --preview`. It builds a separate `dist/buildhybridai-preview/` directory with inference disabled.

See [Firebase Hosting](https://firebase.google.com/docs/hosting/quickstart) and [App Check for web](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider).

## Verify the live routes before recording

| Scenario | Expected result |
| --- | --- |
| Supported desktop Chrome with Nano ready | Firebase reports **On device** when comparing a fictional caption. |
| Two different creators name Moonwalk Slide | The second post reaches **2/2**, pauses and blurs. **Show video** resumes playback. |
| A different named challenge appears | It creates a separate count without changing Moonwalk Slide’s count. |
| The post says only “Tried this today.” | ContextLens shows that the evidence is insufficient and leaves the count unchanged. |
| Revisit the same post | It does not increase the count. |
| Hosted **Test cloud fallback**, with cloud consent off | Comparison is unavailable and no caption is sent for cloud analysis. |
| Hosted **Test cloud fallback**, with consent on | Firebase reports **Cloud** after a successful comparison. |

These are expected outcomes. Verify the extension on real Chrome and the hosted site with live Firebase. The automated SDK test replaces the Chrome model and remote responses, and checks how the pinned Firebase SDK routes inference, attaches an App Check token, and refrains from a cloud request without consent.

Cloud fallback may send the current caption and up to eight reference captions to Firebase. Caption text can contain personal information. The hosted demo only provides fictional data.

See the [Devpost text and recording plan](DEVPOST_SUBMISSION.md) for submission materials and remaining publishing steps.
