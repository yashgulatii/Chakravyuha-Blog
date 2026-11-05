import { XMLParser } from 'npm:fast-xml-parser@4.5.3'
import sanitizeHtml from 'npm:sanitize-html@2.17.0'
import { parseDocument } from 'npm:htmlparser2@10.0.0'
import { HIDE_SLUGS, INCLUDE_TAGS, normalizeTag } from '../_shared/feed-config.ts'

const UPSTREAM_FEED = 'https://yashgulatii.hashnode.dev/rss.xml'
const MAX_FEED_BYTES = 5 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 8_000
const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400'
const PRODUCTION_ORIGIN = 'https://blog.chakravyuha.tech'
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '__cdata',
  parseTagValue: false,
  trimValues: true,
  isArray: (_name, path) => path === 'rss.channel.item' || path === 'rss.channel.item.category',
})

interface Post {
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

interface FeedPayload {
  posts: Post[]
  fetchedAt: string
}

interface HtmlNode {
  type: string
  name?: string
  data?: string
  attribs?: Record<string, string>
  children?: HtmlNode[]
}

function jsonResponse(body: unknown, status: number, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8')
  if (status >= 500) responseHeaders.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  })
}

export { normalizeTag }

function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(textValue).join(' ')
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return textValue(record['#text'] ?? record.__cdata ?? '')
  }
  return ''
}

function getText(node: HtmlNode): string {
  return node.type === 'text'
    ? node.data ?? ''
    : (node.children ?? []).map(getText).join(' ')
}

