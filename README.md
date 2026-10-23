# Chakravyuha Field notes

A typographic reading room for the Chakravyuha Active Directory purple-team lab. The static React app reads only the server-filtered feed from the `hashnode-feed` Supabase Edge Function; it never contacts Hashnode directly.

## Local development

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` to the Supabase project URL. The public site origin and exact Lovable preview origin must also be configured in the edge function.

## Supabase deployment

1. Link the Supabase CLI to the project and apply `supabase/migrations/20261023000000_hashnode_feed_cache.sql`.
2. Set `LOVABLE_PREVIEW_ORIGIN` as an Edge Function secret to the exact HTTPS preview origin. The production origin is fixed to `https://blog.chakravyuha.tech`.
3. Deploy `hashnode-feed`; `supabase/config.toml` disables JWT verification because this is a public, read-only feed.
4. Set `VITE_SUPABASE_URL` in the static host's build environment.
5. Build with `VITE_SUPABASE_URL` set. The Vite build narrows the CSP `connect-src` and the `/rss.xml` and `/api/hashnode-feed` rewrites to that exact project origin.

The function fixes the upstream URL to `https://yashgulatii.hashnode.dev/rss.xml`, parses RSS XML server-side, filters to the normalized `chakravyuha` tag, sanitizes article HTML, and stores the latest successful response in a service-role-only table. It returns that persisted copy on refresh failure. `/rss.xml` is rewritten to the same function with `format=rss`; adding `?tag=ring-1` to either the index or feed applies the same normalized tag filter.

The feed cache uses a one-hour shared cache lifetime and stale-while-revalidate. The client query remains fresh for ten minutes. To run the edge-function tests with Deno:

```sh
deno test --config supabase/functions/hashnode-feed/deno.json --allow-net --allow-env=LOVABLE_PREVIEW_ORIGIN supabase/functions/hashnode-feed/index_test.ts
```

## Build

```sh
npm run build
npm run lint
```

Post routes are client-rendered and use `react-helmet-async` for in-app metadata. Social previews intentionally retain the static site-level OG card; no per-post HTML generation is used.
