/**
 * Demo database for the Forum, kept in localStorage so posts survive reloads in one browser.
 * It plays the role of the backend's tables. Every read goes back to storage so two tabs see each
 * other's changes (useful to demonstrate stale moderation decisions, AC07).
 */
import { SEED_TAGS, type ReasonCode } from '../config'
import type { ModerationReason, NotificationKind, PostContent, RevisionState, Tag, Visibility } from '../types'

export interface Hidden {
  reason: ModerationReason
  at: string
  by: string
}

export interface StoredPost {
  id: string
  authorId: string
  visibility: Visibility
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  editedAt: string | null
  currentRevisionId: string | null
  workingRevisionId: string | null
  hidden: Hidden | null
  clientKey: string | null
}

export interface StoredRevision extends PostContent {
  id: string
  postId: string
  number: number
  state: RevisionState
  basedOnRevisionId: string | null
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  decidedAt: string | null
  decidedBy: string | null
  reason: ModerationReason | null
}

export interface StoredComment {
  id: string
  postId: string
  authorId: string
  body: string
  createdAt: string
  /** Published revision the comment was written against (context after edits, BA §6). */
  revisionId: string | null
  hidden: Hidden | null
}

export interface StoredReport {
  id: string
  targetType: 'post' | 'comment'
  targetId: string
  postId: string
  reporterId: string
  reason: ModerationReason
  state: 'open' | 'resolved' | 'dismissed'
  createdAt: string
  closedAt: string | null
  closedBy: string | null
}

export interface StoredNotification {
  id: string
  userId: string
  kind: NotificationKind
  postId: string
  title: string
  reason: ModerationReason | null
  createdAt: string
  read: boolean
}

export interface AuditEvent {
  id: string
  actorId: string
  action: string
  postId: string | null
  revisionId: string | null
  targetId: string | null
  at: string
  reason: ModerationReason | null
  before: string | null
  after: string | null
}

export interface ForumDb {
  version: 1
  seq: number
  tags: Tag[]
  posts: StoredPost[]
  revisions: StoredRevision[]
  comments: StoredComment[]
  reports: StoredReport[]
  notifications: StoredNotification[]
  audit: AuditEvent[]
  /** Display names of the seeded demo authors. */
  seedAuthors: Record<string, string>
}

export const STORE_KEY = 'spherex-forum-demo-v1'

let memory: ForumDb | null = null

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function loadDb(): ForumDb {
  const s = storage()
  if (s) {
    try {
      const raw = s.getItem(STORE_KEY)
      if (raw) {
        const db = JSON.parse(raw) as ForumDb
        if (db.version === 1) return (memory = db)
      }
    } catch {
      // Corrupt or blocked: fall through to a fresh seed.
    }
  }
  if (memory) return memory
  const db = seedDb()
  saveDb(db)
  return db
}

export function saveDb(db: ForumDb) {
  memory = db
  try {
    storage()?.setItem(STORE_KEY, JSON.stringify(db))
  } catch {
    // Storage full or blocked: keep the in-memory copy for this page.
  }
}

export function resetDb(): ForumDb {
  const db = seedDb()
  saveDb(db)
  return db
}

export function nextId(db: ForumDb, prefix: string): string {
  db.seq += 1
  return `${prefix}_${db.seq.toString(36)}`
}

// ---------------------------------------------------------------- seed

const DAY = 86_400_000

function daysAgo(n: number, hour = 10): string {
  const d = new Date(Date.now() - n * DAY)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}

interface SeedPost {
  author: string
  title: string
  body: string
  tags: string[]
  links?: string[]
  day: number
  comments?: { author: string; body: string; day: number }[]
}

const AUTHORS: Record<string, string> = {
  seed_linh: 'Linh N.',
  seed_omar: 'Omar K.',
  seed_ana: 'Ana T.',
  seed_kenji: 'Kenji',
  seed_sara: 'Sara M.',
}

const PUBLISHED: SeedPost[] = [
  {
    author: 'seed_linh',
    title: 'How do I tell a moving star from noise in the difference view?',
    body: "I opened Barnard's Star in D6 and switched to the difference view. I see a bright spot next to a dark spot near the crosshair, but there are also small speckles everywhere.\n\nIs the bright-and-dark pair the star moving, or could it be noise? What should I look for?",
    tags: ['questions', 'moving-stars'],
    links: ['/the-eyes?q=barnard&det=6'],
    day: 6,
    comments: [
      {
        author: 'seed_omar',
        body: 'A real moving star leaves the pair in the same place in every later frame, with the dark side where the star used to be. Noise speckles jump around from frame to frame.',
        day: 5,
      },
      { author: 'seed_ana', body: 'Also try zooming in. The pair should be about one or two pixels apart for Barnard over a year.', day: 5 },
    ],
  },
  {
    author: 'seed_omar',
    title: 'Why does WISE 0855 only show up in the longer-wavelength detectors?',
    body: 'I could barely see anything at WISE 0855 in D1–D3, but D6 shows a faint dot near the crosshair.\n\nFrom what I read, it is a very cold brown dwarf, so most of its light comes out at longer infrared wavelengths. Does that match what others see?',
    tags: ['brown-dwarfs', 'questions'],
    links: ['/the-eyes?q=wise0855&det=6'],
    day: 4,
    comments: [{ author: 'seed_kenji', body: 'Same for me. D5 and D6 are the ones to use for this target.', day: 3 }],
  },
  {
    author: 'seed_ana',
    title: 'Tip: zoom in before you press play',
    body: 'The full cutout is 10 arcminutes wide, so a star that moves by one pixel is easy to miss.\n\n- Zoom to about 2 arcminutes around the crosshair\n- Turn on the difference view\n- Play at 1× and watch for a pair that stays in place\n\nIt made the motion much easier to spot for me.',
    tags: ['observing-tips', 'image-analysis'],
    day: 3,
  },
  {
    author: 'seed_kenji',
    title: 'R Draconis looks brighter in some frames than others',
    body: 'R Dra is a Mira variable, so I expected it to change. In D4 the star looks clearly brighter in the later frames.\n\nI have not checked the light curve tab carefully yet. Is the change I see in the images the same one the Brightness tab shows?',
    tags: ['variable-stars'],
    links: ['/the-eyes?q=rdra&det=4'],
    day: 2,
  },
  {
    author: 'seed_sara',
    title: 'Why are the centres of bright stars black in the image?',
    body: 'Very bright stars like Barnard and R Dra have a black hole in the middle. Is that a problem with the data?\n\nThe team notes say the detector saturates on very bright stars, and pixels without a valid value are drawn black for now.',
    tags: ['image-analysis', 'spherex'],
    day: 1,
  },
]

