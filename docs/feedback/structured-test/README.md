# Structured user review — playbook

A 4-session hands-on test with 3-5 friends/co-workers competing in one shared "Beta Testers" group, while you (the admin) drive the simulation forward between sessions. Goal: surface things that the Google Forms feedback path can't catch — onboarding stumbles, real-device feel, scoring confusion, and the cognitive load right before a kickoff.

## Why this format

Forms-only feedback misses the moments where users tap, hesitate, swear, and recover. With 3-5 friends in one shared group across multiple sessions you get the social/leaderboard dynamic for free, and time-warping between sessions compresses a tournament into a few days of testers' time.

You've already chosen:
- 3-5 testers, friends/co-workers, all in one shared group
- Multi-session: dedicated onboarding, then 2-3 follow-ups across a few days
- Forms only — no live observation
- Iteration surveys after each session

## Cohort recruitment

Aim for variety more than skill. The mistakes you'll catch from a 4-year-old phone outweigh anything a flagship reveals.

- **Devices:** at least 1 iPhone and 1 Android. If you have 5 testers, ideally add 1 desktop user and 1 tablet/iPad. Don't double up on the same device unless you have to.
- **Football literacy:** at least one casual / non-fan. They reveal scoring + advancement + bracket confusion that fans skip past.
- **Tech literacy:** at least one non-power-user. Power users will figure out broken things and call them charming. Non-power-users will tell you something is broken.
- **Closeness to you:** all friends/co-workers is fine. The welcome email explicitly tells them honest is more useful than nice.

Track them in a small spreadsheet:

| Tester | Email | Device | Football fan? | Notes |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

You'll add columns later for survey-response timestamps.

## Pre-test admin setup

Before sending invites, do this once:

1. Confirm the dev server is running and you can reach `/admin/simulation`.
2. Deactivate any current simulation (clean slate). The simulation panel has a "Deactivate" button; confirm `simulationActive=false` after.
3. Create a fresh group in the admin panel. Suggested name: **"Beta Testers"**. Public, no password, default scoring (5 exact / 1 direction). Generate a join link.
4. **Set virtual time to `2026-06-10T12:00:00.000Z`.** That puts the first kickoff (June 11, 19:00 UTC) about 30 hours away, and the advancement lock (June 11, 18:00 UTC) about 30 hours away too. Testers have a real "before tournament" window in which to do advancement picks, then watch them lock.
5. Confirm VAPID push keys are configured if you want push notifications to be part of the test. Email is fine if push is broken.
6. Build the 3 iteration forms in Google Forms from `iteration-1-survey.md`, `iteration-2-survey.md`, `iteration-3-survey.md`. ~5 min each.
7. The existing `survey-1-onboarding.md` and `survey-2-steady-state.md` from `../` are reused at the bookends — confirm both forms exist.
8. Send the welcome email (template at `tester-welcome-email.md`) to all testers, ideally **24-48 hours before Session 0**.

## The 4 sessions

Each tester spends ~30 min per session. You spend longer (sim setup + per-tester pings + survey sends).

### Session 0 — Onboarding

**Goal:** capture first-impression friction before the user normalises to the app.

**Admin before:** virtual time at June 10, 12:00 UTC. Group exists. Invites sent. Survey 1 form built and ready to send.

**Tester does:** receives invite, signs up (Google or magic link or password), accepts the group invite, optionally completes the first-visit welcome modal, sets advancement picks (locks at June 11, 18:00 UTC — they have ~30 hours), predicts at least 2 of the Day-1 matches.

**Admin during/after:** zero help. Note the timestamp each tester signs up. The moment a tester completes their first prediction, send them **Survey 1** (`../survey-1-onboarding.md`).

**What this iteration uniquely captures:** whether the welcome modal lands, whether advancement picks are findable, whether the prediction flow is intuitive without anyone walking them through it.

### Session 1 — First results revealed (Day 1 evening of test)

**Goal:** the moment they see scoring + leaderboard for the first time.

**Admin before (~10 min of setup):**
1. Time-warp from June 10 → June 11, ~21:00 UTC (after the first 4 group-stage matches kick off).
2. Score the Day-1 matches via the simulation panel's "setScore" buttons. Each setScore triggers a result-notification + the post-game email blast (per-group).
3. Confirm one of your testers receives a notification (you can see it in their account if you log in as them — but only if they consent, otherwise just trust the system).

