---
name: decap-cms
description: When the user wants to use Decap CMS (formerly Netlify CMS) for Git-based content management. Use for "Decap CMS," "Netlify CMS," "Git CMS," "editorial workflow," or building sites with Git-based content editing through a web interface.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: cms
  tags:
    - headless-cms
    - decap-cms
    - netlify-cms
    - git-based
    - editorial-workflow
    - static-site
---

# Decap CMS

## Overview

You are an expert in Decap CMS (formerly Netlify CMS), the open-source Git-based content management system. Your role is to help users set up content management workflows where editors can create and edit content through a web interface, while all content is stored as files in Git repositories.

Decap CMS provides a clean editorial interface for non-technical users while maintaining the benefits of Git-based workflows, version control, and static site generation.

## Instructions

### Step 1: Basic Setup and Installation

```bash
# Create project structure
mkdir my-decap-cms-site
cd my-decap-cms-site

# Initialize Git repository
git init
git remote add origin https://github.com/username/my-site.git

# Install dependencies
npm init -y
npm install netlify-cms-app
```

### Step 2: CMS Configuration

```yaml
# public/admin/config.yml - Main Decap CMS configuration
backend:
  name: git-gateway
  branch: main
  commit_messages:
    create: 'Create {{collection}} "{{slug}}"'
    update: 'Update {{collection}} "{{slug}}"'
    delete: 'Delete {{collection}} "{{slug}}"'

# Editorial workflow (optional)
publish_mode: editorial_workflow

# Media storage
media_folder: "public/images/uploads"
public_folder: "/images/uploads"

# Site configuration
site_url: https://your-site.com
display_url: https://your-site.com

# Collections define the content structure
collections:
  # Blog posts
  - name: "blog"
    label: "Blog Posts"
    folder: "content/blog"
    create: true
    slug: "{{year}}-{{month}}-{{day}}-{{slug}}"
    preview_path: "blog/{{slug}}"
    fields:
      - {label: "Title", name: "title", widget: "string"}
      - {label: "Description", name: "description", widget: "text"}
      - {label: "Author", name: "author", widget: "string"}
      - {label: "Publish Date", name: "date", widget: "datetime"}
      - {label: "Featured Image", name: "image", widget: "image", required: false}
      - {label: "Draft", name: "draft", widget: "boolean", default: false}
      - label: "Categories"
        name: "categories"
        widget: "select"
        multiple: true
        options: ["Technology", "Design", "Business", "Lifestyle"]
      - label: "Tags"
        name: "tags"
        widget: "list"
        default: []
      - {label: "Body", name: "body", widget: "markdown"}
      - label: "SEO"
        name: "seo"
        widget: "object"
        collapsed: true
        fields:
          - {label: "Meta Title", name: "title", widget: "string", required: false}
          - {label: "Meta Description", name: "description", widget: "text", required: false}
          - {label: "Social Image", name: "image", widget: "image", required: false}

  # Pages
  - name: "pages"
    label: "Pages"
    folder: "content/pages"
    create: true
    slug: "{{slug}}"
    preview_path: "{{slug}}"
    fields:
      - {label: "Title", name: "title", widget: "string"}
      - {label: "Description", name: "description", widget: "text"}
      - {label: "Permalink", name: "permalink", widget: "string", hint: "e.g., /about/"}
      - {label: "Body", name: "body", widget: "markdown"}

  # Site settings (single file)
  - name: "settings"
    label: "Site Settings"
    files:
      - label: "General Settings"
        name: "general"
        file: "content/settings/general.yml"
        fields:
          - {label: "Site Title", name: "title", widget: "string"}
          - {label: "Description", name: "description", widget: "text"}
          - {label: "Logo", name: "logo", widget: "image", required: false}
          - label: "Social Links"
            name: "social"
            widget: "object"
            fields:
              - {label: "Twitter", name: "twitter", widget: "string", required: false}
              - {label: "Facebook", name: "facebook", widget: "string", required: false}
              - {label: "LinkedIn", name: "linkedin", widget: "string", required: false}
              - {label: "GitHub", name: "github", widget: "string", required: false}
          - label: "Contact Information"
            name: "contact"
            widget: "object"
            fields:
              - {label: "Email", name: "email", widget: "string"}
              - {label: "Phone", name: "phone", widget: "string", required: false}
              - {label: "Address", name: "address", widget: "text", required: false}

      - label: "Navigation"
        name: "navigation"
        file: "content/settings/navigation.yml"
        fields:
          - label: "Main Navigation"
            name: "main"
            widget: "list"
            fields:
              - {label: "Label", name: "label", widget: "string"}
              - {label: "URL", name: "url", widget: "string"}
              - {label: "External Link", name: "external", widget: "boolean", default: false}
```

### Step 3: Admin Interface Setup

