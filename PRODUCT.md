# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
One person: the owner, a forward deployed engineer working on Windows (work Microsoft 365 account planned). They open Kip once each morning, around 9am, on their own machine and go through a short briefing before starting work. Not shared, not hosted, no other audience.

## Product Purpose
A personal, local-only morning briefing. It generates a daily brief and shows it in the browser at `http://127.0.0.1:47821`, with a button to shut the server down. Success is the owner starting the day knowing what matters (their notes and open loops, meetings, mail awaiting reply, job-critical platform news, world news) and what to do first, without skimming past anything.

## Positioning
- One item at a time: a guided walkthrough, one slide per item, then a summary where every section can be reopened.
- Warm-up before work: brain-teaser chess puzzles and previous notes ease the owner in, then job-critical items and a derived plan for the day.
- Personal and tuned to the owner: their tech stack, their notes and open loops, their chess weak themes, their favourite and blocked sources.
- Local and private: runs on 127.0.0.1 only, read-only access to email and calendar, secrets stay on the machine.

## Operating Context
Run each morning via `./scripts/start.sh` (Git Bash on Windows). A fixed section order: brain teaser (chess), notes, meetings, email, job-critical work news, world news, then today's plan (derived from the others). Notes are typed or dictated in-app and stay on the list until marked Completed. Briefings are pruned after 14 days.

## Capabilities and Constraints
- Each section fails independently: an error card or a "not set up" card, never a broken brief.
- Every work/world item needs a link and a date, or is marked unverified. Nothing may be invented.
- Read-only on email, calendar and Teams; never send, delete or modify.
- Security guard on the local server (token, Origin, Host checks) must not be weakened.
- Keyboard use (arrows, Enter, Escape) must keep working.
- Must stay usable on laptop and phone sizes with nothing clipped or unreachable; long content scrolls.
- Possible future display: a 2560 x 720 screen (very wide and short). Not yet verified or designed for.

## Brand Commitments
The red sci-fi HUD theme (reactor core, rings, glow) and the Kip mascot (`src/web/public/kip.png`, floating around the stage) are binding and must be kept.

## Evidence on Hand
Sample briefing at `fixtures/briefing.sample.json`. Project spec in `docs/PROJECT_SPEC.md`. No testimonials, customers or metrics exist and none should be invented.

## Product Principles
- Nothing skimmed past: one item per screen, and nothing may disappear, clip or become unreachable.
- Calm start to the day: warm up first, then the job-critical items, then the plan.
- Private by default: local only, read-only access to work accounts.
- Honest sources: every item is linked and dated or labelled unverified.
- The owner's own words and choices (notes, priorities, feedback) shape what comes back.

## Accessibility & Inclusion
Keyboard operable with visible focus. Text at 11px or above and sufficient contrast on the dark theme. Touch targets large enough on phones. Motion should respect reduced-motion.
