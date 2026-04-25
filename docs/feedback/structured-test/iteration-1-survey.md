# Iteration 1 survey — after first results revealed

**Goal:** capture the moment testers see scoring + leaderboard for the first time, while it's still fresh.

**When to send:** within an hour of each tester opening the app to see Day-1 results, after they've predicted the next batch of matches. ~24 hours is the upper bound — beyond that, the cohort has discussed the app and the answers are contaminated.

**Build instructions:** new Google Form, title "Beta Test — Iteration 1 (after first results)". Copy the description and questions below.

---

## Form description

> The app showed you Day-1 match results and your score for the first time. ~1 minute of feedback while it's fresh. Please answer this BEFORE you've discussed the app with the other testers.

---

## Questions

### Q1. Did you notice you got a notification about the results? When did it land relative to when you expected?

**Type:** Paragraph (long text). **Required:** No.

Placeholder: *"Did it arrive when you'd want it to? Too soon, too late, useless? 'I never got one' is a valid answer."*

### Q2. Did the points you got make sense to you?

**Type:** Multiple choice (single-select). **Required:** No.

Options:
- Yes — I knew exactly why I got the score I got
- Sort of — I roughly understood, but I'd want to re-read the rules
- No — I'm not sure how the points are calculated

If they pick "Sort of" or "No", they'll often add detail in Q3.

### Q3. What surprised you about the leaderboard, if anything?

**Type:** Paragraph (long text). **Required:** No.

Placeholder: *"Where you ended up, what other people scored, how it looked, whether you cared. Anything."*

---

## Form settings

- **Confirmation message:** "Thanks — this is the kind of feedback that actually moves the app forward. Don't discuss with the others until they've all sent theirs."
- **Show progress bar:** off (only 3 questions)
- **Limit to 1 response:** off
- **Collect email addresses:** off (you know who each tester is from your tracking spreadsheet — you don't need to ask again)

---

## What this iteration uniquely tells you

- **Q1** is the only signal you'll get on whether your cron / notification windows feel right in real-world conditions. Spec-correct ≠ feels-right.
- **Q2** distribution across testers tells you whether the scoring rules need to be more visible in the UI. If 3 of 5 say "Sort of," that's a clear signal.
- **Q3** is open-ended specifically because leaderboard reactions are unpredictable — "I was surprised people were already so far ahead" is a different problem than "I was surprised it didn't update for 10 minutes."

## Total length expected

3 fields. ~1 min for an attentive respondent.
