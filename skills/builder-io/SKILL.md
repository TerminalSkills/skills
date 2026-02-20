---
name: builder-io
description: When the user wants to use Builder.io for visual headless CMS and page building. Use for "Builder.io," "visual page builder," "drag-drop CMS," "visual headless CMS," or building websites with visual editing and component-based content creation.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: cms
  tags:
    - headless-cms
    - builder-io
    - visual-editor
    - page-builder
    - drag-drop
    - react
---

# Builder.io

## Overview

You are an expert in Builder.io, the visual headless CMS and page builder. Your role is to help users create websites and applications where content creators can visually design pages and components using a drag-and-drop interface, while developers maintain full control over the underlying code.

Builder.io enables teams to create content visually while leveraging existing React components, design systems, and custom functionality.

## Instructions

### Step 1: Project Setup

```bash
# Install Builder.io SDK
npm install @builder.io/react @builder.io/sdk

# For Next.js integration
npm install @builder.io/react @builder.io/sdk-react-nextjs
```

### Step 2: Basic Configuration

```javascript
// lib/builder.js - Builder configuration
import { builder, Builder } from '@builder.io/react'

// Initialize Builder with your API key
builder.init(process.env.NEXT_PUBLIC_BUILDER_API_KEY)

export { builder, Builder }
```

### Step 3: Custom Components Registration

```jsx
// components/BuilderComponents.jsx - Register custom components
import { Builder } from '@builder.io/react'

const Hero = ({ title, subtitle, backgroundImage, ctaText, ctaUrl }) => (
  <section 
    className="min-h-screen flex items-center justify-center relative"
    style={{
      backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}
  >
    <div className="text-center text-white max-w-4xl mx-auto px-4">
      <h1 className="text-6xl font-bold mb-4">{title}</h1>
      {subtitle && <p className="text-xl mb-8">{subtitle}</p>}
      {ctaText && ctaUrl && (
        <a href={ctaUrl} className="bg-blue-600 text-white px-8 py-4 rounded-lg">
          {ctaText}
        </a>
      )}
    </div>
  </section>
)

const FeatureGrid = ({ features }) => (
  <section className="py-16 px-4">
    <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
      {features?.map((feature, index) => (
        <div key={index} className="text-center p-6 bg-white rounded-lg shadow-lg">
          <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
          <p className="text-gray-600">{feature.description}</p>
        </div>
      ))}
    </div>
  </section>
)

// Register components with Builder
Builder.registerComponent(Hero, {
  name: 'Hero',
  inputs: [
    { name: 'title', type: 'string', required: true },
    { name: 'subtitle', type: 'longText' },
    { name: 'backgroundImage', type: 'file' },
    { name: 'ctaText', type: 'string' },
    { name: 'ctaUrl', type: 'string' },
  ],
})

Builder.registerComponent(FeatureGrid, {
  name: 'Feature Grid',
  inputs: [
    {
      name: 'features',
      type: 'list',
      subFields: [
        { name: 'title', type: 'string', required: true },
        { name: 'description', type: 'longText', required: true },
      ],
    },
  ],
})
```

### Step 4: Dynamic Page Rendering

```jsx
// pages/[...page].js - Catch-all route for Builder pages
import { builder, BuilderComponent, useIsPreviewing } from '@builder.io/react'
import { GetStaticProps } from 'next'
import '../components/BuilderComponents' // Register components

export default function Page({ builderContent }) {
  const isPreviewing = useIsPreviewing()
  
  if (!builderContent && !isPreviewing) {
    return <div>Page not found</div>
  }

  return (
    <BuilderComponent
      model="page"
      content={builderContent}
    />
  )
}

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const urlPath = '/' + (params?.page?.join('/') || '')
  
  const content = await builder
    .get('page', {
      userAttributes: { urlPath },
    })
    .toPromise()

  return {
    props: {
      builderContent: content || null,
    },
    revalidate: 5,
  }
}

export const getStaticPaths = async () => {
  const pages = await builder.getAll('page', {
    options: { noTargeting: true },
    omit: 'data.blocks',
  })

  return {
    paths: pages.map((page) => ({
      params: {
        page: page.data?.url?.split('/').filter(Boolean) || [],
      },
    })),
    fallback: 'blocking',
  }
}
```

## Guidelines

- **Component Design**: Create flexible, reusable components that work well in Builder's visual editor. Consider how non-technical users will configure them.
- **Performance**: Implement proper caching, image optimization, and lazy loading. Builder content can be large, so optimize delivery.
- **Content Strategy**: Plan your content models carefully. Consider how content creators will structure and organize their content.
- **Visual Design**: Ensure your components look good in Builder's editor and provide clear controls for customization.
- **Data Integration**: Connect Builder to your existing data sources. Use dynamic data binding for personalization and real-time content.
- **A/B Testing**: Leverage Builder's built-in A/B testing capabilities for optimization and experimentation.
- **SEO**: Implement proper meta tags and structured data. Ensure Builder-generated content is SEO-friendly.
- **Security**: Validate all inputs and sanitize content. Be careful with user-generated content and custom code.
- **Responsive Design**: Ensure your components work well across all device sizes. Use Builder's responsive editing features.
- **Team Workflow**: Set up proper permissions and workflows. Train content creators on using the Builder interface effectively.