export function removeAuthorFooter(html: string) {
  const document = parseDocument(html, { decodeEntities: true }) as unknown as { children: HtmlNode[] }
  function trimTail(nodes: HtmlNode[]): boolean {
    for (let index = 0; index < nodes.length; index += 1) {
      if (nodes[index].name === 'hr') {
        let nextIndex = index + 1
        while (
          nextIndex < nodes.length &&
          nodes[nextIndex].type === 'text' &&
          !(nodes[nextIndex].data ?? '').trim()
        ) nextIndex += 1
        const following = nodes[nextIndex]
        if (
          following?.name === 'p' &&
          /thanks for reading this article so far/i.test(getText(following))
        ) {
          nodes.splice(index)
          return true
        }
      }
      if (nodes[index].children && trimTail(nodes[index].children!)) {
        nodes.splice(index + 1)
        return true
      }
    }
    return false
  }
  trimTail(document.children)
  return document.children.map(serializeHtmlNode).join('')
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

function serializeHtmlNode(node: HtmlNode): string {
  if (node.type === 'text') return escapeHtml(node.data ?? '')
  if (node.type === 'comment' || node.type === 'directive') return ''
  const tag = node.name ?? ''
  const attributes = Object.entries(node.attribs ?? {})
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('')
  const children = (node.children ?? []).map(serializeHtmlNode).join('')
  if (!tag) return children
  const voidTag = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(tag)
  return voidTag ? `<${tag}${attributes}>` : `<${tag}${attributes}>${children}</${tag}>`
}

export function sanitizePostHtml(source: string) {
  const trimmed = removeAuthorFooter(source)
  const sanitized = sanitizeHtml(trimmed, {
    allowedTags: [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'ul', 'ol', 'li',
      'blockquote', 'pre', 'code', 'em', 'strong', 'hr', 'img', 'figure',
      'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br',
      'span', 'sup', 'sub', 'del',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'loading', 'decoding'],
      h1: ['id'],
      h2: ['id'],
      h3: ['id'],
      h4: ['id'],
      h5: ['id'],
      h6: ['id'],
      code: ['class'],
      '*': ['title'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    disallowedTagsMode: 'discard',
    transformTags: {
      h1: sanitizeHtml.simpleTransform('h2'),
      code: (_tagName: string, attributes: Record<string, string>) => {
        const codeClass = attributes.class
        return {
          tagName: 'code',
          attribs: {
            ...(codeClass && /^language-[a-z0-9]+$/.test(codeClass) ? { class: codeClass } : {}),
          },
        }
      },
      a: (_tagName: string, attributes: Record<string, string>) => {
        const href = attributes.href
        if (!href) return { tagName: 'a', attribs: {} }
        try {
          const destination = new URL(href, UPSTREAM_FEED)
          if (destination.protocol === 'http:' || destination.protocol === 'https:') {
            return {
              tagName: 'a',
              attribs: {
                href,
                ...(attributes.title ? { title: attributes.title } : {}),
                ...(destination.origin !== PRODUCTION_ORIGIN
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {}),
              },
            }
          }
          return {
            tagName: 'a',
            attribs: { href, ...(attributes.title ? { title: attributes.title } : {}) },
          }
        } catch {
          return { tagName: 'a', attribs: {} }
        }
      },
      img: (_tagName: string, attributes: Record<string, string>) => ({
        tagName: 'img',
        attribs: {
          ...(attributes.src ? { src: attributes.src } : {}),
          ...(attributes.alt ? { alt: attributes.alt } : {}),
          ...(attributes.title ? { title: attributes.title } : {}),
          loading: 'lazy',
          decoding: 'async',
        },
      }),
    },
  })
  return convertWikiImages(sanitized)
}

function convertWikiImages(html: string) {
  const document = parseDocument(html, { decodeEntities: true }) as unknown as { children: HtmlNode[] }
  function convert(nodes: HtmlNode[]) {
    for (let index = 0; index < nodes.length; index += 1) {
      const paragraph = nodes[index]
      if (paragraph.name !== 'p') {
        if (paragraph.children) convert(paragraph.children)
        continue
      }

      const children = (paragraph.children ?? []).filter(
        (node) => node.type !== 'text' || (node.data ?? '').trim(),
      )
      let alt: string | undefined
      let source: string | null = null
      if (children.length === 3 && children[1].name === 'a') {
        const opening = /^!\[\[([^\]]+)\]\]\(\s*$/.exec(children[0].data?.trimStart() ?? '')
        const closing = /^\s*(?:align=(?:"[^"]*"|'[^']*')\s*)?\)$/.test(children[2].data ?? '')
        if (opening && closing) {
          alt = opening[1].trim()
          source = safeUrl(children[1].attribs?.href ?? '', UPSTREAM_FEED)
        }
      } else if (children.length === 1) {
        const markdown = /^!\[\[([^\]]+)\]\]\((https?:\/\/[^\s)]+)(?:\s+align=(?:"[^"]*"|'[^']*'))?\)$/
          .exec(children[0].data?.trim() ?? '')
        if (markdown) {
          alt = markdown[1].trim()
          source = safeUrl(markdown[2], UPSTREAM_FEED)
        }
      }

      if (alt && source) {
        nodes[index] = {
          type: 'tag',
          name: 'figure',
          children: [{
            type: 'tag',
            name: 'img',
            attribs: { src: source, alt, loading: 'lazy', decoding: 'async' },
            children: [],
          }],
        }
      } else if (paragraph.children) {
        convert(paragraph.children)
      }
    }
  }
  convert(document.children)
  return document.children.map(serializeHtmlNode).join('')
}

function descriptionText(value: unknown) {
  return sanitizeHtml(textValue(value), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim()
}

function categoryValues(value: unknown) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value]
  return [...new Set(values.map((item) => normalizeTag(textValue(item))).filter(Boolean))]
}

function safeUrl(value: string, base: string) {
  try {
    const url = new URL(value, base)
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

function mapItem(item: Record<string, unknown>): Post | null {
  const url = safeUrl(textValue(item.link), UPSTREAM_FEED)
  if (!url) throw new Error('An upstream item has an invalid link.')
  const slug = new URL(url).pathname.split('/').filter(Boolean).at(-1)
  if (!slug) throw new Error('An upstream item has no post slug.')
  if (HIDE_SLUGS.includes(slug)) return null
  const tags = categoryValues(item.category)
  if (!INCLUDE_TAGS.some((tag) => tags.includes(normalizeTag(tag)))) return null
  const rawDate = textValue(item.pubDate)
  const timestamp = Date.parse(rawDate)
  if (!Number.isFinite(timestamp)) throw new Error(`The publication date for "${slug}" is invalid.`)
  const html = sanitizePostHtml(textValue(item['content:encoded']))
  const plainText = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
  const words = plainText.trim() ? plainText.trim().split(/\s+/).length : 0
  const enclosure = item.enclosure as Record<string, unknown> | undefined
  const coverImage = enclosure ? safeUrl(textValue(enclosure['@_url']), UPSTREAM_FEED) : null
  return {
    slug,
    title: descriptionText(item.title) || slug,
    brief: descriptionText(item.description),
    url,
    publishedAt: new Date(timestamp).toISOString(),
    coverImage,
    html,
    tags,
    readingMinutes: Math.ceil(words / 200),
  }
}

async function readCappedBody(response: Response) {
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > MAX_FEED_BYTES) {
    throw new Error('The upstream feed exceeded the 5 MB response limit.')
  }
  if (!response.body) throw new Error('The upstream feed returned an empty body.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_FEED_BYTES) {
      await reader.cancel()
      throw new Error('The upstream feed exceeded the 5 MB response limit.')
    }
    chunks.push(value)
  }
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
}

export function parseFeedXml(xml: string): FeedPayload {
  const parsed = parser.parse(xml) as Record<string, unknown>
  const rss = parsed.rss as Record<string, unknown> | undefined
  const channel = rss?.channel as Record<string, unknown> | undefined
  const items = channel?.item
  if (!Array.isArray(items)) throw new Error('The upstream RSS feed has no channel item list.')
  const posts = items
    .map((item) => mapItem(item as Record<string, unknown>))
    .filter((post): post is Post => post !== null)
    .sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt))
  return { posts, fetchedAt: new Date().toISOString() }
}

async function fetchFreshFeed(): Promise<FeedPayload> {
  const response = await fetch(UPSTREAM_FEED, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    redirect: 'error',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`The upstream feed returned HTTP ${response.status}.`)
  return parseFeedXml(await readCappedBody(response))
}

