# WC2026 Beta Testing Guide

A complete playbook for running a structured beta test with 3–5 friends/co-workers.

---

## 📱 Add the App to Your Phone Home Screen

Send this to testers before they begin. It makes the app feel native and ensures they open it the same way they would a real app.

### iPhone (Safari only — does NOT work in Chrome)
1. Open **https://wc2026-production-6376.up.railway.app** in **Safari**
2. Tap the **Share** button (the box with an arrow, at the bottom of the screen)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **"Add"** in the top-right corner
5. The WC2026 icon will appear on your home screen — tap it to open the app

### Android (Chrome)
1. Open **https://wc2026-production-6376.up.railway.app** in **Chrome**
2. Tap the **three dots menu (⋮)** in the top-right corner
3. Tap **"Add to Home Screen"**
4. Tap **"Add"**
5. The WC2026 icon will appear on your home screen

> **Why this matters:** Opening from the home screen icon gives you a full-screen experience without browser chrome. It's also how you'll get push notifications (if enabled).

---

## Playbook

A 4-session hands-on test with 3–5 friends/co-workers competing in one shared "Beta Testers" group, while you (the admin) drive the simulation forward between sessions. Goal: surface things that surveys alone can't catch — onboarding stumbles, real-device feel, scoring confusion, and the cognitive load right before a kickoff.

### Why this format

Forms-only feedback misses the moments where users tap, hesitate, swear, and recover. With 3–5 friends in one shared group across multiple sessions you get the social/leaderboard dynamic for free, and time-warping between sessions compresses a tournament into a few days of testers' time.

### Cohort recruitment

Aim for variety more than skill.

- **Devices:** at least 1 iPhone and 1 Android. If you have 5 testers, ideally add 1 desktop user and 1 tablet/iPad.
- **Football literacy:** at least one casual / non-fan. They reveal scoring + advancement confusion that fans skip past.
- **Tech literacy:** at least one non-power-user. Power users figure out broken things and call them charming.

Track them in a spreadsheet:

| Tester | Email | Device | Football fan? | Notes |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

---

## Pre-test admin setup

Before sending invites, do this once:

1. Confirm you can reach `/admin/simulation`.
2. Deactivate any current simulation (clean slate). Confirm `simulationActive=false`.
3. Create a fresh group: **"Beta Testers"**. Public, no password, default scoring (5 exact / 1 direction). Generate a join link.
4. **Set virtual time to `2026-06-10T12:00:00.000Z`.** First kickoff (June 11, 19:00 UTC) is ~30 hours away.
5. Build the 3 iteration forms in Google Forms from the blueprints below (~5 min each).
6. Confirm Survey 1 (onboarding) and Survey 2 (steady-state) forms are live.
7. Send the welcome email (template below) **24–48 hours before Session 0**.

---

## The 4 Sessions

Each tester spends ~30 min per session.

### Session 0 — Onboarding

**Goal:** capture first-impression friction before the user normalises to the app.

**Admin before:** virtual time at June 10, 12:00 UTC. Group exists. Invites sent.

**Tester does:** signs up, accepts group invite, sets advancement picks, predicts at least 2 Day-1 matches.

**Admin during/after:** zero help. The moment a tester completes their first prediction, send them **Survey 1**.

---

### Session 1 — First results revealed

**Goal:** the moment they see scoring + leaderboard for the first time.

**Admin before (~10 min):**
1. Time-warp to June 11, ~21:00 UTC.
2. Score the Day-1 matches via the simulation panel.
3. Confirm notifications fired.

**Tester does:** opens app after your ping, sees match results, sees their score, sees the leaderboard, predicts Day-2 matches.

**Admin during/after:** ping each tester: *"results are in — check the app."* After 24h, send **Iteration-1 survey**.

---

### Session 2 — Mid-stage + score correction

**Goal:** ongoing engagement and the score-corrected flow specifically.

