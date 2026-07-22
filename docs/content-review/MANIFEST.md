# Content review pack

| | |
|---|---|
| Artifact | `tracechain-content-review.html` |
| Generation command | `npm run generate:content-review` |
| Generator version | `1.0.0` |
| Format version | `1` |
| Source commit | `7eabc16d6f7dffa22403a883b13273cf9c185f0f` |
| Source SHA-256 | `cf08142e999b4bc34fd6652db10ecc3adbe747790e63f9e11fc0b18aeb795dd4` |
| Locale parity | **539/539** strings present, 0 missing |
| Artifact SHA-256 | `6df203b5c5a5fb02f16a96b768f1f76fdb8e1c129ebd88743723ee3a9a2441d7` |
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
