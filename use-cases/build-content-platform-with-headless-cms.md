---
title: Build a Content Platform with Headless CMS
slug: build-content-platform-with-headless-cms
description: Build a high-performance marketing website using Contentful headless CMS, Next.js with ISR, and modern deployment practices for scalable content management.
skills:
  - contentful
  - nextjs
  - vercel
  - typescript
  - tailwindcss
category: Content Management
tags:
  - headless-cms
  - nextjs
  - contentful
  - isr
  - marketing-site
  - performance
---

# Build a Content Platform with Headless CMS

Sarah's marketing agency landed their biggest client yet — a B2B SaaS company needing a complete website overhaul. The requirements are demanding: lightning-fast performance, SEO optimization, content team autonomy, multi-language support, and the ability to handle traffic spikes during product launches. Traditional WordPress won't cut it. They need a modern headless architecture that can scale and perform.

## Step 1 — Architecture Planning and Contentful Setup

Start by designing the content architecture in Contentful. The key is modeling content that reflects real business needs while staying flexible for future growth.

```typescript
// lib/contentful/types.ts — TypeScript interfaces for content
export interface BlogPost {
  sys: {
    id: string
    createdAt: string
    updatedAt: string
  }
  fields: {
    title: string
    slug: string
    excerpt: string
    body: Document // Rich text document
    featuredImage: Asset
    author: Author
    publishedDate: string
    categories: Category[]
    tags: string[]
    seo: {
      title: string
      description: string
      image: Asset
    }
    readingTime: number
  }
}

export interface LandingPage {
  sys: {
    id: string
    createdAt: string
    updatedAt: string
  }
  fields: {
    title: string
    slug: string
    sections: (HeroSection | FeatureGrid | Testimonials | CTASection)[]
    seo: {
      title: string
      description: string
      image: Asset
    }
  }
}
```

```typescript
// lib/contentful/client.ts — Type-safe Contentful client
import { createClient, ContentfulApi } from 'contentful'

const client: ContentfulApi = createClient({
  space: process.env.CONTENTFUL_SPACE_ID!,
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN!,
  environment: process.env.CONTENTFUL_ENVIRONMENT || 'master',
})

const previewClient: ContentfulApi = createClient({
  space: process.env.CONTENTFUL_SPACE_ID!,
  accessToken: process.env.CONTENTFUL_PREVIEW_TOKEN!,
  host: 'preview.contentful.com',
  environment: process.env.CONTENTFUL_ENVIRONMENT || 'master',
})

export { client, previewClient }

// Content fetching with proper error handling and caching
export async function getEntries<T>(
  contentType: string,
  options: any = {},
  preview: boolean = false
): Promise<T[]> {
  const activeClient = preview ? previewClient : client
  
  try {
    const response = await activeClient.getEntries({
      content_type: contentType,
      include: 2, // Include linked entries
      ...options,
    })
    
    return response.items.map(transformEntry) as T[]
  } catch (error) {
    console.error(`Error fetching ${contentType}:`, error)
    return []
  }
}

function transformEntry(entry: any) {
  return {
    sys: entry.sys,
    fields: entry.fields,
  }
}
```

## Step 2 — Next.js with ISR Implementation

Set up Next.js with Incremental Static Regeneration for optimal performance and content freshness.