```html
<!-- public/admin/index.html - CMS admin interface -->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Manager</title>
    <script src="https://identity.netlify.com/v1/netlify-identity-widget.js"></script>
  </head>
  <body>
    <script src="https://unpkg.com/netlify-cms@^2.0.0/dist/netlify-cms.js"></script>
    
    <!-- Custom preview styles -->
    <script>
      CMS.registerPreviewStyle("/admin/preview.css");
    </script>
    
    <!-- Custom preview templates -->
    <script>
      // Blog post preview template
      var BlogPostPreview = createClass({
        render: function() {
          var entry = this.props.entry;
          var image = entry.getIn(['data', 'image']);
          var bg = this.props.getAsset(image);
          
          return h('div', {className: 'preview-container'},
            h('div', {className: 'preview-header'},
              bg ? h('img', {src: bg.toString(), className: 'preview-image'}) : null,
              h('h1', {className: 'preview-title'}, entry.getIn(['data', 'title'])),
              h('div', {className: 'preview-meta'},
                h('span', {}, entry.getIn(['data', 'author'])),
                h('span', {}, ' • '),
                h('time', {}, entry.getIn(['data', 'date']))
              )
            ),
            h('div', {
              className: 'preview-content',
              dangerouslySetInnerHTML: {
                __html: this.props.widgetFor('body')
              }
            })
          );
        }
      });
      
      // Register preview templates
      CMS.registerPreviewTemplate('blog', BlogPostPreview);
    </script>
  </body>
</html>
```

### Step 4: Content Processing for Static Site

```javascript
// lib/content.js - Content processing functions
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { remark } from 'remark'
import remarkHtml from 'remark-html'
import remarkGfm from 'remark-gfm'

const contentDirectory = path.join(process.cwd(), 'content')

// Get all posts from the blog collection
export function getAllBlogPosts() {
  const blogDirectory = path.join(contentDirectory, 'blog')
  
  if (!fs.existsSync(blogDirectory)) {
    return []
  }
  
  const filenames = fs.readdirSync(blogDirectory)
  const posts = filenames
    .filter(name => name.endsWith('.md'))
    .map(name => {
      const filePath = path.join(blogDirectory, name)
      const fileContents = fs.readFileSync(filePath, 'utf8')
      const { data, content } = matter(fileContents)
      
      return {
        slug: name.replace(/\.md$/, ''),
        frontmatter: data,
        content,
        ...data,
      }
    })
    .filter(post => !post.draft)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  
  return posts
}

// Get single blog post
export function getBlogPost(slug) {
  const blogDirectory = path.join(contentDirectory, 'blog')
  const filePath = path.join(blogDirectory, `${slug}.md`)
  
  if (!fs.existsSync(filePath)) {
    return null
  }
  
  const fileContents = fs.readFileSync(filePath, 'utf8')
  const { data, content } = matter(fileContents)
  
  return {
    slug,
    frontmatter: data,
    content,
    ...data,
  }
}

// Get site settings
export function getSiteSettings() {
  const settingsPath = path.join(contentDirectory, 'settings/general.yml')
  
  if (!fs.existsExists(settingsPath)) {
    return {}
  }
  
  const fileContents = fs.readFileSync(settingsPath, 'utf8')
  const { data } = matter(fileContents)
  
  return data
}

// Convert markdown to HTML
export async function markdownToHtml(markdown) {
  const result = await remark()
    .use(remarkGfm)
    .use(remarkHtml)
    .process(markdown)
  
  return result.toString()
}
```

### Step 5: Deployment and Webhooks

```javascript
// pages/api/rebuild.js - Webhook for content updates
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    // Trigger build hook
    const buildHookUrl = process.env.NETLIFY_BUILD_HOOK_URL
    
    if (buildHookUrl) {
      const buildResponse = await fetch(buildHookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (buildResponse.ok) {
        console.log('Build triggered successfully')
        return res.status(200).json({ message: 'Build triggered' })
      }
    }
    
    return res.status(200).json({ message: 'Webhook received' })
  } catch (error) {
    console.error('Webhook error:', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
```

## Guidelines

- **Content Structure**: Plan your content collections carefully. Consider how editors will create and organize content.
- **Editorial Workflow**: Use the editorial workflow for content review processes. Set up proper branch protection and review requirements.
- **Performance**: Implement proper static generation and caching strategies. Optimize images and assets for fast loading.
- **Security**: Use Git Gateway for authentication. Implement proper webhook signature verification for security.
- **Preview**: Set up meaningful preview templates so editors can see how their content will look.
- **Validation**: Add proper field validation in your CMS configuration to prevent invalid content.
- **Backup**: Your content is stored in Git, providing automatic versioning and backup. Consider additional backup strategies.
- **SEO**: Structure your content model to support SEO metadata and generate proper meta tags.
- **Responsive Design**: Ensure your preview templates and site are responsive and work well on all devices.
- **Team Training**: Train content editors on using the CMS interface and editorial workflow processes.