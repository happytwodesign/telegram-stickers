const dotenv = require('dotenv');

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

const config = {
  port: parseInt(process.env.PORT ?? '8787', 10),
  priceStars: parseInt(process.env.PRICE_STARS ?? '300', 10),
  generationEngine: process.env.GENERATION_ENGINE ?? 'manual-review',
  telegramBotToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || null,
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
};

if (Number.isNaN(config.priceStars) || config.priceStars <= 0) {
  throw new Error('PRICE_STARS must be a positive integer.');
}

module.exports = config;
