# Final review: `feat/v1` (90526b9..2971014)

Reviewer: opus, read-only. Method: I read every product source file in full on HEAD (`src/**`, ~3.7 kLOC), plus the spec, the plan (global constraints, points de vigilance, tasks 5, 6, 7, 10 and 11, final-review section), the ledger, the T11 commit bodies and the scenario harness. I also listed every test. I skimmed the pre-packaged diff rather than reading all of it, because HEAD has no deletions in product code (51 files, +6266/−0), so reading the files in full covers the same content. To settle specific doubts, I ran probe scripts against HEAD's `src/` from a scratch directory, plus one scratch copy with a TUNING change. The working tree was not touched.

Probes run (scratch `vitest` files, not committed):
- Standard format, AI vs AI, seeds 1–3: all reach `matchEnd`. Seed 1 goes to a 3rd set at 15 (15–17). The first server alternates per set ([1, 0, 1]). `setEnd` fires 1–2 times.
- Passive human (`humanPlayerId: 0`, player 0 never acts): the match ends at 0–15 in 6061 ticks (14 `landedIn`, 1 `serveTimeout`). No freeze.
- Player-0 attack outcomes over 8 seeds, normal vs normal, with player 0's attack aim forced (see I3).
- 2nd-touch gesture with keyboard diagonals (see I1).

---

### Strengths

- **Simulation purity holds.** `src/sim/**` has no `three`, DOM, `window`, `performance`, `Date` or `Math.random` (grep is clean). All randomness goes through `rng.ts`, with the sim RNG stored in `GameState` and a separate seeded RNG per brain. `step()` works on `structuredClone(prev)` and a test checks this.
- **Architecture matches the spec's intent.**
  - A clean data flow: `Command`s go into `step`, the renderer reads state, and the HUD reads state.
  - Human and AI produce the same `Command` type.
  - `phases.ts` is extracted along the plan's own threshold, with one handler per phase.
  - The analytical ball model (`ball.ts`) has a closed form and serves prediction, the landing marker and the AI alike.
- **N players per team is real, not cosmetic.** `laneOf`/`laneCenterX`, `teamPlayers`, the role assignment and the service rotation are all generic over N. Tests exercise N=3 (`createInitialState`) and N=4 (point de vigilance 4). The only literal `2`s are the config itself (`menu.ts:12`, `main.ts:26`), the touch count and the arm count.
- **All five points de vigilance have a test and hold:**
  1. Line ball counts in: `rules.test.ts`, « dedans, y compris sur la ligne ».
  2. Serve never tossed or never hit: two tests, plus a whiff test, in `simulation.test.ts`.
  3. Repeated presses and presses with no context: three tests.
  4. Lane boundary at x=0: `ai.test.ts`, run for N=2 and N=4.
  5. 0.25 s catch-up cap: `loop.test.ts`. In `main.ts`, a hidden tab also pauses the game.
- **Robust state machine.** Every phase has a guaranteed exit (serve timeout, toss falling, gravity always lands the ball, pointScored and setEnd timers). A 20 000-tick random-command fuzz test and my passive-human and standard-format probes found no stuck phase.
- **Good handling of subtle sim details:**
  - net crossing detected by a sign change, with the touch taking priority on the same tick;
  - the `sameBall` guard on attacks pending resolution;
  - the toss `resolveTick` rounded the same way as `idealPressTick('serve')`;
  - `isDiscontinuity` to avoid interpolating across teleports;
  - an action latch so that frames with zero steps (high-refresh monitors) do not drop presses;
  - the menu's input edges purged when a match starts.
- **The T11 tuning work was done well.** The AI's approach run-up and its aim away from the block were found by measuring before touching TUNING. Commit bodies record the numbers. Hard beats easy 5/5, and rallies average 5.5 touches.
- **French UI throughout**, and the `KeyboardEvent.code` mapping is correct for AZERTY. Screen orientation is consistent (+x appears on the left of the screen, and so does the A/Q key).

---

### Issues

#### Critical (Must Fix)

None. I found no crash, no freeze, no purity violation and no broken success criterion in the automated sense.

#### Important (Should Fix)

