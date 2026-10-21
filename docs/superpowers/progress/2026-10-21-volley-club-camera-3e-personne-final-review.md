# Final review: « Caméra 3e personne libre » (c64ac1b..4f88bad)

Reviewer: opus (final review). Read-only on the checkout: no files changed, no worktree.
Sources: the spec (2026-10-21), the plan and its « Revue finale » section, CLAUDE.md, the ledger, the task reports and screenshots, the full diff and the current files.
Evidence I gathered myself: one throwaway script in the scratchpad (not committed). It runs an AI vs AI match through the real `step`, `createBrain` and `cameraPosition` and projects the ball with a three.js `PerspectiveCamera(55°, 16/9)`. I wanted to know whether the spec's framing (distance 4, target 1.4 m, pitch 15°) keeps the ball on screen during a rally (see Recommendations).

## Strengths

- **The simulation is fully isolated.**
  - Under `src/sim/`, only `tuning.ts` changes. It gains exactly the `camera`, `fx.flash` and `fx.shockwave` sections, with the § 7 values.
  - `types.ts`, the simulation, the AI and their tests are untouched.
  - `src/camera/`, `src/fx/` and `src/pointerLock.ts` have no `three` and no DOM.
- **The signs are consistent from end to end.** I checked each one by hand:
  - `screenToWorld` is exactly the rotation of angle `yaw` around +y. At yaw −π/2, "forward" gives −x and "left" gives +z, which is a rigid rotation of the view.
  - Mouse right, right stick right and `KeyE` all decrease yaw (turn right).
  - Mouse down and stick down raise the camera (non-inverted, as in standard third-person games).
  - `cameraPosition` matches `cible − d·(cos p·f, −sin p)`.
  - `minimapCone` mirrors x through the same signs as `courtToMinimap`, and the pixels-per-metre scale is read from that function.
  - Screenshots `task-5-pause.png` and `task-4-rotated90*` match: a cone pointing left on the minimap gives a view with the net on the right.
- **Exact non-regression at yaw 0.** `cos 0 = 1` and `sin 0 = 0` are exact, so the command is unchanged, and `toEqual` checks this against `step`. The magnetism (V1.1) runs after the rotation, in terrain coordinates, as the spec requires.
- **The pause and pointer-lock state machine is well factored.** `src/pointerLock.ts` holds the decisions as pure functions, and `main.ts` only wires events to them. I walked through every scenario and found no stuck state:
  - Escape while locked, whether or not the keydown is delivered, in the same frame or the next one;
  - Start on the gamepad, then the programmatic release, which pauses idempotently without arming the guard;
  - Alt+Tab or blur;
  - a recapture refused after « Reprendre », which keeps playing, shows the hint, and a click recaptures;
  - Escape in pause, which unpauses; the recapture is refused because Escape does not count as user activation, and that error falls inside the request window, so it does not pause again;
  - `matchEnd` and « Menu », where the lock is released so « Rejouer » and « Menu » can be clicked;
  - a canvas click while paused, which resumes even if the lock is still held.
  `#ui` has `pointer-events: none`, so canvas clicks do reach the canvas. The hint and the flash do not capture clicks either.
- **Camera time is handled correctly.**
  - `updateView` runs in real time, capped by `MAX_FRAME_DT`, during the hit-stop and the slow motion, and never during pause.
  - `screenToWorld` is applied at the step, with the current yaw (vigilance 4).
  - The camera target is smoothed in real time, while the orientation is applied without smoothing.
  - The floor is applied twice: in `cameraPosition`, then again after the shake.
- **The impact effects follow the spec.**
  - Only `attack` + `perfect` triggers an effect.
  - The flash restarts from its peak instead of adding up, and at most 4 shockwaves exist at once, oldest removed first.
  - The fx code still uses real time.
  - Under `prefers-reduced-motion`, the human's attack shows a shockwave instead of the flash.
  - The renderer uses a pool of 4 groups with shared geometry, materials updated in place, and disposal on teardown.
- **The tests check real behaviour.** Examples:
  - criterion 2 checks the command that `step` receives through the existing mock;
  - vigilance 3 checks that `gestureFor` returns `set` and not `attack` at yaw π/4, after a sanity check that `attack` is reachable;
  - magnetism after conversion is checked against an independent computation;
  - the pause guard was checked by mutation (task 5 report);
  - the shockwave keeps its position after the ball moves;
  - the flash decays during the hit-stop.
- **The banner follows the camera.** The Ruling that feeds the terrain command to `expectedGesture`, `timingRing` and `diveHint` matters for the player: without it, the banner would announce one gesture and the game would play another once the camera is turned.

## Issues

### Critical
None.

### Important
None.

### Minor

