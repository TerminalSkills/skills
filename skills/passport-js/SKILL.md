---
name: passport-js
description: >-
  Passport.js is authentication middleware for Express and other Node.js frameworks, with strategies for local passwords, Google, GitHub and many other providers. Use when implementing
  login with Google/GitHub/email, OAuth, session auth, or social login.
license: Apache-2.0
compatibility: 'Express, Node.js'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/jaredhanson/passport
  category: development
  tags: [passport, authentication, oauth, express, social-login]
---

# Passport.js

## Overview

Passport.js is Express-compatible authentication middleware with 480+ strategies (Google, GitHub, Facebook, SAML, LDAP, local). Login state is kept in a session by default; stateless JWT strategies exist too. Checked against passport 0.7.0, passport-local 1.0.0, passport-google-oauth20 2.0.0 and Express 5.

## Instructions

### Step 1: Install and wire up sessions

```bash
npm install express express-session passport passport-local passport-google-oauth20 bcrypt
npm install --save-dev @types/passport @types/passport-local @types/passport-google-oauth20 @types/express-session
```

```typescript
import express from 'express'
import session from 'express-session'
import passport from 'passport'

const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
}))
app.use(passport.authenticate('session'))
```

Behind a reverse proxy also set `app.set('trust proxy', 1)`, otherwise secure cookies and the OAuth callback URL break.

### Step 2: Local Strategy

```typescript
import passport from 'passport'
import { Strategy as LocalStrategy } from 'passport-local'
import bcrypt from 'bcrypt'

passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    const user = await db.users.findByEmail(email)
    if (!user) return done(null, false, { message: 'No account' })
    if (!await bcrypt.compare(password, user.passwordHash)) return done(null, false)
    return done(null, user)
  }
))

passport.serializeUser((user: any, cb) => process.nextTick(() => cb(null, user.id)))
passport.deserializeUser((id: string, cb) => {
  db.users.findById(id).then((user) => cb(null, user), cb)
})
```

### Step 3: Google OAuth

```typescript
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: '/auth/google/callback', // must match the authorized redirect URI in the Google console
}, async (accessToken, refreshToken, profile, done) => {
  let user = await db.users.findByOAuthId('google', profile.id)
  if (!user) user = await db.users.create({
    email: profile.emails?.[0]?.value,   // may be undefined; handle it
    name: profile.displayName,
    oauthProvider: 'google', oauthId: profile.id,
  })
  return done(null, user)
}))
```

### Step 4: Routes

```typescript
app.post('/login', passport.authenticate('local', {
  successRedirect: '/dashboard', failureRedirect: '/login',
}))
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }))
app.get('/auth/google/callback', passport.authenticate('google', {
  successRedirect: '/dashboard', failureRedirect: '/login',
}))
// Passport 0.6+ needs a callback, and logout should be POST
app.post('/logout', (req, res, next) => {
  req.logout((err) => (err ? next(err) : res.redirect('/')))
})
// Protect pages
const requireLogin = (req, res, next) => (req.isAuthenticated() ? next() : res.redirect('/login'))
app.get('/dashboard', requireLogin, (req, res) => res.send(`Hello ${req.user.name}`))
```

For GitHub use `passport-github2`; other strategies are listed at passportjs.org.

## Examples

**Request:** "Add email and password login to my Express app."
Install the packages in Step 1, add the local strategy and `POST /login`. Posting `email=maria@northwind.dev&password=...` with a correct password answers `302 Location: /dashboard` and sets a session cookie; `GET /dashboard` then returns the page, and after `POST /logout` it redirects to `/login`.

**Request:** "Let users sign in with Google."
Create an OAuth client in the Google Cloud console, put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and add the Step 3 strategy. `GET /auth/google` answers `302` to `https://accounts.google.com/o/oauth2/v2/auth?...`.

## Guidelines

- Hash passwords with bcrypt (cost 12+). Never store plaintext.
- Use express-session with a persistent store (Redis, for example) in production; the default MemoryStore leaks memory and loses sessions on restart.
- Passport 0.6+ regenerates the session on login (session fixation protection) and `req.logout()` requires a callback; old snippets that call it without one fail.
- Read `SESSION_SECRET` and OAuth secrets from the environment, never from source.
- Implement CSRF protection with session-based auth.
- Link accounts: let users connect multiple OAuth providers to one account.
