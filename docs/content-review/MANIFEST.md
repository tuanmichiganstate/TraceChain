# Content review pack

| | |
|---|---|
| Artifact | `tracechain-content-review-2026-07-21.html` |
| Generated | 2026-07-21 |
| Source commit | `07274457d769af099803a4b2555d3f06ea79ce7b` |
| Locale parity | **512/512** strings present, 0 missing |
| SHA-256 | `66a34d1d2328a35db84a7fdabd6a088a6f70068ad99644d5a907f78b0dd83536` |
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

An earlier draft of this pack claimed completeness while containing 512/512
strings. That is why the count is recorded here and why it must be re-verified
whenever the pack is regenerated.

## Known limitation of the current check

`npm run verify:content-review` proves that every locale string appears in the
committed pack and that this manifest's digest and count are current. It does
**not** regenerate the pack, so it cannot detect a stale HTML export whose
manifest was refreshed without re-rendering.

Closing that needs the generator committed as `scripts/generate-content-review.mjs`
and the verifier extended to:

```bash
npm run generate:content-review
git diff --exit-code -- docs/content-review/
```

The generator currently exists only as the ad-hoc scripts used to produce this
pack. Until it is committed, treat regeneration as a manual step and re-run
`verify:content-review` afterwards.

## Adjudicated comments

None yet. Record decisions here against the pack's reference codes
(`S3·Q1·b`), including items deferred rather than accepted — notably the
"quyền lưu giữ" terminology question, which is open pending a native speaker.
