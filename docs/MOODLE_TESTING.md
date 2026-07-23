# Moodle acceptance testing

The checklist to run against a Moodle staging course. The automated Docker
acceptance covers Moodle storage and gradebook APIs; this list retains the
player, visual, and window-arrangement checks that still require a browser.

Run the whole list for every release that changes learner-package inputs.

---

## Before you start

```bash
npm run quality        # must pass end to end
```

Produces `tracechain-scorm-v2.0.0.zip` in the project root.

**Moodle activity settings to use:**

| Setting | Value | Why |
|---|---|---|
| Activity type | SCORM package | — |
| Grading method | Highest grade | Allows retries without punishing exploration |
| Maximum grade | 100 | Matches `cmi.core.score.max` |
| Display package | Test both new window and embedded | API discovery differs between the two |
| Attempts allowed | 2 or more | Exercises the resume and relaunch paths |
| Force new attempt | No | Otherwise resume can never be observed |

Note the Moodle version and browser you tested with — SCORM player behaviour
varies between Moodle releases, and that context matters when triaging.

To put a build into the local Docker demo, run `./docker-moodle/deploy.sh`
rather than re-uploading by hand; it bumps the SCORM revision, without which
the browser keeps serving the previous build. See `docker-moodle/README.md`.

---

## 1. First launch

- [ ] The package uploads without a manifest error.
- [ ] The activity launches and the start screen appears.
- [ ] The interface is Vietnamese, with diacritics rendering correctly
      (check `Hợp tác xã Cà phê Cao nguyên` — stacked marks on `ợ` and `ê`).
- [ ] The **standalone-mode warning does NOT appear**. If it does, SCORM API
      discovery failed; open with `?debug=true` and read the diagnostics panel.
- [ ] Browser console has no errors.
- [ ] Gradebook shows the activity as attempted, status *incomplete*.

## 2. Working through the activity

- [ ] Stage 1 renders the supply-chain diagram and the diagnostic question.
- [ ] The top bar always shows progress, current role, and save status.
- [ ] Stage 2 accepts the batch, and the transaction pipeline advances through
      all seven states to *Ghi vào khối*.
- [ ] All five validation rules report *Đạt*.
- [ ] The ledger shows block 1, with the genesis notice in place of a previous
      hash, and the full 64-character digest wrapping rather than overflowing.
- [ ] Save status shows *Đã lưu tiến độ*.

## 3. Suspend and resume — the critical path

- [ ] Reach stage 2, then leave via Moodle's normal exit.
- [ ] Re-enter the activity. The start screen offers **Tiếp tục lần học trước**.
- [ ] Choosing it returns to stage 2, not to the beginning.
- [ ] Choosing **Bắt đầu lại** asks for confirmation before discarding progress.

**If resume fails, capture `cmi.suspend_data` before doing anything else** —
Moodle admins can read it from the SCORM report, or `?debug=true` shows the
decode error. Current saves start with `TC2.` (legacy `TC1` is still accepted)
and should be a few hundred characters.

## 4. Score and status reporting

- [ ] `cmi.core.score.raw` reaches the Moodle gradebook.
- [ ] Score minimum is 0 and maximum is 100.
- [ ] Status moves from *incomplete* to *completed* / *passed* appropriately.
- [ ] A learner who finishes below 70 shows as completed but not passed.

## 5. Relaunch after completion — the score-clobbering check

- [ ] Complete the activity, then relaunch it.
- [ ] **The existing grade is not overwritten with a lower one.**
- [ ] With `?debug=true`, the diagnostics panel reports the attempt as
      read-only when Moodle supplies `lesson_mode=review`.

This is the failure the specification did not address: without the review-mode
guard, a relaunch recalculates a fresh score of zero and writes it over a good
grade. Test it deliberately.

## 6. Launch modes and window handling

- [ ] New-window (popup) launch: API found via `window.opener`.
- [ ] Embedded (iframe) launch: API found by walking `window.parent`.
- [ ] Browser back button does not corrupt the attempt.
- [ ] Closing the activity window mid-attempt still preserves progress
      (the save fires on `visibilitychange` and `pagehide`).

## 7. Resilience

- [ ] Disconnect the network **after** the activity has loaded. It keeps
      working — no asset is fetched at runtime.
- [ ] Reconnect and exit. Progress is committed.
- [ ] Reload mid-stage. Progress resumes from the last save.

## 8. Responsive and accessible

- [ ] Usable at 320 px width with no horizontal page scroll.
- [ ] Tab order reaches every control; focus is always visible.
- [ ] The whole activity is completable with the keyboard alone.
- [ ] Status is never conveyed by colour alone — each pill has a glyph and a
      text label.

---

## Recording results

For each failure, capture:

- Moodle version and browser.
- Launch mode (popup or embedded).
- `?debug=true` diagnostics panel contents.
- `cmi.suspend_data` value and its length.
- Console errors.

The diagnostics panel is developer-facing and is never shown to an ordinary
learner; `?debug=true` does not alter scoring or domain behaviour.