```tsx
// pages/blog/[slug].tsx — Blog post with ISR
import { GetStaticProps, GetStaticPaths } from 'next'
import { BlogPost } from '../../lib/contentful/types'
import { getEntries } from '../../lib/contentful/client'
import { documentToReactComponents } from '@contentful/rich-text-react-renderer'
import { BLOCKS, INLINES } from '@contentful/rich-text-types'
import Head from 'next/head'
import Image from 'next/image'

interface BlogPostPageProps {
  post: BlogPost
  relatedPosts: BlogPost[]
  preview: boolean
}

export default function BlogPostPage({ post, relatedPosts, preview }: BlogPostPageProps) {
  const richTextOptions = {
    renderNode: {
      [BLOCKS.PARAGRAPH]: (node: any, children: React.ReactNode) => (
        <p className="mb-6 text-lg leading-relaxed text-gray-700">{children}</p>
      ),
      [BLOCKS.HEADING_2]: (node: any, children: React.ReactNode) => (
        <h2 className="text-3xl font-bold mt-12 mb-6 text-gray-900">{children}</h2>
      ),
      [BLOCKS.EMBEDDED_ASSET]: (node: any) => {
        const { file, title } = node.data.target.fields
        return (
          <div className="my-8">
            <Image
              src={`https:${file.url}`}
              alt={title || ''}
              width={file.details.image.width}
              height={file.details.image.height}
              className="w-full rounded-xl shadow-2xl"
              sizes="(max-width: 768px) 100vw, 800px"
            />
          </div>
        )
      },
    },
  }

  return (
    <>
      <Head>
        <title>{post.fields.seo.title || post.fields.title}</title>
        <meta name="description" content={post.fields.seo.description || post.fields.excerpt} />
        <meta property="og:title" content={post.fields.seo.title || post.fields.title} />
        <meta property="og:image" content={`https:${post.fields.featuredImage.fields.file.url}`} />
      </Head>

      <article className="max-width-4xl mx-auto px-4 py-12">
        <Image
          src={`https:${post.fields.featuredImage.fields.file.url}`}
          alt={post.fields.title}
          width={800}
          height={400}
          className="w-full h-96 object-cover rounded-2xl shadow-2xl mb-12"
          priority
        />

        <header className="mb-12">
          <h1 className="text-5xl font-bold leading-tight mb-6">
            {post.fields.title}
          </h1>
          <p className="text-2xl text-gray-600 leading-relaxed mb-8">
            {post.fields.excerpt}
          </p>
        </header>

        <div className="prose prose-lg max-w-none mb-16">
          {documentToReactComponents(post.fields.body, richTextOptions)}
        </div>

        {/* Related posts */}
        {relatedPosts.length > 0 && (
          <section className="border-t pt-12">
            <h2 className="text-3xl font-bold mb-8">Related Articles</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {relatedPosts.map(relatedPost => (
                <article key={relatedPost.sys.id} className="group">
                  <a href={`/blog/${relatedPost.fields.slug}`}>
                    <h3 className="font-semibold mb-2 group-hover:text-blue-600 transition-colors">
                      {relatedPost.fields.title}
                    </h3>
                  </a>
                </article>
              ))}
            </div>
          </section>
        )}
      </article>
    </>
  )
}

export const getStaticProps: GetStaticProps = async ({ 
  params, 
  preview = false 
}) => {
  try {
    // Get the post by slug
    const posts = await getEntries<BlogPost>(
      'blogPost',
      { 'fields.slug': params?.slug },
      preview
    )
    
    const post = posts[0]
    
    if (!post) {
      return { notFound: true }
    }

    // Get related posts
    const relatedPosts = await getEntries<BlogPost>(
      'blogPost',
      {
        'fields.categories.sys.id[in]': post.fields.categories.map(cat => cat.sys.id).join(','),
        'sys.id[ne]': post.sys.id,
        limit: 3,
      },
      preview
    )

    return {
      props: {
        post,
        relatedPosts,
        preview,
      },
      revalidate: 60, // Revalidate every minute
    }
  } catch (error) {
    return { notFound: true }
  }
}

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getEntries<BlogPost>('blogPost')
  
  return {
    paths: posts.map(post => ({
      params: { slug: post.fields.slug }
    })),
    fallback: 'blocking', // Enable ISR for new posts
  }
}
```

## Step 3 — Webhook Integration for Real-time Updates

Set up webhooks to automatically trigger rebuilds when content changes.

```typescript
// pages/api/revalidate.ts — ISR revalidation endpoint
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const signature = req.headers['x-contentful-webhook-signature'] as string
  
  try {
    const { sys } = req.body
    const contentType = sys.contentType?.sys?.id
    const entryId = sys.id

    // Revalidate based on content type
    switch (contentType) {
      case 'blogPost':
        const { getEntries } = await import('../../lib/contentful/client')
        const posts = await getEntries('blogPost', { 'sys.id': entryId })
        
        if (posts.length > 0) {
          const post = posts[0] as any
          await res.revalidate(`/blog/${post.fields.slug}`)
          await res.revalidate('/blog')
        }
        break

      case 'landingPage':
        const pages = await getEntries('landingPage', { 'sys.id': entryId })
        
        if (pages.length > 0) {
          const page = pages[0] as any
          const slug = page.fields.slug === 'home' ? '/' : `/${page.fields.slug}`
          await res.revalidate(slug)
        }
        break
    }

    return res.json({ 
      revalidated: true,
      message: `Content updated for ${contentType}` 
    })
    
  } catch (err) {
    return res.status(500).json({ 
      message: 'Error revalidating'
    })
  }
}
```

## Results

Sarah's agency delivered a high-performance content platform that exceeded all client expectations:

**Performance Metrics:**
- **Lighthouse Score**: 98/100 (Performance), 100/100 (SEO), 100/100 (Accessibility)
- **Core Web Vitals**: LCP 1.2s, FID 45ms, CLS 0.05
- **Page Load Speed**: 80% improvement over previous WordPress site
- **Time to Interactive**: Under 2 seconds on 3G connections

**Business Impact:**
- **Organic Traffic**: 150% increase in 6 months
- **Conversion Rate**: 23% improvement on landing pages  
- **Content Velocity**: Publishing time reduced from hours to minutes
- **Global Reach**: Multi-language support increased international traffic by 200%
- **Editorial Workflow**: Content team autonomy increased, development bottlenecks eliminated

**Technical Achievements:**
- **ISR Implementation**: Content updates without full rebuilds
- **Multi-language**: 4 locales with fallback handling
- **Webhook Integration**: Real-time content sync
- **Performance Monitoring**: Comprehensive analytics and alerting
- **99.9% Uptime**: Vercel's edge network and CDN

**Content Team Feedback:**
*"The editing experience is incredible. We can see changes instantly and the preview mode lets us perfect everything before publishing. No more waiting for developers!"* — Marketing Manager

The headless architecture proved its value during a major product launch when the site handled 10x normal traffic without any performance degradation, something impossible with their previous WordPress setup.