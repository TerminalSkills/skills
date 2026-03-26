---
name: find-community
description: >-
  Find and build a community around your product — identify where your users gather, engage
  authentically, and grow a loyal user base. Use when: building community-led growth, finding
  early adopters, creating a brand community.
license: MIT
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: [community, growth, engagement, users, startup]
  use-cases:
    - "Find the online communities where your target users hang out"
    - "Create a community engagement strategy for a developer tool"
    - "Build a brand community from scratch"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Find Community

## Overview

Help founders identify and engage with the communities that will become the foundation of their business. Based on the philosophy of The Minimalist Entrepreneur by Sahil Lavingia. The core insight: start with community, not with a product idea. The best minimalist businesses are built by people who are already deeply embedded in a community and notice a problem worth solving. You don't "find" a community — you already belong to several.

## Instructions

### Identify Your Communities

Walk the user through these questions:

1. **What communities are you already a part of?** Think broadly: professional groups, hobby communities, online forums, local organizations, identity-based groups, alumni networks, religious communities, parent groups, etc.
2. **Where do you spend your time online?** Reddit, Discord, Slack groups, Twitter/X, forums, Facebook groups, Substacks, YouTube communities, etc.
3. **What problems do you hear people complain about repeatedly?** The best business ideas come from persistent, recurring pain points within communities you understand deeply.
4. **Which of these communities would you be excited to serve for years?** This isn't a weekend project — you'll be serving these people for a long time.

### Evaluate Each Community

For each potential community, assess:

- **Are you a genuine member?** You should understand the community's language, values, and culture. You should be contributing, not just lurking.
- **Is the problem painful enough that people would pay for a solution?** Not every problem is a business. The bar is: would people exchange money for this?
- **Can you reach these people?** Do you know where they gather? Can you contact them directly?
- **Is the community large enough but not too large?** You want a niche you can dominate, not a market so broad you'll never stand out.

### Output Format

Help the user narrow down to 1-3 communities they could realistically serve, with specific problems identified in each. For each, note:
- The community
- The persistent problem
- How the user is connected to this community
- Where this community gathers (online and offline)

## Examples

### Example 1: Developer Building a Side Project

**User prompt:** "I'm a senior Rails developer. I spend a lot of time on Ruby-related Reddit, the Rails Discord, and GoRails. I also play in a recreational soccer league and am active in my city's tech meetup scene. Help me find my community."

**Expected output:**

Based on your involvement, here are your strongest community fits:

**Community 1: Rails Developers (Primary Recommendation)**
- *Persistent problem:* Deploying Rails apps is still unnecessarily painful. Heroku got expensive, and alternatives like Render/Fly require config that most Rails devs find frustrating. People constantly ask "where should I deploy my Rails app now?"
- *Your connection:* Senior Rails developer, active on Reddit/Discord/GoRails — you speak the language and understand the pain firsthand.
- *Where they gather:* r/rails (45k members), Rails Discord (~8k active), GoRails community, RailsConf, local Ruby meetups.
- *Assessment:* Strong fit. You're a genuine insider, the problem is persistent, and you can reach these people directly.

**Community 2: Local Tech Meetup Organizers**
- *Persistent problem:* Coordinating speakers, venues, and RSVPs across multiple platforms (Meetup.com fees, Eventbrite limitations).
- *Your connection:* Active attendee, but not an organizer — you'd need to go deeper.
- *Where they gather:* Meetup.com, local Slack groups, in-person events.
- *Assessment:* Moderate fit. You're adjacent but not central. Would need 3-6 months of deeper involvement before building here.

**Recommendation:** Focus on the Rails developer community. You're already a pillar there. Start paying attention to the deployment and infrastructure complaints — that's where the business opportunity lives.

### Example 2: Non-Technical Founder

**User prompt:** "I'm a yoga instructor who also does bookkeeping for small studios. I'm in several yoga teacher Facebook groups, I attend yoga conferences, and I run a small WhatsApp group of studio owners in my city. I want to start a business but I'm not technical."

**Expected output:**

**Community 1: Small Yoga Studio Owners (Primary Recommendation)**
- *Persistent problem:* Managing class schedules, memberships, and payments with cobbled-together tools (Mindbody is expensive, spreadsheets break, Venmo is unprofessional). Studio owners constantly ask "what software should I use?" in Facebook groups.
- *Your connection:* You literally do bookkeeping for studios — you see the financial chaos firsthand. You run a WhatsApp group of owners. You're an insider.
- *Where they gather:* Facebook groups (Yoga Studio Owners, Yoga Teachers Community — 50k+ members combined), yoga conferences (Yoga Journal LIVE, Wanderlust), local WhatsApp/text groups.
- *Assessment:* Excellent fit. You understand both the yoga side and the business/financial side. That's rare and valuable.

**Community 2: Freelance Yoga Teachers**
- *Persistent problem:* Finding consistent class slots, managing substitutions, getting paid on time by studios.
- *Your connection:* You are one. You understand the hustle.
- *Where they gather:* Same Facebook groups, plus Instagram DM networks, local teacher circles.
- *Assessment:* Good fit but lower willingness to pay — freelance teachers have tight budgets compared to studio owners.

**Recommendation:** Focus on yoga studio owners. You have unique credibility (instructor + bookkeeper), direct access (WhatsApp group), and they have budget for tools. Start by asking your WhatsApp group: "What's the most annoying part of running your studio?"

## Guidelines

- Never suggest a community the user has no genuine connection to — authenticity is non-negotiable
- Discourage targeting overly broad audiences (e.g., "all small business owners")
- The user should be able to name specific people in the community, not just describe demographics
- Prioritize communities where the user is already contributing, not just consuming
- Watch for anti-patterns: inventing a community from scratch, choosing purely for market size, or skipping participation to jump straight to selling
- A good community fit means the user could serve these people for years without burning out
