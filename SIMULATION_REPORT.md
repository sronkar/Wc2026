# WC2026 Simulation Report

**Started:** 2026-04-24T06:43:58.537Z
**Finished:** 2026-04-24T06:46:12.947Z
**Summary:** 90 pass / 0 fail / 25 notes

## Phase 0 — Reset existing simulation state
_2 pass, 0 fail, 1 notes — started 2026-04-24T06:43:58.540Z_

- ✅ Virtual time set via HTTP to 2026-06-10T12:00Z — _{"ok":true,"virtualTime":"2026-06-10T12:00:00.000Z"}_
- ✅ Loaded 104 matches from DB — _expected 104_

**Notes:**
- Found 104 previously-scored matches; resetting to SCHEDULED

## Phase 1 — Create test admin and 50 users
_3 pass, 0 fail, 2 notes — started 2026-04-24T06:43:59.326Z_

- ✅ Test admin exists
- ✅ Admin can sign in and session reports ADMIN role — _{"name":"MegaSim Admin","email":"megasim-admin@megasim.test","image":null,"id":"cmocjok2o0000wxfqefxiu0vn","role":"ADMIN"}_
- ✅ Created 50 test users

**Notes:**
- Personas: {"completionist":5,"casual":5,"safe-picker":5,"bold-picker":5,"lazy":5,"knockouts-only":5,"mid-tournament-joiner":5,"mid-match-joiner":5,"visitor-admin":5,"pending-only":5}
- Time zones: {"UTC":13,"PST":13,"IST":12,"JST":12}

## Phase 2 — Create 6 groups with varied settings
_7 pass, 0 fail, 0 notes — started 2026-04-24T06:43:59.514Z_

- ✅ Created group "MegaSim: Alpha Legion" (3 target, isPublic=true, reqPw=false, joinToken=false)
- ✅ Created group "MegaSim: Bravo Squad" (5 target, isPublic=true, reqPw=false, joinToken=false)
- ✅ Created group "MegaSim: Charlie Crew" (8 target, isPublic=true, reqPw=true, joinToken=false)
- ✅ Created group "MegaSim: Delta Elite" (12 target, isPublic=false, reqPw=true, joinToken=true)
- ✅ Created group "MegaSim: Echo Ensemble" (20 target, isPublic=true, reqPw=false, joinToken=true)
- ✅ Created group "MegaSim: Foxtrot Phenoms" (30 target, isPublic=true, reqPw=false, joinToken=true)
- ✅ Admin GET /api/groups returns all MegaSim groups — _got 6_

## Phase 3 — Joining: direct/email/URL/search + invite edge cases
_15 pass, 0 fail, 6 notes — started 2026-04-24T06:43:59.695Z_

- ✅ Alpha: direct-insert 3 approved members — _got 4 (includes admin as VISITOR_ADMIN)_
- ✅ Bravo: 5 users joined via email invite — _got 6 (includes admin)_
- ✅ Charlie: 8 users joined via password-required invite (had password already) — _8/8_
- ✅ Delta (private): 12 users joined via /join/[token] — _got 12_
- ✅ Echo: 20 users joined (10 email + 10 joinToken) — _got 20_
- ✅ Foxtrot: joinToken route — 17/17
- ✅ Foxtrot: search-and-request flow — 9/9 approved
- ✅ Foxtrot: 4 join requests remain PENDING — _got 4_
- ✅ Visitor-admins assigned: 4 total
- ✅ Total PENDING memberships across groups: 8 — _got 8_
- ✅ Expired invite rejected with 410 — _status=410_
- ✅ Invite email mismatch rejected with 403 — _status=403_
- ✅ First acceptance of invite succeeds — _status=200_
- ✅ Re-using already-accepted invite rejected with 410 — _status=410_
- ✅ Unauth invite accept rejected with 401 — _status=401_

**Notes:**
- MegaSim: Alpha Legion: 3 approved predictors
- MegaSim: Bravo Squad: 6 approved predictors
- MegaSim: Charlie Crew: 8 approved predictors
- MegaSim: Delta Elite: 12 approved predictors
- MegaSim: Echo Ensemble: 18 approved predictors
- MegaSim: Foxtrot Phenoms: 24 approved predictors

