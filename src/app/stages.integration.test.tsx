import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { App } from "./app";
import { LocaleProvider } from "./providers/locale-provider";
import { ScenarioProvider } from "./providers/scenario-provider";
import { SimulationProvider } from "./providers/simulation-provider";
import { installMockScormApi, MockScorm12Api } from "../../test/scorm-mock/mock-scorm-api";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";
import { challengeAScenario } from "../scenarios/challenge-a/scenario";
import { ConfigurationProvider } from "./providers/configuration-provider";
import {
  ASSESSMENT_PRESET,
  CHALLENGE_PRESET,
  GUIDED_PRESET,
} from "../config/presets";
import { hashConfiguration } from "../config/hash";
import { coffeeCryptographicRuntime } from "../scenarios/coffee-traceability/cryptographic-runtime";

/**
 * THE MILESTONE 5 EXIT CONDITION.
 *
 * A learner completes all nine stages in the browser: answering checks,
 * composing transactions, watching them validate, sealing blocks, trying to
 * edit history and watching it fail, tracing the contamination forward, filing
 * the recall, and submitting a result to the LMS. The domain was already proven
 * headless; this proves the interface reaches all of it.
 */
function AppUnderTest(): React.ReactElement {
  return (
    <ConfigurationProvider
      configuration={GUIDED_PRESET}
      configurationHash={hashConfiguration(GUIDED_PRESET)}
      cryptographicRuntime={coffeeCryptographicRuntime}
    >
      <LocaleProvider>
        <ScenarioProvider scenario={coffeeScenario}>
          <SimulationProvider>
            <App />
          </SimulationProvider>
        </ScenarioProvider>
      </LocaleProvider>
    </ConfigurationProvider>
  );
}

function ChallengeAppUnderTest(): React.ReactElement {
  return (
    <ConfigurationProvider
      configuration={CHALLENGE_PRESET}
      configurationHash={hashConfiguration(CHALLENGE_PRESET)}
      cryptographicRuntime={coffeeCryptographicRuntime}
    >
      <LocaleProvider locale="vi">
        <ScenarioProvider scenario={challengeAScenario}>
          <SimulationProvider>
            <App />
          </SimulationProvider>
        </ScenarioProvider>
      </LocaleProvider>
    </ConfigurationProvider>
  );
}

function AssessmentAppUnderTest(): React.ReactElement {
  return (
    <ConfigurationProvider
      configuration={ASSESSMENT_PRESET}
      configurationHash={hashConfiguration(ASSESSMENT_PRESET)}
      cryptographicRuntime={coffeeCryptographicRuntime}
    >
      <LocaleProvider locale="vi">
        <ScenarioProvider scenario={coffeeScenario}>
          <SimulationProvider>
            <App />
          </SimulationProvider>
        </ScenarioProvider>
      </LocaleProvider>
    </ConfigurationProvider>
  );
}

function GuidedSignatureAppUnderTest(): React.ReactElement {
  return (
    <ConfigurationProvider
      configuration={GUIDED_PRESET}
      configurationHash={hashConfiguration(GUIDED_PRESET)}
      cryptographicRuntime={coffeeCryptographicRuntime}
    >
      <LocaleProvider locale="vi">
        <ScenarioProvider scenario={coffeeScenario}>
          <SimulationProvider>
            <App />
          </SimulationProvider>
        </ScenarioProvider>
      </LocaleProvider>
    </ConfigurationProvider>
  );
}

type User = ReturnType<typeof userEvent.setup>;

/**
 * Submit the transaction in the named panel, then seal its block.
 *
 * Matched at heading level 3: stage titles are level 2, and several action
 * labels are substrings of their stage's title.
 */
