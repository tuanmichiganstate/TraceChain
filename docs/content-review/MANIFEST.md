# Content review pack

| | |
|---|---|
| Artifact | `tracechain-content-review.html` |
| Generation command | `npm run generate:content-review` |
| Generator version | `1.0.0` |
| Format version | `1` |
| Source commit | `f81c84b0adf4d2abaa97d4b9a40e1987245df3d9` |
| Source SHA-256 | `67aaa5176e0556f1db23759da94769c397da674eb9df424137708c4769f5b3bb` |
| Locale parity | **563/563** strings present, 0 missing |
| Artifact SHA-256 | `4fe0cc4724db92e162567c63b69b4568686f5a8e25614ce43abbcda00de37fac` |
| Review status | **Not yet reviewed** — awaiting Vietnamese subject-expert adjudication |

The source commit records the clean committed base used for generation. The
source SHA-256 covers the exact sorted locale catalogs, scenario review model,
format version, and exclusions, including any working-tree source changes.

## Authoritative sources

- `src/locales/vi.json`
- `src/locales/en.json`
- `src/scenarios/coffee-traceability/`
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
