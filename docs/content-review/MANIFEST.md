# Content review pack

| | |
|---|---|
| Artifact | `tracechain-content-review-2026-07-21.html` |
| Generated | 2026-07-21 |
| Source state | Phase 1 locale update; deterministic commit provenance lands with the Phase 4 generator |
| Locale parity | **519/519** strings present, 0 missing |
| SHA-256 | `5a52ab22e85272b2087fe79209179036b9eb4db3678df6efd3254a508b22d70f` |
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

An earlier draft of this pack claimed completeness while containing only part
of the locale catalog. The current count is recorded mechanically rather than
assumed, and must be re-verified whenever the pack is regenerated.

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
