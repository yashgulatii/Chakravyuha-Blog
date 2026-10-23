import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { normalizeTag } from '../content/config'

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')

  useEffect(() => {
    const update = () => setDark(document.documentElement.dataset.theme === 'dark')
    window.addEventListener('themechange', update)
    return () => window.removeEventListener('themechange', update)
  }, [])

  function toggle() {
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    document.documentElement.style.colorScheme = next
    try {
      localStorage.setItem('theme', next)
    } catch (error) {
      console.warn('Theme preference could not be saved.', error)
    }
    const color = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (themeColor) themeColor.content = color
    setDark(!dark)
    window.dispatchEvent(new Event('themechange'))
  }

  return (
    <button
      className="theme-toggle mono"
      type="button"
      aria-pressed={dark}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`}
      onClick={toggle}
    >
      {dark ? 'Paper' : 'Night'}
    </button>
  )
}

export function SiteHeader() {
  const location = useLocation()
  const requestedTag = location.pathname === '/'
    ? normalizeTag(new URLSearchParams(location.search).get('tag') ?? '')
    : ''
  const rssHref = requestedTag
    ? `/rss.xml?${new URLSearchParams({ tag: requestedTag })}`
    : '/rss.xml'
  return (
    <header className="site-header">
      <Link to="/" className="wordmark" aria-label="Chakravyuha Field notes home">
        <svg className="wordmark__glyph" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="13.5" />
          <circle cx="16" cy="16" r="8.5" />
          <circle cx="16" cy="16" r="3.5" />
        </svg>
        <span className="wordmark__name">Chakravyuha</span>
        <span className="wordmark__subtitle">Field notes</span>
      </Link>
      <nav className="site-nav" aria-label="Site navigation">
        <a href="https://chakravyuha.tech" target="_blank" rel="noopener noreferrer">
          The lab ↗
        </a>
        <a href={rssHref}>RSS</a>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>Chakravyuha · Field notes by Yash Gulati</span>
      <ThemeToggle />
    </footer>
  )
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <div className="site-frame">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />
      {location.pathname.startsWith('/posts/') && <div className="reading-progress" aria-hidden="true" />}
      {children}
      <SiteFooter />
    </div>
  )
}