**I1. A set pressed while holding forward or diagonal-forward becomes a jump that is sure to miss.**
Where: `src/sim/touch.ts:101-107` and `:123`, plus `src/sim/tuning.ts:23` (`secondTouchAttackAimForward: 0.7`).
- **What happens.** The keyboard normalizes diagonals to 0.7071 (`keyboard.ts` `keysToMove`), so Z+Q or Z+D (W+A or W+D) clears the 0.7 threshold. On a typical reception (high, near the net), holding forward or a forward diagonal at the moment of the press turns the 2nd touch into an `attack`. The attack's ideal press is 35–36 ticks earlier than the set's. My probe on real reception trajectories, seed 3, gave: `neutral: set`, `W+A: attack`, `W: attack`, `setTick 302`, `attTick 267`, `attackEvalAtSetTiming: null`. A human who presses at set timing while still steering forward gets a jump, a whiff, a 0.8 s lock, and almost always loses the point.
- **Why it matters.** The human's most frequent gesture is the set, because the AI teammate takes about half the receptions. Running forward toward the set zone is exactly how a player gets there. The spec (§ 6.1) does not condition the 2nd-touch attack on the aim at all; the aim condition is a plan addition.
- **Fix.** Either one of these, ideally both:
  - Raise the threshold above 1/√2 (for example 0.9), so that only straight forward triggers it.
  - In `gestureFor`, choose the 2nd-touch `attack` only while it can still be timed (`tick ≤ idealPressTick(attack) + timing.maxTicks`), and fall back to `set` otherwise. This removes the trap completely.

**I2. The timing ring shows when the human is not in reach, and for gestures the human must not play.**
Where: `src/main.ts:72-81`. The plan's T10 wording dropped the spec's condition.
- **What the spec says.** Spec § 6.5: the ring « n'apparaît que si un geste est possible **et que le joueur est à portée** ». The implementation only checks `gestureFor` and `idealPressTick`.
- **Effect 1.** The ring appears for every opponent ball arriving on the team's side, including balls in the AI teammate's lane 5 m away. Pressing gives a « Raté » plus a lock.
- **Effect 2.** Right after the human sets, `gestureFor` still returns `attack` for them, because it does not exclude the last toucher. So the ring invites a press that, if within reach, is a `doubleTouch` fault.
- **Why it matters.** This is the main timing cue, and it currently misleads.
- **Fix.** Show the ring only when `rally.lastToucherId !== humanId` and the human's distance to `contactPoint` is ≤ `reach.max`. For the attack, use the position projected over the jump (`pos + vel·apex`), as `evaluatePress` does. Extract this into a pure function so it can be tested; this also covers the T10 minor « timingRing non testé ».

**I3. The human's "Parfait" straight attack is blocked more often than not; success criterion 2 is at risk for the default input.**
Where: the interaction between `src/sim/phases.ts:356-376` (`tryBlock`), `TUNING.touch.block` and the AI blocker (`decisions.ts` `targetPosition` block, `brain.ts` block press).
- **Measurements.** Probe: 8 seeds, normal vs normal, player 0's attack aim forced, everything else AI.

  | Aim of player 0's attacks | Attacks | Blocked | "Parfait" attacks blocked |
  |---|---|---|---|
  | AI's own aim | 63 | 12 (19 %) | 10 of 37 |
  | Neutral (no direction) | 52 | 22 (42 %) | 17 of 30 (57 %) |
  | Line side (x = −1) | 86 | 38 (44 %) | 28 of 48 (58 %) |
  | Cross-court (x = +1) | 72 | 11 (15 %) | 9 of 41 |

- **Why the AI is not affected.** The AI only escapes the block because T11 taught it to aim away (« Avant, 48 % des attaques étaient contrées »). The human got no equivalent help: no rule changed for human gestures.
- **The ledger's suggested lever does not work.** A scratch copy with `block.halfWidth = 0.4` gave neutral 33/70 blocked, with 28 of 46 "Parfait" attacks blocked. Straight attacks cross at the attacker's x, where the AI blocker stands within 0.3 m.
- **Why it matters.** Spec § 1.3.2: « Un bon placement suivi d'un bon timing donne une attaque gagnante ». A new player who presses perfectly with no direction will see « Parfait » and then get blocked most of the time. Block success also ignores attack quality entirely.
- **Fix.** This is a tuning and design decision for the user. Possible options:
  - Make the AI blocker's lateral placement or timing error larger per difficulty.
  - Make interception probability depend on attack quality, or reduce it, for example by requiring `blockSync` ≥ some threshold for a solid block.
  - Teach the counter: a HUD hint when blocked, or the assist zone showing the open diagonal.

  Whatever is chosen, re-run the probe above and play it by hand. At minimum, the user should explicitly accept the current behaviour before merging.

