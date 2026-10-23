import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SiteLayout } from './components/Site'

const IndexPage = lazy(() => import('./pages/IndexPage'))
const ArticlePage = lazy(() => import('./pages/ArticlePage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function App() {
  return (
    <BrowserRouter>
      <SiteLayout>
        <Suspense fallback={<main id="main-content" className="page-main loading-lines" aria-label="Loading" />}>
          <Routes>
            <Route path="/" element={<IndexPage />} />
            <Route path="/posts/:slug" element={<ArticlePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </SiteLayout>
    </BrowserRouter>
  )
}

export default App
