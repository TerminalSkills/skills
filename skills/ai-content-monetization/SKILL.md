---
name: ai-content-monetization
description: >-
  Automate online content creation and monetization with AI — blog posts, videos,
  social media, affiliate marketing, and digital products. Use when: building
  passive income streams with AI, automating content marketing, scaling content
  production.
license: Apache-2.0
compatibility: "Python 3.10+ or Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: [monetization, content-creation, passive-income, affiliate, ai-content, marketing]
  use-cases:
    - "Build an AI content pipeline that generates and publishes blog posts daily"
    - "Automate YouTube faceless channel with AI scripts and voiceover"
    - "Create affiliate marketing content at scale with AI"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# AI Content Monetization — Passive Income with AI

## Overview

Build automated content creation and monetization systems using AI. Cover the full pipeline from content generation to revenue collection across multiple channels: blogs, YouTube, social media, newsletters, and digital products. Inspired by [MoneyPrinterV2](https://github.com/FujiwaraChoki/MoneyPrinterV2) (25k+ stars).

## Instructions

### Strategy 1: AI Blog with SEO + Affiliate Revenue

**Revenue model:** AdSense ($5-30 RPM) + affiliate links (5-15% commission)
**Timeline to revenue:** 3-6 months for organic traffic
**Target:** $500-2,000/month

#### Step 1: Niche Selection with Keyword Research

```python
import anthropic

def find_profitable_niche():
    """Use AI to identify profitable blog niches."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        messages=[{"role": "user", "content": """
            Suggest 5 blog niches that meet ALL criteria:
            1. High affiliate commission potential (>$50 avg product price)
            2. Evergreen search demand (not seasonal)
            3. Low-medium competition (not dominated by big brands)
            4. Content can be AI-generated without expert credentials
            5. Clear monetization path (affiliate + ads)

            For each: niche, example keywords, affiliate programs, estimated RPM.
        """}]
    )
    return response.content[0].text

def generate_keyword_cluster(niche, seed_keyword):
    """Generate a content calendar from a seed keyword."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": f"""
            Niche: {niche}
            Seed keyword: {seed_keyword}

            Generate 30 blog post ideas targeting long-tail keywords.
            Format each as:
            - Title (SEO optimized, includes keyword)
            - Target keyword
            - Search intent (informational/commercial/transactional)
            - Suggested affiliate products to mention
            - Estimated difficulty (low/medium/high)

            Prioritize commercial intent keywords (people ready to buy).
        """}]
    )
    return response.content[0].text
```

#### Step 2: Automated Blog Post Generation

```python
def generate_blog_post(title, keyword, affiliate_products):
    """Generate an SEO-optimized blog post with affiliate links."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        messages=[{"role": "user", "content": f"""
            Write a 2000-word blog post:
            Title: {title}
            Target keyword: {keyword}
            Products to mention: {affiliate_products}

            Requirements:
            - SEO: Use keyword in H1, first paragraph, 2-3 H2s, conclusion
            - Structure: Intro → Problem → Solution → Product reviews → Comparison → FAQ → Conclusion
            - Include [AFFILIATE_LINK:product_name] placeholders for each product
            - Write naturally — avoid AI detection patterns
            - Add personal touches ("In my experience...", "I've tested...")
            - Include a comparison table for products
            - End with clear recommendation and CTA
        """}]
    )
    return response.content[0].text

def insert_affiliate_links(content, link_map):
    """Replace placeholders with actual affiliate links."""
    for product, link in link_map.items():
        placeholder = f'[AFFILIATE_LINK:{product}]'
        html_link = f'<a href="{link}" rel="nofollow sponsored">{product}</a>'
        content = content.replace(placeholder, html_link)
    return content
```

#### Step 3: Auto-Publish to WordPress

```python
import requests

def publish_to_wordpress(title, content, wp_url, wp_user, wp_app_password):
    """Publish blog post to WordPress via REST API."""
    endpoint = f"{wp_url}/wp-json/wp/v2/posts"
    auth = (wp_user, wp_app_password)
    data = {
        "title": title,
        "content": content,
        "status": "publish",
        "categories": [1],  # your category ID
        "meta": {"_yoast_wpseo_metadesc": content[:155]}
    }
    response = requests.post(endpoint, json=data, auth=auth)
    return response.json().get('link')
```

### Strategy 2: Faceless YouTube Channel

**Revenue model:** AdSense ($3-8 RPM) + affiliate in description
**Timeline to revenue:** 2-4 months (Shorts monetization is faster)
**Target:** $1,000-5,000/month

```python
# Use the ai-video-generator skill for the full pipeline
# Key additions for monetization:

def generate_youtube_metadata(topic, script):
    """Generate optimized title, description, and tags."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        messages=[{"role": "user", "content": f"""
            Video topic: {topic}
            Script summary: {script[:500]}

            Generate YouTube metadata:
            1. TITLE: Clickbait but accurate, <60 chars, include main keyword
            2. DESCRIPTION: 200 words, keyword-rich first 2 lines,
               include 3 affiliate links with context,
               add timestamps, add hashtags at end
            3. TAGS: 15 relevant tags, mix of broad and specific
            4. THUMBNAIL TEXT: 3-5 words for thumbnail overlay (shocking/curious)
        """}]
    )
    return response.content[0].text
```

### Strategy 3: AI Newsletter + Digital Products

**Revenue model:** Sponsorships ($50-500/issue) + digital products ($10-50)
**Timeline to revenue:** 1-3 months
**Target:** $500-3,000/month

```python
def generate_newsletter(niche, trending_topics):
    """Generate a weekly newsletter issue."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": f"""
            Write a newsletter issue for a {niche} newsletter.
            Trending topics this week: {trending_topics}

            Format:
            - Catchy subject line (drives opens)
            - Personal intro (2-3 sentences, conversational)
            - Main story: deep dive on #1 trend (300 words)
            - Quick hits: 3-5 other trends (2-3 sentences each)
            - Tool of the week: recommend one tool (with affiliate context)
            - One actionable tip readers can use today
            - CTA: reply to this email / share with a friend
        """}]
    )
    return response.content[0].text

def send_newsletter(subject, html_content, list_id):
    """Send newsletter via Resend API."""
    import resend
    resend.api_key = os.environ["RESEND_API_KEY"]
    resend.Emails.send({
        "from": "newsletter@yourdomain.com",
        "to": list_id,  # audience/list ID
        "subject": subject,
        "html": html_content
    })
```

### Strategy 4: Social Media Content Syndication

Repurpose each piece of content across platforms:

```python
def repurpose_blog_to_social(blog_post, title):
    """Turn one blog post into 5+ social media posts."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": f"""
            Blog post: {blog_post[:2000]}
            Title: {title}

            Create social media posts for:
            1. TWITTER/X THREAD: 5-tweet thread, hook + value + CTA with blog link
            2. LINKEDIN POST: Professional angle, 200 words, storytelling format
            3. REDDIT POST: Value-first, no self-promotion feel, which subreddit
            4. INSTAGRAM CAROUSEL: 8 slides (title + 6 tips + CTA), text for each
            5. TIKTOK SCRIPT: 30-second video script derived from main points
        """}]
    )
    return response.content[0].text
```

### Daily Automation Schedule

```python
import schedule
import time

def daily_content_pipeline():
    """Run the full content pipeline daily."""
    # 1. Generate blog post
    post = generate_blog_post(today_topic, today_keyword, products)
    post = insert_affiliate_links(post, affiliate_map)
    url = publish_to_wordpress(today_title, post, WP_URL, WP_USER, WP_PASS)

    # 2. Create social posts
    social = repurpose_blog_to_social(post, today_title)

    # 3. Generate video (if video day — 3x/week)
    if datetime.now().weekday() in [0, 2, 4]:  # Mon, Wed, Fri
        generate_video(today_topic)

    # 4. Weekly newsletter (Friday)
    if datetime.now().weekday() == 4:
        newsletter = generate_newsletter(NICHE, week_topics)
        send_newsletter(subject, newsletter, LIST_ID)

schedule.every().day.at("06:00").do(daily_content_pipeline)

while True:
    schedule.run_pending()
    time.sleep(60)
```

## Revenue Tracking

```python
# Track revenue across channels in a simple SQLite DB
import sqlite3

def init_revenue_db():
    conn = sqlite3.connect('revenue.db')
    conn.execute('''CREATE TABLE IF NOT EXISTS revenue (
        id INTEGER PRIMARY KEY, date TEXT, channel TEXT,
        amount REAL, source TEXT, notes TEXT
    )''')
    return conn

def add_revenue(conn, channel, amount, source):
    conn.execute(
        'INSERT INTO revenue (date, channel, amount, source) VALUES (date("now"), ?, ?, ?)',
        (channel, amount, source)
    )
    conn.commit()

def monthly_report(conn):
    cur = conn.execute('''
        SELECT channel, SUM(amount) as total
        FROM revenue WHERE date >= date("now", "-30 days")
        GROUP BY channel ORDER BY total DESC
    ''')
    return cur.fetchall()
```

## Realistic Timeline

| Month | Focus | Expected Revenue |
|-------|-------|-----------------|
| 1 | Setup + content creation (30 posts, 10 videos) | $0 |
| 2 | Scale content + build email list (500 subs) | $0-50 |
| 3 | First affiliate sales + Shorts monetization | $50-200 |
| 4-6 | SEO traffic grows + consistent video uploads | $200-1,000 |
| 6-12 | Compounding — multiple channels + products | $1,000-5,000 |

## References

- [MoneyPrinterV2](https://github.com/FujiwaraChoki/MoneyPrinterV2) — original inspiration (25k stars)
- [Resend](https://resend.com/) — email API for newsletters
- [WordPress REST API](https://developer.wordpress.org/rest-api/) — auto-publishing
