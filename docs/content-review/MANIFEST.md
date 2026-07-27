# Content review pack

| | |
|---|---|
| Artifact | `tracechain-content-review.html` |
| Generation command | `npm run generate:content-review` |
| Generator version | `1.0.0` |
| Format version | `1` |
| Source commit | `57279785c2045e6c81016efa0c3b9559f15b8a5a` |
| Source SHA-256 | `71fd1ba05f028dcf659da7de5549398cf093253723dd78e62bcb6d7af512b043` |
| Locale parity | **2438/2438** strings present, 0 missing |
| Artifact SHA-256 | `4516e56c5887bd4f29906645ae306bc2d4caff6d720fc1d33c79d5b9b00eec7a` |
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
