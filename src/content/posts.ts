export interface Post {
  slug: string
  title: string
  brief: string
  url: string
  publishedAt: string
  coverImage: string | null
  html: string
  tags: string[]
  readingMinutes: number
}

export interface FeedResponse {
  posts: Post[]
  fetchedAt: string
}

const feedEndpoint = '/api/hashnode-feed'

export async function fetchPosts(tag?: string, signal?: AbortSignal): Promise<FeedResponse> {
  const params = new URLSearchParams()
  if (tag) params.set('tag', tag)
  const response = await fetch(`${feedEndpoint}${params.size ? `?${params}` : ''}`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(detail?.error ?? `The field notes could not be loaded (${response.status}).`)
  }
  return response.json() as Promise<FeedResponse>
}

export function getEntryNumber(post: Post, chronologicalPosition: number) {
  const match = /^(?:Post|Part)\s*(\d+)/i.exec(post.title)
  return match ? Number(match[1]) : chronologicalPosition
}

export function orderPosts(posts: Post[]) {
  return [...posts].sort((left, right) => {
    const leftDate = Date.parse(left.publishedAt)
    const rightDate = Date.parse(right.publishedAt)
    return leftDate - rightDate || left.slug.localeCompare(right.slug)
  })
}
