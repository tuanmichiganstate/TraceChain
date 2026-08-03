import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Activity } from "./support/activity";
import { installScormApi, peek } from "./scorm-harness";
import { embedConfiguration, hashConfiguration } from "../src/config/hash";
import {
  ASSESSMENT_PRESET,
  AUDIT_ASSESSMENT_PRESET,
  AUDIT_CHALLENGE_PRESET,
  AUDIT_PRACTICE_PRESET,
  CHALLENGE_PRESET,
  PRACTICE_PRESET,
} from "../src/config/presets";
import { challengeAScenario } from "../src/scenarios/challenge-a/scenario";
import { challengeVariantBank } from "../src/scenarios/challenge-a/variant-bank";
import { practiceAScenario } from "../src/scenarios/practice-a/scenario";
import { practiceVariantBank } from "../src/scenarios/practice-a/variant-bank";
import { coffeeScenario } from "../src/scenarios/coffee-traceability/scenario";
import { sha256Hex } from "../src/infrastructure/hashing/sha256";
import { ScenarioStageId } from "../src/domain/types/enums";
import { selectVariantAssignment } from "../src/domain/scenario/variant-bank";
import { sl1CodecSchema } from "../src/domain/simulation/command-journal";
import { encodeSl1Attempt } from "../src/infrastructure/persistence/sl1-codec";
import {
  publishScenarioPack,
} from "../src/platform/scenario-packs/publication";
import {
  validateScenarioPack,
} from "../src/platform/scenario-packs/validation";

const practiceAuditPackJson: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../scenario-packs/practice-coffee-audit/simuledger.pack.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const challengeAuditPackJson: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../scenario-packs/challenge-coffee-audit/simuledger.pack.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function publishedPracticeAuditPack() {
  const validation = validateScenarioPack(
    structuredClone(practiceAuditPackJson),
  );
  if (!validation.isValid) {
    throw new Error(
      validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n"),
    );
  }
  return publishScenarioPack(validation.pack, {
    publishedAt: "2026-07-27T03:00:00.000Z",
    publishedBy: "SIMULEDGER_BROWSER_ACCEPTANCE",
  });
}

function publishedChallengeAuditPack() {
  const validation = validateScenarioPack(
    structuredClone(challengeAuditPackJson),
  );
  if (!validation.isValid) {
    throw new Error(
      validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n"),
    );
  }
  return publishScenarioPack(validation.pack, {
    publishedAt: "2026-07-27T03:00:00.000Z",
    publishedBy: "SIMULEDGER_BROWSER_ACCEPTANCE",
  });
}

async function installPracticeAuditRuntime(page: Page): Promise<void> {
  const pack = publishedPracticeAuditPack();
  await page.route("**/simuledger.config.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(embedConfiguration(AUDIT_PRACTICE_PRESET)),
    });
  });
  await page.route("**/audit-scenario-pack.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(pack),
    });
  });
  await page.route("**/build-info.json", async (route) => {
    const response = await route.fetch();
    const buildInformation = (await response.json()) as Record<
      string,
      unknown
    >;
    const source = `${JSON.stringify(pack, null, 2)}\n`;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...buildInformation,
        auditScenarioPackHash: sha256Hex(source),
        auditScenarioPackContentHash:
          pack.publication?.contentHash,
        auditPersistenceSchemaVersion: "TA2",
      }),
    });
  });
}

async function installAuditBankRuntime(
  page: Page,
  configuration:
    | typeof AUDIT_CHALLENGE_PRESET
    | typeof AUDIT_ASSESSMENT_PRESET,
): Promise<void> {
  const pack = publishedChallengeAuditPack();
  await page.addInitScript(() => {
    const nativeGetRandomValues =
      globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = (<T extends ArrayBufferView>(
      values: T,
    ): T => {
      if (values.byteLength === 16 && "fill" in values) {
        (
          values as unknown as {
            fill(value: number): unknown;
          }
        ).fill(0);
        return values;
      }
      return nativeGetRandomValues(values);
    }) as Crypto["getRandomValues"];
  });
  await page.route("**/simuledger.config.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(embedConfiguration(configuration)),
    });
  });
  await page.route("**/audit-scenario-pack.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(pack),
    });
  });
  await page.route("**/build-info.json", async (route) => {
    const response = await route.fetch();
    const buildInformation = (await response.json()) as Record<
      string,
      unknown
    >;
    const source = `${JSON.stringify(pack, null, 2)}\n`;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...buildInformation,
        auditScenarioPackHash: sha256Hex(source),
        auditScenarioPackContentHash:
          pack.publication?.contentHash,
        auditPersistenceSchemaVersion: "TA2",
      }),
    });
  });
}