#### Minor (Nice to Have)

- **M1. The assist zone does not account for momentum on the attack.**
  - Where: `src/sim/ai/decisions.ts:260-276`, and the human side in `main.ts:191-194`.
  - The zone shows the hit point, but `evaluatePress` projects the human by `vel·0.4 s`, which is 2 m at full speed. A human who runs into the zone and presses on the move overshoots and gets « Raté ». This is the same flaw that cost the AI 35 whiffs before the T11 fix.
  - It is learnable ("stop, then jump"), but nothing tells the player. Consider a hint, or a debug read-out of the projected hand.
- **M2. The AI blocker goes to the net already at the opponent's 1st touch.** `decisions.ts:183-187` (`defending` covers `touches ≥ 1`). Spec § 7.2 says « une fois la passe adverse effectuée ». The AI only presses at `touches === 2`, which is correct, but its positioning anticipates.
- **M3. The serve has no prompt.**
  - The human gets no « À vous de servir (Espace) » message. The timing ring only appears after the toss, and the 8 s timeout silently costs a point.
  - The controls panel does mention it. A one-line HUD message in the `serve` phase, shown when `currentServerId === humanId`, would fix it.
- **M4. Space cannot activate the end-of-match buttons from the keyboard.** `main.ts:138` prevents the default action of Space whenever a session exists, including at `matchEnd`, so « Rejouer » and « Menu » cannot be triggered with Space (Enter still works). Skip the `preventDefault` when `phase === 'matchEnd'`, or when the event target is a button.
- **M5. A 3rd touch on a low set is forced to be an attack, which always whiffs.**
  - A set whose remaining apex is below 3.0 m (a low-quality set with a short flight time peaks around 2.7 m) can only be played as `attack`, and that attack always whiffs. There is no way to bump it over.
  - It is rare for the AI (4 attack whiffs in 5 matches), but for the human it is a point lost with nothing they can do.
  - Consider letting `gestureFor` return `set` (a free ball over the net) on the 3rd touch when `attack` has no `idealPressTick`. This needs a target on the other side.
- **M6. A free ball still on the opponent's side reads as a block.** A human at the net who presses on such a ball gets `block` (`touch.ts:85-93`, which takes priority over reception) and is locked for 48 ticks, so they cannot play the ball when it arrives. This is learnable; it is related to the T5 deferred minor about `touches = 3`.
- **M7. The scenarios do not cover the `standard` format.** It is the menu's default. My probe shows it works (3rd set at 15, first-server alternation), but one standard seed in `tests/scenarios/` would lock that in. No test drives a match with a human slot either; the passive-human probe above is a cheap one to add.
- **M8. No sound effects at all.**
  - Spec § 1.4 lists « sons élaborés » as out of scope with « quelques effets simples suffisent », which implies simple effects were expected. The plan has no task for them.
  - This is a gap in the plan, not in the implementation. Flag it to the user as V1 scope.
- **M9. Known duplication.** `opposingAttacker` and `ATTACKER_NEAR_NET_Z` are duplicated in `touch.ts:73-83` and `ai/decisions.ts:114-122`. Today the two are equivalent: same filter, same tie-break by lane order. Export the one in `touch.ts` so the gesture rule and the AI cannot drift apart. Low risk now.

---

### Deferred minors triage

**Must fix before merge:**
- **T8, timing ring very thin at the ideal instant.** **Must fix, together with I2.** At `t = 0` the ring is 0.07 × 0.4 ≈ 0.03 m thick. From the 7 m high camera that is about 1 px, which makes the cue invisible at exactly the moment it is meant for (success criterion 2: « perceptible »). Use a fixed absolute thickness, or rebuild the geometry with a minimum width.

**Can stay.** One line each, grouped by task:

