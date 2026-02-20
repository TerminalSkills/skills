---
name: storyblok
description: When the user wants to use Storyblok for component-based headless CMS. Use for "Storyblok," "component CMS," "visual editor," "headless CMS with components," or building websites with structured, reusable content components.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: cms
  tags:
    - headless-cms
    - storyblok
    - component-based
    - visual-editor
    - nextjs
    - vue
    - react
---

# Storyblok

## Overview

You are an expert in Storyblok, the component-based headless CMS with a visual editor. Your role is to help users build websites and applications using Storyblok's component-driven content architecture, where content is structured as reusable components that can be visually arranged and edited.

Storyblok enables developers to create flexible content structures using components, while providing content editors with an intuitive visual editing interface.

## Instructions

### Step 1: Project Setup

```bash
# Install Storyblok SDK for React/Next.js
npm install @storyblok/react @storyblok/js

# Rich text rendering
npm install @storyblok/rich-text-react-renderer
```

### Step 2: Storyblok Configuration

```javascript
// lib/storyblok.js - Storyblok client configuration
import { StoryblokApi, storyblokInit, apiPlugin } from '@storyblok/react'

const { storyblokApi } = storyblokInit({
  accessToken: process.env.NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN,
  use: [apiPlugin],
  components: {}, // Components will be registered separately
})

export { storyblokApi }
export const STORYBLOK_VERSION = process.env.NODE_ENV === 'development' ? 'draft' : 'published'
```

### Step 3: Component Schema Definition

```javascript
// components/storyblok/index.js - Component registry
import { storyblokInit } from '@storyblok/react'
import Hero from './Hero'
import FeatureGrid from './FeatureGrid'
import Testimonials from './Testimonials'
import Page from './Page'

const components = {
  hero: Hero,
  feature_grid: FeatureGrid,
  testimonials: Testimonials,
  page: Page,
}

storyblokInit({
  accessToken: process.env.NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN,
  components,
})

export default components
```

### Step 4: Storyblok Components

```jsx
// components/storyblok/Hero.jsx - Hero component
import { storyblokEditable } from '@storyblok/react'
import Image from 'next/image'

const Hero = ({ blok }) => {
  return (
    <section
      {...storyblokEditable(blok)}
      className="relative bg-gradient-to-r from-blue-600 to-purple-700 text-white py-24 px-4"
    >
      {blok.background_image?.filename && (
        <div className="absolute inset-0">
          <Image
            src={blok.background_image.filename}
            alt={blok.background_image.alt || ''}
            layout="fill"
            objectFit="cover"
            className="opacity-50"
          />
        </div>
      )}
      
      <div className="relative max-w-6xl mx-auto text-center">
        <h1 className="text-5xl font-bold mb-6">{blok.headline}</h1>
        {blok.subheadline && (
          <p className="text-xl mb-8">{blok.subheadline}</p>
        )}
        {blok.cta_text && blok.cta_url && (
          <a href={blok.cta_url?.cached_url || blok.cta_url}
             className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold">
            {blok.cta_text}
          </a>
        )}
      </div>
    </section>
  )
}

export default Hero
```

### Step 5: Next.js Pages Integration

```jsx
// pages/[...slug].js - Catch-all route for Storyblok content
import { 
  useStoryblokState, 
  getStoryblokApi, 
  StoryblokComponent 
} from '@storyblok/react'
import { GetStaticProps, GetStaticPaths } from 'next'
import Head from 'next/head'
import { STORYBLOK_VERSION } from '../lib/storyblok'

export default function DynamicPage({ story, preview }) {
  story = useStoryblokState(story, {
    resolve_relations: ['blog_post.author', 'page.categories'],
  })

  if (!story || !story.content) {
    return <div>Story not found</div>
  }

  return (
    <>
      <Head>
        <title>{story.content.title || story.name}</title>
        {story.content.description && (
          <meta name="description" content={story.content.description} />
        )}
        {story.content.image?.filename && (
          <meta property="og:image" content={story.content.image.filename} />
        )}
      </Head>
      
      <StoryblokComponent blok={story.content} />
    </>
  )
}

export const getStaticProps: GetStaticProps = async ({ 
  params, 
  preview = false,
}) => {
  let slug = params?.slug ? params.slug.join('/') : 'home'
  
  let sbParams = {
    version: preview ? 'draft' : STORYBLOK_VERSION,
    resolve_relations: ['blog_post.author'],
  }

  const storyblokApi = getStoryblokApi()
  
  try {
    const { data } = await storyblokApi.get(`cdn/stories/${slug}`, sbParams)

    return {
      props: {
        story: data ? data.story : null,
        preview: preview || false,
      },
      revalidate: 3600,
    }
  } catch (error) {
    return { notFound: true }
  }
}

export const getStaticPaths: GetStaticPaths = async () => {
  const storyblokApi = getStoryblokApi()
  
  const { data } = await storyblokApi.get('cdn/stories', {
    version: STORYBLOK_VERSION,
    per_page: 100,
  })

  const paths = data.stories
    .filter(story => !story.is_folder)
    .map(story => ({
      params: { 
        slug: story.full_slug === 'home' ? [] : story.full_slug.split('/') 
      },
    }))

  return {
    paths,
    fallback: 'blocking',
  }
}
```

## Guidelines

- **Component Architecture**: Design components to be flexible and reusable. Think about how content editors will compose pages using your components.
- **Content Strategy**: Plan your content structure carefully. Consider relationships between content types and how they'll be used together.
- **Performance**: Implement proper caching, image optimization, and lazy loading. Use Storyblok's CDN effectively.
- **Visual Editor**: Test your components in Storyblok's visual editor. Ensure they render correctly and provide good editing experience.
- **Localization**: If building multilingual sites, structure your content and routing to support internationalization from the start.
- **SEO**: Implement proper meta tags, structured data, and sitemap generation for better search engine visibility.
- **Preview Mode**: Set up preview functionality so editors can see their changes before publishing.
- **Validation**: Add proper validation to your components and content fields. Help editors create valid content.
- **Responsive Design**: Ensure your components work well across all device sizes. Use Storyblok's responsive editing features.
- **Team Workflow**: Set up proper roles, permissions, and content workflows for your team's needs.