import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  handleRequest,
  normalizeTag,
  parseFeedXml,
  removeAuthorFooter,
  renderRss,
  sanitizePostHtml,
} from './index.ts'

Deno.test('normalizes Hashnode tags, aliases and duplicate spelling', () => {
  assertEquals(normalizeTag('#hacktoberfest '), 'hacktoberfest')
  assertEquals(normalizeTag('  #Chakravyuha  '), 'chakravyuha')
  assertEquals(normalizeTag('python 3'), 'python')
  assertEquals(normalizeTag('cybersecurity'), normalizeTag('#cybersecurity'))
})

Deno.test('strips executable markup and unsafe attributes and demotes h1', () => {
  const html = sanitizePostHtml(
    '<h1 id="intro">Title</h1><p onerror="alert(1)">Safe</p><script>alert(2)</script><iframe src="https://evil.example"></iframe><a href="javascript:alert(3)">link</a>',
  )
  assertStringIncludes(html, '<h2 id="intro">Title</h2>')
  assertStringIncludes(html, '<p>Safe</p>')
  assert(!html.includes('<script'))
  assert(!html.includes('onerror'))
  assert(!html.includes('iframe'))
  assert(!html.includes('javascript:'))
})

Deno.test('removes the complete author footer tail after its marker', () => {
  const html = removeAuthorFooter(
    '<p>Article body</p><hr><p>Thanks for reading this article so far</p><ul><li>Follow me</li></ul>',
  )
  assertStringIncludes(html, 'Article body')
  assert(!html.includes('Thanks for reading this article so far'))
  assert(!html.includes('Follow me'))
})

Deno.test('removes the complete author footer when nested in a wrapper', () => {
  const html = removeAuthorFooter(
    '<section><p>Body</p><hr><p>Thanks for reading this article so far</p><ul><li>Social</li></ul></section><p>Tail outside wrapper</p>',
  )
  assertStringIncludes(html, 'Body')
  assert(!html.includes('Social'))
  assert(!html.includes('Tail outside wrapper'))
})

Deno.test('keeps safe content links and applies safe external-link attributes', () => {
  const html = sanitizePostHtml(
    '<p><a href="https://example.org/post">External</a> <a href="https://yashgulatii.hashnode.dev/article">Hashnode</a> <a href="mailto:reader@example.org">Mail</a></p><img src="https://example.org/image.png" alt="Diagram" onerror="alert(1)">',
  )
  assertStringIncludes(html, 'rel="noopener noreferrer"')
  assertStringIncludes(html, 'target="_blank"')
  assertStringIncludes(html, 'loading="lazy"')
  assertStringIncludes(html, 'decoding="async"')
  assert(!html.includes('onerror'))
})

Deno.test('parses CDATA, namespace content, and normalized categories', () => {
  const feed = parseFeedXml(
    '<?xml version="1.0"?><rss><channel><item><title>Post 0 Opening</title><link>https://yashgulatii.hashnode.dev/post-0-opening</link><pubDate>Fri, 23 Oct 2026 00:00:00 GMT</pubDate><description><![CDATA[Short brief]]></description><content:encoded><![CDATA[<h1>Opening</h1><p>Body text.</p><script>alert(1)</script>]]></content:encoded><category>#Chakravyuha</category><category>ring-1</category><category>#chakravyuha</category></item></channel></rss>',
  )
  assertEquals(feed.posts.length, 1)
  assertEquals(feed.posts[0].slug, 'post-0-opening')
  assertEquals(feed.posts[0].tags, ['chakravyuha', 'ring-1'])
  assertStringIncludes(feed.posts[0].html, '<h2>Opening</h2>')
  assert(!feed.posts[0].html.includes('<script'))
})

Deno.test('drops posts without the configured series tag', () => {
  const feed = parseFeedXml(
    '<rss><channel><item><title>Unrelated post</title><link>https://yashgulatii.hashnode.dev/unrelated</link><pubDate>Fri, 23 Oct 2026 00:00:00 GMT</pubDate><description>Brief</description><content:encoded><![CDATA[<p>Body</p>]]></content:encoded><category>cybersecurity</category></item></channel></rss>',
  )
  assertEquals(feed.posts, [])
})

Deno.test('generates a tag-filtered RSS 2.0 feed with full HTML content', async () => {
  const parsed = parseFeedXml(
    '<rss><channel><item><title>Part 1</title><link>https://yashgulatii.hashnode.dev/part-1</link><pubDate>Fri, 23 Oct 2026 00:00:00 GMT</pubDate><description>Brief</description><content:encoded><![CDATA[<p>Full article text</p>]]></content:encoded><category>chakravyuha</category><category>ring-1</category></item></channel></rss>',
  )
  const response = renderRss(parsed.posts, 'ring-1')
  const body = await response.text()
  assertEquals(response.headers.get('Content-Type'), 'application/rss+xml; charset=utf-8')
  assertStringIncludes(body, '<rss version="2.0"')
  assertStringIncludes(body, '<content:encoded><![CDATA[<p>Full article text</p>]]></content:encoded>')
  assertStringIncludes(body, '<category>ring-1</category>')
})

Deno.test('rejects unexpected CORS origins and caller-provided feed URLs', async () => {
  const blockedOrigin = await handleRequest(new Request('https://edge.example/feed', {
    headers: { Origin: 'https://attacker.example' },
  }))
  assertEquals(blockedOrigin.status, 403)
  assertEquals(blockedOrigin.headers.get('Access-Control-Allow-Origin'), null)

  const suppliedUrl = await handleRequest(new Request('https://edge.example/feed?url=https%3A%2F%2Fattacker.example'))
  assertEquals(suppliedUrl.status, 400)
})