async function installChallengeRuntime(page: Page): Promise<void> {
  const mediaManifest = {
    schemaVersion: "1",
    scenarioId: challengeAScenario.scenarioId,
    scenarioVersion: challengeAScenario.scenarioVersion,
    assets: challengeAScenario.portraitAssets,
  };
  await page.addInitScript(() => {
    const target = globalThis as typeof globalThis & {
      __variantSeedDraws?: number;
    };
    const drawCountStorageKey =
      "__simuledger_variant_seed_draw_count__";
    target.__variantSeedDraws = Number.parseInt(
      globalThis.sessionStorage.getItem(drawCountStorageKey) ?? "0",
      10,
    );
    const nativeGetRandomValues =
      globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = (<T extends ArrayBufferView>(
      values: T,
    ): T => {
      if (values.byteLength === 16 && "fill" in values) {
        target.__variantSeedDraws =
          (target.__variantSeedDraws ?? 0) + 1;
        globalThis.sessionStorage.setItem(
          drawCountStorageKey,
          String(target.__variantSeedDraws),
        );
        (
          values as unknown as {
            fill(value: number): unknown;
          }
        ).fill(6);
        return values;
      }
      return nativeGetRandomValues(values);
    }) as Crypto["getRandomValues"];
  });
  await page.route("**/simuledger.config.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(embedConfiguration(CHALLENGE_PRESET)),
    });
  });
  await page.route("**/scenario.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(challengeAScenario),
    });
  });
  await page.route("**/scenario-variant-bank.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(challengeVariantBank),
    });
  });
  await page.route("**/media-manifest.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(mediaManifest),
    });
  });
  await page.route("**/build-info.json", async (route) => {
    const response = await route.fetch();
    const buildInformation = (await response.json()) as Record<
      string,
      unknown
    >;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...buildInformation,
        scenarioHash: sha256Hex(
          `${JSON.stringify(challengeAScenario, null, 2)}\n`,
        ),
        portraitMediaManifestHash: sha256Hex(
          `${JSON.stringify(mediaManifest, null, 2)}\n`,
        ),
        portraitMediaHashes: Object.fromEntries(
          challengeAScenario.portraitAssets.map((asset) => [
            asset.filePath,
            asset.sha256,
          ]),
        ),
        variantBankId: challengeVariantBank.bankId,
        variantBankVersion:
          challengeVariantBank.bankVersion,
        variantBankHash: sha256Hex(
          `${JSON.stringify(challengeVariantBank, null, 2)}\n`,
        ),
        variantContentHashes: Object.fromEntries(
          challengeVariantBank.variants.map((variant) => [
            variant.metadata.variantId,
            variant.metadata.contentHash,
          ]),
        ),
      }),
    });
  });
}

async function installAssessmentRuntime(page: Page): Promise<void> {
  await page.route("**/simuledger.config.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(embedConfiguration(ASSESSMENT_PRESET)),
    });
  });
  await page.route("**/scenario.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(coffeeScenario),
    });
  });
  await page.route("**/build-info.json", async (route) => {
    const response = await route.fetch();
    const buildInformation = (await response.json()) as Record<
      string,
      unknown
    >;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...buildInformation,
        scenarioHash: sha256Hex(
          `${JSON.stringify(coffeeScenario, null, 2)}\n`,
        ),
      }),
    });
  });
}

