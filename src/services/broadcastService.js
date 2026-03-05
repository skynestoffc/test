'use strict';

const logger = require('../utils/logger');
const { getDb } = require('../db');

const RATE_LIMIT_MS = 100;

async function sendBroadcast(telegram, message) {
  const db = getDb();
  const users = Object.values(db.users);
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await telegram.sendMessage(user.id, message, { parse_mode: 'HTML' });
      sent++;
    } catch (err) {
      logger.warn(`Broadcast failed for user ${user.id}: ${err.message}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  return { sent, failed, total: users.length };
}

module.exports = { sendBroadcast };
