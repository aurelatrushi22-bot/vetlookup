# Vetlookup — Deployment Guide (no coding required)

Follow these steps in order. Total time: ~15 minutes. Everything below is free
except a small, pay-as-you-go cost for the Anthropic API (usually pennies
while testing — see Step 2).

---

## Step 1 — Create a free GitHub account (skip if you have one)

1. Go to https://github.com/signup
2. Create an account.

## Step 2 — Get an Anthropic API key

This is the one piece that isn't free-free: the API key lets your app "call"
Claude, and Anthropic charges per use (typically a fraction of a cent per
lookup with this app). New accounts usually get a small free credit to start.

1. Go to https://console.anthropic.com and sign up / log in.
2. Add a small amount of credit (e.g. $5) under **Billing**.
3. Go to **API Keys** → **Create Key**.
4. Copy the key (starts with `sk-ant-...`) and paste it somewhere safe —
   you'll need it in Step 4. Don't share this key with anyone or post it
   publicly.

## Step 3 — Upload the app files to GitHub

1. On github.com, click the **+** icon (top right) → **New repository**.
2. Name it `vetlookup` (or anything you like). Keep it **Public** or
   **Private**, either works. Click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. Drag in BOTH the `index.html` file AND the whole `api` folder
   (with `lookup.js` inside it) from the files I gave you. Make sure the
   folder structure stays intact — `api/lookup.js`, not just `lookup.js`
   loose in the root.
5. Click **Commit changes**.

## Step 4 — Deploy on Vercel (this makes it live)

1. Go to https://vercel.com/signup and sign up using your GitHub account
   (click "Continue with GitHub").
2. Click **Add New** → **Project**.
3. Find your `vetlookup` repo in the list and click **Import**.
4. Before deploying, open **Environment Variables** and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: (paste the key from Step 2)
5. Click **Deploy**.
6. After ~30 seconds you'll get a live URL like
   `https://vetlookup-yourname.vercel.app` — that's your real, working app.

## Step 5 — Test it

Open the URL on your phone or laptop and try looking up "Rimadyl" or
"Apoquel." Every time someone loads that page from now on, they're using
your live app — no further steps needed from you.

---

## Making changes later

Any time you want to change how the app looks or behaves, edit the files in
your GitHub repo (GitHub lets you edit files right in the browser — click the
pencil icon on any file) and Vercel will automatically redeploy the new
version within about a minute.

## Keeping costs low

- Anthropic bills per API call. This app's design (short, structured
  responses) keeps each lookup cheap, but a lot of traffic will add up.
- You can set a spending limit in the Anthropic console under **Billing** so
  you're never surprised by a bill.
- When you're ready to launch for real, revisit adding a small cache so
  repeat searches (e.g. "Rimadyl" searched 100 times) don't re-call the API
  every single time — that's the biggest cost lever.