async function installPracticeRuntime(page: Page): Promise<void> {
  const mediaManifest = {
    schemaVersion: "1",
    scenarioId: practiceAScenario.scenarioId,
    scenarioVersion: practiceAScenario.scenarioVersion,
    assets: practiceAScenario.portraitAssets,
  };
  await page.route("**/simuledger.config.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(embedConfiguration(PRACTICE_PRESET)),
    });
  });
  await page.route("**/scenario.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(practiceAScenario),
    });
  });
  await page.route(
    "**/scenario-variant-bank.json",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(practiceVariantBank),
      });
    },
  );
  await page.route("**/media-manifest.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(mediaManifest),
    });
  });
  await page.route("**/build-info.json", async (route) => {
    const response = await route.fetch();
    const buildInformation = (await response.json()) as Record<
      string,
      unknown
    >;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...buildInformation,
        scenarioHash: sha256Hex(
          `${JSON.stringify(practiceAScenario, null, 2)}\n`,
        ),
        portraitMediaManifestHash: sha256Hex(
          `${JSON.stringify(mediaManifest, null, 2)}\n`,
        ),
        portraitMediaHashes: Object.fromEntries(
          practiceAScenario.portraitAssets.map((asset) => [
            asset.filePath,
            asset.sha256,
          ]),
        ),
        variantBankId: practiceVariantBank.bankId,
        variantBankVersion: practiceVariantBank.bankVersion,
        variantBankHash: sha256Hex(
          `${JSON.stringify(practiceVariantBank, null, 2)}\n`,
        ),
        variantContentHashes: Object.fromEntries(
          practiceVariantBank.variants.map((variant) => [
            variant.metadata.variantId,
            variant.metadata.contentHash,
          ]),
        ),
      }),
    });
  });
}

test("loads Practice Audit, persists a bounded hint action, and resumes it by TA2 replay", async ({
  page,
  context,
}) => {
  await installScormApi(page);
  await installPracticeAuditRuntime(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Hồ sơ kiểm toán thực hành",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Hãy xác nhận phạm vi ngắn gọn, rồi tự xác định hồ sơ, bằng chứng và chính sách phù hợp. Hồ sơ không được đánh dấu sẵn là bất thường.",
    ),
  ).toBeVisible();
  const reveal = page.getByRole("button", {
    name: "Mở gợi ý 1",
  });
  await reveal.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(
      "Hãy đối chiếu hành động bên ký được phép thực hiện với hành động trong hồ sơ chứng nhận.",
    ),
  ).toBeVisible();

  const persisted = await peek(page, "cmi.suspend_data");
  expect(persisted).toMatch(/^TA2\./u);
  expect(persisted.length).toBeLessThan(3_800);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);

  const resumed = await context.newPage();
  await installScormApi(resumed, {
    initialValues: {
      "cmi.core.entry": "resume",
      "cmi.core.lesson_location": "AUDIT_WORKPAPER",
      "cmi.suspend_data": persisted,
    },
  });
  await installPracticeAuditRuntime(resumed);
  await resumed.goto("/");
  await expect(
    resumed.getByText(
      "Hãy đối chiếu hành động bên ký được phép thực hiện với hành động trong hồ sơ chứng nhận.",
    ),
  ).toBeVisible();
  await expect(
    resumed.getByRole("button", { name: "Mở gợi ý 1" }),
  ).toHaveCount(0);
  await resumed.close();
});

test("persists an Audit Challenge case before reveal and resumes the exact assignment", async ({
  page,
  context,
}) => {
  await installScormApi(page);
  await installAuditBankRuntime(page, AUDIT_CHALLENGE_PRESET);
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Hồ sơ thử thách kiểm toán",
    }),
  ).toBeVisible();
  const caseReference = page.getByText(/^AC-0[1-3]$/u);
  await expect(caseReference).toBeVisible();
  const selectedReference = await caseReference.textContent();
  const persisted = await peek(page, "cmi.suspend_data");
  expect(persisted).toMatch(/^TA2\./u);
  expect(persisted.length).toBeLessThan(3_800);

  const resumed = await context.newPage();
  await installScormApi(resumed, {
    initialValues: {
      "cmi.core.entry": "resume",
      "cmi.core.lesson_location": "AUDIT_WORKPAPER",
      "cmi.suspend_data": persisted,
    },
  });
  await installAuditBankRuntime(
    resumed,
    AUDIT_CHALLENGE_PRESET,
  );
  await resumed.goto("/");
  await expect(
    resumed.getByText(selectedReference!, { exact: true }),
  ).toBeVisible();
  await resumed.close();
});

