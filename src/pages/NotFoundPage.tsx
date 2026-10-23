import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { RingGlyph } from '../components/RingGlyph'

export default function NotFoundPage() {
  return (
    <>
      <Helmet>
        <title>No such entry — Chakravyuha</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <main id="main-content" className="page-main not-found">
        <RingGlyph size={112} className="ring-glyph--gap" />
        <h1>No such entry.</h1>
        <Link to="/">Return to the entries →</Link>
      </main>
    </>
  )
}
