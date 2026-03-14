---
title: Build a Gamification System with Points and Badges
slug: build-gamification-system
description: Build a gamification engine with XP points, leveling, achievement badges, streaks, leaderboards, and reward unlocks — driving user engagement through game mechanics.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Full-Stack Development
tags:
  - gamification
  - engagement
  - badges
  - leaderboard
  - retention
---

# Build a Gamification System with Points and Badges

## The Problem

Hana leads product at a 25-person learning platform. Course completion rate is 12%. Users sign up, watch 1-2 lessons, and never return. There's no sense of progress, no reward for consistency, no social proof. Duolingo's streak system keeps users coming back daily — Hana wants the same mechanics for her platform. They need XP for completed lessons, levels that unlock content, badges for achievements, streaks for daily engagement, and a leaderboard for competitive motivation.

## Step 1: Build the Gamification Engine

```typescript
// src/gamification/engine.ts — Points, levels, badges, streaks, and leaderboards
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

// Level thresholds (XP required to reach each level)
const LEVELS = [
  { level: 1, xpRequired: 0, title: "Beginner" },
  { level: 2, xpRequired: 100, title: "Learner" },
  { level: 3, xpRequired: 300, title: "Student" },
  { level: 4, xpRequired: 600, title: "Practitioner" },
  { level: 5, xpRequired: 1000, title: "Skilled" },
  { level: 6, xpRequired: 1500, title: "Advanced" },
  { level: 7, xpRequired: 2500, title: "Expert" },
  { level: 8, xpRequired: 4000, title: "Master" },
  { level: 9, xpRequired: 6000, title: "Grandmaster" },
  { level: 10, xpRequired: 10000, title: "Legend" },
];

// XP rewards for actions
const XP_REWARDS: Record<string, number> = {
  lesson_completed: 25,
  quiz_passed: 50,
  quiz_perfect_score: 100,
  course_completed: 500,
  first_comment: 10,
  helpful_answer: 30,
  daily_login: 5,
  streak_bonus_7: 50,         // 7-day streak bonus
  streak_bonus_30: 200,       // 30-day streak bonus
};

// Achievement badges
interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: (stats: UserStats) => boolean;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

interface UserStats {
  totalXp: number;
  level: number;
  lessonsCompleted: number;
  coursesCompleted: number;
  currentStreak: number;
  longestStreak: number;
  quizzesPassed: number;
  perfectScores: number;
  daysActive: number;
  helpfulAnswers: number;
}

const BADGES: Badge[] = [
  { id: "first_lesson", name: "First Step", description: "Complete your first lesson", icon: "👶", rarity: "common",
    condition: (s) => s.lessonsCompleted >= 1 },
  { id: "ten_lessons", name: "Getting Serious", description: "Complete 10 lessons", icon: "📚", rarity: "common",
    condition: (s) => s.lessonsCompleted >= 10 },
  { id: "hundred_lessons", name: "Centurion", description: "Complete 100 lessons", icon: "🏛️", rarity: "rare",
    condition: (s) => s.lessonsCompleted >= 100 },
  { id: "first_course", name: "Graduate", description: "Complete your first course", icon: "🎓", rarity: "uncommon",
    condition: (s) => s.coursesCompleted >= 1 },
  { id: "five_courses", name: "Scholar", description: "Complete 5 courses", icon: "🎖️", rarity: "rare",
    condition: (s) => s.coursesCompleted >= 5 },
  { id: "streak_7", name: "On Fire", description: "7-day learning streak", icon: "🔥", rarity: "uncommon",
    condition: (s) => s.currentStreak >= 7 },
  { id: "streak_30", name: "Unstoppable", description: "30-day learning streak", icon: "⚡", rarity: "epic",
    condition: (s) => s.currentStreak >= 30 },
  { id: "streak_100", name: "Legendary Commitment", description: "100-day learning streak", icon: "💎", rarity: "legendary",
    condition: (s) => s.longestStreak >= 100 },
  { id: "perfect_quiz", name: "Perfectionist", description: "Get a perfect quiz score", icon: "💯", rarity: "uncommon",
    condition: (s) => s.perfectScores >= 1 },
  { id: "ten_perfect", name: "Flawless", description: "10 perfect quiz scores", icon: "✨", rarity: "epic",
    condition: (s) => s.perfectScores >= 10 },
  { id: "helper", name: "Mentor", description: "Give 10 helpful answers", icon: "🤝", rarity: "rare",
    condition: (s) => s.helpfulAnswers >= 10 },
  { id: "level_10", name: "Legend", description: "Reach level 10", icon: "👑", rarity: "legendary",
    condition: (s) => s.level >= 10 },
];

// Award XP for an action
export async function awardXP(
  userId: string,
  action: string,
  metadata?: Record<string, any>
): Promise<{
  xpAwarded: number;
  totalXp: number;
  leveledUp: boolean;
  newLevel: number | null;
  newBadges: Badge[];
  streakUpdated: boolean;
}> {
  const xp = XP_REWARDS[action];
  if (!xp) return { xpAwarded: 0, totalXp: 0, leveledUp: false, newLevel: null, newBadges: [], streakUpdated: false };

  // Apply streak multiplier
  const streak = await updateStreak(userId);
  const multiplier = streak >= 30 ? 1.5 : streak >= 7 ? 1.2 : 1.0;
  const adjustedXp = Math.round(xp * multiplier);

  // Update user XP
  const { rows: [user] } = await pool.query(
    `UPDATE user_gamification SET
       total_xp = total_xp + $2,
       ${action.includes("lesson") ? "lessons_completed = lessons_completed + 1," : ""}
       ${action.includes("course") ? "courses_completed = courses_completed + 1," : ""}
       ${action === "quiz_passed" ? "quizzes_passed = quizzes_passed + 1," : ""}
       ${action === "quiz_perfect_score" ? "perfect_scores = perfect_scores + 1," : ""}
       updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [userId, adjustedXp]
  );

  // Check level up
  const currentLevel = calculateLevel(user.total_xp - adjustedXp);
  const newLevel = calculateLevel(user.total_xp);
  const leveledUp = newLevel > currentLevel;

  if (leveledUp) {
    await pool.query("UPDATE user_gamification SET level = $2 WHERE user_id = $1", [userId, newLevel]);
  }

  // Check new badges
  const stats = userRowToStats(user);
  stats.level = newLevel;
  const newBadges = await checkBadges(userId, stats);

  // Update leaderboard
  await redis.zadd("leaderboard:weekly", user.total_xp, userId);
  await redis.zadd("leaderboard:alltime", user.total_xp, userId);

  // Streak bonuses
  if (streak === 7) await awardXP(userId, "streak_bonus_7");
  if (streak === 30) await awardXP(userId, "streak_bonus_30");

  return {
    xpAwarded: adjustedXp,
    totalXp: user.total_xp,
    leveledUp,
    newLevel: leveledUp ? newLevel : null,
    newBadges,
    streakUpdated: true,
  };
}

