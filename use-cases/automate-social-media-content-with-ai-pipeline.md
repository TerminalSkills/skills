---
title: Automate Social Media Content with an AI Pipeline
slug: automate-social-media-content-with-ai-pipeline
description: Build an automated content pipeline that monitors industry trends, generates platform-optimized posts for LinkedIn, Twitter, and Instagram using AI, creates visual assets, and schedules everything — turning a solo founder's 8-hour weekly content process into a 30-minute review-and-approve workflow.
skills: [twitter-x, linkedin, instagram, openai-realtime, n8n-workflow-sdk]
category: Marketing & Growth
tags: [social-media, content-automation, ai-content, marketing, scheduling, growth]
---

# Automate Social Media Content with an AI Pipeline

Mila is a solo founder running a developer tools startup. She knows she needs to post consistently on LinkedIn (3x/week), Twitter (daily), and Instagram (2x/week) to build brand awareness. But writing posts, creating visuals, and scheduling takes 8 hours every week — time she should be spending on product.

She builds an AI pipeline that monitors her industry, generates drafts, creates matching visuals, and queues everything for review. Her role shifts from content creator to content editor — a 30-minute weekly review instead of 8 hours of writing.

## Step 1: Trend Monitoring and Topic Generation

The pipeline starts by scanning industry sources for what's trending. It checks Hacker News, dev.to, Reddit, and competitor blogs daily, then extracts topics relevant to Mila's niche (developer tools, API design, DevEx).

```python
# trend_monitor.py — Daily trend scanner
import httpx
from openai import OpenAI
from datetime import datetime

client = OpenAI()

async def scan_trends() -> list[dict]:
    """Scan industry sources for trending topics.

    Checks HN, dev.to, and Reddit for discussions with high engagement
    in the developer tools space. Returns 5-8 topic candidates.
    """
    sources = await gather_sources()

    # Ask GPT-4o to identify trending topics from raw data
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": """You are a content strategist for a developer tools startup.
Analyze these industry signals and identify 5-8 trending topics that would resonate
with software developers and engineering leaders. For each topic:
- Title: catchy but not clickbait
- Hook: opening line that stops the scroll
- Angle: unique perspective the founder can take
- Platforms: which platforms this topic works best on (linkedin/twitter/instagram)
- Urgency: hot (post today), warm (post this week), evergreen"""},
            {"role": "user", "content": f"Today's industry signals:\n{format_sources(sources)}"},
        ],
        response_format={"type": "json_object"},
    )

    topics = json.loads(response.choices[0].message.content)["topics"]
    return topics


async def gather_sources() -> dict:
    """Fetch trending content from multiple sources."""
    async with httpx.AsyncClient() as http:
        # Hacker News — top stories with 100+ points
        hn = await http.get("https://hn.algolia.com/api/v1/search", params={
            "tags": "story",
            "numericFilters": "points>100",
            "hitsPerPage": 20,
        })

        # dev.to — top articles this week
        devto = await http.get("https://dev.to/api/articles", params={
            "top": 7, "per_page": 20
        })

        # Reddit — top posts from relevant subs
        reddit = await http.get(
            "https://old.reddit.com/r/programming+webdev+devops/top/.json",
            params={"t": "week", "limit": 20},
            headers={"User-Agent": "ContentBot/1.0"},
        )

    return {"hn": hn.json(), "devto": devto.json(), "reddit": reddit.json()}
```

## Step 2: Platform-Specific Content Generation

Each platform has different norms. LinkedIn rewards storytelling and professional insights. Twitter rewards sharp takes and threads. Instagram rewards visual-first content with concise captions. The pipeline generates platform-native content, not one-size-fits-all reposts.

