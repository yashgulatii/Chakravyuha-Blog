import { Link } from 'react-router-dom'
import { getEntryNumber, type Post } from '../content/posts'
import { RingGlyph } from './RingGlyph'

function getRing(tags: string[]) {
  for (const tag of tags) {
    const match = /^ring-([1-7])$/.exec(tag)
    if (match) return Number(match[1])
  }
  return undefined
}

export function EntryRow({
  post,
  chronologicalPosition,
}: {
  post: Post
  chronologicalPosition: number
}) {
  const date = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(post.publishedAt))
  return (
    <Link to={`/posts/${encodeURIComponent(post.slug)}`} className="entry-row">
      <span className="entry-row__number mono">{String(getEntryNumber(post, chronologicalPosition)).padStart(2, '0')}</span>
      <span className="entry-row__copy">
        <span className="entry-row__title">{post.title}</span>
        {post.brief && <span className="entry-row__brief">{post.brief}</span>}
        <span className="entry-row__meta mono">
          {date} <span aria-hidden="true">·</span> {post.readingMinutes} min read
          {post.tags.length > 0 && <> <span aria-hidden="true">·</span> {post.tags.join(', ')}</>}
        </span>
      </span>
      <RingGlyph ring={getRing(post.tags)} size={32} className="entry-row__glyph" />
    </Link>
  )
}