- **T1.**
  - Missing tests (`rngRange`, `isOnSide`, `teamPlayers`, clamp in `laneOf`): can stay.
  - z 9/3/5 hard-coded: can stay (geometry, allowed by the brief).
  - DOM lib visible in `src/sim` with no guard: can stay. The grep is clean; optionally add a lint rule or a sim-only tsconfig later.
  - Gaussian test without a variance check: can stay.
- **T2.**
  - `launchTo` does not guard `flightTime ≤ 0`: can stay. Every caller passes ≥ 0.7·ft > 0.
  - `velocityAt` test without an x component: can stay.
  - `landingTime` returns 0 silently: can stay. The only case is a touch on the tick the ball reaches the ground, which is judged on the same tick with the same verdict.
  - `netCrossingTime(z0 = 0)`: can stay (unused by the sim).
- **T3.**
  - Bounds 6/11 hard-coded, TUNING destructured at load time: can stay.
  - `move` not normalized: can stay. Every caller uses `clampNorm`.
  - Velocity kept against the wall in the air; z = −11 clamp untested; `startJump` is a no-op when the player cannot act: can stay.
- **T4.**
  - Serve landing at exactly z = 0: can stay.
  - Score not reset at `matchEnd`: can stay (intended, the HUD shows the final points).
  - `fourTouches` takes priority over `doubleTouch`: can stay.
  - `lastTouch` null out of the court: can stay (unreachable in a rally).
- **T9.**
  - Missing tests for the gamepad button re-arm and for `connected: false`: can stay.
  - No `preventDefault` on arrows and Space: resolved in `main.ts`.
  - A gamepad button already held at the first poll counts as an edge: can stay.
  - Commit attributed to Haiku: can stay (process).
- **T5.**
  - Block possible at `touches = 3` against the wrong timing reference: can stay. A press after the hit is beyond `syncMaxTicks` anyway; a one-line `touches ≤ 2` guard is cheap if touching `touch.ts` for I1.
  - Depth and lateral constants outside TUNING: can stay.
  - `attack` with no ideal tick when the ball never reaches 3.0 m: handled as a whiff by T6 (see M5).
  - Missing tests: can stay.
  - `deviate` does not clamp the target to the court: can stay (intended).
- **T6.**
  - Set end inferred from `points == [0, 0]`: can stay. It is fragile coupling but correct and tested; prefer returning `setWinner` when next touching `rules.ts`.
  - No same-tick double-touch guard: can stay. The second press whiffs.
  - Two deviations without a test: can stay.
  - `HAND_HEIGHT` and `SOFT_BLOCK_DEPTH` outside TUNING: can stay.
  - `createInitialState` imports from `phases.ts`: can stay.
  - Toss `resolveTick` duplicated: can stay.
  - `expect` inside a 20 000-tick loop: can stay.
  - `tick` still advances at `matchEnd`: can stay (the loop stops stepping).
- **T7.**
  - `opposingAttacker` duplicated: can stay (see M9).
  - AI constants outside TUNING, and `TUNING.ai` mixing presets with `serveDelayTicks`: can stay.
  - Missing brain tests (reaction delay, slow-down and stop, timing noise, block before `touches === 2`, N = 4, integration without a points assertion): can stay.
  - `assignRoles` recomputed several times per think: can stay (cheap).
  - AI chases balls going out; defenders stacked for N > 2: can stay (AI quality; 2v2 only in V1).
- **T8.**
  - Renderer animations run in real time and ignore the ×0.25 slow-motion: can stay (debug only).
  - Debug roles indexed by position: can stay (`id === index` holds by convention).
  - Debug trajectory starts from the whole tick: can stay.
  - Arms raised only after the `touch` event: can stay (cosmetic).
  - Small per-frame allocations: can stay.
  - Shadow map not freed, dev-preview listener (file deleted), double dispose, orphan role sprites: can stay (the renderer is never disposed).
  - Sand cut off at FAR = 120: can stay.
  - Interpolation across a discontinuity: resolved by `isDiscontinuity`.
- **T10.**
  - `timingRing`, `trackHumanTouch` and the action latch untested: can stay, but extract `timingRing` when fixing I2.
  - No DOM tests: can stay.
  - Stale `pressEval` in debug: can stay.
  - F1 slow-motion not applied to renderer animations: can stay.
  - No mouse « Reprendre » button: can stay (Échap and Start work, and the overlay says so).
  - Duplicated `el()`, unused `dispose()`, no `aria-live`, `DEFAULT_CONFIG` comment: can stay.
