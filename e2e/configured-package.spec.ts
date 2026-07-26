import { expect, test, type Page } from "@playwright/test";
import { Activity } from "./support/activity";
import { installScormApi, peek } from "./scorm-harness";
import { embedConfiguration, hashConfiguration } from "../src/config/hash";
import {
  ASSESSMENT_PRESET,
  CHALLENGE_PRESET,
} from "../src/config/presets";
import { challengeAScenario } from "../src/scenarios/challenge-a/scenario";
import { coffeeScenario } from "../src/scenarios/coffee-traceability/scenario";
import { sha256Hex } from "../src/infrastructure/hashing/sha256";

async function installChallengeRuntime(page: Page): Promise<void> {
  const mediaManifest = {
    schemaVersion: "1",
    scenarioId: challengeAScenario.scenarioId,
    scenarioVersion: challengeAScenario.scenarioVersion,
    assets: challengeAScenario.portraitAssets,
  };
  await page.route("**/tracechain.config.json", async (route) => {
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
      }),
    });
  });
}

async function installAssessmentRuntime(page: Page): Promise<void> {
  await page.route("**/tracechain.config.json", async (route) => {
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

test("loads Challenge A and preserves mitigation history through its causal report", async ({
  page,
  browserName,
}) => {
  if (browserName === "webkit") test.setTimeout(240_000);
  await installScormApi(page);
  await installChallengeRuntime(page);
  await page.goto("/");
  const activity = new Activity(page);

  await expect(
    page.getByRole("heading", { name: "TraceChain Thử thách A" }),
  ).toBeVisible();
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
  await activity.selectLots(/BAT_PACKAGED_COFFEE_CA01/);
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
    report.getByText("SCN_COFFEE_CHALLENGE_A@1.2.0"),
  ).toBeVisible();
  await expect(
    report.getByText(hashConfiguration(CHALLENGE_PRESET)),
  ).toBeVisible();

  await report
    .getByRole("button", { name: "Kết thúc và gửi kết quả" })
    .click();
  await expect(report.getByText(/Đã gửi kết quả/)).toBeVisible();
  expect(await peek(page, "cmi.core.lesson_status")).toBe("passed");
});