// Streak tracking
async function updateStreak(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const key = `streak:${userId}`;
  const lastActive = await redis.hget(key, "lastActive");

  if (lastActive === today) {
    // Already active today
    return parseInt(await redis.hget(key, "current") || "0");
  }

  let newStreak: number;
  if (lastActive === yesterday) {
    newStreak = parseInt(await redis.hget(key, "current") || "0") + 1;
  } else {
    newStreak = 1; // streak broken
  }

  await redis.hset(key, { lastActive: today, current: String(newStreak) });

  // Update longest streak
  const longest = parseInt(await redis.hget(key, "longest") || "0");
  if (newStreak > longest) {
    await redis.hset(key, "longest", String(newStreak));
    await pool.query("UPDATE user_gamification SET longest_streak = $2, current_streak = $2 WHERE user_id = $1", [userId, newStreak]);
  } else {
    await pool.query("UPDATE user_gamification SET current_streak = $2 WHERE user_id = $1", [userId, newStreak]);
  }

  return newStreak;
}

// Get leaderboard
export async function getLeaderboard(
  period: "weekly" | "monthly" | "alltime",
  limit: number = 20
): Promise<Array<{ rank: number; userId: string; username: string; xp: number; level: number; avatar: string }>> {
  const key = `leaderboard:${period}`;
  const entries = await redis.zrevrange(key, 0, limit - 1, "WITHSCORES");

  const results = [];
  for (let i = 0; i < entries.length; i += 2) {
    const userId = entries[i];
    const xp = parseInt(entries[i + 1]);
    const { rows: [user] } = await pool.query(
      "SELECT username, avatar_url FROM users WHERE id = $1", [userId]
    );
    results.push({
      rank: i / 2 + 1, userId, username: user?.username || "Unknown",
      xp, level: calculateLevel(xp), avatar: user?.avatar_url || "",
    });
  }

  return results;
}

async function checkBadges(userId: string, stats: UserStats): Promise<Badge[]> {
  const { rows: earned } = await pool.query(
    "SELECT badge_id FROM user_badges WHERE user_id = $1",
    [userId]
  );
  const earnedIds = new Set(earned.map((r) => r.badge_id));
  const newBadges: Badge[] = [];

  for (const badge of BADGES) {
    if (!earnedIds.has(badge.id) && badge.condition(stats)) {
      await pool.query(
        "INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES ($1, $2, NOW())",
        [userId, badge.id]
      );
      newBadges.push(badge);
    }
  }

  return newBadges;
}

function calculateLevel(xp: number): number {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xpRequired) return LEVELS[i].level;
  }
  return 1;
}

function userRowToStats(row: any): UserStats {
  return {
    totalXp: row.total_xp, level: row.level || 1,
    lessonsCompleted: row.lessons_completed, coursesCompleted: row.courses_completed,
    currentStreak: row.current_streak, longestStreak: row.longest_streak,
    quizzesPassed: row.quizzes_passed, perfectScores: row.perfect_scores,
    daysActive: row.days_active || 0, helpfulAnswers: row.helpful_answers || 0,
  };
}
```

## Results

- **Course completion rate: 12% → 38%** — XP rewards and level progression create a sense of accomplishment; users complete courses to reach the next level
- **Daily active users up 65%** — streak system (+ multiplier bonus) motivates daily returns; breaking a 30-day streak feels like losing something real
- **Referral-driven growth** — leaderboard creates social proof; users share their badges and levels on social media; "I reached Expert level!" drives organic signups
- **Badge rarity drives aspiration** — only 2% of users have the "Legendary Commitment" badge (100-day streak); rarity makes it worth pursuing
- **Community engagement doubled** — "Mentor" badge rewards helpful answers; users actively help others to earn the badge
