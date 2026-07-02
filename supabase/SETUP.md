# ScaleUp — User System Setup

One-time setup to enable accounts and the personal library. Until these steps
are done the app runs fine, but Sign-In shows a "not configured" notice.

## 1. Create the Supabase project

1. [supabase.com](https://supabase.com) → **New project** (free tier is fine).
2. Pick a region close to your users and a strong database password.

## 2. Run the schema

1. In the project: **SQL Editor → New query**.
2. Paste the entire contents of [`schema.sql`](./schema.sql) and **Run**.
   - Safe to re-run any time — everything is `if not exists` / `or replace`.
   - This creates: `profiles` (+ auto-create trigger on signup),
     `audio_tabs`, `saved_tabs`, `saved_progressions`,
     `saved_harmonizations`, all RLS policies, and the public `audio`
     storage bucket with per-user folder policies.

## 3. Configure auth providers

**Authentication → Sign In / Up:**

- **Email**: enabled by default. Under **Auth → Emails** you can customize the
  confirmation template. If you prefer no email confirmation, disable
  "Confirm email" (users sign in immediately after signup).
- **Google** (optional): Authentication → Providers → Google → follow the
  wizard (needs a Google Cloud OAuth client; paste its ID + secret).
- **Apple** (optional): same page — requires an Apple Developer account.

**Authentication → URL Configuration:**

- **Site URL**: your production URL (e.g. `https://your-app.vercel.app`).
- **Redirect URLs**: add `http://localhost:5173` for local development.

## 4. Environment variables

From **Project Settings → API** copy:

| Variable | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel env + local `.env` | public by design |
| `VITE_SUPABASE_ANON_KEY` | Vercel env + local `.env` | public by design — RLS guards the data |

Redeploy after adding them. That's it — the Sign In button, the account menu,
and STUDIO → Library light up automatically once both vars are present.

## What the app stores per user

| Table | Written by | Library section |
|---|---|---|
| `saved_tabs` | Tab Builder → Save | My Tabs |
| `saved_harmonizations` | Melody Harmonizer → Save to Library | Harmonized |
| `saved_progressions` | Chord Builder → Save | Progressions |
| `audio_tabs` (+ `audio` bucket) | Audio→Tab → Save | Audio Archive |

Deleting an account (account menu → Delete Account) wipes all of the above,
including uploaded audio files.