**Admin before (~10 min):**
1. Time-warp to ~June 17.
2. Score all matches Day 2 → Day 5 (~16 matches).
3. **Deliberately correct one Day-2 score** (e.g. 1–1 → 2–1). This fires correction notifications to anyone who predicted that match.

**Tester does:** catches up on the leaderboard, predicts the next batch.

**Admin during/after:** ping: *"check what's new in the app."* Don't mention the correction. After 24h, send **Iteration-2 survey**.

---

### Session 3 — Knockouts + final

**Goal:** advancement-pick scoring clarity, knockout flow, end-state.

**Admin before (~15 min):**
1. Time-warp to end of group stage (June 27).
2. Set TeamAdvancement results for all 32 advancing teams in the Advancement admin tab.
3. Time-warp to ~July 2. Score 1–2 Round of 32 matches.

**Tester does:** sees advancement-pick scoring, predicts knockout matches, sees final leaderboard.

**Admin during/after:** send **Iteration-3 survey** immediately. ~24 hours later, send **Survey 2** (steady-state).

---

### Optional — synchronous debrief

A single **30-min group video call** at the end is high-value. The cohort dynamic means testers riff off each other's frustrations and reveal things they wouldn't write down. If schedule blocks it, skip — the surveys still produce signal.

---

## Key admin rules

- **Don't help them.** When a tester pings "I can't find X" — log the timestamp and verbatim message, do not respond until the session ends. That ping is your data.
- **Communicate the time-warp gimmick up front.** If you don't, testers think the app is broken when "tomorrow's matches" already ended overnight.
- **Watch for what they DON'T do.** Nobody clicks the leaderboard? That's data.
- **Don't pre-explain features in pings.** Stick to "check the app for what's new."
- **Don't argue with feedback.** If a tester is wrong about how something works, that's a sign the app communicated it badly.

---

## Cohort contamination — the one big risk

Friends in one group will discuss the app between sessions. Mitigations:

- **Send each survey BEFORE the next session starts.**
- **Ask explicitly in each survey: "Please answer before discussing with the others."**
- **Sort responses by timestamp.** The first response per question is your cleanest data.

---

## What to do with the answers

- **Don't try to act on every individual answer.** Cluster across all 5 surveys per tester.
- **Highest-signal questions:** Iteration-3 Q3 ("ONE thing to change") and Survey 2 Q12. These are your prioritisation list.
- **Watch for things mentioned by 3+ testers.** Single-mention items are real but lower priority.
- **Sentiment delta** between Iteration 1 and Iteration 3 tells you whether the app gets better or worse the more you use it.

---

## Quick admin checklist

```
PRE-TEST
[ ] Deactivate any current simulation
[ ] Create "Beta Testers" group (public, default scoring)
[ ] Sim time → 2026-06-10T12:00:00.000Z
[ ] Build 3 iteration forms in Google Forms
[ ] Confirm Survey 1 + Survey 2 are live
[ ] Send welcome email (24-48h before Session 0)
[ ] Set up tracking spreadsheet

SESSION 0 (Onboarding, Day 0)
[ ] Verify each tester signed up + joined group
[ ] Send Survey 1 after their first prediction
[ ] Log any "I can't find X" pings — DO NOT REPLY

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
[ ] Optional: 30-min group debrief call
[ ] Cluster all 5 surveys per tester
[ ] Pick top 2 fixes; add to TODO.md
```

---

## Welcome email template

Send to each tester 24–48 hours before Session 0. Personal "to:" (not BCC) — they're more likely to read it.

---

**Subject:** WC2026 Predictions — beta test invite (3–5 short sessions)

Hey [Name],

I'm beta-testing a World Cup 2026 prediction app I've been building, and I'd love your help finding the things I can't see from the inside. You'd be one of [3 / 4 / 5] testers competing in a private group called "Beta Testers".

**Time commitment:** ~30 minutes per session, **3–4 sessions over [3–5] days**, plus a couple of short surveys (~1 min each) between sessions.

