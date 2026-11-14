import { diffParagraphs, diffSet } from '../diff'
import { MarkdownView } from '../markdown'
import type { PublishedContent, RevisionView, Tag } from '../types'
import { ObservationLinkCard, TagChips } from '../components/bits'
import { isEyesLink } from '../links'

function tagName(tags: Tag[], id: string) {
  const t = tags.find((x) => x.id === id)
  return t ? `#${t.slug}${t.active ? '' : ' (retired)'}` : id
}

/** A first post: show exactly what will become public. */
export function SubmissionPreview({ revision }: { revision: RevisionView }) {
  return (
    <div className="review-preview">
      <h3 className="review-preview__title">{revision.title}</h3>
      <TagChips tags={revision.tags} linked={false} />
      <MarkdownView source={revision.body} />
      {revision.links.length > 0 && (
        <div className="review-links">
          {revision.links.map((l) =>
            isEyesLink(l) ? (
              <ObservationLinkCard key={l} href={l} />
            ) : (
              <p key={l} className="review-links__ext">
                {l}
              </p>
            ),
          )}
        </div>
      )}
    </div>
  )
}

/**
 * An edit: published version vs proposed version, one view stacked top to bottom (Option A's diff).
 * Every changed part is listed, including topics and links (BA §6 "Sửa bài đã công khai").
 */
export function RevisionDiff({ before, after }: { before: PublishedContent; after: RevisionView }) {
  const allTags = [...before.tags, ...after.tags]
  const tags = diffSet(before.tagIds, after.tagIds)
  const links = diffSet(before.links, after.links)
  const body = diffParagraphs(before.body, after.body)
  const titleChanged = before.title !== after.title
  const bodyChanged = body.some((d) => d.op !== 'same')

  return (
    <dl className="diff">
      <div className="diff__row">
        <dt>Title</dt>
        <dd>
          {titleChanged ? (
            <>
              <del className="diff__del">{before.title}</del>
              <ins className="diff__ins">{after.title}</ins>
            </>
          ) : (
            <span className="diff__same">Unchanged: {after.title}</span>
          )}
        </dd>
      </div>
      <div className="diff__row">
        <dt>Topics</dt>
        <dd>
          {tags.added.length === 0 && tags.removed.length === 0 ? (
            <span className="diff__same">Unchanged</span>
          ) : (
            <ul className="diff__set">
              {tags.removed.map((id) => (
                <li key={`r${id}`}>
                  <del className="diff__del">{tagName(allTags, id)}</del>
                </li>
              ))}
              {tags.added.map((id) => (
                <li key={`a${id}`}>
                  <ins className="diff__ins">{tagName(allTags, id)}</ins>
                </li>
              ))}
              {tags.kept.map((id) => (
                <li key={`k${id}`} className="diff__same">
                  {tagName(allTags, id)}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </div>
      <div className="diff__row">
        <dt>Links</dt>
        <dd>
          {links.added.length === 0 && links.removed.length === 0 ? (
            <span className="diff__same">{after.links.length ? 'Unchanged' : 'None'}</span>
          ) : (
            <ul className="diff__set diff__set--stack">
              {links.removed.map((l) => (
                <li key={`r${l}`}>
                  <del className="diff__del">{l}</del>
                </li>
              ))}
              {links.added.map((l) => (
                <li key={`a${l}`}>
                  <ins className="diff__ins">{l}</ins>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </div>
      <div className="diff__row">
        <dt>Post</dt>
        <dd>
          {!bodyChanged && <span className="diff__same">Unchanged</span>}
          <div className="diff__body">
            {body.map((d, i) =>
              d.op === 'same' ? (
                <div key={i} className="diff__para diff__para--same">
                  <MarkdownView source={d.value} className="md md--compact" />
                </div>
              ) : d.op === 'add' ? (
                <ins key={i} className="diff__para diff__para--add">
                  <span className="sr-only">Added: </span>
                  <MarkdownView source={d.value} className="md md--compact" />
                </ins>
              ) : (
                <del key={i} className="diff__para diff__para--remove">
                  <span className="sr-only">Removed: </span>
                  <MarkdownView source={d.value} className="md md--compact" />
                </del>
              ),
            )}
          </div>
        </dd>
      </div>
    </dl>
  )
}
