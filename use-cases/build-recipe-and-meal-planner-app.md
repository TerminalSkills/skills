---
title: "Build a Recipe Manager and AI Meal Planner"
description: "Build a personal recipe hub with AI meal planning, automatic shopping list aggregation, nutrition calculation, and recipe import from any URL."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "9 hours"
tags: [recipes, meal-planning, nutrition, ai, shopping-list, food, productivity]
---

# Build a Recipe Manager and AI Meal Planner

You have 200 saved URLs across browser bookmarks, a notes app, and that one Instagram post you screenshotted. Every Sunday you stare at your fridge and order UberEats because meal planning is a whole thing. Build one app that stores your recipes, generates meal plans, and builds your shopping list automatically.

## What You'll Build

- Recipe storage: ingredients, steps, photos, cook time, ratings
- AI meal planner: generate a week of meals based on preferences + what's in your fridge
- Shopping list: auto-aggregate ingredients from the meal plan
- Nutrition calculation per recipe and per day
- Recipe scraper: import recipes from any URL

## Schema

```typescript
// prisma/schema.prisma
model User {
  id            String       @id @default(cuid())
  email         String       @unique
  name          String
  dietaryPrefs  String[]     @default([]) // vegetarian, gluten-free, keto, etc.
  dislikedFoods String[]     @default([])
  recipes       Recipe[]
  mealPlans     MealPlan[]
  pantry        PantryItem[]
  createdAt     DateTime     @default(now())
}

model Recipe {
  id           String         @id @default(cuid())
  userId       String
  user         User           @relation(fields: [userId], references: [id])
  title        String
  description  String?
  imageUrl     String?
  sourceUrl    String?
  prepTimeMins Int?
  cookTimeMins Int?
  servings     Int            @default(2)
  rating       Int?           @default(0) // 0-5
  isFavorite   Boolean        @default(false)
  tags         String[]       @default([])
  cuisine      String?
  ingredients  Ingredient[]
  steps        RecipeStep[]
  mealEntries  MealPlanEntry[]
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
}

model Ingredient {
  id         String  @id @default(cuid())
  recipeId   String
  recipe     Recipe  @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  name       String
  amount     Float?
  unit       String?
  notes      String?
  calories   Float?
  proteinG   Float?
  carbsG     Float?
  fatG       Float?
  order      Int     @default(0)
}

model RecipeStep {
  id         String  @id @default(cuid())
  recipeId   String
  recipe     Recipe  @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  stepNumber Int
  instruction String
  timerMins  Int?
  imageUrl   String?
}

model MealPlan {
  id         String         @id @default(cuid())
  userId     String
  user       User           @relation(fields: [userId], references: [id])
  weekStart  DateTime       @db.Date
  entries    MealPlanEntry[]
  shoppingList ShoppingListItem[]
  createdAt  DateTime       @default(now())
}

model MealPlanEntry {
  id         String   @id @default(cuid())
  planId     String
  plan       MealPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  recipeId   String
  recipe     Recipe   @relation(fields: [recipeId], references: [id])
  dayOfWeek  Int      // 0=Mon, 6=Sun
  mealType   String   // breakfast | lunch | dinner | snack
  servings   Int      @default(2)
}

model ShoppingListItem {
  id         String   @id @default(cuid())
  planId     String
  plan       MealPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  name       String
  amount     Float?
  unit       String?
  category   String?  // produce | dairy | meat | pantry | frozen
  isChecked  Boolean  @default(false)
}

model PantryItem {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  name       String
  quantity   Float?
  unit       String?
  expiresAt  DateTime?
}
```

## Recipe Scraper (Import from URL)

```typescript
// lib/recipe-scraper.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function importRecipeFromUrl(url: string, userId: string) {
  // Fetch the page
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0)' },
  })
  const html = await response.text()

  // Strip HTML tags for cleaner text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 8000) // stay within token limits

  const aiResponse = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Extract the recipe from this webpage text and return it as JSON.

Text: ${text}

Return JSON:
{
  "title": "...",
  "description": "...",
  "prepTimeMins": 15,
  "cookTimeMins": 30,
  "servings": 4,
  "cuisine": "Italian",
  "tags": ["pasta", "quick"],
  "ingredients": [{"name": "spaghetti", "amount": 200, "unit": "g"}],
  "steps": [{"stepNumber": 1, "instruction": "Boil water..."}]
}

Only return the JSON object.`,
    }],
  })

  const content = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : ''
  const data = JSON.parse(content.match(/\{[\s\S]+\}/)?.[0] || '{}')

  return prisma.recipe.create({
    data: {
      userId,
      title: data.title,
      description: data.description,
      sourceUrl: url,
      prepTimeMins: data.prepTimeMins,
      cookTimeMins: data.cookTimeMins,
      servings: data.servings || 2,
      cuisine: data.cuisine,
      tags: data.tags || [],
      ingredients: { create: data.ingredients || [] },
      steps: { create: data.steps || [] },
    },
    include: { ingredients: true, steps: true },
  })
}
```

## AI Meal Planner

```typescript
// lib/meal-planner.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function generateWeeklyMealPlan(userId: string, preferences?: {
  calorieTarget?: number
  mealsPerDay?: number
  excludeRecipeIds?: string[]
}) {
  const [user, savedRecipes, pantry] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.recipe.findMany({
      where: { userId, id: { notIn: preferences?.excludeRecipeIds || [] } },
      select: { id: true, title: true, cuisine: true, cookTimeMins: true, tags: true, servings: true },
    }),
    prisma.pantryItem.findMany({ where: { userId }, select: { name: true } }),
  ])

  const recipeList = savedRecipes
    .map(r => `- [${r.id}] ${r.title} (${r.cuisine || 'any'}, ${r.cookTimeMins || '?'} min)`)
    .join('\n')

  const pantryList = pantry.map(p => p.name).join(', ')

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Create a 7-day meal plan using these saved recipes.

