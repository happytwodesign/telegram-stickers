const express = require('express');
const crypto = require('crypto');
const config = require('./config');
const supabase = require('./lib/supabase');
const telegram = require('./lib/telegram');

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/tg-webhook', async (req, res) => {
  if (config.telegramWebhookSecret) {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== config.telegramWebhookSecret) {
      return res.status(403).json({ ok: false, error: 'Invalid webhook secret' });
    }
  }

  const update = req.body;
  try {
    await handleUpdate(update);
  } catch (error) {
    console.error('Failed to process Telegram update:', error);
  }
  res.json({ ok: true });
});

app.use((err, req, res, _next) => {
  console.error('Unhandled error', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Telegram bot server listening on port ${config.port}`);
});

async function handleUpdate(update) {
  const eventType = resolveEventType(update);
  await recordWebhookEvent(update, eventType);

  if (update.pre_checkout_query) {
    await telegram.answerPreCheckoutQuery(update.pre_checkout_query.id, true);
    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  if (update.message) {
    await handleMessage(update.message);
  }
}

function resolveEventType(update) {
  if (update.message?.successful_payment) return 'successful_payment';
  if (update.message?.photo) return 'message_photo';
  if (update.message?.text) return 'message_text';
  if (update.callback_query) return 'callback_query';
  if (update.pre_checkout_query) return 'pre_checkout_query';
  return 'unknown';
}

async function recordWebhookEvent(update, eventType) {
  const tgUserId = update.message?.from?.id
    ?? update.callback_query?.from?.id
    ?? update.pre_checkout_query?.from?.id
    ?? null;

  let orderId = null;
  const invoicePayloadRaw = update.message?.successful_payment?.invoice_payload;
  if (invoicePayloadRaw) {
    try {
      const parsed = JSON.parse(invoicePayloadRaw);
      if (parsed?.order_id) {
        orderId = parsed.order_id;
      }
    } catch (error) {
      orderId = invoicePayloadRaw;
    }
  }

  const { error } = await supabase.from('webhook_events').insert({
    source: 'telegram',
    event_type: eventType,
    payload: update,
    tg_user_id: tgUserId,
    order_id: orderId,
  });

  if (error) {
    console.error('Failed to record webhook event:', error);
  }
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const from = message.from;

  await upsertTelegramProfile(from);

  if (message.successful_payment) {
    await handleSuccessfulPayment(message);
    return;
  }

  if (message.text) {
    await handleTextMessage(message.text.trim(), from, chatId);
    return;
  }

  if (message.photo?.length) {
    await handlePhotoMessage(message, from, chatId);
    return;
  }

  await telegram.sendMessage(chatId, 'Unsupported message type. Please send a photo.');
}

async function handleTextMessage(text, from, chatId) {
  if (text === '/start') {
    await telegram.sendMessage(chatId, 'Welcome! Send me a clear photo and I will guide you through purchasing your AI sticker pack.');
    return;
  }

  if (text === '/erase') {
    await handleEraseCommand(from.id, chatId);
    return;
  }

  await telegram.sendMessage(chatId, 'I do not recognise that command. Send a photo to begin.');
}

async function handlePhotoMessage(message, from, chatId) {
  const photos = message.photo || [];
  const largestPhoto = [...photos].sort((a, b) => (a.file_size ?? 0) - (b.file_size ?? 0)).pop();
  if (!largestPhoto) {
    await telegram.sendMessage(chatId, 'Could not read that photo. Please try again.');
    return;
  }

  try {
    const file = await telegram.getFile(largestPhoto.file_id);
    const buffer = await telegram.downloadFile(file.file_path);
    const extension = extractExtension(file.file_path) ?? 'jpg';
    const objectPath = `${from.id}/${crypto.randomUUID()}.${extension}`;
    const storagePath = `uploads/${objectPath}`;

    const uploadResponse = await supabase.storage.from('uploads').upload(storagePath, buffer, {
      contentType: inferMimeType(extension),
      cacheControl: '3600',
      upsert: false,
    });

    if (uploadResponse.error) {
      throw uploadResponse.error;
    }

    const sha256Hex = crypto.createHash('sha256').update(buffer).digest('hex');

    const { error } = await supabase.from('uploads').insert({
      tg_user_id: from.id,
      storage_path: `storage://uploads/${storagePath}`,
      mime_type: inferMimeType(extension),
      width: largestPhoto.width,
      height: largestPhoto.height,
      sha256: `\\x${sha256Hex}`,
    });

    if (error) {
      throw error;
    }

    await telegram.sendMessage(chatId, 'Photo saved! Choose a style for your sticker pack.');
    await sendStylePicker(chatId);
  } catch (error) {
    console.error('Failed to process photo upload:', error);
    await telegram.sendMessage(chatId, 'Sorry, something went wrong while saving your photo. Please try again.');
  }
}