const PENDING_FIRST: SeedPost = {
  author: 'seed_sara',
  title: 'Epsilon Indi A and B move together across the sky',
  body: 'With a wide field I can see both Eps Ind A and the brown dwarf pair B. Blinking the frames, they seem to shift in the same direction.\n\nIs that what "common proper motion" means?',
  tags: ['moving-stars', 'brown-dwarfs'],
  links: ['/the-eyes?q=epsindib&det=5&fov=10'],
  day: 0,
}

/** Edit proposed for the R Dra post, so the moderation diff has something to show. */
const PENDING_EDIT = {
  postIndex: 3,
  title: 'R Draconis gets brighter in the later frames (D4)',
  body: 'R Dra is a Mira variable, so I expected it to change. In D4 the star looks clearly brighter in the later frames.\n\nUpdate: the Brightness tab shows the same rise, so the change in the images matches the light curve.\n\nThanks to everyone who pointed me to that tab.',
  tags: ['variable-stars', 'image-analysis'],
}

export function seedDb(): ForumDb {
  const db: ForumDb = {
    version: 1,
    seq: 100,
    tags: SEED_TAGS.map((t, i) => ({ id: `tag_${i + 1}`, slug: t.slug, name: t.name, active: true })),
    posts: [],
    revisions: [],
    comments: [],
    reports: [],
    notifications: [],
    audit: [],
    seedAuthors: { ...AUTHORS },
  }
  const tagId = (slug: string) => db.tags.find((t) => t.slug === slug)!.id

  const addPost = (s: SeedPost, state: 'approved' | 'pending') => {
    const postId = nextId(db, 'post')
    const revId = nextId(db, 'rev')
    const at = daysAgo(s.day, 9)
    db.revisions.push({
      id: revId,
      postId,
      number: 1,
      state,
      basedOnRevisionId: null,
      title: s.title,
      body: s.body,
      tagIds: s.tags.map(tagId),
      links: s.links ?? [],
      createdAt: at,
      updatedAt: at,
      submittedAt: at,
      decidedAt: state === 'approved' ? daysAgo(s.day, 11) : null,
      decidedBy: state === 'approved' ? 'seed_admin' : null,
      reason: null,
    })
    db.posts.push({
      id: postId,
      authorId: s.author,
      visibility: state === 'approved' ? 'published' : 'unpublished',
      createdAt: at,
      updatedAt: at,
      publishedAt: state === 'approved' ? daysAgo(s.day, 11) : null,
      editedAt: null,
      currentRevisionId: state === 'approved' ? revId : null,
      workingRevisionId: state === 'pending' ? revId : null,
      hidden: null,
      clientKey: null,
    })
    for (const c of s.comments ?? []) {
      db.comments.push({
        id: nextId(db, 'cmt'),
        postId,
        authorId: c.author,
        body: c.body,
        createdAt: daysAgo(c.day, 14),
        revisionId: revId,
        hidden: null,
      })
    }
    return postId
  }

  const publishedIds = PUBLISHED.map((p) => addPost(p, 'approved'))
  addPost(PENDING_FIRST, 'pending')

  const editPostId = publishedIds[PENDING_EDIT.postIndex]
  const post = db.posts.find((p) => p.id === editPostId)!
  const base = db.revisions.find((r) => r.id === post.currentRevisionId)!
  const editId = nextId(db, 'rev')
  const at = daysAgo(0, 8)
  db.revisions.push({
    ...base,
    id: editId,
    number: 2,
    state: 'pending',
    basedOnRevisionId: base.id,
    title: PENDING_EDIT.title,
    body: PENDING_EDIT.body,
    tagIds: PENDING_EDIT.tags.map(tagId),
    createdAt: at,
    updatedAt: at,
    submittedAt: at,
    decidedAt: null,
    decidedBy: null,
  })
  post.workingRevisionId = editId

  // One open report so the Reports tab is not empty in the demo.
  const reported = db.comments[db.comments.length - 1]
  db.reports.push({
    id: nextId(db, 'rep'),
    targetType: 'comment',
    targetId: reported.id,
    postId: reported.postId,
    reporterId: 'seed_ana',
    reason: { code: 'needs_context' satisfies ReasonCode, note: 'Not sure this is right without a source.' },
    state: 'open',
    createdAt: daysAgo(0, 7),
    closedAt: null,
    closedBy: null,
  })
  return db
}