- **T11.**
  - `netCrossingX` test reimplements the same formula: can stay.
  - `teams[id] ?? 0` in the harness: can stay.
  - `hadFullSequence` defined on the last three touches of a possession: can stay.
  - Confusing comment in `matches.test.ts`: can stay.
  - Hard vs easy tested only with hard as team 0: can stay.
  - `isAttackApproach` recomputes roles: can stay.
  - No straight attack past a perfect blocker: **superseded by I3**. The suggested `halfWidth ≈ 0.4` lever does not solve it (probe above).
  - Easy possibly too weak (~15–2): can stay; revisit in manual play.

### Rulings

1. Sequential execution instead of parallel waves: **agree.** It avoids git conflicts in a single checkout, at no rework cost.
2. Working on `feat/v1`, not `main`: **agree.**
3. "Faces the ball when still" done in the renderer: **agree.** It is implemented in `players.ts:178-184` and keeps `movePlayer` pure.
4. Commit trailers (`Claude-Session` then `Co-Authored-By`): **agree.**
5. Touch beats a net crossing on the same tick: **agree.** It is the right choice for a 60 Hz sim, and the cost is negligible.
6. `sameBall` guard (an attack on a replayed ball is a whiff): **agree.**
7. The AI presses at `tick + 1` with a capped late window: **agree.** The analysis is correct: `step` increments `tick` before reading commands.
8. The AI blocks only after the opposing pass and never attacks on the 2nd touch: **agree** for the press. Note that its blocker positioning starts at the 1st touch (M2).
9. Tuning reached through AI fixes, with no TUNING change: **agree with a reservation.** It was the right method for the AI-vs-AI target, but it left the human-facing balance untuned and unmeasured (I3). The ruling's own "cost if wrong" line (« à vérifier en jeu ») has not been discharged yet.

### Declined to judge

- Cross-engine floating-point determinism of `Math.exp`, `log` and `cos` for future online play: outside V1 (spec § 11, "à ne pas bloquer").
- Visual and art quality of the low-poly scene: subjective, and I only saw headless screenshots.
- Real-browser behaviour of `visibilitychange`, `blur` and the gamepad: I could not exercise them. The code paths read correctly, and the user needs to check them by hand (as already flagged in the ledger).
- Bundle size (three.js chunk over 500 kB): the spec sets no load-time requirement.
- Menu accessibility (screen readers, `aria-live`): the spec is silent, it is a personal desktop project, and it is already a T10 deferred minor.
- AI realism choices (chasing balls that go out, the feint threshold, aim grids): these are AI quality preferences within spec § 7, and AI-vs-AI scenarios pass.
- Vendored `.claude/skills/**` and the process documents: tooling, excluded from the package.
- Whether 8 s of serve inactivity *should* cost a point for a human: spec § 8.2 mandates it. I only flagged the missing prompt (M3).

### Recommendations

1. Fix I1. It is a few lines in `gestureFor`, plus a test: a "forward diagonal at set timing gives `set`" case.
2. Fix I2 together with the T8 ring thickness, extracting `timingRing` into a pure, tested function.
3. Decide on I3 with the user: pick a block-balance lever, re-run the player-0 aim probe (shown above), and play a few sets by hand.
4. Cheap additions: one `standard`-format scenario and one passive-human scenario (M7), the serve prompt (M3), and letting Space work at `matchEnd` (M4).
5. Manual session by the user before merging: blur and tab switch to pause, gamepad plugged in and unplugged, F1 slow-motion, Rejouer and Menu cycles.

### Assessment

**Ready to merge?** With fixes

**Reasoning:** The branch is architecturally sound, pure, deterministic and well tested, and all four automated success criteria and the five points de vigilance hold. However, three human-facing problems undermine success criterion 2 for an actual player:
- forward or diagonal input turns sets into certain whiffs (I1);
- the timing ring is shown out of reach and is invisible at its key instant (I2 and T8);
- straight "Parfait" attacks are blocked more often than not (I3).

I1, I2 and T8 are small and should be fixed before merging. I3 needs at least an explicit tuning decision by the user.
