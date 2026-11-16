# ContextLens submission draft

Use these fields in [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/). The category is **Web (Chrome)**. The submission deadline is **November 30, 2026 at 2:00 p.m. Pacific**. [Official rules](https://firebasehybridaihackathon.devpost.com/rules)

## Project overview

**Project name**

ContextLens

**Tagline**

Spot repeated trends in short videos and choose when to pause. Compare captions on your device with optional cloud fallback.

**Built with**

Firebase AI Logic, Gemini Nano, Gemini, Firebase App Check, Chrome Extensions, JavaScript. Add Firebase Hosting once the live demo is deployed.

## Project story

### Inspiration

Different creators can make the same challenge, campaign, or product feel like fresh content every time it appears. ContextLens helps short-video viewers notice that repetition and choose how much of it they want to see.

### What it does

ContextLens compares a post’s caption with recent captions that identify specific targets. When two creators describe the same named challenge in different words, the posts can count toward the same target. Viewers choose whether to count unique posts or creators and set a limit. At that limit, the current clip pauses and blurs. The viewer can reveal it and continue. A caption without enough identifying detail leaves the count unchanged.

### How we built it

Firebase AI Logic uses Chrome’s on-device Gemini Nano model when available. Viewers can opt in to the SDK’s cloud fallback, which uses Gemini 3.5 Flash-Lite through Firebase AI Logic with App Check. The model returns a structured decision and quoted evidence. ContextLens checks that any chosen candidate exists and that the quoted excerpts occur in the captions. Its counting rules handle duplicate posts and apply the viewer’s threshold. The UI displays the inference source returned by the SDK. The test feed uses fictional captions and locally rendered clips.

### What we built during #BuildHybridAI

The earlier ContextLens prototype analyzed sampled frames through a separate bridge. During this event we added Firebase-powered caption comparison, explicit cloud consent, visible inference source, and a Chrome web demo that exercises the same caption comparison and counting rules. We adapted the existing per-target counting and playback controls for the new caption mode.

### What we learned

Similar wording can describe separate projects or products, and vague captions may provide too little context. The prototype keeps uncertain results visible and limits its search to recent captions. We plan to evaluate multilingual captions and missed matches on a larger labeled set.

## Links and submission checks

| Devpost field | What to enter |
| --- | --- |
| Platform | Web (Chrome) |
| Team | Confirm the final entrants and obtain permission to license any collaborative code in the submission. Add participating team members in Manage team. |
| Source code | Public repository with the verified build on its default branch and a detectable open-source LICENSE. The development branch is at https://github.com/reusahn/Contextlens/tree/buildhybridai. |
| Try it out | Firebase Hosting URL after validating both inference routes, or a working test build with the required testing access. |
| Video | Public YouTube watch URL for the English demo, 3 minutes or less. |
| Final status | Submit project, then check for the green Submitted label under My projects. |

The draft does not have live Firebase results, a public YouTube link, or an agreed repository license yet. Replace the development source link with the final submission repository if they differ. Test the hosted link and video in a signed-out browser before submitting. [Devpost submission steps](https://help.devpost.com/article/126-know-your-submission-steps)

## Demo recording plan

Aim for about 2 minutes 40 seconds. Record the screen after both routes have been verified. Use the fictional feed in the extension or the accompanying web demo. Skip installation footage.

| Time | Screen |
| --- | --- |
| 0:00–0:20 | Show two fictional creators and the caption wording. Set the limit to two unique posts. |
| 0:20–1:20 | Show the first successful comparison and the **On device** label. Show the second post matching, the counter at **2/2**, the paused blur, then **Show video**. |
| 1:20–1:45 | Compare the unrelated challenge and the vague caption. Show that the original count stays at two. |
| 1:45–2:25 | Open **Test cloud fallback**. Attempt a comparison with cloud consent off. Enable consent, retry, and show the **Cloud** label. |
| 2:25–2:40 | Briefly show the two inference routes and what changed since the previous prototype. |

### English voiceover

Have you ever seen the same trend five times without realizing it? ContextLens helps you spot repeated patterns while you scroll. I’ve set my limit to two unique posts, and I’ll use four fictional posts to show how it works.

This first creator names the Moonwalk Slide Challenge. Firebase AI Logic compares the caption on this device using Chrome’s built-in Gemini Nano model. A second creator describes the same challenge in different words. When the captions support a match, the count reaches two. ContextLens pauses and blurs the clip, and I can choose to keep watching.

Here’s a different challenge. It gets its own count. When a caption is too vague, ContextLens leaves the count unchanged.

For this test page I’ve blocked access to Chrome’s local model. With cloud fallback turned off, comparison stops here. When I enable it, Firebase AI Logic uses the cloud and the interface shows the route it actually used.

The previous ContextLens prototype compared sampled video frames. For this challenge we added caption comparison with on-device inference, consent-based cloud fallback, and a web demo that anyone can try in Chrome.