Dietary preferences: ${user?.dietaryPrefs.join(', ') || 'none'}
Foods to avoid: ${user?.dislikedFoods.join(', ') || 'none'}
Pantry items available: ${pantryList || 'unknown'}
Calorie target: ${preferences?.calorieTarget || 'not specified'}
Meals per day: ${preferences?.mealsPerDay || 3}

Available recipes:
${recipeList}

Return JSON array of meal plan entries:
[
  {"dayOfWeek": 0, "mealType": "breakfast", "recipeId": "...", "servings": 2},
  {"dayOfWeek": 0, "mealType": "lunch", "recipeId": "...", "servings": 2},
  ...
]

Use recipeId exactly as shown. Distribute recipes across the week for variety. Day 0 = Monday.`,
    }],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const entries = JSON.parse(content.match(/\[[\s\S]+\]/)?.[0] || '[]')

  const weekStart = getMonday(new Date())

  const plan = await prisma.mealPlan.create({
    data: {
      userId,
      weekStart,
      entries: { create: entries },
    },
    include: { entries: { include: { recipe: { include: { ingredients: true } } } } },
  })

  // Auto-generate shopping list
  await generateShoppingList(plan)

  return plan
}

function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}
```

## Shopping List Aggregation

```typescript
// lib/shopping.ts
export async function generateShoppingList(plan: any) {
  const allIngredients: { name: string; amount: number; unit: string }[] = []

  for (const entry of plan.entries) {
    const scaleFactor = entry.servings / entry.recipe.servings
    for (const ing of entry.recipe.ingredients) {
      allIngredients.push({
        name: ing.name.toLowerCase().trim(),
        amount: (ing.amount || 0) * scaleFactor,
        unit: ing.unit || '',
      })
    }
  }

  // Aggregate: sum quantities of same ingredient+unit combos
  const aggregated = allIngredients.reduce((acc, ing) => {
    const key = `${ing.name}|${ing.unit}`
    if (!acc[key]) acc[key] = { ...ing, amount: 0 }
    acc[key].amount += ing.amount
    return acc
  }, {} as Record<string, any>)

  const CATEGORIES: Record<string, string[]> = {
    produce: ['tomato', 'onion', 'garlic', 'lemon', 'lettuce', 'spinach', 'carrot', 'pepper', 'potato'],
    dairy: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'egg'],
    meat: ['chicken', 'beef', 'pork', 'salmon', 'tuna', 'shrimp'],
    pantry: ['oil', 'flour', 'sugar', 'salt', 'pasta', 'rice', 'sauce', 'vinegar'],
  }

  const items = Object.values(aggregated).map((item: any) => ({
    planId: plan.id,
    name: item.name,
    amount: item.amount || null,
    unit: item.unit || null,
    category: Object.entries(CATEGORIES).find(([, keywords]) =>
      keywords.some(k => item.name.includes(k))
    )?.[0] || 'other',
  }))

  await prisma.shoppingListItem.createMany({ data: items })
  return items
}
```

## Key Features Summary

- **Recipe scraper**: one-click import from NYT Cooking, Serious Eats, AllRecipes
- **AI meal planning**: Claude considers preferences, pantry, and variety
- **Smart shopping list**: aggregates ingredients, deduplicates across recipes
- **Nutrition per recipe**: calories, macros from ingredient data
- **Pantry tracker**: subtract ingredients you already have from the shopping list

## Extensions to Consider

- **Instacart / grocery delivery** integration for one-click cart fill
- **Recipe scaling**: adjust servings, recalculate ingredients automatically
- **Leftover optimizer**: plan meals that reuse leftover ingredients
- **Family profiles**: track everyone's preferences and allergens
- **Cook mode**: step-by-step UI with timers, screen stays on
