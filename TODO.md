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
