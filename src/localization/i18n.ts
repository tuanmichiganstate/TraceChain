/**
 * Localization.
 *
 * A translation library was considered and rejected: the whole requirement is a
 * lookup in a flat map plus `{placeholder}` substitution, and the specification
 * (section 36) asks that every dependency be justified. This is about forty
 * lines and adds nothing to the bundle.
 *
 * No learner-facing string may be hard-coded in a component or in domain logic
 * (specification section 5.1). `npm run validate:locales` enforces that.
 */

import viCatalogue from "../locales/vi.json";
import enCatalogue from "../locales/en.json";

export type LocaleCode = "vi" | "en";

export type TranslationCatalogue = Readonly<Record<string, string>>;

const catalogues: Readonly<Record<LocaleCode, TranslationCatalogue>> = {
  vi: viCatalogue as TranslationCatalogue,
  en: enCatalogue as TranslationCatalogue,
};

export type TranslationParameters = Readonly<Record<string, string | number>>;

/** Substitute `{name}` placeholders. Unknown placeholders are left in place. */
function interpolate(template: string, parameters?: TranslationParameters): string {
  if (parameters === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = parameters[key];
    return value === undefined ? match : String(value);
  });
}

export interface Translator {
  readonly locale: LocaleCode;
  (key: string, parameters?: TranslationParameters): string;
}

export function createTranslator(locale: LocaleCode): Translator {
  const catalogue = catalogues[locale];
  const fallback = catalogues.vi;

  const translate = (key: string, parameters?: TranslationParameters): string => {
    const template = catalogue[key] ?? fallback[key];
    if (template === undefined) {
      // A missing key is a content bug, not a learner-facing failure: show the
      // key so it is obvious in review, rather than an empty space.
      if (import.meta.env?.DEV) {
        console.warn(`[i18n] Missing translation key: ${key}`);
      }
      return key;
    }
    return interpolate(template, parameters);
  };

  return Object.assign(translate, { locale }) as Translator;
}

export function getCatalogue(locale: LocaleCode): TranslationCatalogue {
  return catalogues[locale];
}

export const AVAILABLE_LOCALES: readonly LocaleCode[] = ["vi", "en"];
