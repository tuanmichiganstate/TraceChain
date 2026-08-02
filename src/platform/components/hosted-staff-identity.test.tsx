import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../../app/providers/locale-provider";
import type { LearnerRunStaffProfileV1 } from "../contracts/run-events";
import { HostedStaffIdentity } from "./hosted-staff-identity";

const profile: LearnerRunStaffProfileV1 = {
  staffProfileId: "STAFF_CERTIFICATION_OFFICER",
  displayName: {
    localizationKey: "staff.certificationOfficer.name",
    valuesByLocale: { en: "Trần Minh Anh", vi: "Trần Minh Anh" },
  },
  roleTitle: {
    localizationKey: "staff.certificationOfficer.role",
    valuesByLocale: {
      en: "Certification Officer",
      vi: "Chuyên viên chứng nhận",
    },
  },
  organizationName: {
    localizationKey: "organizations.certificationBody.name",
    valuesByLocale: {
      en: "VietCert Certification Body",
      vi: "Tổ chức chứng nhận VietCert",
    },
  },
  portraitAssetId: "PORTRAIT_CERTIFICATION_OFFICER",
  portraitPath: "media/staff/certification-officer.webp",
  portraitAlt: {
    localizationKey: "staff.certificationOfficer.alt",
    valuesByLocale: {
      en: "Fictional portrait of Trần Minh Anh",
      vi: "Chân dung hư cấu của Trần Minh Anh",
    },
  },
  professionalResponsibility: {
    localizationKey: "staff.certificationOfficer.responsibility",
    valuesByLocale: {
      en: "Assess the certificate and issuer.",
      vi: "Đánh giá chứng nhận và đơn vị cấp.",
    },
  },
  fictional: true,
};

describe("hosted staff identity", () => {
  it("uses the projection rather than a hard-coded person", () => {
    const { container } = render(
      <LocaleProvider locale="en">
        <HostedStaffIdentity profile={profile} />
      </LocaleProvider>,
    );

    expect(
      screen.getByRole("region", { name: "You are acting as" }),
    ).toHaveAttribute("data-staff-profile-id", profile.staffProfileId);
    expect(screen.getByText("Trần Minh Anh")).toBeInTheDocument();
    expect(screen.getByText("Certification Officer")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("falls back to initials without removing role context", () => {
    const { container } = render(
      <LocaleProvider locale="vi">
        <HostedStaffIdentity profile={profile} />
      </LocaleProvider>,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image as HTMLImageElement);

    expect(screen.getByText("MA")).toHaveClass("staff-portrait--fallback");
    expect(screen.getByText("Chuyên viên chứng nhận")).toBeInTheDocument();
    expect(screen.getByText("Trần Minh Anh")).toBeInTheDocument();
  });
});
