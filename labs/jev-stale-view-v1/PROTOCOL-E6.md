# E6 protocol — withdraw instead of annotate (written after E5, before any E6 call)

E5 result that motivates this: annotating the stale conclusion (arm C) did not
change first-submission pass rate versus leaving it (arm B), 13/15 both; the
no-conclusion control (D) was 15/15. All B and C failures answered without
reading any file.

Change: new arm `E_fc_jev_withdraw`. Same as C, but for assistant messages with
Jev p >= 0.5 the outgoing copy replaces the whole message text with:
`[FreshCtx: an earlier note about <observed> was withdrawn because the file changed after it was written.]`
The saved session keeps the original text.

Arms run: B_fc, D_fc_noclaim, E_fc_jev_withdraw (B and D re-run as same-day
controls). Same 5 tasks, 3 repetitions, rotated order, same model, limits,
checker, prompt, spend cap ($2 cumulative with E5). Reported like E5.
Small, directional; one marker wording; no tuning after seeing results.
