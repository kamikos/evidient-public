# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Primary surface is wide-screen web: judges open a link and watch a 3-minute demo video. The same Expo codebase also runs on phones via Expo Go, mainly for photographing a medicine box. Phone layouts must work but are secondary.)

## Stack

Expo (Expo Router, React Native + react-native-web, TypeScript), chosen by the user. Server logic lives in Expo Router API routes. The graph is drawn with react-native-svg using a d3-force layout.

## Users

Self-managing adults who take a prescription or OTC medication and want to understand the risks of combining it with other medicines or alcohol. Typical situation: on an antibiotic, invited out for drinks tonight, the leaflet is vague, and the pharmacy is closed. They are not clinicians. They want to understand the evidence well enough to ask a pharmacist or doctor better questions.

## Product Purpose

Evidient shows what published sources (FDA drug labels, PubMed studies) actually say about interactions between medications, OTC drugs and alcohol. Each interaction is shown as a graph edge. Opening an edge shows the reported harm, the proposed mechanism, the type and size of the evidence, where sources disagree, and what is missing. Success means the user leaves knowing what is documented, how strong it is, and what to ask a professional.

## Positioning

A verifiable evidence agent, not an advisor. Every sentence shown is backed by a verbatim quote that the agent fetched. A deterministic check confirms the quote exists in the source, and an independent open-weight model (Muse Spark Open) judges whether the quote supports the claim. Rejected claims stay visible in an audit trail. Disagreement between sources is surfaced, never resolved into a verdict.

## Operating Context

- Built for the Meta Global AI Developer Hackathon (Indie track). Submission is due Nov 4, 2026, 9 PM ET, with a public repo and a 3-minute demo video.
- Evaluated by judges on a laptop, and seen in a screen-recorded video.
- Real use: at home or on the go, often on a phone, often in the evening.

## Capabilities and Constraints

- A curated list of 12 substances and about 17 documented interactions. The model never decides which interactions exist.
- Data sources: openFDA labels (public domain), RxNorm, PubMed (PMIDs and short quotes with links).
- Input methods: search, plus photographing a medicine box (Muse Spark image understanding).
- Evidence cards are precomputed. A live agent run streams its trace over SSE.
- Hackathon rules ban "AI giving medical advice". The product must never give a verdict, a recommendation, or a timing ("wait N hours").
- Out of scope: voice input, a half-life/elimination visualizer, accounts, and stored personal medication lists.

## Brand Commitments

- Name: **Evidient**. The current icon (assets/icon.svg) is a T3 placeholder and not binding.
- Voice: plain, precise, calm, never alarmist and never reassuring. It reports, it does not advise.
- Banned words in UI copy: "safe", "OK to take", "you should", "verified" on its own (use "Quote matched · Support checked").

## Evidence on Hand

- Real FDA label text, e.g. metronidazole "Alcoholic Beverages", sertraline "concomitant use… not recommended", the acetaminophen OTC liver warning.
- PMID 12022894: a controlled study of 12 healthy men that found no disulfiram-like reaction with metronidazole and alcohol. This is the showcase conflict.
- No user testimonials, clinical validation, or usage numbers exist. Never fabricate them.

## Product Principles

1. **Show the quote, not the conclusion.** Every claim is traceable to the words it came from.
2. **No edge does not mean safe.** Absence of documented evidence is stated as absence.
3. **Disagreement is information.** Conflicts are shown side by side with each study's limits.
4. **The machine shows its work.** Accepted and rejected claims alike are inspectable.
5. **Hand off to a human.** The end of every path is a better question for a pharmacist or doctor.

## Accessibility & Inclusion

- English only.
- Harm categories and evidence depth are never encoded by color alone; line style and labels carry them too.
- Text meets WCAG 2.2 AA contrast. Interactive targets are at least 44pt on touch.
- The graph has a list alternative so it is usable with a screen reader.