function extractExtension(filePath) {
  const parts = filePath.split('.');
  if (parts.length <= 1) return null;
  return parts.pop().toLowerCase();
}

function inferMimeType(extension) {
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

async function sendStylePicker(chatId) {
  const styles = await fetchActiveStyles();
  if (styles.length === 0) {
    await telegram.sendMessage(chatId, 'No styles are configured yet. Add rows to the styles table in Supabase.');
    return;
  }

  const keyboard = buildStyleKeyboard(styles);
  await telegram.sendMessage(chatId, 'Choose the style you want:', {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

function buildStyleKeyboard(styles) {
  const keyboard = [];
  for (let i = 0; i < styles.length; i += 2) {
    const row = styles.slice(i, i + 2).map((style) => ({
      text: style.title,
      callback_data: `style:${style.id}`,
    }));
    keyboard.push(row);
  }
  return keyboard;
}

async function fetchActiveStyles() {
  const { data, error } = await supabase
    .from('styles')
    .select('id, title, description')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch styles:', error);
    return [];
  }

  return data ?? [];
}

async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  if (!chatId) {
    await telegram.answerCallbackQuery(callbackQuery.id);
    return;
  }

  const data = callbackQuery.data || '';
  if (data.startsWith('style:')) {
    const styleId = data.split(':')[1];
    await telegram.answerCallbackQuery(callbackQuery.id, { text: 'Generating invoice…', show_alert: false });
    await handleStyleSelection(styleId, callbackQuery.from, chatId);
    return;
  }

  await telegram.answerCallbackQuery(callbackQuery.id);
}

async function handleStyleSelection(styleId, from, chatId) {
  const { data: style, error: styleError } = await supabase
    .from('styles')
    .select('id, title, description')
    .eq('id', styleId)
    .eq('is_active', true)
    .maybeSingle();

  if (styleError || !style) {
    await telegram.sendMessage(chatId, 'That style is no longer available.');
    return;
  }

  const latestUpload = await fetchLatestUpload(from.id);
  if (!latestUpload) {
    await telegram.sendMessage(chatId, 'I need a photo first. Please send one before choosing a style.');
    return;
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      tg_user_id: from.id,
      style_id: style.id,
      price_stars: config.priceStars,
      status: 'pending',
    })
    .select()
    .single();

  if (orderError) {
    console.error('Failed to create order:', orderError);
    await telegram.sendMessage(chatId, 'Could not create an order. Please try again later.');
    return;
  }

  const invoicePayload = {
    order_id: order.id,
    style_id: style.id,
    price_stars: config.priceStars,
  };

  try {
    const invoiceLink = await telegram.createInvoiceLink({
      title: `${style.title} Sticker Pack`,
      description: style.description ?? 'Custom AI-generated sticker pack',
      payload: JSON.stringify(invoicePayload),
      currency: 'XTR',
      prices: [
        {
          label: 'Sticker Pack',
          amount: config.priceStars * 100,
        },
      ],
    });

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        invoice_link: invoiceLink,
        invoice_payload: invoicePayload,
      })
      .eq('id', order.id);

    if (updateError) {
      throw updateError;
    }

    await telegram.sendMessage(chatId, `Pay ${config.priceStars} Stars to start the generation:`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `Pay ${config.priceStars} ⭐`,
              url: invoiceLink,
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.error('Failed to create invoice link:', error);
    await telegram.sendMessage(chatId, 'Could not generate the payment link. Please try again in a moment.');
  }
}

async function fetchLatestUpload(tgUserId) {
  const { data, error } = await supabase
    .from('uploads')
    .select('id, storage_path, mime_type, created_at')
    .eq('tg_user_id', tgUserId)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch latest upload:', error);
    return null;
  }

  return data ?? null;
}

async function handleSuccessfulPayment(message) {
  const chatId = message.chat.id;
  const successfulPayment = message.successful_payment;
  const tgUserId = message.from.id;

  let invoicePayload = null;
  try {
    invoicePayload = JSON.parse(successfulPayment.invoice_payload);
  } catch (error) {
    invoicePayload = { order_id: successfulPayment.invoice_payload };
  }

  const orderId = invoicePayload.order_id;
  if (!orderId) {
    await telegram.sendMessage(chatId, 'Payment received, but the order could not be identified. A human will review it.');
    return;
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, style_id')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError || !order) {
    console.error('Order not found for payment:', orderError);
    await telegram.sendMessage(chatId, 'Payment received, but there is no matching order. A human will assist you shortly.');
    return;
  }

  if (order.status !== 'paid') {
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', order.id);
    if (updateError) {
      console.error('Failed to update order status to paid:', updateError);
    }
  }

  await ensurePaymentRecorded(order.id, successfulPayment);
  await ensureGenerationQueued(order.id, tgUserId, order.style_id);

  await telegram.sendMessage(chatId, 'Payment confirmed! I am generating your sticker pack now. I will notify you when it is ready.');
}

