# Iteration 2 survey — after corrected score

**Goal:** specifically test the score-corrected flow (the one deliberate corner-case in the test) and capture mid-test ongoing UX pain.

**When to send:** ~24 hours after Session 2 (when you time-warp to mid-group-stage and deliberately correct one Day-2 score). The window matters: you want them to have noticed (or not) the correction, but not so much later that the cohort has already discussed it.

**Build instructions:** new Google Form, title "Beta Test — Iteration 2 (mid-stage)". Copy the description and questions below.

---

## Form description

> Quick check-in after a few days of using the app. ~1 minute of feedback. Please answer BEFORE you've discussed the app with the other testers.

---

## Questions

### Q1. Did you notice that one match's score had been corrected after the fact?

**Type:** Multiple choice (single-select). **Required:** No.

Options:
- Yes, I saw a notification about it
- I saw my points changed but didn't know why
- No, I didn't notice anything
- Don't remember

This is the test. If 4 of 5 testers picked "No, I didn't notice," your score-corrected notifications aren't surfacing strongly enough.

### Q2. If you noticed the correction — was it clear what changed and why your points were updated?

**Type:** Paragraph (long text). **Required:** No.

Placeholder: *"What did the notification say? Did you understand what happened? Skip this one if you didn't notice in Q1."*

### Q3. Anything you'd expected the app to do that it didn't, in the past few days of using it?

**Type:** Paragraph (long text). **Required:** No.

Placeholder: *"Big or small. 'I wished I could see X' or 'I expected to be able to do Y from this screen.' Even one line."*

---

## Form settings

- **Confirmation message:** "Thanks — same rule, please don't compare notes with the other testers until they've all sent theirs."
- **Show progress bar:** off (3 questions)
- **Limit to 1 response:** off
- **Collect email addresses:** off

---

## What this iteration uniquely tells you

- **Q1** is the most direct test of the score-corrected flow you'll ever get. The flow exists (notification + automatic point recalc), but only humans can tell you whether it's loud enough to catch attention. If the answers cluster on "didn't notice," the notification copy or the in-app surface needs work.
- **Q2** validates whether the EXPLANATION ("Score corrected: X-Y → A-B. Your points were updated.") actually communicates what happened. Sometimes the user notices something changed but can't tell what.
- **Q3** is a half-test deliberate-and-half-fishing. It catches expectations the testers couldn't have articulated in Iteration 1 — by Day 3 they've started forming opinions about what the app SHOULD do.

## Total length expected

3 fields. ~1 min for an attentive respondent. Q2 is conditional on Q1 — many testers will skip it.