async function submitAndSeal(user: User, actionName: string): Promise<void> {
  const panel = (
    await screen.findByRole("heading", { name: actionName, level: 3 })
  ).closest("section") as HTMLElement;
  const submit = within(panel).getByRole("button", {
    name: "Gửi giao dịch lên mạng",
  });
  await waitFor(() => expect(submit).not.toBeDisabled());
  await user.click(submit);
  let seal: HTMLElement | undefined;
  await waitFor(() => {
    const submittedPanel = screen
      .getByRole("heading", { name: actionName, level: 3 })
      .closest("section") as HTMLElement;
    seal = within(submittedPanel).getByRole("button", {
      name: "Ghi giao dịch vào khối",
    });
  }, { timeout: 30_000 });
  await user.click(seal as HTMLElement);
}

async function submitEndorsedAndSeal(
  user: User,
  actionName: string,
  handoffName: string,
): Promise<void> {
  const panel = (
    await screen.findByRole("heading", {
      name: actionName,
      level: 3,
    })
  ).closest("section") as HTMLElement;
  await user.click(
    within(panel).getByRole("button", {
      name: "Gửi giao dịch lên mạng",
    }),
  );
  await within(panel).findByRole("heading", {
    name: "Phê duyệt bắt buộc",
  });
  await user.click(
    within(panel).getByRole("button", {
      name: handoffName,
    }),
  );
  await user.click(
    await within(panel).findByRole("button", {
      name: "Ký và phê duyệt đề xuất",
    }),
  );
  await within(panel).findByText("Đã đáp ứng yêu cầu");
  await user.click(
    within(panel).getByRole("button", {
      name: "Cam kết giao dịch đã được phê duyệt",
    }),
  );
  const seal = await within(panel).findByRole("button", {
    name: "Ghi giao dịch vào khối",
  });
  await user.click(seal);
}

async function answer(user: User, optionPattern: RegExp): Promise<void> {
  await user.click(await screen.findByRole("radio", { name: optionPattern }));
  const submit = screen
    .getAllByRole("button", { name: "Trả lời" })
    .find((button) => !(button as HTMLButtonElement).disabled);
  if (submit === undefined) throw new Error("No enabled answer button");
  await user.click(submit);
}

async function submitSoundCertificateDecision(user: User): Promise<void> {
  await user.selectOptions(
    await screen.findByRole("combobox", {
      name: "Nội dung và thời hạn chứng nhận",
    }),
    "VALID",
  );
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Sự công nhận và thẩm quyền của đơn vị cấp",
    }),
    "RECOGNIZED_AUTHORIZED",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Cách lưu trữ tài liệu" }),
    "HASH_OFF_CHAIN",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Cách xử lý lô hàng" }),
    "CONTINUE",
  );
  await user.click(
    screen.getByRole("button", { name: "Gửi quyết định về chứng nhận" }),
  );
  await screen.findByRole("heading", { name: "Đã ghi nhận quyết định ban đầu" });
}

async function submitSoundDiscrepancyDecision(user: User): Promise<void> {
  await user.selectOptions(
    await screen.findByRole("combobox", {
      name: "Hành động đề xuất đối với bản ghi",
    }),
    "INVESTIGATE_THEN_CORRECT",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Nguyên nhân có khả năng nhất" }),
    "TYPING_ERROR",
  );
  await user.click(
    screen.getByRole("button", { name: "Gửi quyết định xử lý chênh lệch" }),
  );
  await screen.findByRole("heading", { name: "Lập giao dịch điều chỉnh" });
}

/** Place every item of the data-governance classification correctly. */
async function answerClassification(user: User): Promise<void> {
  const placements: Readonly<Record<string, string>> = {
    ITEM_BATCH_ID: "CAT_ON_CHAIN",
    ITEM_RECALL_STATUS: "CAT_ON_CHAIN",
    ITEM_CERTIFICATE_PDF: "CAT_OFF_CHAIN_HASH",
    ITEM_SENSOR_DATASET: "CAT_OFF_CHAIN_HASH",
    ITEM_WHOLESALE_PRICE: "CAT_AUTHORIZED_ONLY",
    ITEM_CUSTOMER_ADDRESS: "CAT_DO_NOT_COLLECT",
  };
  for (const [itemId, categoryId] of Object.entries(placements)) {
    const select = document.getElementById(
      `INT_DATA_GOVERNANCE_CLASSIFICATION-${itemId}`,
    ) as HTMLSelectElement;
    await user.selectOptions(select, categoryId);
  }
  const submit = screen
    .getAllByRole("button", { name: "Trả lời" })
    .find((button) => !(button as HTMLButtonElement).disabled);
  if (submit === undefined) throw new Error("No enabled answer button");
  await user.click(submit);
}

