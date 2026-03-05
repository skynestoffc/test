'use strict';

const { Markup } = require('telegraf');

function adminMenuKeyboard() {
  return Markup.keyboard([
    ['➕ Tambah Produk', '🗑️ Hapus Produk'],
    ['📦 Tambah Stok', '✏️ Set Harga'],
    ['📢 Broadcast', '📊 Statistik'],
    ['🔙 Menu Utama'],
  ])
    .resize()
    .persistent();
}

function adminInlineActions(productId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('➕ Tambah Variasi', `admin_add_variant:${productId}`),
      Markup.button.callback('🗑️ Hapus Variasi', `admin_del_variant:${productId}`),
    ],
    [
      Markup.button.callback('📦 Tambah Stok', `admin_add_stock:${productId}`),
      Markup.button.callback('🗑️ Hapus Stok', `admin_del_stock:${productId}`),
    ],
    [Markup.button.callback('❌ Nonaktifkan', `admin_deactivate:${productId}`)],
  ]);
}

module.exports = { adminMenuKeyboard, adminInlineActions };