test("loads final-feedback Audit Assessment without hints or revision actions", async ({
  page,
}) => {
  await installScormApi(page);
  await installAuditBankRuntime(page, AUDIT_ASSESSMENT_PRESET);
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Hồ sơ thử thách kiểm toán",
    }),
  ).toBeVisible();
  await expect(page.getByText(/^AC-0[1-3]$/u)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Mở gợi ý/u }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /Sửa phát hiện|Rút phát hiện/u,
    }),
  ).toHaveCount(0);
  expect(await peek(page, "cmi.suspend_data")).toMatch(/^TA2\./u);
});

test("loads independent Practice with optional support and immediate feedback", async ({
  page,
}) => {
  await installScormApi(page);
  await installPracticeRuntime(page);
  await page.goto("/");
  const activity = new Activity(page);

  await expect(page.getByText("PR-01", { exact: true })).toBeVisible();
  await activity.start();
  const support = page.locator("details.operations-support");
  await expect(
    support.getByText("Bằng chứng nên kiểm tra"),
  ).toBeHidden();
  await support
    .getByText("Xem gợi ý về bằng chứng và quy tắc")
    .click();
  await expect(
    support.getByText("Bằng chứng nên kiểm tra"),
  ).toBeVisible();

  await activity.answer(/Có\. Dữ liệu đã ghi lên blockchain/);
  await expect(
    page.getByRole("status").getByText("Chưa đúng", {
      exact: true,
    }),
  ).toBeVisible();
});

