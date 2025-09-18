const axios = require('axios');
const config = require('../config');

const apiBase = `https://api.telegram.org/bot${config.telegramBotToken}`;
const fileBase = `https://api.telegram.org/file/bot${config.telegramBotToken}`;

async function callTelegram(method, payload = {}) {
  try {
    const response = await axios.post(`${apiBase}/${method}`, payload, {
      timeout: 10000,
    });
    if (!response.data.ok) {
      throw new Error(`Telegram API error: ${response.data.description}`);
    }
    return response.data.result;
  } catch (error) {
    if (error.response?.data) {
      console.error('Telegram API response error:', error.response.data);
    }
    throw error;
  }
}

async function sendMessage(chatId, text, extra = {}) {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    ...extra,
  });
}

async function answerCallbackQuery(id, options = {}) {
  return callTelegram('answerCallbackQuery', {
    callback_query_id: id,
    ...options,
  });
}

async function answerPreCheckoutQuery(id, ok = true, errorMessage) {
  return callTelegram('answerPreCheckoutQuery', {
    pre_checkout_query_id: id,
    ok,
    error_message: ok ? undefined : errorMessage,
  });
}

async function createInvoiceLink(payload) {
  return callTelegram('createInvoiceLink', payload);
}

async function getFile(fileId) {
  return callTelegram('getFile', { file_id: fileId });
}

async function downloadFile(filePath) {
  const url = `${fileBase}/${filePath}`;
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
  return Buffer.from(response.data);
}

module.exports = {
  answerCallbackQuery,
  answerPreCheckoutQuery,
  createInvoiceLink,
  downloadFile,
  getFile,
  sendMessage,
};
