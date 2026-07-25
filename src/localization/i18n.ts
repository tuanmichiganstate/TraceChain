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

/**
 * A number written the way the reading language writes one.
 *
 * `String(1.2)` is "1.2" everywhere, but Vietnamese writes that with a comma --
 * and the hint disclosure, which tells a learner how many points opening a hint
 * can cost, is the one sentence in the activity that carries a decimal.
 *
 * Grouping stays off. Vietnamese groups thousands with a full stop, so turning
 * it on would print "1.000 kg" next to the manifest panel's "1000 kg" -- the
 * same trade already refused in `format-correction-value.ts`. With grouping off
 * an integer formats identically to `String`, which confines this to decimals.
 */
const numberFormats = new Map<LocaleCode, Intl.NumberFormat>();

function formatNumber(value: number, locale: LocaleCode): string {
  let formatter = numberFormats.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, { useGrouping: false });
    numberFormats.set(locale, formatter);
  }
  return formatter.format(value);
}

/** Substitute `{name}` placeholders. Unknown placeholders are left in place. */
function interpolate(
  template: string,
  locale: LocaleCode,
  parameters?: TranslationParameters,
): string {
  if (parameters === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = parameters[key];
    if (value === undefined) {
      return match;
    }
    return typeof value === "number" ? formatNumber(value, locale) : String(value);
  });
}

export interface Translator {
  readonly locale: LocaleCode;
  readonly formatNumber: (value: number) => string;
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
    return interpolate(template, locale, parameters);
  };

  return Object.assign(translate, {
    locale,
    formatNumber: (value: number) => formatNumber(value, locale),
  }) as Translator;
}

export function getCatalogue(locale: LocaleCode): TranslationCatalogue {
  return catalogues[locale];
}

export const AVAILABLE_LOCALES: readonly LocaleCode[] = ["vi", "en"];