## Phase 4 — Advancement predictions (before lock at 2026-06-11T18:00Z)
_5 pass, 0 fail, 0 notes — started 2026-04-24T06:44:33.144Z_

- ✅ Advancement predictions submitted by 60 (user,group) pairs (8 intentionally skipped)
- ✅ Two winners in same WC group rejected (422) — _status=422, body={"error":"Group A: only 1 winner allowed"}_
- ✅ 9 global 3rd-place picks rejected (422) — _status=422, body={"error":"Group A: only 1 advance-as-3rd allowed"}_
- ✅ VISITOR_ADMIN submitting advancement rejected (403) — _status=403_
- ✅ PENDING member submitting advancement rejected (403) — _status=403_

## Phase 5 — Advancement lock (2026-06-11T18:00Z)
_4 pass, 0 fail, 0 notes — started 2026-04-24T06:44:39.558Z_

- ✅ setTime to 2026-06-11T18:01Z succeeded — _{"ok":true,"virtualTime":"2026-06-11T18:01:00.000Z"}_
- ✅ Advancement batch submit after lock rejected (403) — _status=403_
- ✅ Advancement individual submit after lock rejected (403) — _status=403_
- ✅ Advancement delete after lock rejected (403) — _status=403_

## Phase 6 — Group stage (72 matches) with rule-enforcement sampling
_32 pass, 0 fail, 1 notes — started 2026-04-24T06:44:39.691Z_

- ✅ Group stage match count — _got 72_
- ✅ M1: Post-lock POST prediction rejected (403) — _status=403, body={"error":"Predictions are locked (< 1 hour before kickoff)"}_
- ✅ M1: Post-lock DELETE prediction rejected (403) — _status=403_
- ✅ M1: All 20 predictions received points — _preds=20_
- ✅ M1: At least one prediction scored non-zero
- ✅ M5: Negative score rejected (400) — _status=400_
- ✅ M5: Score >20 rejected (400) — _status=400_
- ✅ M5: Non-integer score rejected (400) — _status=400_
- ✅ M8: Impersonation attempt — prediction created under attacker's own userId only — _victim.before=0, victim.after=0, attacker has 9-9 pred=true_
- ✅ M10: All 20 predictions received points — _preds=20_
- ✅ M10: At least one prediction scored non-zero
- ✅ M12: Non-member prediction rejected (403) — _status=403_
- ✅ M15: Post-lock POST prediction rejected (403) — _status=403, body={"error":"Predictions are locked (< 1 hour before kickoff)"}_
- ✅ M15: Post-lock DELETE prediction rejected (403) — _status=403_
- ✅ M18: VISITOR_ADMIN prediction POST rejected (403) — _status=403_
- ✅ M20: Mid-match joiner cannot predict locked match (403) — _status=403_
- ✅ M22: PENDING member prediction rejected (403) — _status=403_
- ✅ M30: Post-lock POST prediction rejected (403) — _status=403, body={"error":"Predictions are locked (< 1 hour before kickoff)"}_
- ✅ M30: Post-lock DELETE prediction rejected (403) — _status=403_
- ✅ M35: Score correction (1-1→2-3) generated 32 notifications — _notifsBefore=0, notifsAfter=32_
- ✅ M35: All predictions rescored after correction
- ✅ M36: All 20 predictions received points — _preds=20_
- ✅ M36: At least one prediction scored non-zero
- ✅ M50: Post-lock POST prediction rejected (403) — _status=403, body={"error":"Predictions are locked (< 1 hour before kickoff)"}_
- ✅ M50: Post-lock DELETE prediction rejected (403) — _status=403_
- ✅ M72: Post-lock POST prediction rejected (403) — _status=403, body={"error":"Predictions are locked (< 1 hour before kickoff)"}_
- ✅ M72: Post-lock DELETE prediction rejected (403) — _status=403_
- ✅ M72: All 20 predictions received points — _preds=20_
- ✅ M72: At least one prediction scored non-zero
- ✅ Group stage complete: 72/72 matches scored, 3375 predictions written
- ✅ Late joiner has 0 points for matches 1-30 — _sum=null_
- ✅ Late joiner has 0 predictions for matches 1-30 — _count=0_

**Notes:**
- After match 30: 5 mid-tournament joiners added; foxtrot has 30 approved predictors

