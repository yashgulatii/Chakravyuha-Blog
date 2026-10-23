import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { useSearchParams } from 'react-router-dom'
import { fetchPosts, orderPosts } from '../content/posts'
import { normalizeTag, PLANNED_ENTRIES } from '../content/config'
import { EntryRow } from '../components/EntryRow'
import { RingGlyph } from '../components/RingGlyph'

function LoadingRows() {
  return (
    <div className="entry-list loading-lines" aria-label="Loading field notes">
      {Array.from({ length: 4 }, (_, index) => <div className="loading-row" key={index} />)}
    </div>
  )
}

export default function IndexPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTag = normalizeTag(searchParams.get('tag') ?? '')
  const query = useQuery({
    queryKey: ['posts'],
    queryFn: ({ signal }) => fetchPosts(undefined, signal),
  })
  const allPosts = query.data?.posts ?? []
  const posts = orderPosts(selectedTag ? allPosts.filter((post) => post.tags.includes(selectedTag)) : allPosts)
  const allTags = [...new Set(allPosts.flatMap((post) => post.tags))].sort()
  const positions = new Map(posts.map((post, index) => [post.slug, index + 1]))

  function selectTag(tag: string) {
    const next = new URLSearchParams(searchParams)
    if (tag) next.set('tag', tag)
    else next.delete('tag')
    setSearchParams(next)
  }

  return (
    <>
      <Helmet>
        <title>Field notes — Chakravyuha</title>
        <meta name="description" content="The Chakravyuha field notes: one entry at a time, from the Active Directory purple team lab." />
        <link rel="canonical" href="https://blog.chakravyuha.tech/" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Field notes — Chakravyuha" />
        <meta property="og:description" content="The Chakravyuha field notes: one entry at a time, from the Active Directory purple team lab." />
        <meta property="og:url" content="https://blog.chakravyuha.tech/" />
        <meta property="og:image" content="https://blog.chakravyuha.tech/og-image.svg" />
      </Helmet>
      <main id="main-content" className="page-main">
        <section className="index-intro" aria-labelledby="page-title">
          <p className="kicker mono">Field notes</p>
          <h1 id="page-title">The formation, one ring at a time.</h1>
          <p className="publication-count mono">
            {query.data?.posts.length ?? 0} of {PLANNED_ENTRIES} entries published
          </p>
        </section>

        {allTags.length > 0 && (
          <nav className="tag-filter mono" aria-label="Filter entries by tag">
            {allTags.map((tag) => (
              <button
                type="button"
                key={tag}
                className={selectedTag === tag ? 'tag-filter__tag is-selected' : 'tag-filter__tag'}
                aria-pressed={selectedTag === tag}
                onClick={() => selectTag(selectedTag === tag ? '' : tag)}
              >
                {tag}
              </button>
            ))}
          </nav>
        )}

        {query.isPending ? (
          <LoadingRows />
        ) : query.isError ? (
          <p className="feed-error" role="status">
            The field notes could not be reached.{' '}
            <button className="text-link" type="button" onClick={() => void query.refetch()}>Try again</button>
          </p>
        ) : posts.length === 0 ? (
          <section className="empty-state" aria-label="No entries published">
            <RingGlyph size={112} dotted />
            <p>The formation is still closed. The first entry is on its way.</p>
          </section>
        ) : (
          <div className="entry-list">
            {posts.map((post) => (
              <EntryRow
                key={post.slug}
                post={post}
                chronologicalPosition={positions.get(post.slug) ?? 1}
              />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
