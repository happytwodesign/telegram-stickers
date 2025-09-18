# Getting Started Guide

This guide walks you through everything you need to set up the AI sticker-pack bot, even if you are new to programming.

## 1. Accounts and tools you need
1. **Telegram account** – you already have one if you use Telegram.
2. **Telegram Bot** – talk to [@BotFather](https://t.me/BotFather) in Telegram and follow the steps to create a new bot. Save the bot token you receive.
3. **Supabase account** – sign up at https://supabase.com and create a new project. Choose the EU (Frankfurt) region if you want to stay in the EU.
4. **Version control basics** – install [Git](https://git-scm.com/downloads) on your computer so you can track changes to this project.
5. **Code editor** – download [Visual Studio Code](https://code.visualstudio.com/) or another editor of your choice.

## 2. Prepare the Supabase database
1. Open your Supabase project dashboard.
2. Click **SQL Editor** in the left navigation.
3. Copy the contents of [`docs/supabase-schema.sql`](./supabase-schema.sql) from this repository and paste it into a new query.
4. Press **Run**. Supabase will create all tables, types, and indexes for you.
5. Go to **Storage** in Supabase and create three **private** buckets named `uploads`, `stickers`, and `exports`.
6. Under each bucket, set the **file lifecycle** rules:
   - `uploads`: delete files after 30 days.
   - `stickers`: delete files after 90 days.
   - `exports`: delete files after 1 day (24 hours).
7. In the **Authentication** → **Policies** section, make sure Row Level Security (RLS) stays enabled on all tables. You will use the Supabase service-role key inside your server to bypass RLS where necessary.

## 3. Connect your bot to Supabase
1. In Supabase, open **Project Settings** → **API** and copy the **Project URL** and **service_role key**.
2. On your computer, create an `.env` file for your bot server (for example `BOT_TOKEN=...`, `SUPABASE_URL=...`, `SUPABASE_SERVICE_KEY=...`). Never share this file publicly.
3. If you do not have a server yet, plan to use [Supabase Edge Functions](https://supabase.com/docs/guides/functions) or a small Node.js/Python server hosted on platforms like Railway, Render, or Fly.io.

## 4. Handle Telegram webhooks
1. Your server needs an HTTPS URL that Telegram can reach. Services like Railway or Vercel can host it.
2. Use the Telegram Bot API method [`setWebhook`](https://core.telegram.org/bots/api#setwebhook) to point Telegram to your server endpoint (for example `https://yourdomain.com/tg-webhook`).
3. Implement an endpoint that receives JSON updates. Store incoming events in the `public.webhook_events` table for audit/debugging.
4. When a user sends `/start`, collect their Telegram profile data and upsert it into `public.telegram_profiles`.
5. When a user sends a photo, upload it to the Supabase `uploads` bucket, create a record in `public.uploads`, and ask them to choose a style.

## 5. Payments with Telegram Stars
1. Read [Telegram’s Stars documentation](https://core.telegram.org/bots/api#telegram-star-payments) so you know the rules.
2. When the user picks a style, create a row in `public.orders` with `status='pending'` and `price_stars=300`.
3. Call the Bot API method `createInvoiceLink` to generate a Stars payment link and store the response in `invoice_link`.
4. Send the link to the user so they can pay inside Telegram.
5. Handle the payment confirmation in your webhook (look for the `successful_payment` update). Insert a row into `public.payments` and update the related order to `status='paid'`.

## 6. Generating stickers
1. After payment, enqueue a job by inserting into `public.generations` with `status='queued'`.
2. Run a worker (Edge Function, serverless job, or background worker) that reads queued generations, calls your AI image model, and stores the resulting files in the `stickers` bucket.
3. Ensure each generated sticker complies with Telegram’s technical rules:
   - Static: PNG or WEBP, one side exactly 512 px, transparent background recommended.
   - Animated: `.tgs` (Lottie) format.
   - Video: `.webm` VP9 codec, max 3 seconds, max 30 FPS, one side exactly 512 px, max 256 KB, no audio.
4. Record each sticker in `public.stickers` with file metadata.

## 7. Building the Telegram sticker set
1. Use the Bot API method `createNewStickerSet` (or `createNewVideoStickerSet` / `createNewAnimatedStickerSet`) to create a set named like `username_style_byYourBot`.
2. Insert a row into `public.sticker_sets` with the Telegram user, set name, and status `creating`.
3. Use `addStickerToSet` for each generated sticker. Map each sticker to an emoji and create rows in `public.sticker_set_items`.
4. When Telegram confirms the set is ready, update the row to `status='ready'` and send the `t.me/addstickers/<set_name>` link to the user.

## 8. /erase deletion flow
1. When a user sends `/erase`, delete their files from the `uploads`, `stickers`, and `exports` buckets.
2. Update any related database records (`uploads.status='deleted'`, timestamps, etc.).
3. Log the event in `public.webhook_events` so you have proof of compliance.

## 9. Optional exports
1. If you want to give users a ZIP or preview sheet, generate it on demand and upload to the `exports` bucket.
2. Use Supabase signed URLs with a short expiry to share the file.

## 10. Keep documentation up to date
- Update the [Privacy Policy](privacy-policy.md) with your company details and publish it on your website or bot landing page.
- Record a lightweight Data Protection Impact Assessment (DPIA) and store it securely.
- Add a consent prompt before running generation jobs.

## Need more help?
- Supabase docs: https://supabase.com/docs
- Telegram Bot API: https://core.telegram.org/bots/api
- If you get stuck, search for tutorials on “Telegram bot webhook Node.js” or similar in your preferred language.
