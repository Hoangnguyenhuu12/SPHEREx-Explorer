(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(String(key)) ?? null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(String(key))
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value))
    },
  }
}

if (typeof window !== 'undefined') {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    let current: Storage | undefined
    try {
      current = globalThis[name]
    } catch {
      current = undefined
    }
    if (!current || typeof current.getItem !== 'function') {
      let winStorage: Storage | undefined
      try {
        winStorage = window[name]
      } catch {
        winStorage = undefined
      }
      const fallback = winStorage && typeof winStorage.getItem === 'function' ? winStorage : makeMemoryStorage()
      Object.defineProperty(globalThis, name, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: fallback,
      })
      if (!winStorage || typeof winStorage.getItem !== 'function') {
        Object.defineProperty(window, name, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: fallback,
        })
      }
    }
  }
}
