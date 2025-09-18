# Getting Started Guide

This guide walks you through everything you need to set up the AI sticker-pack bot, even if you are new to programming.

## 1. Accounts and tools you need
1. **Telegram account** – you already have one if you use Telegram.
2. **Telegram Bot** – talk to [@BotFather](https://t.me/BotFather) in Telegram and follow the steps to create a new bot. Save the bot token you receive.
3. **Supabase account** – sign up at https://supabase.com and create a new project. Choose the EU (Frankfurt) region if you want to stay in the EU.
4. **Node.js 18 or newer** – download from [nodejs.org](https://nodejs.org/en). This installs both Node and npm, which you need to run the Express server.
5. **Version control basics** – install [Git](https://git-scm.com/downloads) on your computer so you can track changes to this project.
6. **Code editor** – download [Visual Studio Code](https://code.visualstudio.com/) or another editor of your choice.
7. **Tunnel tool (optional but helpful)** – tools like [ngrok](https://ngrok.com/) expose your local server to Telegram while you test.

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
2. Copy `.env.example` to `.env` and fill in `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Never share this file publicly.
3. If you do not have a server yet, this repository includes an Express-based webhook handler in [`src/index.js`](../src/index.js) that you can run locally or deploy to a platform like Railway, Render, Fly.io, or Supabase Edge Functions.

## 4. Install dependencies and run the server locally
1. Clone your fork of this repository: `git clone <your-repo-url>`.
2. Change into the directory and install dependencies: `cd telegram-stickers && npm install`.
3. Start the Express server: `npm start`. You should see `Telegram bot server listening on port 8787` in your terminal.
4. Keep this terminal open so the process keeps running.

## 5. Expose your local server to Telegram
1. Start `ngrok` (or a similar tunnel) pointing at your local port: `ngrok http 8787`.
2. Copy the HTTPS URL ngrok gives you (for example `https://pretty-moth.ngrok.app`).
3. Register the webhook with Telegram:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -d url="https://pretty-moth.ngrok.app/tg-webhook" \
     -d secret_token="$(grep TELEGRAM_WEBHOOK_SECRET .env | cut -d'=' -f2)"
   ```
4. Telegram should return `{"ok":true}`. If it does not, double-check the token, URL, and secret.

## 6. Handle Telegram webhooks
1. Your server needs an HTTPS URL that Telegram can reach. Services like Railway or Vercel can host it.
2. Use the Telegram Bot API method [`setWebhook`](https://core.telegram.org/bots/api#setwebhook) to point Telegram to your server endpoint (for example `https://yourdomain.com/tg-webhook`).
3. Implement an endpoint that receives JSON updates. Store incoming events in the `public.webhook_events` table for audit/debugging.
4. When a user sends `/start`, collect their Telegram profile data and upsert it into `public.telegram_profiles`.
5. When a user sends a photo, upload it to the Supabase `uploads` bucket, create a record in `public.uploads`, and ask them to choose a style.

The provided Express server already implements these basics. Read through [`src/index.js`](../src/index.js) so you understand each step.

## 7. Payments with Telegram Stars
1. Read [Telegram’s Stars documentation](https://core.telegram.org/bots/api#telegram-star-payments) so you know the rules.
2. When the user picks a style, create a row in `public.orders` with `status='pending'` and `price_stars=300`.
3. Call the Bot API method `createInvoiceLink` to generate a Stars payment link and store the response in `invoice_link`.
4. Send the link to the user so they can pay inside Telegram.
5. Handle the payment confirmation in your webhook (look for the `successful_payment` update). Insert a row into `public.payments` and update the related order to `status='paid'`.

## 8. Generating stickers
1. After payment, enqueue a job by inserting into `public.generations` with `status='queued'`.
2. Run a worker (Edge Function, serverless job, or background worker) that reads queued generations, calls your AI image model, and stores the resulting files in the `stickers` bucket.
3. Ensure each generated sticker complies with Telegram’s technical rules:
   - Static: PNG or WEBP, one side exactly 512 px, transparent background recommended.
   - Animated: `.tgs` (Lottie) format.
   - Video: `.webm` VP9 codec, max 3 seconds, max 30 FPS, one side exactly 512 px, max 256 KB, no audio.
4. Record each sticker in `public.stickers` with file metadata.

## 9. Building the Telegram sticker set
1. Use the Bot API method `createNewStickerSet` (or `createNewVideoStickerSet` / `createNewAnimatedStickerSet`) to create a set named like `username_style_byYourBot`.
2. Insert a row into `public.sticker_sets` with the Telegram user, set name, and status `creating`.
3. Use `addStickerToSet` for each generated sticker. Map each sticker to an emoji and create rows in `public.sticker_set_items`.
4. When Telegram confirms the set is ready, update the row to `status='ready'` and send the `t.me/addstickers/<set_name>` link to the user.

## 10. /erase deletion flow
1. When a user sends `/erase`, delete their files from the `uploads`, `stickers`, and `exports` buckets.
2. Update any related database records (`uploads.status='deleted'`, timestamps, etc.).
3. Log the event in `public.webhook_events` so you have proof of compliance.

## 11. Optional exports
1. If you want to give users a ZIP or preview sheet, generate it on demand and upload to the `exports` bucket.
2. Use Supabase signed URLs with a short expiry to share the file.

## 12. Keep documentation up to date
- Update the [Privacy Policy](privacy-policy.md) with your company details and publish it on your website or bot landing page.
- Record a lightweight Data Protection Impact Assessment (DPIA) and store it securely.
- Add a consent prompt before running generation jobs.

## Need more help?
- Supabase docs: https://supabase.com/docs
- Telegram Bot API: https://core.telegram.org/bots/api
- If you get stuck, search for tutorials on “Telegram bot webhook Node.js” or similar in your preferred language.
