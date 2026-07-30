import { expect, test } from "@playwright/test";

test("authors a complete scenario without code at desktop and phone widths", async ({
  page,
}) => {
  await page.route("**/api/v1/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        userId: "USER_AUTHOR_BROWSER",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
    });
  });
  await page.route("**/api/v1/scenario-packs", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ packs: [] }),
    });
  });

  await page.goto("/author");
  await page
    .getByRole("button", { name: "Bắt đầu kịch bản mới" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Trình tạo kịch bản" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", {
      name: "Các bước của Trình tạo kịch bản",
    }),
  ).toContainText("Rà soát");
  await page
    .getByLabel("Lĩnh vực bản nháp")
    .fill("an-toan-nuoc-do-thi");

  await page
    .getByRole("button", { name: "Thành phần và trạng thái" })
    .click();
  const actualStateEditor = page
    .locator("details.scenario-builder__structured")
    .filter({ hasText: "Trạng thái thực tế" })
    .first();
  await actualStateEditor
    .getByLabel("Tên thuộc tính mới")
    .fill("shipment");
  await actualStateEditor
    .getByRole("button", { name: "Thêm thuộc tính" })
    .click();
  await actualStateEditor
    .getByLabel("Kiểu giá trị")
    .selectOption("object");
  const nestedShipmentEditor = actualStateEditor
    .locator("details.scenario-builder__structured")
    .filter({ hasText: "shipment" })
    .first();
  await nestedShipmentEditor.locator(":scope > summary").click();
  await nestedShipmentEditor
    .getByLabel("Tên thuộc tính mới")
    .fill("temperatureC");
  await nestedShipmentEditor
    .getByRole("button", { name: "Thêm thuộc tính" })
    .click();
  await nestedShipmentEditor
    .getByLabel("Kiểu giá trị")
    .selectOption("number");
  const nestedValue = nestedShipmentEditor.getByLabel("temperatureC");
  await nestedValue.fill("4.5");
  await expect(nestedValue).toHaveValue("4.5");

  await page
    .getByRole("button", { name: "Chế độ triển khai" })
    .click();
  await expect(
    page.getByRole("checkbox", {
      name: "Môi trường thử nghiệm (Sandbox)",
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Tiêu chuẩn" })
    .check();
  await expect(
    page.getByLabel("Mô hình kết quả", { exact: true }),
  ).toHaveValue("OUTCOME_MODEL_DEFAULT");
  await expect(
    page.getByLabel("Mã kết quả được ấn định"),
  ).toHaveValue("OUTCOME_DEFAULT");
  await page
    .getByRole("checkbox", {
      name: "Cho phép người học giao tiếp",
    })
    .check();
  await expect(
    page.getByRole("checkbox", {
      name: "Cho phép người học giao tiếp",
    }),
  ).toBeChecked();

  await page
    .getByRole("button", { name: "Bằng chứng và chính sách" })
    .click();

  await page
    .getByRole("button", { name: "Quy trình", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm sự cố" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Hãy thêm ít nhất một mục bằng chứng trước khi tạo sự cố.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Thêm nút" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Mã nút").first(),
  ).toHaveValue("NODE_BRIEFING");
  await page.getByLabel("Loại nút").first().selectOption("DECISION");
  await page.getByRole("button", { name: "Thêm nút" }).click();
  await expect(
    page.getByLabel("Nút quy trình cần chỉnh sửa"),
  ).toHaveValue("1");
  await expect(
    page.locator('select[id^="node-type-"]'),
  ).toHaveValue("DECISION");
  await expect(
    page.getByRole("button", { name: "Chỉnh sửa nút" }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Đang chỉnh sửa" }),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Đánh giá" }).click();
  await expect(page.getByLabel("Mã khung")).toBeVisible();
  await expect(page.getByLabel("Mã năng lực")).toBeVisible();
  await expect(
    page.getByLabel("Mã chỉ báo hiệu suất"),
  ).toBeVisible();
  await expect(page.getByLabel("Mã rubric")).toBeVisible();
  await expect(
    page.getByLabel("Mã quy tắc bằng chứng"),
  ).toBeVisible();
  await expect(page.getByText("Kiểu giá trị")).toHaveCount(0);

  await page.getByRole("button", { name: "Rà soát" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Kiểm tra toàn bộ hợp đồng",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Xem trước bản nháp đang biên soạn",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/3 nút quy trình có thể đi tới/u),
  ).toBeVisible();

  await page.setViewportSize({ width: 320, height: 568 });
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const widest = [...document.querySelectorAll<HTMLElement>("*")]
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          element: `${element.tagName.toLowerCase()}.${element.className}`,
          right: Math.round(bounds.right),
          width: Math.round(bounds.width),
          inStepNavigation:
            element.closest(".scenario-builder__steps") !== null,
        };
      })
      .filter(
        (candidate) =>
          candidate.right > root.clientWidth &&
          !candidate.inStepNavigation,
      )
      .sort((left, right) => right.right - left.right)
      .slice(0, 10);
    const navigation = document.querySelector<HTMLElement>(
      ".scenario-builder__steps",
    );
    const overflowingContent = [
      ...document.querySelectorAll<HTMLElement>("*"),
    ]
      .map((element) => ({
        element: `${element.tagName.toLowerCase()}.${element.className}`,
        id: element.id,
        parent: element.parentElement?.className ?? "",
        text: (element.textContent ?? "").trim().slice(0, 60),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        inStepNavigation:
          element.closest(".scenario-builder__steps") !== null,
      }))
      .filter(
        (candidate) =>
          candidate.scrollWidth > candidate.clientWidth &&
          !candidate.inStepNavigation,
      )
      .sort(
        (left, right) =>
          right.scrollWidth -
          right.clientWidth -
          (left.scrollWidth - left.clientWidth),
      )
      .slice(0, 10);
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      overflowingContent,
      navigation:
        navigation === null
          ? null
          : {
              clientWidth: navigation.clientWidth,
              scrollWidth: navigation.scrollWidth,
              overflowX: getComputedStyle(navigation).overflowX,
            },
      widest,
    };
  });
  expect(
    layout.scrollWidth,
    JSON.stringify({
      navigation: layout.navigation,
      overflowingContent: layout.overflowingContent,
      widest: layout.widest,
    }),
  ).toBeLessThanOrEqual(layout.clientWidth);
  await expect(
    page.getByRole("navigation", {
      name: "Các bước của Trình tạo kịch bản",
    }),
  ).toBeVisible();
});
