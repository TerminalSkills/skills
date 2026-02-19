---
name: auth0
description: >-
  Add authentication and authorization with Auth0. Use when a user asks to add
  login to an app, implement social login, set up SSO, manage user roles and
  permissions, add MFA, or integrate identity management. Covers Universal Login,
  SDKs, social connections, RBAC, Actions, and machine-to-machine auth.
license: Apache-2.0
compatibility: 'Any web framework, React, Next.js, Node.js, Python'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: auth
  tags:
    - auth0
    - authentication
    - authorization
    - sso
    - social-login
    - identity
---

# Auth0

## Overview

Auth0 is a managed identity platform providing authentication (login, social, SSO, MFA) and authorization (roles, permissions, RBAC). It supports 30+ social connections (Google, GitHub, Apple), enterprise SSO (SAML, OIDC), and customizable login pages.

## Instructions

### Step 1: Next.js Integration

```bash
npm install @auth0/nextjs-auth0
```

```typescript
// app/api/auth/[auth0]/route.ts — Auth0 route handler
import { handleAuth } from '@auth0/nextjs-auth0'
export const GET = handleAuth()
// Creates: /api/auth/login, /api/auth/logout, /api/auth/callback, /api/auth/me
```

```typescript
// app/layout.tsx — Wrap app with UserProvider
import { UserProvider } from '@auth0/nextjs-auth0/client'
export default function RootLayout({ children }) {
  return <html><body><UserProvider>{children}</UserProvider></body></html>
}
```

```typescript
// app/dashboard/page.tsx — Protected page
import { withPageAuthRequired, getSession } from '@auth0/nextjs-auth0'
export default withPageAuthRequired(async function Dashboard() {
  const session = await getSession()
  return <h1>Welcome, {session?.user.name}</h1>
})
```

### Step 2: React SPA

```typescript
// App.tsx — Auth0 React SDK
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'

function App() {
  return (
    <Auth0Provider domain="YOUR_DOMAIN" clientId="YOUR_CLIENT_ID" authorizationParams={{ redirect_uri: window.location.origin }}>
      <MainApp />
    </Auth0Provider>
  )
}

function MainApp() {
  const { isAuthenticated, loginWithRedirect, logout, user } = useAuth0()
  if (!isAuthenticated) return <button onClick={loginWithRedirect}>Log In</button>
  return <div>Hello {user?.name} <button onClick={() => logout()}>Log Out</button></div>
}
```

### Step 3: Protect API Routes

```typescript
// middleware/auth.ts — Validate JWT from Auth0
import { auth } from 'express-oauth2-jwt-bearer'
const checkJwt = auth({
  audience: 'https://api.myapp.com',
  issuerBaseURL: 'https://YOUR_DOMAIN.auth0.com/',
})
app.get('/api/protected', checkJwt, (req, res) => {
  res.json({ data: 'secret' })
})
```

### Step 4: Roles and Permissions

```bash
# Configure RBAC in Auth0 Dashboard:
# 1. Create API → enable RBAC and "Add Permissions in the Access Token"
# 2. Create roles (admin, editor, viewer) with permissions
# 3. Assign roles to users
```

```typescript
// Check permissions in your API
app.delete('/api/posts/:id', checkJwt, (req, res) => {
  const permissions = req.auth?.payload.permissions || []
  if (!permissions.includes('delete:posts')) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  // Delete post...
})
```

## Guidelines

- Use Universal Login (redirect to Auth0-hosted page) instead of embedded login — it's more secure and easier to customize.
- Free tier: 7,500 active users, unlimited logins — sufficient for most startups.
- Use Actions (serverless hooks) to customize login flow: enrich tokens, block suspicious logins, sync to your database.
- Always validate JWTs server-side — never trust client-side auth state for API access.
