# TODO — work parked for later

## Mobile

### Replace discrete swipe with scroll-snap on the carousels

Both `MatchCarousel` and `GeneralPredictionsCarousel` currently render *one* card at a time and jump between cards on swipe (commit `b63e275`). The native-feeling alternative is to lay out all cards in a horizontal strip with `scroll-snap-type: x mandatory` and let the browser handle scroll + momentum + snap.

**Reward:** highest UX-per-effort win still on the table. Real momentum, partial peek, matches the gesture model of every native iOS/Android app.

**Risk to weigh before tackling:**
- All cards mount simultaneously instead of one — more DOM, all lock countdowns tick.
- React `current` state has to be derived from scroll position via `IntersectionObserver`; arrow buttons and dot indicators must scroll programmatically. Two-way sync.
- The keyboard / a11y work shipped in `7b4a827` (tabIndex, role, aria-label) needs to be re-validated against the new structure.
- Existing regression tests are API-layer, so they'll stay green even if the carousel *feels* off — verification requires real-device testing.

Rollback point if attempted: tag `pre-mobile-polish`.

Estimated effort: 60-90 min, ~100 lines per carousel, contained to two files.

### Dark mode

Add Tailwind `dark:` variants across the app + a user-facing toggle (or `prefers-color-scheme` listener).

**Reward:** table-stakes in 2026; needed for users with light sensitivity. Felt benefit is small for the average user, who only opens the app for ~5 min around kickoff and rarely notices the theme.

**Risk to weigh before tackling:**
- Touches almost every file — 50+ components and 20+ pages currently use light-only colors. Realistic scope: 1-2 days of mechanical work plus visual QA.
- Brand redefinition required: FIFA-blue navbar against white is iconic. In dark mode the navbar either stays blue (loses contrast against a dark page) or inverts (stops being the FIFA-blue brand). No obvious right answer — needs a product decision up front.
- Status colors (red LIVE / green Predicted / orange Locked) were tuned against white; need a tuned dark-mode pair each, not a mechanical brighten.
- `shadow-sm` cards become invisible against `bg-gray-900` — elevation strategy must switch to borders or glows.
- User-uploaded avatars / team flag emoji were designed for light bg; can't be fixed server-side.
- First-paint flash unless an inline `<head>` script reads the preference before the first paint.
- Decide where the preference lives: system-only (simplest), localStorage (per device), or User column (follows user across devices). Each has product implications.
- Email templates stay light (Outlook dark mode flips things badly) — minor inconsistency a dark-mode user will live with.
- Existing 164 regression assertions are data-layer; they'll all stay green even if dark mode looks awful. Pure visual QA, ideally on a real screen at night.
- Tailwind CSS roughly doubles in color-related class count once dark variants are used.

**Recommendation:** defer until post-tournament if shipping to real users for WC2026. Worth doing as a dedicated session with a clear brand decision in advance, not a sneaky retrofit alongside other work.

Estimated effort: 1-2 days realistic.

## Feedback collection

### In-app `/feedback` page

We currently collect user feedback via two Google Forms (`docs/feedback/`). Once response volume regularly exceeds ~50/month per survey, the friction of "users follow an external Google link" becomes the bottleneck — port the same questions to an in-app `/feedback` route that auto-attaches userId, group memberships, prediction count, and user-agent.

**Reward:** richer feedback (no copy-paste of context users would forget to mention), feedback lives in your DB rather than Google's, no external dependency.

**Risk / cost:**
- Half-day to a full day of build work: schema migration for a `Feedback` table, the `/feedback` page UI, the POST endpoint, and ideally an admin export view.
- Discovery problem: a footer link is passive and won't get traffic; an in-app prompt after a milestone (e.g. "you've predicted 5 matches") gets responses but is also one more piece of UI to design.
- Until the questions in `docs/feedback/` have proven useful with real users, building this is premature optimisation — port only after the Forms-based questions are stable.

Estimated effort: ½ – 1 day after the Google Form questions are validated.
