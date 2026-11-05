import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import DOMPurify from 'dompurify'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'
import { fetchPosts, getEntryNumber, orderPosts, type Post } from '../content/posts'
import { RingGlyph } from '../components/RingGlyph'
import NotFoundPage from './NotFoundPage'

interface Heading {
  id: string
  text: string
  level: 2 | 3
}

const allowedTags = [
  'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'ul', 'ol', 'li', 'blockquote',
  'pre', 'code', 'em', 'strong', 'hr', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'span', 'sup', 'sub', 'del',
]
const allowedAttributes = [
  'href', 'src', 'alt', 'title', 'id', 'class', 'target', 'rel', 'loading', 'decoding',
]

function convertWikiImages(container: HTMLElement) {
  container.querySelectorAll('p').forEach((paragraph) => {
    const children = [...paragraph.childNodes].filter(
      (node) => node.nodeType !== Node.TEXT_NODE || node.textContent?.trim(),
    )
    let alt: string | undefined
    let source: string | null = null

    if (children.length === 3 && children[1] instanceof HTMLAnchorElement) {
      const opening = /^!\[\[([^\]]+)\]\]\(\s*$/.exec(children[0].textContent?.trimStart() ?? '')
      const closing = /^\s*(?:align=(?:"[^"]*"|'[^']*')\s*)?\)$/.test(children[2].textContent ?? '')
      if (opening && closing) {
        alt = opening[1].trim()
        source = children[1].getAttribute('href')
      }
    } else if (children.length === 1) {
      const markdown = /^!\[\[([^\]]+)\]\]\((https?:\/\/[^\s)]+)(?:\s+align=(?:"[^"]*"|'[^']*'))?\)$/
        .exec(children[0].textContent?.trim() ?? '')
      if (markdown) {
        alt = markdown[1].trim()
        source = markdown[2]
      }
    }

    if (!alt || !source) return
    let imageUrl: URL
    try {
      imageUrl = new URL(source, window.location.origin)
    } catch {
      return
    }
    if (!['https:', 'http:'].includes(imageUrl.protocol)) return

    const image = document.createElement('img')
    image.src = imageUrl.href
    image.alt = alt
    image.loading = 'lazy'
    image.decoding = 'async'
    const figure = document.createElement('figure')
    figure.append(image)
    paragraph.replaceWith(figure)
  })
}

function cleanArticleHtml(html: string) {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'h1'],
    FORBID_ATTR: ['style'],
    RETURN_DOM_FRAGMENT: true,
  }) as DocumentFragment
  const container = document.createElement('div')
  container.append(fragment)
  convertWikiImages(container)

  container.querySelectorAll('code').forEach((code) => {
    const className = code.getAttribute('class')
    if (className && !/^language-[a-z0-9]+$/.test(className)) code.removeAttribute('class')
  })
  container.querySelectorAll('[id]').forEach((element) => {
    if (!/^h[2-6]$/.test(element.tagName.toLowerCase())) element.removeAttribute('id')
  })
  container.querySelectorAll('a[href]').forEach((anchor) => {
    const link = anchor as HTMLAnchorElement
    try {
      if (new URL(link.href, window.location.origin).origin !== window.location.origin) {
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
      }
    } catch {
      link.removeAttribute('href')
    }
  })
  container.querySelectorAll('img').forEach((image) => {
    image.setAttribute('loading', 'lazy')
    image.setAttribute('decoding', 'async')
    const alt = image.getAttribute('alt')?.trim()
    if (alt) {
      const currentFigure = image.parentElement?.tagName.toLowerCase() === 'figure'
        ? image.parentElement
        : null
      const figure = currentFigure ?? document.createElement('figure')
      if (!currentFigure) {
        image.replaceWith(figure)
        figure.append(image)
      }
    }
  })
  return container.innerHTML
}

function findRing(tags: string[]) {
  for (const tag of tags) {
    const match = /^ring-([1-7])$/.exec(tag)
    if (match) return Number(match[1])
  }
  return undefined
}

