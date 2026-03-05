'use strict';

const { Markup } = require('telegraf');

function mainMenuKeyboard() {
  return Markup.keyboard([
    ['🛍️ List Produk', '💰 Saldo'],
    ['📋 Riwayat Transaksi', '🏆 Best Seller'],
    ['❓ How To Order'],
  ])
    .resize()
    .persistent();
}

module.exports = { mainMenuKeyboard };