## Phase 7 — Group stage advancement resolution (Jun 27)
_3 pass, 0 fail, 0 notes — started 2026-04-24T06:45:53.953Z_

- ✅ Advancement resolutions posted: 48/48
- ✅ All advancement predictions now scored: 1800/1800
- ✅ Advancement scoring matches rules (sample of WINNER picks: 7 exact, 9 direction)

## Phase 8 — Knockouts (32 matches) with stage-specific scoring
_5 pass, 0 fail, 5 notes — started 2026-04-24T06:45:55.347Z_

- ✅ Knockout match count — _got 32_
- ✅ M73 (first knockout): knockouts-only persona now predicts
- ✅ M97 (Quarter-final): Bravo exact-match points = 8 — _got 8 (expected 8)_
- ✅ M102 (Semi-final): Bravo exact-match points = 10 — _got 10 (expected 10)_
- ✅ Knockouts complete: 32/32 matches scored, 1984 predictions written

**Notes:**
- M98 (Quarter-final): No Bravo exact predictions to verify (score 3-1)
- M99 (Quarter-final): No Bravo exact predictions to verify (score 0-1)
- M100 (Quarter-final): No Bravo exact predictions to verify (score 3-0)
- M101 (Semi-final): No Bravo exact predictions to verify (score 1-0)
- M104 (Final): No Bravo exact predictions to verify (score 1-2)

## Phase 9 — Day after final (Jul 27) + final leaderboards
_14 pass, 0 fail, 7 notes — started 2026-04-24T06:46:12.578Z_

- ✅ Post-tournament: prediction on match 104 rejected (403) — _status=403_
- ✅ MegaSim: Alpha Legion: final leaderboard computed (3 members)
- ✅ MegaSim: Alpha Legion: winner has non-zero points
- ✅ MegaSim: Bravo Squad: final leaderboard computed (6 members)
- ✅ MegaSim: Bravo Squad: winner has non-zero points
- ✅ MegaSim: Charlie Crew: final leaderboard computed (8 members)
- ✅ MegaSim: Charlie Crew: winner has non-zero points
- ✅ MegaSim: Delta Elite: final leaderboard computed (12 members)
- ✅ MegaSim: Delta Elite: winner has non-zero points
- ✅ MegaSim: Echo Ensemble: final leaderboard computed (23 members)
- ✅ MegaSim: Echo Ensemble: winner has non-zero points
- ✅ MegaSim: Foxtrot Phenoms: final leaderboard computed (30 members)
- ✅ MegaSim: Foxtrot Phenoms: winner has non-zero points
- ✅ /api/leaderboard returns array for alpha — _status=200_

**Notes:**
- MegaSim: Alpha Legion top 3: MegaSim User 00 (UTC)=115, MegaSim User 10 (IST)=111, MegaSim User 20 (UTC)=103
- MegaSim: Bravo Squad top 3: MegaSim User 21 (PST)=104, MegaSim User 47 (JST)=102, MegaSim User 01 (PST)=85
- MegaSim: Charlie Crew top 3: MegaSim User 02 (IST)=105, MegaSim User 22 (IST)=102, MegaSim User 32 (UTC)=102
- MegaSim: Delta Elite top 3: MegaSim User 11 (JST)=137, MegaSim User 12 (UTC)=116, MegaSim User 25 (PST)=114
- MegaSim: Echo Ensemble top 3: MegaSim User 22 (IST)=146, MegaSim User 02 (IST)=143, MegaSim User 32 (UTC)=132
- MegaSim: Foxtrot Phenoms top 3: MegaSim User 32 (UTC)=174, MegaSim User 43 (JST)=174, MegaSim User 02 (IST)=172
- alpha /api/leaderboard top: MegaSim User 00 (UTC)=115

## Phase 10 — Final tallies and notes
_0 pass, 0 fail, 3 notes — started 2026-04-24T06:46:12.938Z_


**Notes:**
- Final tallies: {"users":51,"groups":6,"predictions":5359,"advancement":1800,"notifications":2492}
- DB will be restored from prisma/prisma/dev.db.bak-pre-simulation after this script completes.
- TIME ZONES: The app does not implement per-user timezone preferences; all lockout/display times are UTC. Users across UTC/PST/IST/JST experience identical lock behavior, which is correct given the current design.
