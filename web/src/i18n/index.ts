// UI translations. Strings are looked up by their English text, so anything without a
// translation shows in English. The language is a per-browser setting (localStorage); changing
// it reloads the page so every part of the UI picks it up. Placeholders: {name} in the English
// text and the translation are filled from `vars`.

import nl from "./nl.json";

export interface Language {
  id: string;
  /** Name in the language itself. */
  label: string;
}

export const LANGUAGES: Language[] = [
  { id: "en", label: "English" },
  { id: "nl", label: "Nederlands" },
];

const CATALOGS: Record<string, Record<string, string>> = { nl };
export const LANG_KEY = "qt.lang";

function storedLanguage(): string {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v && LANGUAGES.some((l) => l.id === v) ? v : "en";
  } catch {
    return "en";
  }
}

let current = typeof localStorage === "undefined" ? "en" : storedLanguage();

export const getLanguage = (): string => current;

/** For tests: switch without storing or reloading. */
export function useLanguageForTests(id: string): void {
  current = id;
}

/** Stores the language and reloads the page (all text is rendered again). */
export function setLanguage(id: string): void {
  if (!LANGUAGES.some((l) => l.id === id) || id === current) return;
  try {
    localStorage.setItem(LANG_KEY, id);
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
  current = id;
  if (typeof location !== "undefined") location.reload();
}

const fill = (s: string, vars?: Record<string, string | number>) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/** The text in the current language (English when there is no translation). */
export function t(text: string, vars?: Record<string, string | number>): string {
  const cat = CATALOGS[current];
  return fill((cat && cat[text]) || text, vars);
}

/** Translation coverage of a language: catalog entries for the given English texts. */
export function missingTranslations(lang: string, texts: readonly string[]): string[] {
  const cat = CATALOGS[lang] ?? {};
  return texts.filter((s) => !(s in cat));
}
