import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createTranslator, type LocaleCode, type Translator } from "../../localization/i18n";
import { defaultAppConfiguration } from "../configuration";

const LocaleContext = createContext<Translator | null>(null);

export function LocaleProvider({
  locale = defaultAppConfiguration.defaultLocale,
  children,
}: {
  locale?: LocaleCode;
  children: ReactNode;
}): ReactNode {
  const translator = useMemo(() => createTranslator(locale), [locale]);
  return <LocaleContext.Provider value={translator}>{children}</LocaleContext.Provider>;
}

/** The only sanctioned source of learner-facing text. */
export function useTranslator(): Translator {
  const translator = useContext(LocaleContext);
  if (translator === null) {
    throw new Error("useTranslator must be used inside a LocaleProvider");
  }
  return translator;
}