```python
# content_generator.py — Generate platform-optimized posts
from dataclasses import dataclass

@dataclass
class ContentDraft:
    """A single content draft for one platform.

    Each draft is platform-native — different format, tone, and length.
    """
    topic_id: str
    platform: str                     # "linkedin", "twitter", "instagram"
    content: str                      # Post text
    hashtags: list[str]
    visual_prompt: str                # DALL-E prompt for accompanying image
    best_post_time: str               # ISO datetime for optimal engagement
    content_type: str                 # "carousel", "single", "thread", "story"

async def generate_content(topic: dict) -> list[ContentDraft]:
    """Generate platform-specific content from a trending topic.

    Each platform gets tailored content:
    - LinkedIn: 1200-1500 char story with professional insight
    - Twitter: 280-char hot take + optional thread
    - Instagram: visual concept + 150-word caption

    Args:
        topic: Trending topic dict with title, hook, angle, platforms
    """
    drafts = []

    for platform in topic["platforms"]:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": get_platform_prompt(platform)},
                {"role": "user", "content": f"""
Topic: {topic['title']}
Angle: {topic['angle']}
Hook: {topic['hook']}

Generate a {platform} post. Also generate a DALL-E prompt for an
accompanying visual that matches the post's message."""},
            ],
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        drafts.append(ContentDraft(
            topic_id=topic["id"],
            platform=platform,
            content=result["post"],
            hashtags=result["hashtags"],
            visual_prompt=result["visual_prompt"],
            best_post_time=result["best_time"],
            content_type=result["content_type"],
        ))

    return drafts


def get_platform_prompt(platform: str) -> str:
    """Platform-specific writing guidelines."""
    prompts = {
        "linkedin": """Write a LinkedIn post (1200-1500 chars) in first person.
Structure: hook line → personal story or observation → insight → call to action.
Tone: professional but human. Use line breaks every 1-2 sentences.
NO hashtags in the body. Add 3-5 hashtags separately.
End with a question to drive comments.""",

        "twitter": """Write a tweet (max 280 chars). Sharp, opinionated, specific.
If the topic deserves depth, also write a 5-7 tweet thread.
Start with a bold claim or surprising stat.
Tone: confident, slightly provocative, backed by evidence.
Add 1-2 relevant hashtags max.""",

        "instagram": """Write an Instagram caption (100-150 words).
Start with a hook that makes people stop scrolling.
Break into short paragraphs. Use emoji sparingly (2-3 max).
End with a CTA or question.
Generate a DALL-E prompt for an eye-catching visual —
use bold colors, clean design, think infographic or quote card.
Add 15-20 hashtags (mix of broad and niche).""",
    }
    return prompts[platform]
```

## Step 3: Visual Asset Generation

Every post needs a visual. The pipeline generates images with DALL-E, creates text overlays for quote cards, and formats carousel slides for LinkedIn and Instagram.

```python
# visual_generator.py — Generate visuals for posts
from openai import OpenAI
from PIL import Image, ImageDraw, ImageFont
import io

client = OpenAI()

async def generate_visual(draft: ContentDraft) -> bytes:
    """Generate a platform-appropriate visual for a content draft.

    Args:
        draft: Content draft with visual_prompt and platform info

    Returns:
        PNG image bytes, sized for the target platform
    """
    # Platform-specific dimensions
    sizes = {
        "linkedin": (1200, 627),        # 1.91:1 landscape
        "twitter": (1200, 675),          # 16:9 landscape
        "instagram": (1080, 1080),       # 1:1 square
    }
    width, height = sizes[draft.platform]

    if draft.content_type == "carousel":
        return await generate_carousel(draft)

    # Generate base image with DALL-E
    response = client.images.generate(
        model="dall-e-3",
        prompt=f"{draft.visual_prompt}. Clean, modern design suitable for {draft.platform}. "
               f"Professional, minimal, tech-forward aesthetic. Aspect ratio: {width}:{height}.",
        size="1024x1024",
        quality="standard",
        n=1,
    )

    # Download and resize
    image_url = response.data[0].url
    async with httpx.AsyncClient() as http:
        img_data = await http.get(image_url)

    img = Image.open(io.BytesIO(img_data.content))
    img = img.resize((width, height), Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    img.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
```

