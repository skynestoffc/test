'use strict';

require('dotenv').config();

const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  ADMIN_IDS: (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean),
  APIKEY: process.env.APIKEY || '',
  USERNAME_API: process.env.USERNAME_API || '',
  TOKEN_API: process.env.TOKEN_API || '',
  DB_PATH: process.env.DB_PATH || './data/db.json',
  TIMEZONE: process.env.TIMEZONE || 'Asia/Jakarta',
  CHANNEL_ID: process.env.CHANNEL_ID || '',
};

if (!config.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required in environment variables');
}

module.exports = config;