async function advance(user: User): Promise<void> {
  const buttons = await screen.findAllByRole("button", { name: "Tiếp tục" });
  await user.click(buttons[buttons.length - 1] as HTMLElement);
}

describe("the whole activity in the browser", () => {
  let api: MockScorm12Api;
  let uninstall: () => void;

  beforeEach(() => {
    api = new MockScorm12Api();
    uninstall = installMockScormApi(api);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    uninstall();
  });

  it("carries a learner from orientation to a submitted result", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);

    // ---- Stage 1: orientation ----------------------------------------
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await screen.findByRole("heading", { name: /Bước 1/ });
    await answer(user, /Không\. Blockchain giúp xác định/);
    await advance(user);

    // ---- Stage 2: create the batch -----------------------------------
    await screen.findByRole("heading", { name: /Bước 2/ });
    await submitAndSeal(user, "Thông tin lô hàng");
    expect(await screen.findByText("Tất cả quy tắc đều được thỏa mãn.")).toBeInTheDocument();
    await advance(user);

    // ---- Stage 3: one atomic certificate decision --------------------
    await screen.findByRole("heading", { name: /Bước 3/ });
    await submitSoundCertificateDecision(user);
    await submitAndSeal(user, "Ghi nhận tài liệu lên chuỗi");
    await submitAndSeal(user, "Cấp chứng nhận cho lô hàng");
    await advance(user);

    // ---- Stage 4: custody moves, ownership stays ---------------------
    await screen.findByRole("heading", { name: /Bước 4/ });
    expect(
      screen.getByRole("region", { name: "Bàn giao vận tải" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Lô hàng hiện tại" }),
    ).toBeInTheDocument();
    await answer(user, /Chỉ chuyển quyền lưu giữ/);
    await submitEndorsedAndSeal(
      user,
      "Bàn giao lô hàng cho đơn vị vận chuyển",
      "Bàn giao cho bên tiếp nhận lưu giữ",
    );
    await answer(user, /Ghi nhận vượt ngưỡng/);
    await submitAndSeal(user, "Ghi nhận điều kiện vận chuyển");
    await advance(user);

    // ---- Stage 5: receive, buy, and correct --------------------------
    await screen.findByRole("heading", { name: /Bước 5/ });
    await submitAndSeal(user, "Tiếp nhận lô hàng");
    await submitAndSeal(user, "Ghi nhận việc mua lô hàng");
    await submitSoundDiscrepancyDecision(user);
    await submitEndorsedAndSeal(
      user,
      "Gửi giao dịch điều chỉnh",
      "Bàn giao cho nhà sản xuất",
    );
    await advance(user);

    // ---- Stage 6: roast ----------------------------------------------
    await screen.findByRole("heading", { name: /Bước 6/ });
    await submitAndSeal(user, "Chuyển đổi lô hàng");
    await answer(user, /Là một lô mới, có quan hệ nguồn gốc/);
    await advance(user);

    // ---- Stage 7: package and distribute -----------------------------
    await screen.findByRole("heading", { name: /Bước 7/ });
    await submitAndSeal(user, "Đóng gói thành phẩm");
    await submitAndSeal(user, "Chuyển quyền sở hữu cho nhà phân phối");
    await submitAndSeal(user, "Giao hàng cho nhà bán lẻ");

    // The packaged lot reached the retailer with both rights.
    const cards = await screen.findAllByRole("article");
    const packaged = cards[cards.length - 1] as HTMLElement;
    expect(within(packaged).getAllByText("Siêu thị Việt Market")).toHaveLength(2);
    expect(within(packaged).getByText("820 gói")).toBeInTheDocument();

    // ---- Stage 8: what the public sees, and what editing history costs ----
    await advance(user);
    await screen.findByRole("heading", { name: /Bước 8/ });
    expect(
      screen.getByRole("region", {
        name: "Phòng thí nghiệm xác minh blockchain",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Sổ cái và hồ sơ kỹ thuật",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Chạy thử nghiệm sửa dữ liệu" }));

    // The escalation is the lesson: each forgery repairs one layer and exposes
    // the next, and none of the three is prevented.
    expect(await screen.findByRole("heading", { name: /Bước 1 — Sửa khối lượng/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Bước 2 — Làm lại hàm băm của giao dịch/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Bước 3 — Làm lại hàm băm của khối/ })).toBeInTheDocument();

    // And the learner's own attempt survives it.
    expect(
      screen.getByText(/Sổ cái thật của bạn vẫn nguyên vẹn/),
    ).toBeInTheDocument();

    await answer(user, /Blockchain không ngăn được việc sửa/);
    await answerClassification(user);
    await advance(user);

    // ---- Stage 9: trace forward, recall, and account for it -----------
    await screen.findByRole("heading", { name: /Bước 9/ });
    expect(
      screen.getByRole("region", {
        name: "Trung tâm chỉ huy thu hồi",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Nguồn gốc và phạm vi ảnh hưởng",
      }),
    ).toBeInTheDocument();

    // The near-miss lot shares co-op, region, product name and roasting day
    // with the contaminated one. Only the provenance edge separates them.
    await user.click(await screen.findByRole("checkbox", { name: /BAT_PACKAGED_COFFEE_001/ }));
    await user.click(screen.getByRole("checkbox", { name: /BAT_ROASTED_COFFEE_001/ }));
    await user.click(
      screen.getByRole("button", { name: "Xác nhận phạm vi thu hồi" }),
    );

    expect(
      await screen.findByText(/Phạm vi thu hồi chính xác/),
    ).toBeInTheDocument();

    // A careful learner requests the scenario-controlled authority handoff
    // before commitment and therefore keeps the full authorization mark.
    await user.click(
      screen.getByRole("button", { name: "Bàn giao cho cơ quan quản lý" }),
    );
    await screen.findByText(/Bước bàn giao tổ chức tin cậy đã hoàn tất/);
    await submitAndSeal(user, "Gửi lệnh thu hồi");
    await answer(user, /Khi nhiều tổ chức độc lập cần dùng chung bản ghi/);

    // ---- The activity is finished, and says so ------------------------
    const report = (
      await screen.findByRole("heading", { name: "Kết quả hoạt động" })
    ).closest("section") as HTMLElement;
    expect(within(report).getByText(/Tổng điểm: 100 \/ 100/)).toBeInTheDocument();
    expect(within(report).getByText(/Hiệu quả thu hồi/)).toBeInTheDocument();

    // Nothing reaches the LMS until the learner has seen the result.
    expect(api.peek("cmi.core.lesson_status")).not.toBe("passed");
    await user.click(within(report).getByRole("button", { name: "Kết thúc và gửi kết quả" }));
    expect(await within(report).findByText(/Đã gửi kết quả/)).toBeInTheDocument();
    expect(api.peek("cmi.core.lesson_status")).toBe("passed");
    expect(Number(api.peek("cmi.core.score.raw"))).toBe(100);
  }, 120_000);

  it("rejects a custody transfer that also moves ownership, and explains why", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);

    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await answer(user, /Không\. Blockchain giúp xác định/);
    await advance(user);
    await submitAndSeal(user, "Thông tin lô hàng");
    await advance(user);
    await submitSoundCertificateDecision(user);
    await submitAndSeal(user, "Ghi nhận tài liệu lên chuỗi");
    await submitAndSeal(user, "Cấp chứng nhận cho lô hàng");
    await advance(user);

    const transportPanel = (
      await screen.findByRole("heading", {
        name: "Ghi nhận điều kiện vận chuyển",
        level: 3,
      })
    ).closest("section") as HTMLElement;
    expect(
      within(transportPanel).queryByRole("button", {
        name: "Gửi giao dịch lên mạng",
      }),
    ).not.toBeInTheDocument();

    // Answer the scope question wrongly: the transaction the learner then
    // submits is the one the rules refuse.
    await screen.findByRole("heading", { name: /Bước 4/ });
    await answer(user, /Chuyển cả quyền sở hữu và quyền lưu giữ/);

    const panel = (
      await screen.findByRole("heading", {
        name: "Bàn giao lô hàng cho đơn vị vận chuyển",
        level: 3,
      })
    ).closest("section") as HTMLElement;
    await user.click(within(panel).getByRole("button", { name: "Gửi giao dịch lên mạng" }));

    // The rejection is a teaching message, not an error code.
    expect(
      await screen.findByText(/Đơn vị vận chuyển giữ hộ hàng chứ không mua lô hàng/),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Giao dịch chưa được chấp nhận. Vui lòng xem các quy tắc chưa thỏa mãn bên dưới.")).toBeInTheDocument();
  }, 60_000);

  it("distinguishes a valid transporter signature from certificate authority", async () => {
    const user = userEvent.setup();
    render(<GuidedSignatureAppUnderTest />);

    await user.click(
      await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }),
    );
    await answer(user, /Không\. Blockchain giúp xác định/);
    await advance(user);
    await submitAndSeal(user, "Thông tin lô hàng");
    await advance(user);
    await submitSoundCertificateDecision(user);

    const inspection = (
      await screen.findByRole("heading", {
        name: "Kiểm tra chữ ký của bên đề nghị cấp chứng nhận",
        level: 3,
      })
    ).closest("section") as HTMLElement;
    await user.click(
      within(inspection).getByRole("button", {
        name: "Gửi giao dịch lên mạng",
      }),
    );

    expect(
      await within(inspection).findByText("Công ty Vận tải Liên Việt"),
    ).toBeInTheDocument();
    expect(within(inspection).getByText("Hợp lệ")).toBeInTheDocument();
    expect(within(inspection).getByText("Được công nhận")).toBeInTheDocument();
    expect(
      within(inspection).getByText(
        "Không được phép thực hiện hành động này",
      ),
    ).toBeInTheDocument();
    expect(
      within(inspection).queryByRole("button", {
        name: "Ghi giao dịch vào khối",
      }),
    ).toBeNull();
    expect(
      within(inspection).queryByRole("button", { name: "Chỉnh sửa" }),
    ).toBeNull();

    await submitAndSeal(user, "Ghi nhận tài liệu lên chuỗi");
    await submitAndSeal(user, "Cấp chứng nhận cho lô hàng");
    const authorized = (
      screen.getByRole("heading", {
        name: "Cấp chứng nhận cho lô hàng",
        level: 3,
      })
    ).closest("section") as HTMLElement;
    expect(
      within(authorized).getByText("Được phép thực hiện hành động này"),
    ).toBeInTheDocument();
  }, 60_000);

  it("runs curated Challenge A with delayed feedback and a two-step trusted handoff", async () => {
    const user = userEvent.setup();
    render(<ChallengeAppUnderTest />);

    expect(
      await screen.findByRole("heading", { name: "TraceChain Thử thách A" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bắt đầu mô phỏng" }));
    await answer(user, /Không\. Blockchain giúp xác định/);
    await advance(user);

    await submitAndSeal(user, "Thông tin lô hàng");
    await advance(user);

    await user.selectOptions(
      await screen.findByRole("combobox", {
        name: "Nội dung và thời hạn chứng nhận",
      }),
      "VALID",
    );
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Sự công nhận và thẩm quyền của đơn vị cấp",
      }),
      "UNRECOGNIZED",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Cách lưu trữ tài liệu" }),
      "HASH_OFF_CHAIN",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Cách xử lý lô hàng" }),
      "HOLD",
    );
    await user.click(
      screen.getByRole("button", { name: "Gửi quyết định về chứng nhận" }),
    );
    expect(
      await screen.findByText(
        "Đã ghi nhận câu trả lời; phản hồi sẽ hiển thị vào thời điểm được cấu hình.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Quyết định phù hợp.")).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "Xem xét bằng chứng về đơn vị cấp",
      }),
    );
    const inspection = (
      screen.getByRole("heading", {
        name: "Kiểm tra chữ ký của bên đề nghị cấp chứng nhận",
        level: 3,
      })
    ).closest("section") as HTMLElement;
    await user.click(
      within(inspection).getByRole("button", {
        name: "Gửi giao dịch lên mạng",
      }),
    );
    expect(
      await within(inspection).findByText(
        "Công ty Tư vấn Chất lượng Toàn Cầu (chưa được công nhận)",
      ),
    ).toBeInTheDocument();
    expect(
      within(inspection).getByText("Không được công nhận"),
    ).toBeInTheDocument();
    await submitAndSeal(user, "Ghi nhận tài liệu lên chuỗi");
    await submitAndSeal(user, "Cấp chứng nhận cho lô hàng");
    await advance(user);

    await answer(user, /Chỉ chuyển quyền lưu giữ/);
    await submitEndorsedAndSeal(
      user,
      "Bàn giao lô hàng cho đơn vị vận chuyển",
      "Yêu cầu tổ chức khác xem xét",
    );
    await answer(user, /Ghi nhận vượt ngưỡng/);
    await submitAndSeal(user, "Ghi nhận điều kiện vận chuyển");
    await advance(user);

    await submitAndSeal(user, "Tiếp nhận lô hàng");
    await submitAndSeal(user, "Ghi nhận việc mua lô hàng");
    await user.selectOptions(
      await screen.findByRole("combobox", {
        name: "Hành động đề xuất đối với bản ghi",
      }),
      "INVESTIGATE_THEN_CORRECT",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Nguyên nhân có khả năng nhất" }),
      "UNKNOWN",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Gửi quyết định xử lý chênh lệch",
      }),
    );
    await submitEndorsedAndSeal(
      user,
      "Gửi giao dịch điều chỉnh",
      "Yêu cầu tổ chức khác xem xét",
    );
    await advance(user);

    await submitAndSeal(user, "Chuyển đổi lô hàng");
    await answer(user, /Là một lô mới, có quan hệ nguồn gốc/);
    await advance(user);
    await submitAndSeal(user, "Đóng gói thành phẩm");
    await submitAndSeal(user, "Chuyển quyền sở hữu cho nhà phân phối");
    await submitAndSeal(user, "Giao hàng cho nhà bán lẻ");
    await advance(user);

    await user.click(
      screen.getByRole("button", { name: "Chạy thử nghiệm sửa dữ liệu" }),
    );
    await user.click(
      screen.getByText("Kiểm tra khi nội dung đã ký bị thay đổi"),
    );
    await user.click(
      screen.getByRole("button", { name: "Chạy kiểm tra chữ ký" }),
    );
    expect(
      await screen.findByText("Bản gốc: chữ ký hợp lệ"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Bản đã thay đổi: chữ ký ban đầu không còn khớp",
      ),
    ).toBeInTheDocument();
    await answer(user, /Blockchain không ngăn được việc sửa/);
    await answerClassification(user);
    await advance(user);

    await user.click(
      await screen.findByRole("checkbox", {
        name: /BAT_PACKAGED_COFFEE_CA01/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Xác nhận phạm vi thu hồi" }),
    );
    expect(screen.queryByText(/Phạm vi thu hồi chính xác/)).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Gửi giao dịch lên mạng" }),
    );
    await screen.findByText(
      "Không được phép thực hiện hành động này",
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Yêu cầu xem xét sự cố nội bộ",
      }),
    );
    expect(
      screen.queryByRole("heading", {
        name: "Gửi lại lệnh thu hồi với thẩm quyền phù hợp",
      }),
    ).toBeNull();
    await user.click(
      await screen.findByRole("button", {
        name: "Chuyển vụ việc đã xem xét ra bên ngoài",
      }),
    );
    await screen.findByText(
      "Thanh tra cơ quan quản lý của Cơ quan Quản lý An toàn Thực phẩm",
    );
    await submitAndSeal(
      user,
      "Gửi lại lệnh thu hồi với thẩm quyền phù hợp",
    );
    await answer(user, /Khi nhiều tổ chức độc lập cần dùng chung bản ghi/);

    expect(
      await screen.findByText(/Phạm vi thu hồi chính xác/),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Kết quả hoạt động" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/chữ ký hợp lệ nhưng danh tính tổ chức không được công nhận/),
    ).toBeInTheDocument();
  }, 120_000);

  it("keeps assessment hints hidden and detailed feedback until completion", async () => {
    const user = userEvent.setup();
    render(<AssessmentAppUnderTest />);

    await user.click(
      await screen.findByRole("button", {
        name: "Bắt đầu mô phỏng",
      }),
    );
    await user.click(
      screen.getByRole("radio", {
        name: /Có\. Dữ liệu đã ghi lên blockchain/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Trả lời" }),
    );

    expect(
      await screen.findByText(
        "Đã ghi nhận câu trả lời; phản hồi sẽ hiển thị vào thời điểm được cấu hình.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Chưa chính xác.")).toBeNull();
    await advance(user);
    expect(
      await screen.findByRole("heading", {
        name: /Bước 2 – Tạo lô cà phê trên sổ cái/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Xem gợi ý" }),
    ).toBeNull();
  });
});

describe("the reference panels", () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installMockScormApi(new MockScorm12Api());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    uninstall();
  });

  it("exposes the ledger, history, traceability and glossary as keyboard tabs", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await user.click(screen.getByRole("button", { name: "Bảng tra cứu" }));

    const tablist = await screen.findByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(5);

    // Arrow keys move between tabs, per the ARIA authoring practice.
    (tabs[0] as HTMLElement).focus();
    await user.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(tabs[4]).toHaveAttribute("aria-selected", "true");

    // The glossary pairs each Vietnamese term with its English.
    expect(await screen.findByText(/Quyền lưu giữ \(Custody\)/)).toBeInTheDocument();
  });

  it("never claims more outstanding work than it lists", async () => {
    // The panel listed one step for stage 2 while announcing "2 items
    // remaining": the list came from the stage's required actions and the count
    // from its completion conditions, and the two are not the same set. A
    // learner cannot act on a count whose items are invisible.
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await answer(user, /Không\. Blockchain giúp xác định/);
    await advance(user);
    await screen.findByRole("heading", { name: /Bước 2/ });

    const panel = (
      await screen.findByRole("heading", { name: "Việc cần hoàn thành" })
    ).closest("section") as HTMLElement;
    const items = within(panel).getAllByRole("listitem");

    const summary = panel.querySelector(".status") as HTMLElement;
    const claimed = (summary.textContent ?? "").match(/\d+/g)?.map(Number) ?? [];
    expect(
      claimed.filter((n) => n > items.length),
      `panel lists ${items.length} step(s) but its summary says "${summary.textContent}"`,
    ).toEqual([]);
  }, 30_000);

  it("shows seeded background lots before the learner has done anything", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));

    // The distractor lots exist from the start; recall is not the first time
    // the learner can inspect them, while the task remains visually primary.
    await user.click(screen.getByRole("button", { name: "Bảng tra cứu" }));
    expect(await screen.findByText("BAT_PACKAGED_COFFEE_002")).toBeInTheDocument();
    expect(screen.getByText("BAT_PACKAGED_COFFEE_003")).toBeInTheDocument();
  });
});