1. **The view cone dims the landing cross.** `src/ui/minimap.ts:99-110` draws the cone after the red landing cross (`:85-97`).
   - **Why it matters:** the cone covers the cross with 45 % white whenever the player looks toward the ball, which is most of the time. The cross is the main placement cue on the minimap. The spec only says the cone goes "sous les pastilles", and the reasonable reading is under every marker.
   - **Fix:** move the cone block before the landing-cross block. This changes the drawing order only.
2. **The hint flickers when play starts or resumes.** `src/frame.ts:211-213` and `src/main.ts:105,112`. The lock is granted asynchronously, so « Clique pour orienter la caméra à la souris » appears for 1 or 2 frames after each « Jouer », « Rejouer » and « Reprendre », even when the capture succeeds. This is the deferred T5 minor.
   - **Fix:** hide the hint while a request is pending. For example, pass `requestPending` (inside `LOCK_REQUEST_WINDOW_MS` and before the `pointerlockerror`) into `showMouseHint`.
   - **Severity:** cosmetic and barely visible. It can stay.
3. **A single non-finite mouse delta would break the camera and the simulation for good.** `src/input/input.ts:36-37` adds `movementX ?? 0` without a finiteness check. One `NaN` would make `yaw` NaN permanently (`clamp` and `wrapAngle` both keep NaN), then `move`/`aim` would be NaN and reach `step`.
   - **Likelihood:** browsers report integer deltas, so this is very unlikely.
   - **Fix:** `if (Number.isFinite(movementX)) …`. It costs one line. This is the deferred T2 minor.
4. **`minimapCone` repeats `forwardOf`.** `src/ui/minimapMath.ts:54` recomputes `sin`/`cos` instead of calling `forwardOf(a)`. This is a DRY nit (deferred T4).
5. **The `main.ts` wiring has no tests** (`src/main.ts:46-121`): the 1 s window, `lockLost`, recapture and release. The decisions themselves are tested in `pointerLock.ts`, but the glue is not: timestamps, `lockLost` reset in `startMatch`, `wasPaused && !paused`. This is the deferred T5 minor. See Recommendations.
6. **The menu backdrop keeps the last match's target.** After « Menu », the `CameraRig` keeps the human's last position as its target, and `hasTarget` stays true. The backdrop is then framed on that position rather than on `(0, 1.4, −6)`. The panel hides almost all of it, so this is harmless. I note it only because the Ruling describes the backdrop as "cadré sur la cible par défaut", which is true only on first load.

## Deferred minors triage

| Task | Minor | Verdict |
|---|---|---|
| T1 | `toBeCloseTo` tests for minHeight / identity at yaw 0 | can stay (the frame test checks exact `toEqual` at yaw 0) |
| T1 | `NO_LOOK` is a shared mutable object | can stay (nothing mutates it; `Object.freeze` when convenient) |
| T1 | `realDt` not bounded in `updateView` | can stay (the caller caps it with `MAX_FRAME_DT`, and that is tested) |
| T2 | `KeyQ` not covered by "ne déplacent pas le joueur" | can stay |
| T2 | `movementX` NaN not filtered | can stay; one-line fix recommended (Minor 3) |
| T2 | a zero-length `mousemove` counts as keyboard activity | can stay (only affects the device indicator, only while captured) |
| T2 | `padActive` line about 150 characters | can stay |
| T3 | no test for a resume frame with a non-zero look | can stay (the input layer guarantees an empty accumulator: no lock in pause, `poll` every frame) |
| T3 | magnetism test precondition depends on tuning | can stay (the precondition is asserted, so it fails loudly) |
| T3 | `worldCommand` computed twice per frame | can stay (negligible) |
| T4 | `minimapCone` does not use `forwardOf` | can stay (Minor 4) |
| T4 | no automated test of `CameraRig` | can stay (the math is covered by `cameraPosition`; the rig is thin; screenshots back it up) |
| T4 | cone colour hard-coded outside `palette()` | can stay |
| T5 | `main.ts` wiring untested; extract an injectable controller | can stay for this merge; recommended follow-up |
| T5 | `releaseLock` called every frame in pause until `pointerlockchange` | can stay (idempotent, 1 or 2 frames) |
| T5 | 0.25 s guard counted down with a capped dt | can stay (no visible effect) |
| T5 | hard-coded CSS positions | can stay |
| T5 | hint visible 1 or 2 frames after « Reprendre » | can stay (Minor 2; same cause after « Jouer ») |
| T6 | no test that `newSession` passes `humanId` to `createFx` | can stay (verified in the browser: opacity 0.6 on the real session); a one-line test would be worth adding |
| T6 | `impactFlash` has no DOM test | can stay |
| T6 | small per-frame allocations (`waves.map`, `forEach`, `setHex`) | can stay (only while a shockwave is alive, 0.3 s) |
| T6 | the flash layer's `dispose` is never called | can stay (it lives as long as the app, like the other `main.ts` listeners) |
| T6 | first flash shown at about 0.55 (one frame of decay) | can stay |
| T6 | `shockwaveLook` bound and removal bound differ slightly | can stay (opacity is 0 at that point anyway) |

