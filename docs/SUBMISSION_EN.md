# ContextLens — Fewer repeats. More context.

## Problem

A viral phenomenon can appear repeatedly through different people, formats and accounts. Viewers may encounter another tutorial, review or performance without noticing how much of their feed has converged on the same precise subject.

## Product

ContextLens is a Chrome extension that groups observed clips by a specific phenomenon, counts distinct posting accounts encountered in this browser, and pauses and blurs matching content at a viewer-selected N. The viewer can reveal the clip immediately or open the separate OriginTrace project to investigate source leads and context.

## Meta AI

Muse Spark 1.3 first extracts a visual observation without a candidate list: action sequence, named entities, OCR, aliases, identity scope, distinctive cues and uncertainty. Those descriptors retrieve candidates across stored observations. A separate model pass verifies whether the clip belongs to the same precise target, using current and available reference frames. Category, audio and key-name overlap cannot independently authorize a merge.

## Engineering

The extension combines approximate local footage matching with explicit opt-in semantic analysis, stable UUID groups, distinct-account counting, abstention, bounded completion retries, descriptor caching and a persisted request guard. A Shadow DOM portal and top-layer UI address platform stacking and click-through problems. Separate bridge requests bound each model phase within the service-worker fetch deadline.

An included evaluation tool compares the uploaded v0.9 semantic engine, improved timestamped-frame inference and user-provided MP4 input on the same labelled manifest. It reports pairwise grouping quality, false blurs, missed repetitions, latency and actual inference attempts.

## Validation and limitations

This revision passes 40 software regressions and real-provider contract checks on synthetic product fixtures, including a same-brand/different-product negative and MP4 input. These are not real-world Instagram accuracy results. Live Instagram interaction and labelled real-video evaluation remain to be completed. The extension currently uses sampled frames and post metadata, not downloaded Instagram video, extracted audio, SAM segmentation or a global provenance index. An inferred group is not verified original-source attribution.

## Before submission

Add the public repository URL and actual three-minute demo URL. Replace this validation paragraph only with measured results. Retain collaborator attribution and licensing. Keep credentials, private recordings, tokens and usage ledgers out of the public repository. Confirm official track and submission requirements in the current event materials.
