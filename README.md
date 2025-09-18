# Telegram AI Sticker Pack Bot Starter

This repository collects the production-ready database schema, privacy policy, and setup checklist for a Telegram bot that sells AI-generated sticker packs for **300 Telegram Stars** per order. Use it as a reference while you build your own implementation.

## Contents
- [`docs/supabase-schema.sql`](docs/supabase-schema.sql) – ready-to-run SQL for Supabase (tables, enums, indexes).
- [`docs/privacy-policy.md`](docs/privacy-policy.md) – GDPR-friendly privacy policy template tailored for Cyprus.
- [`docs/getting-started.md`](docs/getting-started.md) – step-by-step guide covering Supabase, Telegram bots, payments, and compliance tasks.

## How to use this repository
1. Read the [Getting Started Guide](docs/getting-started.md) to understand the tools you need and the overall workflow.
2. Paste the SQL file into the Supabase SQL editor to create your database objects.
3. Update the privacy policy with your organisation details and publish it on your landing page or mini app.
4. Implement the server-side logic (webhooks, payment handling, AI generation) following the checklist in the guide.

You do not need to deploy anything from this repo directly. Instead, copy the snippets into your own bot project or documentation.
