import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Language = 'en' | 'vi'

export const LANG_STORAGE_KEY = 'spherex-explorer.lang.v1'

export function readLanguage(): Language {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_STORAGE_KEY) : null
    if (saved === 'en' || saved === 'vi') return saved
  } catch {
    /* ignore storage errors in private mode */
  }
  return 'en'
}

export function writeLanguage(lang: Language): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_STORAGE_KEY, lang)
  } catch {
    /* ignore storage errors in private mode */
  }
}

interface LanguageContextValue {
  lang: Language
  setLang: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
})

/** Provides persisted EN/VI language state across the app and keeps `<html lang>` in sync. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => readLanguage())

  const setLang = useCallback((next: Language) => {
    setLangState(next)
    writeLanguage(next)
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
  }, [lang])

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

/** Reads the active UI language (`'en'` or `'vi'`) and setter from context. */
export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext)
}

/** Compact EN / VI header switch reusing the shared `.segmented` control styling. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useLanguage()
  return (
    <div
      className={className ? `segmented lang-switch ${className}` : 'segmented lang-switch'}
      role="group"
      aria-label={lang === 'vi' ? 'Ngôn ngữ' : 'Language'}
    >
      <button
        type="button"
        lang="en"
        title="English"
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        EN
      </button>
      <button
        type="button"
        lang="vi"
        title="Tiếng Việt"
        aria-pressed={lang === 'vi'}
        onClick={() => setLang('vi')}
      >
        VI
      </button>
    </div>
  )
}
