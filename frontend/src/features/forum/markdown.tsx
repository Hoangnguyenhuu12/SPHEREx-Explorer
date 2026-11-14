/* oxlint-disable react/only-export-components -- helpers live next to their provider/view on purpose */
/**
 * Small, safe Markdown subset for Forum posts: paragraphs, line breaks, bullet/numbered lists,
 * **bold**, *italic*, `code`, [text](url) and bare https:// links. Output is React elements only:
 * no HTML string is ever injected, so <script> and friends render as plain text.
 */
import { Fragment, type ReactNode } from 'react'
import { checkLink } from './links'

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[]; external: boolean }
  | { t: 'br' }

export type Block = { t: 'p'; c: Inline[] } | { t: 'ul'; items: Inline[][] } | { t: 'ol'; items: Inline[][] }

const UL = /^\s*[-*]\s+/
const OL = /^\s*\d+[.)]\s+/

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = []
  const chunks = src.replace(/\r\n?/g, '\n').split(/\n{2,}/)
  for (const chunk of chunks) {
    const lines = chunk.split('\n').filter((l) => l.trim() !== '')
    if (lines.length === 0) continue
    if (lines.every((l) => UL.test(l))) blocks.push({ t: 'ul', items: lines.map((l) => parseInline(l.replace(UL, ''))) })
    else if (lines.every((l) => OL.test(l))) blocks.push({ t: 'ol', items: lines.map((l) => parseInline(l.replace(OL, ''))) })
    else {
      const c: Inline[] = []
      lines.forEach((l, i) => {
        if (i > 0) c.push({ t: 'br' })
        c.push(...parseInline(l))
      })
      blocks.push({ t: 'p', c })
    }
  }
  return blocks
}

function safeHref(raw: string): { href: string; external: boolean } | null {
  const r = checkLink(raw)
  if (!r.ok) return null
  return { href: r.href, external: r.kind === 'external' && /^https?:/.test(r.href) }
}

const TOKEN = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\*[^*\n]+?\*|_[^_\n]+?_)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let rest = src
  while (rest.length > 0) {
    const m = TOKEN.exec(rest)
    if (!m) {
      out.push({ t: 'text', v: rest })
      break
    }
    if (m.index > 0) out.push({ t: 'text', v: rest.slice(0, m.index) })
    const tok = m[0]
    if (m[1]) out.push({ t: 'code', v: tok.slice(1, -1) })
    else if (m[2]) out.push({ t: 'strong', c: parseInline(tok.slice(2, -2)) })
    else if (m[3]) out.push({ t: 'em', c: parseInline(tok.slice(1, -1)) })
    else if (m[4]) {
      const close = tok.indexOf('](')
      const text = tok.slice(1, close)
      const link = safeHref(tok.slice(close + 2, -1))
      if (link) out.push({ t: 'link', ...link, c: parseInline(text) })
      else out.push({ t: 'text', v: tok })
    } else if (m[5]) {
      const link = safeHref(tok)
      out.push(link ? { t: 'link', ...link, c: [{ t: 'text', v: tok }] } : { t: 'text', v: tok })
    }
    rest = rest.slice(m.index + tok.length)
  }
  return out
}

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.v}</Fragment>
      case 'br':
        return <br key={i} />
      case 'code':
        return <code key={i}>{n.v}</code>
      case 'strong':
        return <strong key={i}>{renderInline(n.c)}</strong>
      case 'em':
        return <em key={i}>{renderInline(n.c)}</em>
      case 'link':
        return n.external ? (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow ugc">
            {renderInline(n.c)}
          </a>
        ) : (
          <a key={i} href={n.href}>
            {renderInline(n.c)}
          </a>
        )
    }
  })
}

export function MarkdownView({ source, className = 'md' }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source)
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.t === 'p') return <p key={i}>{renderInline(b.c)}</p>
        const items = b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)
        return b.t === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>
      })}
    </div>
  )
}

/** Plain-text excerpt for lists (markup stripped). */
export function excerpt(src: string, max = 180): string {
  const text = src
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/^\s*([-*]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = [...text]
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text
}
