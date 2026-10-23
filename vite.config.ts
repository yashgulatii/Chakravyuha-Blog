import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const supabaseUrl = env.VITE_SUPABASE_URL
  const parsedSupabaseUrl = supabaseUrl ? new URL(supabaseUrl) : undefined
  if (
    parsedSupabaseUrl &&
    (parsedSupabaseUrl.protocol !== 'https:' ||
      parsedSupabaseUrl.username !== '' ||
      parsedSupabaseUrl.password !== '')
  ) {
    throw new Error('VITE_SUPABASE_URL must be an HTTPS project URL without credentials.')
  }
  const supabaseOrigin = parsedSupabaseUrl?.origin
  return {
    plugins: [
      react(),
      {
        name: 'configure-supabase-static-host',
        configureServer(server) {
          server.middlewares.use(async (request, response, next) => {
            const localUrl = new URL(request.url ?? '/', 'http://vite.local')
            const isRss = localUrl.pathname === '/rss.xml'
            if (!isRss && localUrl.pathname !== '/api/hashnode-feed') return next()
            if (!supabaseUrl) {
              response.statusCode = 503
              response.setHeader('Content-Type', 'application/json; charset=utf-8')
              response.end(JSON.stringify({
                error: 'Set VITE_SUPABASE_URL to connect the local app to its feed function.',
              }))
              return
            }
            const target = new URL('/functions/v1/hashnode-feed', supabaseUrl)
            target.search = localUrl.search
            if (isRss) target.searchParams.set('format', 'rss')
            try {
              const upstream = await fetch(target, {
                headers: { Accept: request.headers.accept ?? 'application/json' },
              })
              response.statusCode = upstream.status
              response.setHeader('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
              const cacheControl = upstream.headers.get('Cache-Control')
              if (cacheControl) response.setHeader('Cache-Control', cacheControl)
              response.end(await upstream.text())
            } catch (error) {
              console.error('The local feed proxy could not reach Supabase.', error)
              response.statusCode = 502
              response.setHeader('Content-Type', 'application/json; charset=utf-8')
              response.end(JSON.stringify({ error: 'The local feed proxy could not reach Supabase.' }))
            }
          })
        },
        transformIndexHtml(html) {
          return supabaseOrigin
            ? html.replaceAll('https://*.supabase.co', supabaseOrigin)
            : html
        },
        async closeBundle() {
          if (!supabaseOrigin) return
          const { readFile, writeFile } = await import('node:fs/promises')
          const headersPath = new URL('./dist/_headers', import.meta.url)
          const headers = await readFile(headersPath, 'utf8')
          await writeFile(headersPath, headers.replaceAll('https://*.supabase.co', supabaseOrigin))
          const redirectsPath = new URL('./dist/_redirects', import.meta.url)
          const redirects = await readFile(redirectsPath, 'utf8')
          await writeFile(
            redirectsPath,
            redirects.replaceAll('https://supabase-project.supabase.co', supabaseOrigin),
          )
        },
      },
    ],
    build: {
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('highlight.js')) return 'syntax-highlighting'
            if (id.includes('@tanstack/react-query')) return 'query'
          },
        },
      },
    },
  }
})