**None of them must be fixed before merge.**

## Rulings

- **T4 may complete `frame.ts` minimally for `HudView.view`.** Agree.
- **Implementers run one at a time; reviews run in the background.** Agree (CLAUDE.md rule).
- **`expectedGesture` / `timingRing` / `diveHint` receive the terrain command.** Agree strongly. Otherwise the banner contradicts the gesture actually played.
- **Menu backdrop framed on `(0, 1.4, −6)` instead of player 0's start position.** Agree. Note that after a match the backdrop is framed on the human's last position (Minor 6); this is harmless.
- **A `pointerlockerror` within 1 s of our own request does not pause.** Agree. It reconciles two lines of spec § 5 that contradict each other ("refus" pauses, "refusée → le jeu continue"), and it is what plan vigilance 1 requires.
- **`exitPointerLock` on pause, on `matchEnd` and on « Menu ».** Agree. It is required: otherwise the locked canvas swallows the clicks on « Reprendre », « Rejouer » and « Menu ».
- **Lock loss pauses idempotently, plus a 0.25 s guard.** Agree. It prevents a pause followed immediately by an unpause when the browser also delivers the Escape keydown.
- **`PAUSED_FX` sets the flash and shockwaves to zero instead of freezing them** (this departs from spec § 6.1). Agree: these are effects of 0.18 to 0.3 s, and the pause panel covers the centre of the screen anyway. I suggest amending the sentence in spec § 6.1 so the spec does not contradict the code.

## Declined to judge

- **The camera can go through the net, a post or a teammate when the player looks back.** Spec § 1.3 explicitly puts camera collision out of scope.
- **The human's body hides the centre of the screen** (target at 1.4 m, no shoulder offset). The framing is set by spec § 6 and § 7; see the Recommendation on playtesting.
- **The gamepad no longer has an aim independent from movement.** This is a deliberate spec choice (§ 3.3, § 4).
- **A 2nd-touch attack needs a camera within about ±26° of the net axis when holding "forward"** (`aimForward ≥ 0.9`). The spec states this explicitly (§ 3.3), and the banner shows the gesture that will actually be played.
- **No recentring, no menu sensitivity or inversion setting.** Explicitly out of scope (§ 1.1, § 1.3).
- **The hint stays visible forever where pointer lock is impossible** (sandboxed iframe), even though clicking can never capture. This is the behaviour spec § 5 asks for, and the A/E keys remain available.
- **« A / E » in the menu is the AZERTY reading** (on QWERTY it is Q/E). This matches the existing « ZQSD » line and the text the spec requires.
- **A 200 px per frame cap can clip a very fast flick at a low frame rate.** The cap and its value are set by the spec (§ 3.4, vigilance 1).
- **Pointer-lock behaviour in real browsers** (resizing while locked, a real Escape in Chrome, recapture refused about 1 s after Escape). These cannot be checked headless; they are listed as manual checks for the user (task 5 report).

## Recommendations

1. **Before merging, do the three manual checks** listed in the task 5 report (resize while locked, a real Escape in Chrome, recapture about 1 s after Escape). They are the only success criteria not covered by an automated or headless check (criterion 5, plan vigilance 1 and 5).
2. **Optional quick pass** (about 10 lines, one agent): Minor 1 (cone under the cross), Minor 3 (`Number.isFinite`), Minor 4 (`forwardOf`), and the one-line `newSession → createFx({ humanId })` test.
3. **Follow-up:** extract the `main.ts` pointer-lock glue into a small controller with an injected `document`/`canvas`/`now`, and test the « Jouer → refusal → hint → click → capture » and « Escape → pause → Reprendre » sequences.
4. **Playtest the framing.** My measurement over about 6,400 ticks of ball flight in an AI vs AI match, with the camera on player 0:

   | Camera | Ball on screen | Ball above the top edge |
   |---|---|---|
   | yaw toward the ball, `pitchDefault` | 91 % | 9 % |
   | yaw fixed toward the net, `pitchDefault` | 85 % | 13 % |
   | yaw toward the ball, pitch 0 | 99 % | — |
   | yaw toward the ball, `pitchMax` | 20 % | — |

   So the spec's framing is reasonable. If players complain they lose the ball on high balls, the lever is `pitchDefault` (0.26 → about 0.15) in `tuning.ts`, not the code.
5. **Optional:** `requestPointerLock({ unadjustedMovement: true })` where supported would remove Chrome's `movementX` spikes at the source (they are already capped at 0.5 rad).

## Assessment

**Ready to merge? Yes.** This assumes the three pending manual pointer-lock checks pass.

The implementation follows the spec and the plan faithfully: the simulation and AI are untouched, non-regression at yaw 0 is exact, the signs are consistent, and I found no stuck state in the pause and pointer-lock logic. The findings are Minor only, and none of the deferred minors blocks the merge.