test("loads Assessment with no hints and final-only feedback", async ({
  page,
}) => {
  await installScormApi(page);
  await installAssessmentRuntime(page);
  await page.goto("/");
  const activity = new Activity(page);

  await activity.start();
  await activity.answer(/Có\. Dữ liệu đã ghi lên blockchain/);
  await expect(
    page.getByText(
      "Đã ghi nhận câu trả lời; phản hồi sẽ hiển thị vào thời điểm được cấu hình.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Chưa chính xác.")).toHaveCount(0);
  await activity.continue();
  await expect(
    page.getByRole("heading", {
      name: /Bước 2 – Tạo lô cà phê trên sổ cái/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Xem gợi ý" }),
  ).toHaveCount(0);
  await expect(
    page
      .locator('[data-staff-profile-id="STAFF_PRODUCER_MANAGER"]')
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Ghi nhận chính xác lô cà phê thực tế trước giao dịch đầu tiên trên sổ cái.",
    ),
  ).toHaveCount(0);
});

test("loads an assigned Challenge case and preserves mitigation history through its causal report", async ({
  page,
  browserName,
}) => {
  if (browserName === "webkit") test.setTimeout(240_000);
  await installScormApi(page);
  await installChallengeRuntime(page);
  await page.goto("/");
  const activity = new Activity(page);

  await expect(
    page.getByRole("heading", { name: "SimuLedger Thử thách A" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "SimuLedger Thử thách" }),
  ).toBeVisible();
  await expect(page.getByText("CH-01", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __variantSeedDraws?: number;
            }
          ).__variantSeedDraws ?? 0,
      ),
    )
    .toBe(1);
  await activity.start();
  await activity.answer(/Không\. Blockchain giúp xác định/);
  await activity.continue();

  await activity.submitAndSeal("Thông tin lô hàng");
  await activity.continue();
  await expect(
    page
      .locator(
        '[data-staff-profile-id="STAFF_CERTIFICATION_OFFICER"]',
      )
      .first(),
  ).toBeVisible();

  await page
    .getByRole("combobox", { name: "Nội dung và thời hạn chứng nhận" })
    .selectOption("VALID");
  await page
    .getByRole("combobox", {
      name: "Sự công nhận và thẩm quyền của đơn vị cấp",
    })
    .selectOption("UNRECOGNIZED");
  await page
    .getByRole("combobox", { name: "Cách lưu trữ tài liệu" })
    .selectOption("HASH_OFF_CHAIN");
  await page
    .getByRole("combobox", { name: "Cách xử lý lô hàng" })
    .selectOption("HOLD");
  await page
    .getByRole("button", { name: "Gửi quyết định về chứng nhận" })
    .click();
  await expect(
    page.getByText(
      "Đã ghi nhận câu trả lời; phản hồi sẽ hiển thị vào thời điểm được cấu hình.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Quyết định phù hợp.")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Xem xét bằng chứng về đơn vị cấp" })
    .click();
  const signatureInspection = activity.panel(
    "Kiểm tra chữ ký của bên đề nghị cấp chứng nhận",
  );
  await signatureInspection
    .getByRole("button", { name: "Gửi giao dịch lên mạng" })
    .click();
  await expect(
    signatureInspection.getByText(
      "Công ty Tư vấn Chất lượng Toàn Cầu",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    signatureInspection.getByText("Không được công nhận", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    signatureInspection.getByRole("button", {
      name: "Ghi giao dịch vào khối",
    }),
  ).toHaveCount(0);
  await activity.submitAndSeal("Ghi nhận tài liệu lên chuỗi");
  await activity.submitAndSeal("Cấp chứng nhận cho lô hàng");
  await activity.continue();

  await expect(
    page
      .locator('[data-staff-profile-id="STAFF_PRODUCER_MANAGER"]')
      .first(),
  ).toBeVisible();
  await expect(
    page
      .locator(
        '[data-staff-profile-id="STAFF_LOGISTICS_COORDINATOR"]',
      )
      .first(),
  ).toBeVisible();
  await activity.answer(/Chỉ chuyển quyền lưu giữ/);
  await activity.submitEndorsedAndSeal(
    "Bàn giao lô hàng cho đơn vị vận chuyển",
  );
  await activity.answer(/Ghi nhận vượt ngưỡng/);
  await activity.submitAndSeal("Ghi nhận điều kiện vận chuyển");
  await activity.continue();

  await expect(
    page
      .locator('[data-staff-profile-id="STAFF_PROCESSING_MANAGER"]')
      .first(),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-staff-profile-id="STAFF_SHIPPING_CLERK"]')
      .first(),
  ).toBeVisible();
  await activity.submitAndSeal("Tiếp nhận lô hàng");
  await activity.submitAndSeal("Ghi nhận việc mua lô hàng");
  await page
    .getByRole("combobox", {
      name: "Hành động đề xuất đối với bản ghi",
    })
    .selectOption("INVESTIGATE_THEN_CORRECT");
  await page
    .getByRole("combobox", { name: "Nguyên nhân có khả năng nhất" })
    .selectOption("UNKNOWN");
  await page
    .getByRole("button", { name: "Gửi quyết định xử lý chênh lệch" })
    .click();
  await activity.submitEndorsedAndSeal(
    "Gửi giao dịch điều chỉnh",
  );
  await activity.continue();

  await activity.submitAndSeal("Chuyển đổi lô hàng");
  await activity.answer(/Là một lô mới, có quan hệ nguồn gốc/);
  await activity.continue();
  await activity.submitAndSeal("Đóng gói thành phẩm");
  await activity.submitAndSeal("Chuyển quyền sở hữu cho nhà phân phối");
  await activity.submitAndSeal("Giao hàng cho nhà bán lẻ");
  await activity.continue();

  await page
    .getByRole("button", { name: "Chạy thử nghiệm sửa dữ liệu" })
    .click();
  await page
    .getByText("Kiểm tra khi nội dung đã ký bị thay đổi")
    .click();
  await page
    .getByRole("button", { name: "Chạy kiểm tra chữ ký" })
    .click();
  await expect(page.getByText("Bản gốc: chữ ký hợp lệ")).toBeVisible();
  await expect(
    page.getByText(
      "Bản đã thay đổi: chữ ký ban đầu không còn khớp",
    ),
  ).toBeVisible();
  await activity.answer(/Blockchain không ngăn được việc sửa/);
  await activity.classifyGovernanceItems();
  await activity.continue();

  await expect(
    page
      .locator('[data-staff-profile-id="STAFF_RETAIL_MANAGER"]')
      .first(),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-staff-profile-id="STAFF_REGULATORY_AUDITOR"]')
      .first(),
  ).toHaveCount(0);
  await activity.selectLots(
    /Lô thành phẩm được tạo trong tình huống này/,
  );
  await expect(page.getByText(/Phạm vi thu hồi chính xác/)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Gửi giao dịch lên mạng" })
    .click();
  await expect(page.getByText("Hợp lệ", { exact: true }).last()).toBeVisible();
  await expect(
    page.getByText("Không được phép thực hiện hành động này").last(),
  ).toBeVisible();
  await expect(
    page.getByText(/vai trò này không có thẩm quyền cam kết lệnh thu hồi/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Yêu cầu xem xét sự cố nội bộ" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Gửi lại lệnh thu hồi với thẩm quyền phù hợp",
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Chuyển vụ việc đã xem xét ra bên ngoài",
    })
    .click();
  await expect(
    page.locator('[data-staff-profile-id="STAFF_REGULATORY_AUDITOR"]'),
  ).toBeVisible();
  await activity.submitAndSeal(
    "Gửi lại lệnh thu hồi với thẩm quyền phù hợp",
  );
  await activity.answer(/Khi nhiều tổ chức độc lập cần dùng chung bản ghi/);

  const report = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Kết quả hoạt động" }),
  });
  await expect(report).toBeVisible();
  await expect(
    report.getByText(/Lần gửi lệnh thu hồi đầu tiên dùng vai trò không có thẩm quyền/),
  ).toBeVisible();
  await expect(
    report.getByText("SCN_COFFEE_CHALLENGE@2.0.0"),
  ).toBeVisible();
  await expect(report.getByText("CH-01", { exact: true })).toBeVisible();
  await expect(
    report.getByText(hashConfiguration(CHALLENGE_PRESET)),
  ).toBeVisible();

  await report
    .getByRole("button", { name: "Kết thúc và gửi kết quả" })
    .click();
  await expect(report.getByText(/Đã gửi kết quả/)).toBeVisible();
  expect(await peek(page, "cmi.core.lesson_status")).toBe("passed");
});

