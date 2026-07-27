import { getCatalogue } from "../localization/i18n";
import { createPermissionedFoundationsLabBundle } from "./permissioned-foundations-pack-definition";

export const permissionedFoundationsLabBundle =
  createPermissionedFoundationsLabBundle({
    vi: getCatalogue("vi"),
    en: getCatalogue("en"),
  });
