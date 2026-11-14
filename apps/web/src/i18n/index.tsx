import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { interpolate, type Lang } from '@tablewise/shared';
import { en, type TKey } from './en';
import { ta } from './ta';

export type { TKey };
const DICTS: Record<Lang, Record<TKey, string>> = { en, ta };
const STORAGE_KEY = 'tw.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ta') return saved;
  } catch { /* storage unavailable */ }
  return navigator.language?.toLowerCase().startsWith('ta') ? 'ta' : 'en';
}

// Module-level mirror so non-React code (formatters, API errors) uses the active language.
let current: Lang = initialLang();
export const getLang = () => current;
export const getLocale = () => (current === 'ta' ? 'ta-IN' : 'en-IN');

/** Translate outside React (prefer the `useI18n().t` hook in components). */
export function translate(key: TKey, params?: Record<string, string | number>) {
  return interpolate(DICTS[current][key] ?? en[key], params);
}

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, params?: Record<string, string | number>) => string;
  /** Pick the display name for a dish/category in the active language. */
  dish: (x: { name: string; nameTa?: string | null }) => string;
  /** The name in the other language, for a secondary line (or null). */
  dishAlt: (x: { name: string; nameTa?: string | null }) => string | null;
}

const Ctx = createContext<I18nState | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;

  const setLang = useCallback((l: Lang) => {
    current = l;
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    setLangState(l);
  }, []);

  const value = useMemo<I18nState>(() => ({
    lang,
    setLang,
    t: (key, params) => interpolate(DICTS[lang][key] ?? en[key], params),
    dish: (x) => (lang === 'ta' && x.nameTa ? x.nameTa : x.name),
    dishAlt: (x) => (x.nameTa ? (lang === 'ta' ? x.name : x.nameTa) : null),
  }), [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Segmented English / தமிழ் switch. */
export function LanguageToggle({ dark, className }: { dark?: boolean; className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t('common.language')}
      className={clsx('inline-flex rounded-lg p-0.5 text-xs font-semibold', dark ? 'bg-slate-800' : 'bg-slate-100', className)}>
      {([['en', 'English'], ['ta', 'தமிழ்']] as const).map(([code, label]) => (
        <button key={code} role="radio" aria-checked={lang === code} onClick={() => setLang(code)} lang={code}
          className={clsx('rounded-md px-2.5 py-1 transition',
            lang === code ? (dark ? 'bg-brand-600 text-white' : 'bg-white text-slate-900 shadow-sm') : (dark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'))}>
          {label}
        </button>
      ))}
    </div>
  );
}
