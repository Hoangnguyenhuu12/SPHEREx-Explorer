import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Dialog } from '../../../shared/ui/Dialog'
import { forumApi } from '../api'
import { EmptyState, Skeleton } from '../components/bits'
import { ErrorNotice } from '../components/ForumChrome'
import { ForumError } from '../errors'
import { forumKeys } from '../queries'
import type { TagWithCount } from '../types'
import { normalizeSlug } from '../validation'
import { useRefreshAfterModeration } from './useModerationAction'

/** Topic list managed by moderators (D04). Topics are retired, never deleted, so old posts keep them. */
export function TagsTab({ onDone }: { onDone: (m: string) => void }) {
  const tags = useQuery({ queryKey: forumKeys.allTags, queryFn: () => forumApi.allTags() })
  return (
    <div className="tags-admin">
      <AddTagForm onDone={onDone} existing={tags.data ?? []} />
      <section aria-labelledby="tags-title">
        <h2 id="tags-title" className="master__title">
          Topics <span className="caption">Counts include published posts only.</span>
        </h2>
        {tags.isPending ? (
          <Skeleton lines={5} />
        ) : tags.isError ? (
          <ErrorNotice error={tags.error} onRetry={() => tags.refetch()} />
        ) : tags.data.length === 0 ? (
          <EmptyState title="No topics yet">Add the first topic above.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="tags-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Topic</th>
                  <th scope="col" className="num">
                    Posts
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tags.data.map((t) => (
                  <TagRow key={t.id} tag={t} onDone={onDone} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function AddTagForm({ onDone, existing }: { onDone: (m: string) => void; existing: TagWithCount[] }) {
  const id = useId()
  const refresh = useRefreshAfterModeration()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [error, setError] = useState<string>()
  const effectiveSlug = slugTouched ? normalizeSlug(slug) : normalizeSlug(name)

  const create = useMutation({
    mutationFn: () => forumApi.createTag({ name, slug: effectiveSlug }),
    onSuccess: (tag) => {
      refresh()
      setName('')
      setSlug('')
      setSlugTouched(false)
      onDone(`Topic #${tag.slug} added.`)
    },
    onError: (err) => {
      if (err instanceof ForumError && err.details.reason === 'SLUG_TAKEN') setError(`#${effectiveSlug} already exists.`)
      else if (err instanceof ForumError && err.details.fields) setError(Object.values(err.details.fields)[0])
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return setError('Give the topic a name of at least 2 characters.')
    if (effectiveSlug.length < 2) return setError('The topic needs at least 2 letters or numbers.')
    if (existing.some((t) => t.slug === effectiveSlug)) return setError(`#${effectiveSlug} already exists.`)
    setError(undefined)
    create.mutate()
  }

  return (
    <form className="tag-form" onSubmit={submit} noValidate aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="master__title">
        Add a topic
      </h2>
      <div className="tag-form__row">
        <div className="field">
          <label htmlFor={`${id}-name`} className="field__label">
            Name
          </label>
          <input
            id={`${id}-name`}
            name="topic-name"
            autoComplete="off"
            className="input"
            value={name}
            maxLength={40}
            placeholder="Exoplanets…"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => {
              setName(e.target.value)
              setError(undefined)
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-slug`} className="field__label">
            Hashtag
          </label>
          <input
            id={`${id}-slug`}
            name="topic-hashtag"
            autoComplete="off"
            spellCheck={false}
            className="input"
            value={slugTouched ? slug : effectiveSlug}
            maxLength={40}
            placeholder="exoplanets…"
            aria-describedby={`${id}-slug-hint`}
            onChange={(e) => {
              setSlug(e.target.value)
              setSlugTouched(true)
              setError(undefined)
            }}
          />
        </div>
        <button type="submit" className="btn btn-primary tag-form__submit" disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add topic'}
        </button>
      </div>
      <p id={`${id}-slug-hint`} className="field__hint">
        Shown as #{effectiveSlug || 'topic'}. Letters, numbers and dashes; “SPHEREx” and “#spherex” count as the same topic.
      </p>
      {error && (
        <p id={`${id}-err`} className="field__error">
          <AlertCircle aria-hidden /> {error}
        </p>
      )}
      {create.isError && !(create.error instanceof ForumError && (create.error.details.reason || create.error.details.fields)) && <ErrorNotice error={create.error} />}
    </form>
  )
}

function TagRow({ tag: t, onDone }: { tag: TagWithCount; onDone: (m: string) => void }) {
  const id = useId()
  const refresh = useRefreshAfterModeration()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(t.name)
  const [confirm, setConfirm] = useState(false)

  const rename = useMutation({
    mutationFn: () => forumApi.updateTag(t.id, { name }),
    onSuccess: () => {
      refresh()
      setEditing(false)
      onDone('Topic renamed.')
    },
  })
  const toggle = useMutation({
    mutationFn: () => forumApi.setTagActive(t.id, !t.active),
    onSuccess: () => {
      refresh()
      setConfirm(false)
      onDone(t.active ? `#${t.slug} retired.` : `#${t.slug} is available again.`)
    },
  })

  return (
    <tr className={t.active ? undefined : 'is-retired'}>
      <td>
        {editing ? (
          <form
            className="tags-table__rename"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim().length >= 2) rename.mutate()
            }}
          >
            <label htmlFor={`${id}-n`} className="sr-only">
              New name for #{t.slug}
            </label>
            <input id={`${id}-n`} name="topic-rename" autoComplete="off" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
            <button type="submit" className="btn btn-primary btn-sm" disabled={rename.isPending || name.trim().length < 2}>
              Save
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setEditing(false)
                setName(t.name)
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          t.name
        )}
        {rename.isError && <ErrorNotice error={rename.error} />}
      </td>
      <td>#{t.slug}</td>
      <td className="num">{t.count}</td>
      <td>{t.active ? <span className="status status--ok">Active</span> : <span className="status status--muted">Retired</span>}</td>
      <td className="tags-table__actions">
        {!editing && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            Rename<span className="sr-only"> #{t.slug}</span>
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => (t.active ? setConfirm(true) : toggle.mutate())} disabled={toggle.isPending}>
          {t.active ? 'Retire' : 'Reactivate'}
          <span className="sr-only"> #{t.slug}</span>
        </button>
        <Dialog
          open={confirm}
          title={`Retire #${t.slug}?`}
          description="Members can no longer choose it for new posts. Existing posts keep it and can still be filtered by it."
          onClose={() => setConfirm(false)}
          busy={toggle.isPending}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)} disabled={toggle.isPending}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
                Retire topic
              </button>
            </>
          }
        />
      </td>
    </tr>
  )
}
