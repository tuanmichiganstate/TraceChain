# Content review pack

| | |
|---|---|
| Artifact | `tracechain-content-review-2026-07-21.html` |
| Generated | 2026-07-21 |
| Source commit | `07274457d769af099803a4b2555d3f06ea79ce7b` |
| Locale parity | **509/509** strings present, 0 missing |
| SHA-256 | `3ec8c56f7b2d7f20ea21728320285e32bb6eecc6ae18d3a9ab4000981070dfda` |
| Review status | **Not yet reviewed** — awaiting Vietnamese subject expert |

Generated from `src/scenarios/coffee-traceability/` and `src/locales/vi.json`,
not transcribed, so the completeness claim is mechanical rather than asserted.

## Reproducing the parity check

```python
vi = json.load(open('src/locales/vi.json'))
html = open('docs/content-review/tracechain-content-review-2026-07-21.html', encoding='utf-8').read()
missing = [k for k in vi if escape(vi[k]) not in html]
assert not missing
```

An earlier draft of this pack claimed completeness while containing 204/509
strings. That is why the count is recorded here and why it must be re-verified
whenever the pack is regenerated.

## Adjudicated comments

None yet. Record decisions here against the pack's reference codes
(`S3·Q1·b`), including items deferred rather than accepted — notably the
"quyền lưu giữ" terminology question, which is open pending a native speaker.
