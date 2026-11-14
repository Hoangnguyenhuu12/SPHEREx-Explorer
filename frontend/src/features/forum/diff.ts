/** Revision comparison for moderators (FR-08, AC05): paragraph-level LCS plus set diffs. */

export type DiffOp<T> = { op: 'same' | 'add' | 'remove'; value: T }

export function diffSequence<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = Object.is): DiffOp<T>[] {
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = eq(a[i], b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffOp<T>[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      out.push({ op: 'same', value: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: 'remove', value: a[i++] })
    } else {
      out.push({ op: 'add', value: b[j++] })
    }
  }
  while (i < n) out.push({ op: 'remove', value: a[i++] })
  while (j < m) out.push({ op: 'add', value: b[j++] })
  return out
}

export function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function diffParagraphs(before: string, after: string): DiffOp<string>[] {
  return diffSequence(paragraphs(before), paragraphs(after))
}

export function diffSet(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[]; kept: string[] } {
  const a = new Set(before)
  const b = new Set(after)
  return {
    added: after.filter((x) => !a.has(x)),
    removed: before.filter((x) => !b.has(x)),
    kept: after.filter((x) => a.has(x)),
  }
}