test("restores a persisted Challenge assignment without drawing another case", async ({
  page,
}) => {
  const assignment = selectVariantAssignment({
    bank: challengeVariantBank,
    attemptSeed: "AAAAAAAAAAAAAAAAAAAAAA",
    assignmentSource: "SCORM_ATTEMPT",
  });
  const selectedScenario =
    challengeVariantBank.variants[assignment.variantIndex]?.scenario;
  if (selectedScenario === undefined) {
    throw new Error("The test assignment must resolve to a scenario");
  }
  const encoded = encodeSl1Attempt(
    {
      sessionId: "SES_000001",
      currentStageId: ScenarioStageId.ORIENTATION,
      completedStageIds: [],
      decisions: {},
      hintsUsed: [],
      journal: [],
      isCompleted: false,
      isPassed: false,
      variantAssignment: assignment,
    },
    sl1CodecSchema({
      configuration: CHALLENGE_PRESET,
      configurationHash: hashConfiguration(CHALLENGE_PRESET),
      scenario: selectedScenario,
      variantBank: challengeVariantBank,
    }),
  );
  await installScormApi(page, {
    initialValues: {
      "cmi.core.entry": "resume",
      "cmi.suspend_data": encoded,
    },
  });
  await installChallengeRuntime(page);
  await page.goto("/");

  await expect(
    page.getByText(assignment.caseReference, { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as typeof globalThis & {
            __variantSeedDraws?: number;
          }
        ).__variantSeedDraws ?? 0,
    ),
  ).toBe(0);
  await expect(
    page.getByRole("button", { name: "Bắt đầu mô phỏng" }),
  ).toBeVisible();
});