**The unusual part:** to fit a whole tournament into a few days, I'll be **simulating time and match results** as the admin. So when you log in tomorrow, "yesterday's matches" might already have results — that's normal, not a bug. I'll text you when something new is unlocked.

**What I need from you:**

1. **Use it like real money is on the line.** Predict actual scores, set your group-stage picks, watch the leaderboard. Engage the way you would if your friends were taking it seriously.
2. **Don't be polite.** If something confuses you, frustrates you, or makes you want to put your phone down — that's exactly what I need to hear. "This was great" is the least useful feedback you can give me.
3. **Answer each short survey BEFORE you discuss the app with the others.** This is the most important rule. The first answer you write down — before you've heard anyone else's takes — is the one that's actually useful to me.
4. **If you get stuck, tell me where.** Don't ping me to ask how to do something; just note it ("I tried to find the leaderboard and gave up") and put it in the next survey. Where you gave up is the most valuable answer in the whole test.

**Getting started:**

📱 **First: add the app to your phone home screen** so it feels like a real app:

- **iPhone (Safari):** Open the app → tap the Share button (□↑) → "Add to Home Screen" → Add
- **Android (Chrome):** Open the app → tap ⋮ menu → "Add to Home Screen" → Add

You'll receive an invite email from the app itself in the next ~24–48 hours. Click the link, enter your name and set a password, and you'll land in the Beta Testers group. From there:

- Set your **group-stage advancement picks** before they lock.
- Predict the first batch of matches — they'll be unlocked when you sign up.

I'll text you when "the next matches have results" — usually within ~24 hours of you finishing each session.

**Devices:** use whatever you'd actually use day-to-day — phone, laptop, both. Tell me which device you're on if you hit something weird.

If you're in, just reply with a 👍 and which device you'll mostly be on. I'll send the actual app invite within a day.

Thanks — this kind of feedback is the only thing that fixes the things I'm too close to see.

— [Your name]

---

## Survey blueprints

### Survey 1 — Onboarding (after first prediction)

**Form title:** "Beta Test — Onboarding"

**Description:** *Your very first impression of the app — 2 minutes while it's fresh. Please answer BEFORE you've discussed with the other testers.*

**Q1.** When you first opened the app, what did you try to do first — and did it work?
*(Paragraph. Required: No. Placeholder: "What was the first thing you tapped or looked for? Did it go where you expected?")*

**Q2.** Did you find the advancement picks page (where you predict how teams finish their groups)?
*(Multiple choice. Options: Yes, found it easily / Yes, but only after looking around / No, I couldn't find it / I didn't know this existed)*

**Q3.** What's one thing that confused or slowed you down in the first session?
*(Paragraph. Required: No. Placeholder: "Big or small — a label, a flow, something you had to re-read. Even 'nothing' is useful.")*

**Confirmation message:** "Thanks — this is the kind of feedback that actually moves the app forward. Don't discuss with the others until they've all sent theirs."

---

### Iteration 1 — After first results revealed

**Form title:** "Beta Test — Iteration 1 (after first results)"

**Description:** *The app showed you Day-1 match results and your score for the first time. ~1 minute. Please answer BEFORE discussing with the other testers.*

**Q1.** Did you notice you got a notification about the results? When did it land relative to when you expected?
*(Paragraph. Required: No. Placeholder: "Did it arrive when you'd want it to? Too soon, too late, useless? 'I never got one' is a valid answer.")*

**Q2.** Did the points you got make sense to you?
*(Multiple choice. Options: Yes — I knew exactly why I got the score I got / Sort of — I roughly understood, but I'd want to re-read the rules / No — I'm not sure how the points are calculated)*

**Q3.** What surprised you about the leaderboard, if anything?
*(Paragraph. Required: No. Placeholder: "Where you ended up, what other people scored, how it looked, whether you cared. Anything.")*

