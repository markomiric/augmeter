# Google OAuth 2.0 Setup Guide

Step-by-step guide for creating Google OAuth credentials for web applications.

---

## Step 1: Access Google Cloud Console

Open: https://console.cloud.google.com/

---

## Step 2: Create or Select Project

1. Click the **project dropdown** (top left, next to "Google Cloud")
2. Click **New Project**
3. Enter project name (e.g., `My App Name`)
4. Click **Create**
5. Select the new project from the dropdown

---

## Step 3: Configure OAuth Consent Screen

1. Navigate to **APIs & Services** → **OAuth consent screen**
2. Select **External** (for public apps) → Click **Create**
3. Fill in required fields:
   - **App name**: Your application name
   - **User support email**: Your email address
   - **Developer contact email**: Your email address
4. Click **Save and Continue**
5. **Scopes page**: Click **Save and Continue** (skip - defaults are fine)
6. **Test users page**: Click **Save and Continue** (skip for now)
7. Click **Back to Dashboard**

---

## Step 4: Create OAuth Credentials

1. Navigate to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Configure:
   - **Application type**: `Web application`
   - **Name**: Descriptive name (e.g., `MyApp Production`)
4. Add **Authorized JavaScript origins**:
   ```
   https://yourdomain.com
   ```
5. Add **Authorized redirect URIs**:
   ```
   https://yourdomain.com/api/auth/callback/google
   ```
6. Click **Create**

---

## Step 5: Copy Credentials

A popup displays your credentials:

| Field             | Environment Variable |
| ----------------- | -------------------- |
| **Client ID**     | `AUTH_GOOGLE_ID`     |
| **Client Secret** | `AUTH_GOOGLE_SECRET` |

---

## Environment Variables

```env
AUTH_GOOGLE_ID=your-client-id.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-your-secret
```

---

## Common Redirect URI Patterns

| Library         | Redirect URI Pattern        |
| --------------- | --------------------------- |
| **BetterAuth**  | `/api/auth/callback/google` |
| **NextAuth.js** | `/api/auth/callback/google` |
| **Auth.js**     | `/api/auth/callback/google` |
| **Passport.js** | `/auth/google/callback`     |

---

## Multiple Environments

Add multiple URIs for dev/staging/production:

**JavaScript Origins:**

```
http://localhost:3000
https://yourdomain.com
```

**Redirect URIs:**

```
http://localhost:3000/api/auth/callback/google
https://yourdomain.com/api/auth/callback/google
```

---

## Troubleshooting

| Error                   | Solution                                                       |
| ----------------------- | -------------------------------------------------------------- |
| `redirect_uri_mismatch` | Ensure redirect URI exactly matches (including trailing slash) |
| `Access blocked`        | Publish app or add user to test users                          |
| `Invalid client`        | Check Client ID is correct                                     |
| `Origin not allowed`    | Add domain to Authorized JavaScript origins                    |
