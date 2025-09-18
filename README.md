# Telegram AI Sticker Pack Bot Starter

This repository collects a production-ready database schema, privacy policy, setup checklist, and a starter Express server for a Telegram bot that sells AI-generated sticker packs for **300 Telegram Stars** per order. Use it as a reference while you build your own implementation.

## Contents
- [`docs/supabase-schema.sql`](docs/supabase-schema.sql) – ready-to-run SQL for Supabase (tables, enums, indexes).
- [`docs/privacy-policy.md`](docs/privacy-policy.md) – GDPR-friendly privacy policy template tailored for Cyprus.
- [`docs/getting-started.md`](docs/getting-started.md) – step-by-step guide covering Supabase, Telegram bots, payments, and compliance tasks.
- [`src/index.js`](src/index.js) – Express webhook server that wires Telegram updates into the Supabase schema.
- [`src/lib`](src/lib) – helper clients for Supabase and the Telegram Bot API.
- [`.env.example`](.env.example) – environment variables you must configure before running the server.

## Quick start

1. **Install prerequisites**: Node.js 18+, npm, and Git on your computer.
2. **Clone the repo** and install dependencies:
   ```bash
   git clone <your-fork-url>
   cd telegram-stickers
   npm install
   ```
3. **Create an environment file** based on [`.env.example`](.env.example):
   ```bash
   cp .env.example .env
   ```
   Fill in your Telegram bot token, Supabase project URL, and service-role key.
4. **Run the Supabase SQL** from [`docs/supabase-schema.sql`](docs/supabase-schema.sql) and insert at least one row into `public.styles` so the bot can offer a pack style.
5. **Start the webhook server locally**:
   ```bash
   npm start
   ```
6. **Expose your server** (for example with [ngrok](https://ngrok.com/)) and point your bot webhook to it:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -d url="https://<your-ngrok-subdomain>.ngrok.app/tg-webhook" \
     -d secret_token="$(grep TELEGRAM_WEBHOOK_SECRET .env | cut -d'=' -f2)"
   ```
7. **Send `/start` and a photo to your bot**. The server will store the file in Supabase, create orders, and generate Telegram Stars invoices.

The starter server logs the user into `telegram_profiles`, saves uploads, creates orders, records payments, queues generations, and implements the `/erase` deletion flow. You still need to build a background worker that reads rows from `public.generations` and writes finished stickers into the `stickers` bucket.

## How to use this repository
1. Read the [Getting Started Guide](docs/getting-started.md) to understand the tools you need and the overall workflow.
2. Paste the SQL file into the Supabase SQL editor to create your database objects.
3. Update the privacy policy with your organisation details and publish it on your landing page or mini app.
4. Fill in the environment variables and run the provided Express server as a starting point for your own infrastructure.
5. Implement the background generation worker and sticker-pack publishing logic following the checklist in the guide.

You do not need to deploy anything from this repo directly. Instead, copy the snippets into your own bot project or documentation.