function serviceHeaders() {
  const projectUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!projectUrl || !serviceKey) throw new Error('Supabase cache credentials are not configured.')
  return {
    baseUrl: projectUrl.replace(/\/+$/, ''),
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  }
}

async function readLastGoodCache(): Promise<FeedPayload | null> {
  const { baseUrl, headers } = serviceHeaders()
  const response = await fetch(
    `${baseUrl}/rest/v1/hashnode_feed_cache?id=eq.hashnode-feed&select=payload`,
    { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) },
  )
  if (!response.ok) throw new Error(`Feed cache read failed with HTTP ${response.status}.`)
  const rows = await response.json() as Array<{ payload: FeedPayload }>
  return rows[0]?.payload ?? null
}

async function writeLastGoodCache(payload: FeedPayload) {
  const { baseUrl, headers } = serviceHeaders()
  const response = await fetch(
    `${baseUrl}/rest/v1/hashnode_feed_cache?on_conflict=id`,
    {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: 'hashnode-feed',
        payload,
        fetched_at: payload.fetchedAt,
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    },
  )
  if (!response.ok) throw new Error(`Feed cache write failed with HTTP ${response.status}.`)
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]!)
}

export function renderRss(posts: Post[], tag: string | null) {
  const filteredPosts = tag ? posts.filter((post) => post.tags.includes(normalizeTag(tag))) : posts
  const items = filteredPosts.map((post) => {
    const categories = post.tags.map((category) => `<category>${escapeXml(category)}</category>`).join('')
    const content = post.html.replace(/\]\]>/g, ']]]]><![CDATA[>')
    return `<item><title>${escapeXml(post.title)}</title><link>${escapeXml(post.url)}</link><guid isPermaLink="false">${escapeXml(post.slug)}</guid><pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate><description>${escapeXml(post.brief)}</description>${categories}<content:encoded><![CDATA[${content}]]></content:encoded></item>`
  }).join('')
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Chakravyuha — Field notes</title><link>https://blog.chakravyuha.tech/</link><description>Field notes from the Chakravyuha Active Directory purple team lab.</description>${items}</channel></rss>`
  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
    },
  })
}

function getAllowedOrigins() {
  const origins = new Set([PRODUCTION_ORIGIN])
  const previewOrigin = Deno.env.get('LOVABLE_PREVIEW_ORIGIN')
  if (previewOrigin) {
    try {
      const parsed = new URL(previewOrigin)
      if (parsed.protocol === 'https:' && parsed.origin === previewOrigin) origins.add(parsed.origin)
      else console.error('LOVABLE_PREVIEW_ORIGIN must be an exact HTTPS origin.')
    } catch (error) {
      console.error('LOVABLE_PREVIEW_ORIGIN is invalid.', error)
    }
  }
  return origins
}

export async function handleRequest(request: Request) {
  const origin = request.headers.get('Origin')
  const allowedOrigins = getAllowedOrigins()
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403, { Vary: 'Origin' })
  }
  const corsHeaders = new Headers({
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Cache-Control': CACHE_CONTROL,
  })
  if (origin) corsHeaders.set('Access-Control-Allow-Origin', origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed.' }, 405, corsHeaders)

  const url = new URL(request.url)
  const format = url.searchParams.get('format')
  const tag = url.searchParams.get('tag')
  if (format && format !== 'rss') {
    return jsonResponse({ error: 'Unsupported response format.' }, 400, corsHeaders)
  }
  if (url.searchParams.size > (tag ? 2 : format ? 1 : 0) || (tag && tag.length > 100)) {
    return jsonResponse({ error: 'Unsupported query parameters.' }, 400, corsHeaders)
  }
  try {
    let payload: FeedPayload
    try {
      payload = await fetchFreshFeed()
      await writeLastGoodCache(payload)
    } catch (upstreamError) {
      console.error('Hashnode feed refresh failed; trying the persisted last-good copy.', upstreamError)
      try {
        const cached = await readLastGoodCache()
        if (!cached) {
          return jsonResponse({ error: 'The field notes are temporarily unavailable.' }, 503, corsHeaders)
        }
        payload = cached
      } catch (cacheError) {
        console.error('The persisted feed cache could not be read.', cacheError)
        return jsonResponse({ error: 'The field notes and their cached copy are temporarily unavailable.' }, 503, corsHeaders)
      }
    }
    if (format === 'rss') {
      const rss = renderRss(payload.posts, tag)
      const headers = new Headers(rss.headers)
      corsHeaders.forEach((value, key) => headers.set(key, value))
      return new Response(rss.body, { status: rss.status, headers })
    }
    const posts = tag
      ? payload.posts.filter((post) => post.tags.includes(normalizeTag(tag)))
      : payload.posts
    return new Response(JSON.stringify({ ...payload, posts }), {
      headers: { ...Object.fromEntries(corsHeaders), 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (error) {
    console.error('Hashnode feed request failed.', error)
    return jsonResponse({ error: 'The field notes could not be processed.' }, 503, corsHeaders)
  }
}

if (import.meta.main) Deno.serve(handleRequest)
