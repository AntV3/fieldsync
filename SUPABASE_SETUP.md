# FieldSync — Supabase Setup Guide

This is a one-time setup. Takes about 10 minutes.

---

## Step 1 — Create a Supabase Account and Project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **New Project**
3. Fill in:
   - **Name:** `fieldsync` (or whatever you like)
   - **Database Password:** create a strong password and save it somewhere
   - **Region:** pick the one closest to your users (US East is a safe default)
4. Click **Create new project** and wait ~2 minutes for it to initialize

---

## Step 2 — Run the Database Setup

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `database/FULL_SETUP.sql` from this repo
4. Copy the entire contents and paste it into the SQL editor
5. Click **Run** (or press Cmd/Ctrl + Enter)

> This runs all 57 migrations in the correct order. It should complete in a few seconds with no errors.

---

## Step 3 — Enable Storage

FieldSync uses Supabase Storage for photos (T&M tickets, CORs, field uploads).

1. In the left sidebar, click **Storage**
2. Click **New bucket**
3. Create the following buckets:

| Bucket Name       | Public? |
|-------------------|---------|
| `tm-photos`       | No      |
| `cor-photos`      | No      |
| `field-uploads`   | No      |
| `documents`       | No      |
| `branding`        | Yes     |

> All photo buckets should be **private** (access controlled via RLS). Only `branding` (company logos) should be public.

---

## Step 4 — Get Your API Keys

1. In the left sidebar, click **Settings** → **API**
2. Copy:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long JWT string starting with `eyJ...`

---

## Step 5 — Create Your `.env` File

In the root of this project, create a file called `.env`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
```

Replace the placeholder values with what you copied in Step 4.

> `.env` is already in `.gitignore` — it will never be accidentally committed.

---

## Step 6 — Enable Realtime

FieldSync uses realtime subscriptions so field updates appear instantly in the office dashboard.

1. In the left sidebar, click **Database** → **Replication**
2. Make sure the following tables have realtime enabled:
   - `areas`
   - `field_sessions`
   - `projects`

> If you don't see a toggle for a table, it means realtime isn't enabled for it yet. Toggle it on.

---

## Step 7 — Test Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. You should be able to:
- Sign up for an account
- Create a company
- Create a project

---

## Step 8 — Deploy to Vercel

1. Push this repo to GitHub (if not already there)
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click **Add New Project** → import your GitHub repo
4. In the **Environment Variables** section, add:
   - `VITE_SUPABASE_URL` → your project URL
   - `VITE_SUPABASE_ANON_KEY` → your anon key
5. Click **Deploy**

Vercel will build and deploy automatically. Your app will be live at `your-project.vercel.app`.

---

## Optional — Custom Domain

1. Buy a domain (Namecheap, Google Domains, Cloudflare — all ~$12/year for a .com)
2. In Vercel, go to your project → **Settings** → **Domains**
3. Add your domain and follow the DNS instructions (usually just adding a CNAME record)

---

## Optional — Email Notifications (Resend)

FieldSync can send email notifications for membership approvals and invites.

1. Sign up at [resend.com](https://resend.com) (free: 3,000 emails/month)
2. Create an API key
3. Add to your `.env`:
   ```env
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   EMAIL_FROM=FieldSync <noreply@yourdomain.com>
   ```
4. For production, add these as environment variables in Vercel too

---

## Troubleshooting

**SQL setup fails mid-way:**
- The script uses `IF NOT EXISTS` everywhere, so it's safe to run again
- Re-run the full `FULL_SETUP.sql` — it will skip anything already created

**App loads but shows blank / auth errors:**
- Double-check your `.env` values — a missing character in the anon key is the most common issue
- Make sure the project URL doesn't have a trailing slash

**Photos not loading:**
- Verify the storage buckets were created with the exact names listed in Step 3
- Check that the buckets are set to private (not public)

**Realtime not working:**
- Go to Database → Replication and verify the tables are enabled

---

## Cost Summary

| What | Cost |
|------|------|
| Supabase (free tier) | $0/month — enough for early users |
| Vercel (hobby tier) | $0/month |
| Domain name | ~$12/year |
| Supabase Pro (when you outgrow free) | $25/month |
| Vercel Pro (when you go commercial) | $20/month |

**You can launch for $12/year until you have real revenue.**