**Confirmation message:** "Thanks — same rule, please don't compare notes with the other testers until they've all sent theirs."

---

### Iteration 2 — After corrected score (mid-stage)

**Form title:** "Beta Test — Iteration 2 (mid-stage)"

**Description:** *Quick check-in after a few days. ~1 minute. Please answer BEFORE discussing with the other testers.*

**Q1.** Did you notice that one match's score had been corrected after the fact?
*(Multiple choice. Options: Yes, I saw a notification about it / I saw my points changed but didn't know why / No, I didn't notice anything / Don't remember)*

**Q2.** If you noticed the correction — was it clear what changed and why your points were updated?
*(Paragraph. Required: No. Placeholder: "What did the notification say? Did you understand what happened? Skip if you didn't notice in Q1.")*

**Q3.** Anything you'd expected the app to do that it didn't, in the past few days?
*(Paragraph. Required: No. Placeholder: "Big or small. 'I wished I could see X' or 'I expected to be able to do Y from this screen.' Even one line.")*

**Confirmation message:** "Thanks — same rule applies. Please don't compare notes until everyone's submitted."

---

### Iteration 3 — After knockouts (final short survey)

**Form title:** "Beta Test — Iteration 3 (knockouts + final thoughts)"

**Description:** *Last short survey of the test — and the most important one. ~2 minutes. Please answer BEFORE discussing with the other testers.*

**Q1.** Of the picks you made about how teams would finish their groups (winner / runner-up / 3rd-place), were the points awarded clear?
*(Multiple choice. Options: Yes — I understood when and why I got points / Sort of — I saw points appear but didn't really get when each one was awarded / No — I'm not sure how those picks were scored / I don't think I made advancement picks at all)*

**Q2.** If a real version of this app launched for World Cup 2026, would you keep using it?
*(Multiple choice. Required: Yes. Options: Yes — I'd use it for the whole tournament / Probably — depends on what's fixed / Maybe — I'd try it but not sure I'd stick / Probably not / No)*

**Q2b.** (Optional) Why?
*(Paragraph. Required: No. Placeholder: "What's the deciding factor for you? Even one line is helpful.")*

**Q3.** What's the ONE thing you'd want changed before you'd recommend it to a friend?
*(Paragraph. Required: Yes. Placeholder: "Even half a sentence. The most annoying thing — fixing it would have the biggest effect.")*

**Confirmation message:** "Thanks — that's it for the test. I'll send one more longer survey in a day or so. Don't discuss with the others until everyone's submitted this one."

---

### Survey 2 — Steady state (final comprehensive survey, sent ~24h after Iteration 3)

Send this last. It's longer (~5 min) and designed to be filled out after the test is fully complete.

**Form title:** "Beta Test — Final Survey"

**Description:** *The full end-of-test reflection. Take your time — ~5 minutes. You can discuss the app with the other testers before filling this one out.*

**Q1.** Overall, how would you rate the app? *(Scale 1–5)*
**Q2.** How easy was it to understand what you were supposed to do? *(Scale 1–5)*
**Q3.** How easy was it to make a prediction? *(Scale 1–5)*
**Q4.** How easy was it to find the leaderboard? *(Scale 1–5)*
**Q5.** How useful were the notifications (results, reminders)? *(Scale 1–5, or N/A)*
**Q6.** Did the scoring feel fair and transparent? *(Scale 1–5)*
**Q7.** What did you like most about the app? *(Paragraph)*
**Q8.** What frustrated you most? *(Paragraph)*
**Q9.** What feature did you wish existed? *(Paragraph)*
**Q10.** Did you use it on phone, desktop, or both? *(Multiple choice)*
**Q11.** Did you add it to your home screen? If yes, did that change how you used it? *(Paragraph)*
**Q12.** What's the ONE thing you'd change? *(Paragraph. Required: Yes)*

**Confirmation message:** "Thank you — this is exactly the feedback that makes the app better. I'll share what I learned and what I'm fixing."