function useArticleEnhancements(
  contentRef: React.RefObject<HTMLElement | null>,
  html: string,
  onSection: (id: string) => void,
) {
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const headings = [...content.querySelectorAll<HTMLElement>('h2, h3')]
    const usedIds = new Set<string>()
    headings.forEach((heading, index) => {
      const base = heading.textContent?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${index + 1}`
      let id = heading.id || base
      let suffix = 2
      while (usedIds.has(id)) id = `${base}-${suffix++}`
      usedIds.add(id)
      heading.id = id
    })
    const detectionPattern = /^(?:Detection:|Detection\s-)/i
    content.querySelectorAll('blockquote').forEach((quote) => {
      if (detectionPattern.test(quote.textContent?.trim() ?? '')) quote.classList.add('detection-callout')
    })

    const observer = new IntersectionObserver((entries) => {
      const active = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0]
      if (active) onSection(active.target.id)
    }, { rootMargin: '-15% 0px -75% 0px' })
    headings.forEach((heading) => observer.observe(heading))

    const cleanups: Array<() => void> = []
    content.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
      const code = pre.querySelector('code')
      if (!code) return
      const copy = document.createElement('button')
      copy.type = 'button'
      copy.className = 'code-copy mono'
      copy.textContent = 'copy'
      copy.setAttribute('aria-label', 'Copy code')
      const handleCopy = async () => {
        try {
          await navigator.clipboard.writeText(code.innerText)
          copy.textContent = 'copied'
          window.setTimeout(() => { copy.textContent = 'copy' }, 1600)
        } catch (error) {
          console.error('Code could not be copied to the clipboard.', error)
          copy.textContent = 'copy unavailable'
        }
      }
      copy.addEventListener('click', handleCopy)
      pre.append(copy)
      cleanups.push(() => copy.removeEventListener('click', handleCopy))
    })

    let isCurrent = true
    const codeBlocks = content.querySelectorAll<HTMLElement>('pre code[class^="language-"]')
    if (codeBlocks.length > 0) {
      void Promise.all([
        import('highlight.js/lib/core'),
        import('highlight.js/lib/languages/bash'),
        import('highlight.js/lib/languages/powershell'),
        import('highlight.js/lib/languages/python'),
        import('highlight.js/lib/languages/yaml'),
        import('highlight.js/lib/languages/json'),
        import('highlight.js/lib/languages/xml'),
        import('highlight.js/lib/languages/sql'),
      ]).then(([core, bash, powershell, python, yaml, json, xml, sql]) => {
        if (!isCurrent) return
        const highlighter = core.default
        highlighter.registerLanguage('bash', bash.default)
        highlighter.registerLanguage('powershell', powershell.default)
        highlighter.registerLanguage('python', python.default)
        highlighter.registerLanguage('yaml', yaml.default)
        highlighter.registerLanguage('json', json.default)
        highlighter.registerLanguage('xml', xml.default)
        highlighter.registerLanguage('sql', sql.default)
        codeBlocks.forEach((block) => {
          try {
            highlighter.highlightElement(block)
          } catch (error) {
            console.error('A code block could not be highlighted.', error)
          }
        })
      }).catch((error: unknown) => {
        console.error('Syntax highlighting could not be loaded.', error)
      })
    }

    return () => {
      isCurrent = false
      observer.disconnect()
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [contentRef, html, onSection])
}

function TableOfContents({ headings, activeId }: { headings: Heading[]; activeId: string }) {
  if (headings.length === 0) return null
  return (
    <nav className="article-toc" aria-label="On this page">
      <p className="mono">On this page</p>
      <ol>
        {headings.map((heading) => (
          <li key={heading.id} className={heading.level === 3 ? 'article-toc__sub' : undefined}>
            <a className={activeId === heading.id ? 'is-current' : undefined} href={`#${heading.id}`}>
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function ArticleContent({ post }: { post: Post }) {
  const contentRef = useRef<HTMLElement>(null)
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState('')
  const html = useMemo(() => cleanArticleHtml(post.html), [post.html])
  useArticleEnhancements(contentRef, html, setActiveId)

  useEffect(() => {
    if (!contentRef.current) return
    setHeadings([...contentRef.current.querySelectorAll<HTMLElement>('h2, h3')].map((heading) => ({
      id: heading.id,
      text: heading.textContent?.trim() ?? '',
      level: heading.tagName === 'H3' ? 3 : 2,
    })))
  }, [html])

  return (
    <div className="article-layout">
      <TableOfContents headings={headings} activeId={activeId} />
      <article
        ref={contentRef}
        className="article-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

function Article({ post, posts }: { post: Post; posts: Post[] }) {
  const ordered = orderPosts(posts)
  const index = ordered.findIndex((item) => item.slug === post.slug)
  const number = getEntryNumber(post, index + 1)
  const previous = index > 0 ? ordered[index - 1] : undefined
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : undefined
  const canonical = `https://blog.chakravyuha.tech/posts/${encodeURIComponent(post.slug)}`
  const [linkCopyState, setLinkCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    const progress = document.querySelector<HTMLElement>('.reading-progress')
    if (!progress) return
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const ratio = scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0
      progress.style.setProperty('--reading-progress', String(ratio))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [post.slug])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(canonical)
      setLinkCopyState('copied')
    } catch (error) {
      console.error('The entry link could not be copied.', error)
      setLinkCopyState('failed')
    }
  }

  return (
    <>
      <Helmet>
        <title>{post.title} — Chakravyuha Field notes</title>
        <meta name="description" content={post.brief || `${post.title} — field notes from the Chakravyuha lab.`} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.brief} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content="https://blog.chakravyuha.tech/og-image.svg" />
        <meta property="article:published_time" content={post.publishedAt} />
      </Helmet>
      <main id="main-content" className="page-main article-page">
        <header className="article-header">
          <div className="article-header__copy">
            <p className="entry-label mono">Entry {number}</p>
            <h1>{post.title}</h1>
            <p className="article-meta mono">
              {new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(post.publishedAt))}
              {' · '}{post.readingMinutes} min read
              {post.tags.length > 0 && <> · {post.tags.join(', ')}</>}
            </p>
          </div>
          <RingGlyph ring={findRing(post.tags)} size={64} className="article-header__glyph" />
        </header>
        <ArticleContent post={post} />
        <footer className="article-footer">
          <nav className="entry-navigation" aria-label="Previous and next entries">
            {previous ? (
              <Link to={`/posts/${encodeURIComponent(previous.slug)}`} rel="prev">
                <span className="mono">← Previous entry</span><span>{previous.title}</span>
              </Link>
            ) : <span />}
            {next && (
              <Link to={`/posts/${encodeURIComponent(next.slug)}`} rel="next">
                <span className="mono">Next entry →</span><span>{next.title}</span>
              </Link>
            )}
          </nav>
          <div className="article-footer__links">
            <a href={post.url} target="_blank" rel="noopener noreferrer">Read the original on Hashnode ↗</a>
            <button className="text-link" type="button" onClick={() => void copyLink()}>
              {linkCopyState === 'copied' ? 'Copied' : linkCopyState === 'failed' ? 'Copy unavailable' : 'Copy link'}
            </button>
            <a href="https://chakravyuha.tech">Back to the lab →</a>
          </div>
        </footer>
      </main>
    </>
  )
}

export default function ArticlePage() {
  const { slug = '' } = useParams()
  const query = useQuery({
    queryKey: ['posts', 'all'],
    queryFn: ({ signal }) => fetchPosts(undefined, signal),
  })
  const posts = query.data?.posts ?? []
  const post = posts.find((item) => item.slug === slug)

  if (query.isPending) {
    return <main id="main-content" className="page-main loading-lines" aria-label="Loading entry" />
  }
  if (query.isError) {
    return (
      <main id="main-content" className="page-main">
        <p className="feed-error" role="status">The entry could not be reached. <button className="text-link" type="button" onClick={() => void query.refetch()}>Try again</button></p>
      </main>
    )
  }
  return post ? <Article post={post} posts={posts} /> : <NotFoundPage />
}
