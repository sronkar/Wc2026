# User feedback — distribution and triage

## What's in this folder

Two Google Forms blueprints and this README.

| File | Audience | Length | When to send |
|---|---|---|---|
| `survey-1-onboarding.md` | Anyone who just made their first prediction | ~2 min | 24-72 hours after their first prediction |
| `survey-2-steady-state.md` | Anyone who's been active for at least a week | ~5 min | 7+ days after sign-up, after they've predicted multiple matches |

Each blueprint is a literal field-by-field spec you copy into Google Forms. ~10 min to build each form once.

The forms collect optional name + email at the end, and are otherwise anonymous.

## How to actually send them

Plain email is fine. Two cover-email templates below — adjust to your voice.

### Cover email — Survey 1 (onboarding)

> **Subject:** Quick feedback on WC2026 Predictions?
>
> Hey,
>
> Thanks for trying WC2026 Predictions and getting your first prediction in. While the experience is fresh, would you mind spending **two minutes** on six quick questions? Your honest first-impression is what we can't see from the inside.
>
> Survey: [link]
>
> Optional and anonymous unless you choose to leave your name. No follow-up emails unless you ask for one.
>
> — [Your name]

### Cover email — Survey 2 (steady-state)

> **Subject:** What would you change about WC2026 Predictions?
>
> Hey,
>
> You've been using the predictions app for a bit — long enough to have hit something annoying or wished something was different. We'd love to hear it.
>
> Survey: [link] (~5 minutes, most questions optional)
>
> The single most useful thing you can answer is the last question: "If you could fix or improve ONE thing right now, what would it be?" Even half a sentence is enough.
>
> — [Your name]

## Cadence and tracking

For now, while the user base is small, a manual **Google Sheet** is enough:

| Email | First prediction date | Survey 1 sent | Survey 1 returned | Survey 2 sent | Survey 2 returned | Notes |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... |

Rules:
- Send Survey 1 once you see "first prediction date + 2 days" pass.
- Send Survey 2 once 7+ days have passed AND you've already sent Survey 1 (or skipped it).
- **Don't** send Survey 1 and Survey 2 within the same week to the same person — they'll associate the second email with annoyance.
- **Don't** send any email more than twice (one initial + one reminder a week later, max).

For the WC2026 tournament window specifically, batch sends — once a day is fine. You're aiming for ~10-30 responses per survey total, not a high-volume operation.

## What to look for in answers

Don't try to act on every individual answer. Pattern-match across responses.

### Survey 1 patterns

- **Q3 ("anything confuse you in the first 5 minutes?")** — recurring themes here = onboarding gaps. If three different users mention "I didn't know X existed", build a way to surface X earlier.
- **Q2 + Q4** — if Q2 (clarity) is high but Q4 (scoring understanding) is "Sort of" or "No", the rules need to be explained better, not the navigation.
- **Q1 device distribution** — early signal on where to invest mobile vs desktop polish.

### Survey 2 patterns

- **Q12 ("one thing to fix")** is the highest-signal answer in either survey. Group similar answers, count, sort. The top 1-2 clusters are your next priorities.
- **Q3 (notifications)** — if "came too late" or "wrong time" appear repeatedly, the cron windows or timezone handling need work.
- **Q5 (leaderboard frequency)** — if most users say "never" or "once a tournament", the leaderboard isn't pulling its weight; it's taking up real estate that could go to something else.
- **Q9 (comparison to other apps)** — surfaces features users *expected* but you don't have. Sometimes obvious wins, sometimes scope creep — judge.
- **Q10 + Q11 (mobile)** — pattern across iPhone vs Android answers. iOS-specific weirdness clusters here.
- **Sentiment delta between Q2 (clarity) and Q12 (one-thing-to-fix)** — if Q2 is high (clear) but Q12 is critical, the experience is *clear-but-frustrating* (UX issue). If Q2 is low, you have an *onboarding* problem and shouldn't even bother with Q12 yet.

### When to act

Wait until **~10 responses on each survey** before drawing conclusions. Below that, you're chasing individual opinions rather than patterns. The first 2-3 responses are skewed by who replies fastest — usually the most engaged users, whose feedback isn't representative.

## What NOT to do

- **Don't argue with answers.** Even "incorrect" feedback (e.g., "I think the rules are X" when the rules are actually Y) is useful — it tells you the rules aren't communicated clearly.
- **Don't try to fix every Q12 individually.** Cluster, then pick the top 1-2 to actually work on.
- **Don't anchor on the first responder's hot take.** Their experience is real but rarely representative.
- **Don't email the same user twice within a short window.** That's how feedback fatigue starts.
- **Don't treat survey responses as a backlog.** They're signal for prioritisation, not a to-do list.
- **Don't put the surveys behind a sign-in wall.** Anonymous responses get more honest answers about pain points.

## Future evolution (parked)

If response volume grows past ~50/month per survey, port to an in-app `/feedback` page (would auto-attach userId, group memberships, browser, prediction count). Until then, this manual flow with Google Forms is the right level of investment.

A note on this is in `TODO.md` at the repo root.