**Tester does:** opens app (after your ping), sees match results, sees their score for the first time, sees the leaderboard, predicts Day-2 matches.

**Admin during/after:** ping each tester individually with "results are in — check the app." Don't elaborate. After the last tester finishes their Day-2 predictions (or 24h later, whichever first), send **Iteration-1 survey**.

**What this iteration uniquely captures:** clarity of per-match scoring (did they understand why they got X points), notification timing in the wild, leaderboard reaction (do they care?).

### Session 2 — Mid-stage + score correction (Day 3-4 of test)

**Goal:** ongoing engagement, mobile/desktop friction, and the score-corrected flow specifically.

**Admin before (~10 min):**
1. Time-warp to ~June 17 (mid-group-stage, around match 30 of 72).
2. Score all matches between Day 2 and Day 5 via the simulation panel. ~16 matches.
3. **Deliberately correct one Day-2 score.** Pick a match a tester predicted, change a 1-1 to a 2-1 (or similar). The setScore endpoint detects the corrected state and fires `score_corrected` notifications to anyone who had a prediction for that match. This is the *only* deliberate corner-case in the whole test — its purpose is to surface whether the corrected-score flow is comprehensible.

**Tester does:** catches up on the leaderboard, spots the corrected-score notification (if they're paying attention), predicts the next batch of matches.

**Admin during/after:** ping testers with "check what's new in the app." Don't mention the correction; you want to see if they notice it. After ~24 hours, send **Iteration-2 survey**.

**What this iteration uniquely captures:** whether the score-corrected flow is comprehensible (or scary, or invisible). Whether mobile-vs-desktop feel diverges by Day 3 of usage.

### Session 3 — Knockouts + final

**Goal:** advancement-pick scoring clarity, knockout flow, end-state.

**Admin before (~15 min):**
1. Time-warp to end of group stage (June 27).
2. In the admin panel under "Advancement," set TeamAdvancement results for all 32 advancing teams (16 winners + 16 runners-up + 8 third-placed). This scores everyone's advancement predictions all at once.
3. Time-warp to ~July 2 — Round of 32 unlocks for predictions.
4. Score 1-2 R32 matches so testers see knockout-stage results.

**Tester does:** sees their advancement-pick scoring, predicts knockout matches, sees the final-stage leaderboard.

**Admin during/after:** final ping. Send **Iteration-3 survey** *immediately* (it's the deliberately-final survey and it asks "would you use this for real?"). Then, ~24 hours later, send **Survey 2** (`../survey-2-steady-state.md`) for comprehensive end-state feedback.

**What this iteration uniquely captures:** advancement scoring clarity (this is the most-misunderstood concept in the app), knockout bracket comprehension, "would I use this again" sentiment.

### Optional — synchronous debrief

Even though you opted for forms-only: a single **30-min group video call** at the end of the test would be high-value. The cohort dynamic (everyone in one group) means testers riff off each other's frustrations and reveal things they wouldn't write down. If schedule blocks it, skip — the surveys still produce signal. But if you can swing 30 min, do.

## What to ask in the iteration surveys

Full blueprints in `iteration-1-survey.md`, `iteration-2-survey.md`, `iteration-3-survey.md`. Each is 3 questions, ~1 min to fill out.

## Special instructions for *you* (the admin)

The single highest-cost rule, easiest to violate: **don't help them.**

When a tester pings you with "I can't find X" or "the app says Y, what do I do?" — log the timestamp and the verbatim message, then do not respond until the session ends. That ping is your data. After the session, you can answer their question if they still want it answered.

Other guidelines:
- **Communicate the time-warp gimmick up front** in the welcome email. If you don't, testers will think the app is broken when "tomorrow's matches" already ended overnight.
- **Time-warp aggressively but tell them it's coming.** "I'll move time forward overnight; check back in the morning."
- **Watch for what they DON'T do.** Nobody clicks the leaderboard? That's data. Nobody finds the advancement picks page? Bigger data.
- **Don't pre-explain features in pings.** Stick to "check the app for what's new" or "results are in." Let them discover.
- **Tag responses by tester + iteration** in the spreadsheet so you can track each person across all 5 surveys (Survey 1 + 3 iteration + Survey 2).
- **Don't argue with feedback.** Even if a tester is wrong about how something works, that's a sign the app communicated it badly.

## Special instructions for *testers*

Covered in the welcome email. Key points:
- The simulated-time gimmick — explained plainly.
- "Use it like real money is on the line. Don't be polite."
- "Answer each survey BEFORE discussing the app with the others." (cohort-contamination guard)
- "If you give up on something, tell us where you gave up — that's the answer we want."
- Total time: ~30 min per session × 4 sessions, plus a few short surveys.

## Cohort contamination — the one big risk

Friends/co-workers in one group will discuss the app between sessions. They'll share bugs, point out features, and contaminate independent first-impressions. Mitigations:

- **Send each survey BEFORE the next session starts.** Earliest responses are least contaminated.
- **Ask explicitly in the welcome email and at the top of each survey: "Please answer this before discussing with the others."**
- **Don't expect Iteration-1 responses 5 days later to be useful** — they'll have shared notes.
- **Treat outlier-but-vocal testers with care.** Their loud opinion can shape what others write.
- When triaging, **sort responses by timestamp.** The first response per question is your cleanest data.

## What to do with the answers

- **Don't try to act on every individual answer.** Cluster across all 5 surveys per tester.
- **The two highest-signal questions in the entire test:** Iteration-3 Q3 ("ONE thing to change") and Survey 2 Q12 (also "one thing"). These are your prioritisation list.
- **Notification-timing answers** are the only signal you'll get on whether your cron / window settings are right in the wild — only humans on real phones catch "the 30-min reminder fired right at kickoff."
- **Watch for things mentioned by 3+ testers.** Single-mention items are real but lower priority.
- **Sentiment delta** between Iteration 1 ("clarity at first impression") and Iteration 3 ("would you use it again?") tells you whether the app gets *better* the more you use it (good) or worse (bad).
- **Update the existing `TODO.md`** with whatever you decide to act on. Don't promise to fix everything; promise to fix the top 2.

## Quick admin checklist (one screen)

```
PRE-TEST
[ ] Deactivate any current simulation
[ ] Create "Beta Testers" group (public, default scoring)
[ ] Sim time → 2026-06-10T12:00:00.000Z
[ ] Build 3 iteration forms in Google Forms
[ ] Confirm Survey 1 + Survey 2 are still live
[ ] Send welcome email (24-48h before Session 0)
[ ] Set up tracking spreadsheet (tester + device + survey timestamps)

SESSION 0 (Onboarding, Day 0)
[ ] Verify each tester signed up + joined group
[ ] Send Survey 1 link to each tester after their first prediction
[ ] Note any "I can't find X" pings — DO NOT REPLY

SESSION 1 (First results, Day 1)
[ ] Time-warp to June 11 ~21:00 UTC
[ ] Score 4 Day-1 matches in sim panel
[ ] Ping each tester: "results are in"
[ ] After 24h, send Iteration-1 survey

SESSION 2 (Mid-stage + correction, Day 3-4)
[ ] Time-warp to June 17
[ ] Score all matches Day 2 → Day 5 (~16 matches)
[ ] DELIBERATELY CORRECT one Day-2 score (1-1 → 2-1)
[ ] Ping each tester: "check what's new"
[ ] After 24h, send Iteration-2 survey

SESSION 3 (Knockouts + final, Day 5+)
[ ] Time-warp to June 27
[ ] Set TeamAdvancement results for all 32 advancing teams
[ ] Time-warp to July 2; score 1-2 R32 matches
[ ] Ping each tester: "knockouts have started"
[ ] Send Iteration-3 survey immediately
[ ] After 24h, send Survey 2 (steady-state)

POST-TEST
[ ] Optional: 30-min synchronous group debrief
[ ] Cluster all 5 surveys × testers by question
[ ] Pick top 2 fixes; add to TODO.md
[ ] Don't try to fix everything
```

## Out of scope (deliberately)

- Live observation tooling (you chose forms-only).
- In-app analytics / event tracking — premature.
- Compensation, strangers, public beta — separate plan.
- A bigger test (10+ testers) — would replace this format with async + occasional 1:1s.