## Step 4: Review Queue and Scheduling

All drafts go into a review queue. Mila opens the dashboard Monday morning, spends 30 minutes reviewing the week's content, edits anything that needs adjustment, and hits "Approve." Approved content publishes automatically at optimal times.

```python
# scheduler.py — Content review and scheduling
from datetime import datetime, timedelta
import httpx

class ContentScheduler:
    """Manages the content review queue and publishing schedule.

    Workflow:
    1. AI generates drafts → status: "draft"
    2. Founder reviews → status: "approved" or "rejected"
    3. Scheduler publishes at optimal time → status: "published"
    """

    async def queue_for_review(self, drafts: list[ContentDraft]):
        """Add generated drafts to the review dashboard.

        Drafts include the post text, visual, suggested hashtags,
        and optimal posting time. Founder can edit any field.
        """
        for draft in drafts:
            visual = await generate_visual(draft)
            await self.db.insert({
                "topic_id": draft.topic_id,
                "platform": draft.platform,
                "content": draft.content,
                "hashtags": draft.hashtags,
                "visual": visual,                     # Stored in S3
                "scheduled_time": draft.best_post_time,
                "status": "draft",
                "created_at": datetime.utcnow(),
            })

    async def publish_approved(self):
        """Publish approved content at scheduled times.

        Runs every 15 minutes via cron. Checks for approved posts
        where scheduled_time has passed.
        """
        due_posts = await self.db.find({
            "status": "approved",
            "scheduled_time": {"$lte": datetime.utcnow()},
        })

        for post in due_posts:
            try:
                if post["platform"] == "linkedin":
                    await self.publish_linkedin(post)
                elif post["platform"] == "twitter":
                    await self.publish_twitter(post)
                elif post["platform"] == "instagram":
                    await self.publish_instagram(post)

                await self.db.update(post["_id"], {"status": "published"})
            except Exception as e:
                await self.db.update(post["_id"], {
                    "status": "failed",
                    "error": str(e),
                })

    async def publish_linkedin(self, post: dict):
        """Publish to LinkedIn via API.

        Uses LinkedIn's UGC Post API with image upload.
        Requires: access_token with w_member_social scope.
        """
        async with httpx.AsyncClient() as http:
            # Step 1: Upload image
            image_urn = await self.upload_linkedin_image(http, post["visual"])

            # Step 2: Create post
            await http.post(
                "https://api.linkedin.com/v2/ugcPosts",
                headers={"Authorization": f"Bearer {self.linkedin_token}"},
                json={
                    "author": f"urn:li:person:{self.linkedin_user_id}",
                    "lifecycleState": "PUBLISHED",
                    "specificContent": {
                        "com.linkedin.ugc.ShareContent": {
                            "shareCommentary": {
                                "text": f"{post['content']}\n\n{' '.join('#' + h for h in post['hashtags'])}"
                            },
                            "shareMediaCategory": "IMAGE",
                            "media": [{"status": "READY", "media": image_urn}],
                        }
                    },
                    "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
                },
            )
```

## Results After 60 Days

Mila's content pipeline produces 12 posts per week across three platforms. She spends 30 minutes Monday morning reviewing and editing drafts — down from 8 hours of writing.

The AI pipeline generates content that Mila approves 70% of the time without edits. The remaining 30% needs minor tone adjustments or added personal anecdotes that only she can provide.

Growth metrics after two months:
- **LinkedIn**: 450 → 2,800 followers (+520%), 3 inbound leads from content
- **Twitter**: 1,200 → 3,100 followers (+158%), 2 posts went semi-viral (500+ likes)
- **Instagram**: 200 → 890 followers (+345%), brand awareness with non-developer audience
- **Time saved**: 30 hours/month redirected to product development
- **Content cost**: ~$45/month (OpenAI API + DALL-E generation)
- **Pipeline uptime**: 98.5% — two failures in 60 days (LinkedIn API rate limit, DALL-E timeout)
