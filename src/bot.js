'use strict';

const { Telegraf } = require('telegraf');
const config = require('./config/config');
const { load } = require('./db');
const logger = require('./utils/logger');

const {
  handleStart,
  handleListProduk,
  handleSaldo,
  handleTopup,
  handleRiwayat,
  handleBestSeller,
  handleHowToOrder,
  handleQtyCallback,
  handlePayQris,
  handlePaySaldo,
  handleOrderBack,
  handleCancelOrder,
  handleTestimoni,
  handleTestimoniSkip,
  handleTextInput,
  resumePendingPolls,
} = require('./handlers/userHandlers');

const {
  isAdmin,
  handleAdminMenu,
  handleAdminStats,
  handleAdminAddProduct,
  handleAdminDelProduct,
  handleAdminAddStock,
  handleAdminSetHarga,
  handleAdminBroadcast,
  handleAdminTextInput,
  handleAdminInlineCallback,
  getAdminSessionForBot,
} = require('./handlers/adminHandlers');

function createBot() {
  load();

  const bot = new Telegraf(config.BOT_TOKEN);

  // Middleware: log all updates
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    const type = ctx.updateType;
    logger.debug(`Update [${type}] from user ${userId}`);
    return next();
  });

  // Commands
  bot.start(handleStart);
  bot.command('stok', handleListProduk);
  bot.command('menu', handleStart);

  bot.command('admin', (ctx) => {
    if (isAdmin(ctx)) return handleAdminMenu(ctx);
    return ctx.reply('Akses ditolak.');
  });

  // Reply keyboard text handlers
  bot.hears('🛍️ List Produk', handleListProduk);
  bot.hears('💰 Saldo', handleSaldo);
  bot.hears('📋 Riwayat Transaksi', handleRiwayat);
  bot.hears('🏆 Best Seller', handleBestSeller);
  bot.hears('❓ How To Order', handleHowToOrder);

  // Admin menu
  bot.hears('➕ Tambah Produk', handleAdminAddProduct);
  bot.hears('🗑️ Hapus Produk', handleAdminDelProduct);
  bot.hears('📦 Tambah Stok', handleAdminAddStock);
  bot.hears('✏️ Set Harga', handleAdminSetHarga);
  bot.hears('📢 Broadcast', handleAdminBroadcast);
  bot.hears('📊 Statistik', handleAdminStats);
  bot.hears('🔙 Menu Utama', handleStart);

  // Inline callbacks
  bot.action(/^qty_(minus|plus|add|show):/, handleQtyCallback);
  bot.action(/^pay_qris:/, handlePayQris);
  bot.action(/^pay_saldo:/, handlePaySaldo);
  bot.action(/^order_back:/, handleOrderBack);
  bot.action(/^cancel_order:/, handleCancelOrder);
  bot.action(/^topup:/, handleTopup);
  bot.action(/^testi:/, handleTestimoni);
  bot.action(/^testi_skip:/, handleTestimoniSkip);
  bot.action(/^admin_/, handleAdminInlineCallback);

  // Text input (catch-all for wizard steps)
  bot.on('text', async (ctx) => {
    const userId = String(ctx.from.id);
    // If admin with active session, route to admin handler first
    if (isAdmin(ctx)) {
      const adminSess = getAdminSessionForBot(userId);
      if (adminSess && adminSess.step !== 'MENU') {
        return handleAdminTextInput(ctx);
      }
    }
    return handleTextInput(ctx);
  });

  // Error handler
  bot.catch((err, ctx) => {
    logger.error(`Bot error for update ${ctx?.update?.update_id}:`, err);
  });

  return bot;
}

module.exports = { createBot, resumePendingPolls };
