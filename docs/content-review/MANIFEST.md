# Content review pack

| | |
|---|---|
| Artifact | `tracechain-content-review.html` |
| Generation command | `npm run generate:content-review` |
| Generator version | `1.0.0` |
| Format version | `1` |
| Source commit | `e1b232d7715587936046d656810ca0ba2835a006` |
| Source SHA-256 | `9bc30f9d6402f8b815ad0f0a338cfefc541205d3f3bac83ce9154237c1594724` |
| Locale parity | **2754/2754** strings present, 0 missing |
| Artifact SHA-256 | `209b50c93f6f5571be63cfbe63afdb46871c18d0c65d955e717c4f952a6312fd` |
| Review status | **Not yet reviewed** — awaiting Vietnamese subject-expert adjudication |

The source commit records the clean committed base used for generation. The
source SHA-256 covers the exact sorted locale catalogs, scenario review model,
format version, and exclusions, including any working-tree source changes.

## Authoritative sources

- `src/locales/vi.json`
- `src/locales/en.json`
- `src/scenarios/coffee-traceability/`
- `src/scenarios/practice-a/`
- `src/scenarios/challenge-a/`
- `src/technical-lab/`
- `src/domain/types/scenario.ts`
- `src/domain/types/enums.ts`
- `src/domain/types/scoring.ts`

## Verification

`npm run verify:content-review` regenerates into a temporary directory and
compares both files byte-for-byte. It does not rewrite this directory. It fails
for stale HTML, digest or parity metadata, duplicate or missing locale keys,
source changes, or exclusion drift.

## Explicit exclusions

- Không loại trừ khóa ngôn ngữ nào: mọi khóa trong vi.json và en.json đều có đúng một mục rà soát.
- Giá trị sổ cái phát sinh lúc chạy (mã giao dịch, hàm băm, thời gian và trạng thái tài sản) không phải chuỗi trong danh mục ngôn ngữ.
- Dữ liệu mẫu không dịch nằm trong lệnh hoặc seed (ví dụ productName và originLocation) được giữ nguyên để hàm băm không phụ thuộc ngôn ngữ.

## Human review

No Vietnamese subject-expert adjudication has been supplied. Record future
decisions here against locale keys. The terminology question around “quyền lưu
giữ” remains open until a native-speaking subject expert decides it.