async function ensurePaymentRecorded(orderId, successfulPayment) {
  const chargeId = successfulPayment.telegram_payment_charge_id;

  const { data: existingPayment, error: lookupError } = await supabase
    .from('payments')
    .select('id')
    .eq('tg_charge_id', chargeId)
    .maybeSingle();

  if (lookupError) {
    console.error('Failed to check existing payment:', lookupError);
  }

  if (existingPayment) {
    return;
  }

  const amountStars = Math.round(successfulPayment.total_amount / 100);
  const { error } = await supabase.from('payments').insert({
    order_id: orderId,
    tg_charge_id: chargeId,
    amount_stars: amountStars,
    status: 'succeeded',
    provider_data: successfulPayment,
  });

  if (error) {
    console.error('Failed to record payment:', error);
  }
}

async function ensureGenerationQueued(orderId, tgUserId, styleId) {
  const { data: existing, error: existingError } = await supabase
    .from('generations')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();

  if (existingError) {
    console.error('Failed to check existing generation:', existingError);
  }

  if (existing) {
    return;
  }

  const latestUpload = await fetchLatestUpload(tgUserId);
  if (!latestUpload) {
    console.warn('No upload found for generation, skipping queue.');
    return;
  }

  const { error } = await supabase.from('generations').insert({
    order_id: orderId,
    input_upload_id: latestUpload.id,
    engine: config.generationEngine,
    prompt: `Sticker pack generation for style ${styleId}`,
    params: { style_id: styleId },
    status: 'queued',
  });

  if (error) {
    console.error('Failed to enqueue generation:', error);
  }
}

async function handleEraseCommand(tgUserId, chatId) {
  const timestamp = new Date().toISOString();
  try {
    const { data: uploads, error: uploadsError } = await supabase
      .from('uploads')
      .select('id, storage_path')
      .eq('tg_user_id', tgUserId);

    if (uploadsError) throw uploadsError;

    const uploadPaths = (uploads ?? [])
      .map((item) => item.storage_path?.replace('storage://uploads/', ''))
      .filter(Boolean);

    if (uploadPaths.length) {
      const { error: removeError } = await supabase.storage.from('uploads').remove(uploadPaths);
      if (removeError) throw removeError;
    }

    const { error: updateUploadsError } = await supabase
      .from('uploads')
      .update({ status: 'deleted', deleted_at: timestamp })
      .eq('tg_user_id', tgUserId);
    if (updateUploadsError) throw updateUploadsError;

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id')
      .eq('tg_user_id', tgUserId);
    if (ordersError) throw ordersError;

    const orderIds = (orders ?? []).map((order) => order.id);
    let generationIds = [];

    if (orderIds.length) {
      const { data: generations, error: generationsError } = await supabase
        .from('generations')
        .select('id')
        .in('order_id', orderIds);
      if (generationsError) throw generationsError;
      generationIds = (generations ?? []).map((gen) => gen.id);
    }

    if (generationIds.length) {
      const { data: stickers, error: stickersError } = await supabase
        .from('stickers')
        .select('id, storage_path')
        .in('generation_id', generationIds);
      if (stickersError) throw stickersError;

      const stickerPaths = (stickers ?? [])
        .map((item) => item.storage_path?.replace('storage://stickers/', ''))
        .filter(Boolean);

      if (stickerPaths.length) {
        const { error: removeStickersError } = await supabase.storage.from('stickers').remove(stickerPaths);
        if (removeStickersError) throw removeStickersError;
      }

      const { error: deleteGenerations } = await supabase
        .from('generations')
        .delete()
        .in('id', generationIds);
      if (deleteGenerations) throw deleteGenerations;
    }

    const { error: logError } = await supabase.from('webhook_events').insert({
      source: 'telegram',
      event_type: 'command:/erase',
      payload: { tg_user_id: tgUserId },
      tg_user_id: tgUserId,
    });
    if (logError) {
      console.error('Failed to log erase command:', logError);
    }

    await telegram.sendMessage(chatId, 'Your uploads and generated stickers have been deleted. We may keep payment records for legal reasons.');
  } catch (error) {
    console.error('Failed to handle /erase command:', error);
    await telegram.sendMessage(chatId, 'There was a problem deleting your data. A human will review this request.');
  }
}

async function upsertTelegramProfile(from) {
  const profile = {
    tg_user_id: from.id,
    tg_username: from.username ?? null,
    first_name: from.first_name ?? null,
    language_code: from.language_code ?? null,
    is_premium: from.is_premium ?? false,
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('telegram_profiles').upsert(profile, {
    onConflict: 'tg_user_id',
  });

  if (error) {
    console.error('Failed to upsert telegram profile:', error);
  }
}
