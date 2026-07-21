# Localization

Vietnamese is the production interface. English is a scaffold, kept
key-identical for developer testing and future use.

- `src/locales/vi.json` — what learners read
- `src/locales/en.json` — same keys, English values
- `src/localization/i18n.ts` — a ~40-line `t()` over a flat map

## Using it

```tsx
const t = useTranslator();
t("stage.createBatch.title");
t("workspace.progressValue", { current: 2, total: 9 });
```

Keys are `dot.notation`, grouped by area: `app.`, `navigation.`, `start.`,
`status.`, `workspace.`, `stage.`, `field.`, `transaction.`, `pipeline.`,
`endorsement.`, `validation.`, `ledger.`, `state.`, `history.`, `terms.`,
`message.`, `errors.`.

## The rules

**No learner-facing string may live outside the locale files.** Not in a
component, not in domain logic, not in a scenario file. `npm run
validate:locales` fails the build if Vietnamese appears anywhere in `src/`
outside `src/locales/`.

Test files are exempt — several exist specifically to prove that diacritics
survive hashing and serialization, which requires literal diacritics.

**Both catalogues must have identical key sets**, no empty values, no duplicate
keys, and matching `{placeholder}` sets per key. All enforced.

**Ledger data is not translated.** `productName`, `originLocation` and similar
fields carry scenario values, not keys. A ledger value must not change when the
interface language changes — the hash would change with it.

**Validation messages are keys, never sentences.** A rule returns
`messageKey: "validation.assetIdAlreadyExists"`, and every message explains the
*business* reason, because section 18.4 forbids showing a bare "invalid
transaction".

## Vietnamese specifics

**Diacritics render as literal UTF-8**, not `\uXXXX` escapes. (The escape
convention in the global R/Shiny conventions exists for the Windows R runtime
and does not apply here — Vite bundles UTF-8 and every target browser handles
it.)

**Line height must be at least 1.6 on body text.** Vietnamese stacks two marks
on a single character — ế, ộ, ữ, ẫ — and a tight line-height clips the upper
one. This is the most common Vietnamese typography defect, and it is why no
text-bearing row has a fixed height.

**Technical terms show the English in parentheses on first use**, in tooltips,
in the glossary, and in the debrief — `Giao dịch (Transaction)`,
`Hàm băm (Hash)`, `Quyền lưu giữ (Custody)`. Not in every button or table cell,
which would be noise. The approved term list is section 6.2 of the
specification; `terms.*` keys hold the parenthesized forms.

**Mining vocabulary is forbidden.** Never *đào khối*, *thợ đào*, *mining*,
*miner*, or *proof of work* — this is a permissioned network and that language
teaches a misconception. Use *xác thực giao dịch*, *phê duyệt giao dịch*,
*sắp thứ tự giao dịch*, *ghi giao dịch vào khối*, *cam kết giao dịch vào sổ cái*.

## Adding a key

1. Add to `vi.json` **and** `en.json`, in the same group.
2. Reference it as `t("your.key")`.
3. `npm run validate:locales`.

A missing key renders as the key itself and warns in development, so it is
obvious in review rather than showing as blank space.

## What the audit checks

| Check | Severity |
|---|---|
| Key sets identical across catalogues | error |
| No empty values | error |
| No duplicate keys in the raw JSON | error |
| Placeholders match per key | error |
| Every `t("key")` in source exists in `vi.json` | error |
| No Vietnamese in source outside locale files | error |
| Vietnamese diacritics still present in `vi.json` | error |
| Keys defined but not yet referenced | warning |

The last one is a warning because keys are legitimately added ahead of the
screens that use them.
