# File-Based Routing Templates

TanStack Router's Vite plugin watches `src/routes/` and auto-generates `src/routeTree.gen.ts`.
**Never edit `routeTree.gen.ts` manually.**

## src/main.tsx

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from './router'
import './index.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
)
```

## src/router.tsx

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

## src/routes/__root.tsx

```tsx
import { createRootRoute, Outlet, Link } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <nav className="flex gap-4 p-4 border-b">
        <Link to="/" className="[&.active]:font-bold">Home</Link>
      </nav>
      <main className="p-4">
        <Outlet />
      </main>
      <TanStackRouterDevtools />
    </>
  ),
})
```

## src/routes/index.tsx

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <div>
      <h1 className="text-2xl font-bold">Home</h1>
    </div>
  ),
})
```

## Route file naming conventions

| File | URL |
|------|-----|
| `routes/index.tsx` | `/` |
| `routes/about.tsx` | `/about` |
| `routes/posts/index.tsx` | `/posts` |
| `routes/posts.$postId.tsx` | `/posts/:postId` |
| `routes/_layout.tsx` | Layout wrapper (no URL segment) |
| `routes/_layout/dashboard.tsx` | `/dashboard` inside layout |
| `routes/posts_.$postId.edit.tsx` | `/posts/:postId/edit` (flat) |

## Accessing route params

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  component: PostPage,
})

function PostPage() {
  const { postId } = Route.useParams()
  return <div>Post: {postId}</div>
}
```

## Route with TanStack Query loader

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'

const postQuery = (id: string) =>
  queryOptions({
    queryKey: ['post', id],
    queryFn: () => fetch(`/api/posts/${id}`).then(r => r.json()),
  })

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(postQuery(params.postId)),
  component: PostPage,
})

function PostPage() {
  const { postId } = Route.useParams()
  const { data } = useSuspenseQuery(postQuery(postId))
  return <div>{data.title}</div>
}
```

To use query in loaders, pass `queryClient` via router context:

```tsx
// router.tsx
const queryClient = new QueryClient()
export const router = createRouter({
  routeTree,
  context: { queryClient },
})
```
