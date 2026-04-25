# Survey 2 — Steady-state (after a week of use)

**Goal:** ongoing UX pain, habits, missing-features, and the user's *one-thing-to-fix*.

**When to send:** at least 7 days after sign-up, AND after the user has predicted multiple matches and seen at least a couple of results scored. If the user only predicted once and went silent, send Survey 1 — not this one.

**Build instructions:** create a new Google Form titled "WC2026 Predictions — what would you change?". Copy the description block, then add the questions in order, using sections to group them. Field types and section breaks are noted in **bold**.

---

## Form description

> You've been using WC2026 Predictions for a bit now. ~5 minutes of structured feedback would help us spot the things we can't see from the inside. Most questions are optional. Anonymous unless you choose to share your name at the end.

---

## Section 1 — About you

### Q1. Which device do you use the app on most?
**Type:** Multiple choice (single-select). **Required:** Yes.

Options:
- iPhone
- Android phone
- Tablet (iPad or other)
- Laptop or desktop
- A mix of devices

> Note: this question gates Section 4 (Mobile-specific). Set up branching as described at the bottom of this file.

---

## Section 2 — Day-to-day UI / UX

### Q2. Predicting a match — overall experience
**Type:** Linear scale 1–5. **Required:** No.

- 1 = "Painful"
- 5 = "Effortless"

Add immediately below as a separate field:

### Q2b. (Optional) What could be smoother?
**Type:** Paragraph (long text). **Required:** No.

---

### Q3. Notifications — what's been your experience?
**Type:** Checkboxes (multi-select — pick all that apply). **Required:** No.

Options:
- Useful and timely
- They came too late (after the lock or after the match)
- They came at the wrong time (in the middle of the night, etc.)
- They were noise I didn't care about
- I haven't received any
- I never enabled them
- I don't remember

---

### Q4. Have you ever wanted to change a prediction and not been able to?
**Type:** Multiple choice (single-select). **Required:** No.

Options:
- No
- Yes — *(pick this and the next field appears)*

Set up branching: *if Yes, go to Q4b. If No, go to Q5.*

### Q4b. When? What happened?
**Type:** Paragraph (long text). **Required:** Yes (only when shown).

Placeholder: *"Were predictions locked already? Did it look like the app failed silently? What did you expect to happen?"*

---

### Q5. The leaderboard — how often do you check it?
**Type:** Multiple choice (single-select). **Required:** No.

Options:
- Never — I don't look
- Once a tournament
- About once a week
- Daily
- Multiple times around match days

---

### Q6. Anything visually broken or hard to tap?
**Type:** Paragraph (long text). **Required:** No.

Placeholder: *"Doesn't have to be a real bug — even 'this looks weird on my phone' is useful."*

---

## Section 3 — Product

### Q7. Did you find and submit your group-stage advancement picks before they locked?
**Type:** Multiple choice (single-select). **Required:** No.

Options:
- Yes, on time
- No, missed the deadline
- I never realised this existed
- What's that?

---

### Q8. What's missing? Anything you wish the app had?
**Type:** Paragraph (long text). **Required:** No.

Placeholder: *"Big or small. 'Wish I could see X' or 'wish I could do Y from the home screen.'"*

---

### Q9. Comparing this app to other prediction apps you've used — what's better here, what's worse?
**Type:** Paragraph (long text). **Required:** No.

Placeholder: *"Doesn't matter if you've used one or ten. Even rough comparisons help — and 'this is the only one I've tried' is also a valid answer."*

---

## Section 4 — On your phone (skip if you mostly use desktop)

> **Branching:** show this section only if Q1 was iPhone, Android phone, or "A mix of devices". Skip for Tablet and Laptop/desktop.

### Q10. Have you added the app to your home screen on your phone?
**Type:** Multiple choice (single-select). **Required:** No.

Options:
- Yes
- No — I'm fine using it in the browser
- I didn't know I could
- I tried and it didn't work

---

### Q11. Anything weird about the app on your phone specifically — slow, broken, awkward to thumb?
**Type:** Paragraph (long text). **Required:** No.

Placeholder: *"Touch targets, scroll behaviour, the keyboard, anything that bugs you only on the phone."*

---

## Section 5 — The one that actually matters

### Q12. If you could fix or improve ONE thing right now, what would it be?
**Type:** Paragraph (long text). **Required:** Yes.

Placeholder: *"Even half a sentence is enough. Just the most annoying thing."*

---

### Q13. Anything else you'd like us to know?
**Type:** Paragraph (long text). **Required:** No.

---

### Q14. Want to share your name and email? (Optional — only if you're OK with us replying to clarify.)
**Type:** Two short answer fields, both **optional**.

- Field A: "Name (optional)" — Short answer
- Field B: "Email (optional)" — Short answer (set validation to "Email")

---

## Form settings to flip on

- **Confirmation message:** "Thanks — your one-thing-to-fix answer matters more than you'd think."
- **Show progress bar:** on (this is longer, users want to see how far they are)
- **Limit to 1 response:** off
- **Collect email addresses:** **off** (Q14 covers it optionally)
- **Section navigation:** keep linear except for the Q1 → Section 4 branch and the Q4 → Q4b reveal

---

## Branching summary (for the Forms editor)

Two branches to set up. Both use Google Forms' "Go to section based on answer":

1. **Q1 (Device) → Section 4 routing:**
   - "iPhone" → continue to Section 4
   - "Android phone" → continue to Section 4
   - "A mix of devices" → continue to Section 4
   - "Tablet" → skip to Section 5
   - "Laptop or desktop" → skip to Section 5

2. **Q4 (Wanted to change a prediction) → Q4b reveal:**
   - "Yes" → show Q4b (the "When? What happened?" field)
   - "No" → skip Q4b, continue to Q5

If Forms' branching feels finicky, a simpler alternative is to just leave Q4b visible always and accept that some users will leave it blank — the data quality is the same.

---

## Total length expected

14 fields, **most optional**. About **5 minutes** for an engaged respondent who fills in the free-text questions; ~2 minutes for someone who skips them and only does the multi-choice. The required ones are Q1 (device) and Q12 (one-thing-to-fix) — so even a skim will give us a usable response.
