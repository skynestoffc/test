'use strict';

const { withDb, getDb } = require('../db');
const { createOrder, deliverStock, finalizeOrder, rollbackOrder } = require('../services/orderService');
const { createPayment, verifyPaid } = require('../services/paymentService');
const { mainMenuKeyboard } = require('../keyboards/mainMenu');
const { qtyKeyboard, topupKeyboard, cancelKeyboard, testimoniKeyboard } = require('../keyboards/orderKeyboards');
const { formatRupiah, formatDate, formatBox, statusEmoji } = require('../utils/format');
const { isValidMenuNumber, parseMenuNumber } = require('../utils/validators');
const { getBestSeller, getStats } = require('../services/statsService');
const logger = require('../utils/logger');
const config = require('../config/config');

// Active order sessions per user: { userId: { step, data } }
const sessions = {};

// Pending payment polls: { orderId: intervalId }
const pendingPolls = {};

function getSession(userId) {
  if (!sessions[userId]) sessions[userId] = { step: 'MENU', data: {} };
  return sessions[userId];
}

function clearSession(userId) {
  sessions[userId] = { step: 'MENU', data: {} };
}

async function ensureUser(ctx) {
  const userId = String(ctx.from.id);
  await withDb((db) => {
    if (!db.users[userId]) {
      db.users[userId] = {
        id: userId,
        username: ctx.from.username || '',
        firstName: ctx.from.first_name || '',
        lastName: ctx.from.last_name || '',
        saldo: 0,
        createdAt: new Date().toISOString(),
      };
    } else {
      db.users[userId].username = ctx.from.username || db.users[userId].username;
      db.users[userId].firstName = ctx.from.first_name || db.users[userId].firstName;
    }
  });
  return getDb().users[userId];
}

async function handleStart(ctx) {
  try {
    const user = await ensureUser(ctx);
    const stats = getStats();
    const db = getDb();

    const text = [
      `┌──────────────────────────────┐`,
      `│   🤖 SELAMAT DATANG!         │`,
      `│   Auto Order Bot             │`,
      `└──────────────────────────────┘`,
      ``,
      `👤 <b>${user.firstName}</b> (@${user.username || '-'})`,
      `🆔 ID: <code>${user.id}</code>`,
      `💰 Saldo: <b>${formatRupiah(user.saldo)}</b>`,
      ``,
      `📊 <b>Statistik Bot</b>`,
      `👥 Total User: ${stats.totalUsers}`,
      `📦 Total Terjual: ${stats.totalSold}`,
      `✅ Total Transaksi: ${stats.delivered}`,
      ``,
      `Ketik /stok untuk melihat daftar produk`,
    ].join('\n');

    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...mainMenuKeyboard(),
    });
  } catch (err) {
    logger.error('handleStart error:', err);
    await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleListProduk(ctx) {
  try {
    const db = getDb();
    const categories = db.categories.filter((c) => c.isActive !== false);

    if (categories.length === 0) {
      return ctx.reply('Belum ada produk tersedia saat ini.');
    }

    const lines = categories.map((c, i) => `${i + 1}. ${c.name}`);
    const text = [
      `┌──────────────────────────────┐`,
      `│       📦 DAFTAR KATEGORI     │`,
      `└──────────────────────────────┘`,
      ``,
      ...lines,
      ``,
      `Ketik nomor kategori untuk melihat produk`,
    ].join('\n');

    const sess = getSession(String(ctx.from.id));
    sess.step = 'SELECT_CATEGORY';
    sess.data = { categories };

    await ctx.reply(text, { parse_mode: 'HTML' });
  } catch (err) {
    logger.error('handleListProduk error:', err);
    await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleSelectCategory(ctx, catIndex) {
  try {
    const db = getDb();
    const sess = getSession(String(ctx.from.id));
    const categories = db.categories.filter((c) => c.isActive !== false);
    const cat = categories[catIndex];
    if (!cat) return ctx.reply('Kategori tidak valid.');

    const products = db.products.filter(
      (p) => p.categoryId === cat.id && p.isActive !== false
    );

    if (products.length === 0) {
      return ctx.reply('Belum ada produk di kategori ini.');
    }

    const lines = products.map((p, i) => {
      const stock = getTotalStock(p);
      return `${i + 1}. ${p.name} - ${formatRupiah(p.price)} (Stok: ${stock})`;
    });

    const text = [
      `┌──────────────────────────────┐`,
      `│   🛍️ ${cat.name.toUpperCase().padEnd(24)}│`,
      `└──────────────────────────────┘`,
      ``,
      ...lines,
      ``,
      `Ketik nomor produk untuk memesan`,
      `Ketik 0 untuk kembali`,
    ].join('\n');

    sess.step = 'SELECT_PRODUCT';
    sess.data = { category: cat, products };

    await ctx.reply(text, { parse_mode: 'HTML' });
  } catch (err) {
    logger.error('handleSelectCategory error:', err);
    await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
  }
}

function getTotalStock(product) {
  if (product.variants && product.variants.length > 0) {
    return product.variants.reduce((sum, v) => sum + (v.stock ? v.stock.length : 0), 0);
  }
  return product.stock ? product.stock.length : 0;
}

async function handleSelectProduct(ctx, prodIndex) {
  try {
    const sess = getSession(String(ctx.from.id));
    const products = sess.data.products;
    if (!products) return handleListProduk(ctx);

    const product = products[prodIndex];
    if (!product) return ctx.reply('Produk tidak valid.');

    const totalStock = getTotalStock(product);
    if (totalStock === 0) {
      return ctx.reply('❌ Maaf, stok produk ini sedang habis.');
    }

    if (product.variants && product.variants.length > 0) {
      const activeVariants = product.variants.filter((v) => v.stock && v.stock.length > 0);
      if (activeVariants.length === 0) {
        return ctx.reply('❌ Maaf, semua variasi habis.');
      }

      const lines = activeVariants.map(
        (v, i) => `${i + 1}. ${v.name} - ${formatRupiah(v.price)} (Stok: ${v.stock.length})`
      );
      const text = [
        `┌──────────────────────────────┐`,
        `│   🎯 PILIH VARIASI           │`,
        `└──────────────────────────────┘`,
        ``,
        `<b>${product.name}</b>`,
        ``,
        ...lines,
        ``,
        `Ketik nomor variasi`,
        `Ketik 0 untuk kembali`,
      ].join('\n');

      sess.step = 'SELECT_VARIANT';
      sess.data = { ...sess.data, product, variants: activeVariants };
      return ctx.reply(text, { parse_mode: 'HTML' });
    }

    sess.step = 'DETAIL_ORDER';
    sess.data = { ...sess.data, product, variantId: null, qty: 1 };
    await showOrderDetail(ctx);
  } catch (err) {
    logger.error('handleSelectProduct error:', err);
    await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleSelectVariant(ctx, variantIndex) {
  try {
    const sess = getSession(String(ctx.from.id));
    const variants = sess.data.variants;
    if (!variants) return handleListProduk(ctx);

    const variant = variants[variantIndex];
    if (!variant) return ctx.reply('Variasi tidak valid.');

    sess.step = 'DETAIL_ORDER';
    sess.data = { ...sess.data, variant, qty: 1 };
    await showOrderDetail(ctx);
  } catch (err) {
    logger.error('handleSelectVariant error:', err);
    await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function showOrderDetail(ctx, messageId) {
  try {
    const sess = getSession(String(ctx.from.id));
    const { product, variant, qty = 1 } = sess.data;
    const price = variant ? variant.price : product.price;
    const maxStock = variant ? variant.stock.length : (product.stock || []).length;
    const actualQty = Math.min(qty, maxStock);
    sess.data.qty = actualQty;

    const totalAmount = price * actualQty;

    const tmpOrderId = `tmp_${ctx.from.id}`;

    const text = [
      `┌──────────────────────────────┐`,
      `│       🧾 DETAIL PESANAN      │`,
      `└──────────────────────────────┘`,
      ``,
      `📦 Produk  : <b>${product.name}</b>`,
      variant ? `🎯 Variasi : <b>${variant.name}</b>` : null,
      `💰 Harga   : ${formatRupiah(price)}/pcs`,
      `🔢 Qty     : <b>${actualQty}</b> (maks: ${maxStock})`,
      `💵 Total   : <b>${formatRupiah(totalAmount)}</b>`,
      ``,
      `Pilih jumlah dan metode pembayaran:`,
    ]
      .filter((l) => l !== null)
      .join('\n');

    const keyboard = qtyKeyboard(tmpOrderId, actualQty, maxStock);

    if (messageId) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        text,
        { parse_mode: 'HTML', reply_markup: keyboard.reply_markup }
      );
    } else {
      const msg = await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      sess.data.detailMsgId = msg.message_id;
    }
  } catch (err) {
    logger.error('showOrderDetail error:', err);
    await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleQtyCallback(ctx) {
  try {
    const userId = String(ctx.from.id);
    const sess = getSession(userId);
    const [action, , extra] = ctx.callbackQuery.data.split(':');
    const { product, variant, qty = 1 } = sess.data;

    if (!product) {
      await ctx.answerCbQuery('Sesi expired. Mulai ulang.');
      return;
    }

    const maxStock = variant
      ? variant.stock.length
      : (product.stock || []).length;
    let newQty = qty;

    if (action === 'qty_minus') newQty = Math.max(1, qty - 1);
    else if (action === 'qty_plus') newQty = Math.min(maxStock, qty + 1);
    else if (action === 'qty_add') newQty = Math.min(maxStock, qty + parseInt(extra, 10));
    else if (action === 'qty_show') {
      await ctx.answerCbQuery(`Qty saat ini: ${qty}`);
      return;
    }

    sess.data.qty = newQty;
    await ctx.answerCbQuery();

    const price = variant ? variant.price : product.price;
    const totalAmount = price * newQty;
    const tmpOrderId = `tmp_${userId}`;

    const text = [
      `┌──────────────────────────────┐`,
      `│       🧾 DETAIL PESANAN      │`,
      `└──────────────────────────────┘`,
      ``,
      `📦 Produk  : <b>${product.name}</b>`,
      variant ? `🎯 Variasi : <b>${variant.name}</b>` : null,
      `💰 Harga   : ${formatRupiah(price)}/pcs`,
      `🔢 Qty     : <b>${newQty}</b> (maks: ${maxStock})`,
      `💵 Total   : <b>${formatRupiah(totalAmount)}</b>`,
      ``,
      `Pilih jumlah dan metode pembayaran:`,
    ]
      .filter((l) => l !== null)
      .join('\n');

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: qtyKeyboard(tmpOrderId, newQty, maxStock).reply_markup,
    });
  } catch (err) {
    logger.error('handleQtyCallback error:', err);
    await ctx.answerCbQuery('Terjadi kesalahan.');
  }
}

async function handlePayQris(ctx) {
  try {
    const userId = String(ctx.from.id);
    const sess = getSession(userId);
    const { product, variant, qty = 1 } = sess.data;

    if (!product) {
      await ctx.answerCbQuery('Sesi expired. Mulai ulang.');
      return;
    }

    await ctx.answerCbQuery('Membuat pembayaran QRIS...');

    const price = variant ? variant.price : product.price;
    const totalAmount = price * qty;

    const order = await createOrder({
      userId,
      productId: product.id,
      variantId: variant ? variant.id : null,
      qty,
      payMethod: 'QRIS',
    });

    let paymentData;
    try {
      paymentData = await createPayment(totalAmount);
    } catch (err) {
      await rollbackOrder(order.id);
      return ctx.reply('❌ Gagal membuat pembayaran QRIS. Coba lagi nanti.');
    }

    const qrisUrl = paymentData.qris || paymentData.qr_url || paymentData.data?.qr_url || '';
    const expiredAt = new Date(Date.now() + 10 * 60 * 1000);

    const text = [
      `┌──────────────────────────────┐`,
      `│       💳 PEMBAYARAN QRIS     │`,
      `└──────────────────────────────┘`,
      ``,
      `🆔 Order ID : <code>${order.id}</code>`,
      `📦 Produk   : ${product.name}`,
      `🔢 Qty      : ${qty}`,
      `💵 Total    : <b>${formatRupiah(totalAmount)}</b>`,
      ``,
      `Scan QR Code di bawah ini:`,
      qrisUrl ? `<a href="${qrisUrl}">🔗 Lihat QR Code</a>` : `(QR akan muncul setelah konfirmasi)`,
      ``,
      `⏰ Batas bayar: ${expiredAt.toLocaleTimeString('id-ID', { timeZone: config.TIMEZONE })} WIB`,
      ``,
      `⚡ Status akan diperbarui otomatis setiap 10 detik`,
    ].join('\n');

    const msg = await ctx.reply(text, {
      parse_mode: 'HTML',
      ...cancelKeyboard(order.id),
    });

    clearSession(userId);
    startPaymentPolling(ctx, order.id, totalAmount, msg.message_id, userId);
  } catch (err) {
    logger.error('handlePayQris error:', err);
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

function startPaymentPolling(ctx, orderId, amount, msgId, userId) {
  const maxAttempts = 40; // 10 min at 15s interval
  let attempts = 0;
  const chatId = ctx.chat.id;

  const poll = setInterval(async () => {
    attempts++;
    try {
      const db = getDb();
      const order = db.orders.find((o) => o.id === orderId);

      if (!order || order.status === 'CANCELLED' || order.status === 'EXPIRED') {
        clearInterval(poll);
        delete pendingPolls[orderId];
        return;
      }

      if (order.status === 'DELIVERED') {
        clearInterval(poll);
        delete pendingPolls[orderId];
        return;
      }

      const result = await verifyPaid(orderId, amount);
      if (result.paid) {
        clearInterval(poll);
        delete pendingPolls[orderId];

        try {
          const delivered = await deliverStock(orderId);
          const stockText = delivered.deliveredStock.join('\n');

          const successText = [
            `┌──────────────────────────────┐`,
            `│   ✅ PEMBAYARAN BERHASIL!     │`,
            `└──────────────────────────────┘`,
            ``,
            `🆔 Order ID: <code>${orderId}</code>`,
            `📦 Produk  : ${delivered.productName}`,
            `🔢 Qty     : ${delivered.qty}`,
            ``,
            `📋 <b>Produk Anda:</b>`,
            `<code>${stockText}</code>`,
            ``,
            `Terima kasih telah berbelanja! 🎉`,
          ].join('\n');

          try {
            await ctx.telegram.editMessageText(chatId, msgId, undefined, successText, {
              parse_mode: 'HTML',
            });
          } catch (_) {
            await ctx.telegram.sendMessage(chatId, successText, { parse_mode: 'HTML' });
          }

          // Ask testimoni
          await ctx.telegram.sendMessage(
            chatId,
            `⭐ Berikan rating untuk pesanan Anda!`,
            { parse_mode: 'HTML', ...testimoniKeyboard(orderId) }
          );
        } catch (err) {
          logger.error('Deliver stock error:', err);
          await ctx.telegram.sendMessage(chatId, `❌ Gagal mengirim stok: ${err.message}`);
        }
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        delete pendingPolls[orderId];
        await rollbackOrder(orderId);
        try {
          await ctx.telegram.editMessageText(
            chatId,
            msgId,
            undefined,
            `⌛ <b>Pembayaran EXPIRED</b>\n\nOrder ID: <code>${orderId}</code>\n\nWaktu pembayaran habis.`,
            { parse_mode: 'HTML' }
          );
        } catch (_) {
          await ctx.telegram.sendMessage(
            chatId,
            `⌛ Pembayaran order <code>${orderId}</code> telah expired.`,
            { parse_mode: 'HTML' }
          );
        }
      }
    } catch (err) {
      logger.error('Payment polling error:', err);
    }
  }, 15000);

  pendingPolls[orderId] = poll;
}

async function handlePaySaldo(ctx) {
  try {
    const userId = String(ctx.from.id);
    const sess = getSession(userId);
    const { product, variant, qty = 1 } = sess.data;

    if (!product) {
      await ctx.answerCbQuery('Sesi expired. Mulai ulang.');
      return;
    }

    const price = variant ? variant.price : product.price;
    const totalAmount = price * qty;

    const db = getDb();
    const user = db.users[userId];
    if (!user || (user.saldo || 0) < totalAmount) {
      await ctx.answerCbQuery('❌ Saldo tidak mencukupi!');
      return ctx.reply(
        `❌ Saldo tidak mencukupi.\nSaldo Anda: ${formatRupiah(user?.saldo || 0)}\nDibutuhkan: ${formatRupiah(totalAmount)}`
      );
    }

    await ctx.answerCbQuery('Memproses pembayaran saldo...');

    const order = await createOrder({
      userId,
      productId: product.id,
      variantId: variant ? variant.id : null,
      qty,
      payMethod: 'SALDO',
    });

    try {
      await finalizeOrder(order.id, 'SALDO');
      const delivered = await deliverStock(order.id);
      const stockText = delivered.deliveredStock.join('\n');

      clearSession(userId);

      const text = [
        `┌──────────────────────────────┐`,
        `│   ✅ PEMBAYARAN BERHASIL!     │`,
        `└──────────────────────────────┘`,
        ``,
        `🆔 Order ID: <code>${order.id}</code>`,
        `📦 Produk  : ${delivered.productName}`,
        `🔢 Qty     : ${delivered.qty}`,
        `💵 Total   : ${formatRupiah(totalAmount)}`,
        ``,
        `📋 <b>Produk Anda:</b>`,
        `<code>${stockText}</code>`,
        ``,
        `Terima kasih telah berbelanja! 🎉`,
      ].join('\n');

      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...testimoniKeyboard(order.id),
      });
    } catch (err) {
      await rollbackOrder(order.id);
      logger.error('PaySaldo deliver error:', err);
      await ctx.reply(`❌ Gagal memproses: ${err.message}`);
    }
  } catch (err) {
    logger.error('handlePaySaldo error:', err);
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleOrderBack(ctx) {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  clearSession(userId);
  await ctx.reply('Kembali ke menu utama.', mainMenuKeyboard());
}

async function handleCancelOrder(ctx) {
  try {
    const orderId = ctx.callbackQuery.data.split(':')[1];
    await rollbackOrder(orderId);
    await ctx.answerCbQuery('Order dibatalkan.');
    await ctx.editMessageText(`🚫 Order <code>${orderId}</code> dibatalkan.`, {
      parse_mode: 'HTML',
    });
  } catch (err) {
    logger.error('handleCancelOrder error:', err);
    await ctx.answerCbQuery('Gagal membatalkan.');
  }
}

async function handleSaldo(ctx) {
  try {
    const user = await ensureUser(ctx);
    const text = [
      `┌──────────────────────────────┐`,
      `│         💰 SALDO ANDA        │`,
      `└──────────────────────────────┘`,
      ``,
      `💵 Saldo: <b>${formatRupiah(user.saldo)}</b>`,
      ``,
      `Pilih nominal top up:`,
    ].join('\n');

    await ctx.reply(text, { parse_mode: 'HTML', ...topupKeyboard() });
  } catch (err) {
    logger.error('handleSaldo error:', err);
    await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleTopup(ctx) {
  try {
    const userId = String(ctx.from.id);
    const amount = parseInt(ctx.callbackQuery.data.split(':')[1], 10);

    await ctx.answerCbQuery(`Membuat pembayaran ${formatRupiah(amount)}...`);

    let paymentData;
    try {
      paymentData = await createPayment(amount);
    } catch (err) {
      return ctx.reply('❌ Gagal membuat pembayaran. Coba lagi nanti.');
    }

    const topupOrderId = `topup_${userId}_${Date.now()}`;
    const qrisUrl = paymentData.qris || paymentData.qr_url || paymentData.data?.qr_url || '';
    const expiredAt = new Date(Date.now() + 10 * 60 * 1000);

    const text = [
      `┌──────────────────────────────┐`,
      `│       💳 TOP UP SALDO        │`,
      `└──────────────────────────────┘`,
      ``,
      `💵 Nominal : <b>${formatRupiah(amount)}</b>`,
      ``,
      qrisUrl ? `<a href="${qrisUrl}">🔗 Lihat QR Code</a>` : `(QR akan muncul)`,
      ``,
      `⏰ Batas bayar: ${expiredAt.toLocaleTimeString('id-ID', { timeZone: config.TIMEZONE })} WIB`,
      `⚡ Status akan diperbarui otomatis`,
    ].join('\n');

    const msg = await ctx.reply(text, {
      parse_mode: 'HTML',
      ...cancelKeyboard(topupOrderId),
    });

    startTopupPolling(ctx, topupOrderId, amount, msg.message_id, userId);
  } catch (err) {
    logger.error('handleTopup error:', err);
    await ctx.reply('❌ Terjadi kesalahan.');
  }
}

function startTopupPolling(ctx, topupId, amount, msgId, userId) {
  const maxAttempts = 40;
  let attempts = 0;
  const chatId = ctx.chat.id;

  const poll = setInterval(async () => {
    attempts++;
    try {
      const db = getDb();
      if (!db.usedMutationIds) db.usedMutationIds = [];

      const result = await verifyPaid(topupId, amount);

      if (result.paid) {
        clearInterval(poll);
        delete pendingPolls[topupId];

        await withDb((d) => {
          if (!d.users[userId]) return;
          d.users[userId].saldo = (d.users[userId].saldo || 0) + amount;
          if (!d.orders) d.orders = [];
          d.orders.push({
            id: topupId,
            userId,
            type: 'TOPUP',
            amount,
            status: 'DELIVERED',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        });

        const updatedUser = getDb().users[userId];
        try {
          await ctx.telegram.editMessageText(
            chatId,
            msgId,
            undefined,
            [
              `✅ <b>Top Up Berhasil!</b>`,
              ``,
              `💵 Nominal  : ${formatRupiah(amount)}`,
              `💰 Saldo    : ${formatRupiah(updatedUser?.saldo || 0)}`,
            ].join('\n'),
            { parse_mode: 'HTML' }
          );
        } catch (_) {
          await ctx.telegram.sendMessage(
            chatId,
            `✅ Top Up ${formatRupiah(amount)} berhasil! Saldo: ${formatRupiah(updatedUser?.saldo || 0)}`,
            { parse_mode: 'HTML' }
          );
        }
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        delete pendingPolls[topupId];
        try {
          await ctx.telegram.editMessageText(
            chatId,
            msgId,
            undefined,
            `⌛ Top up expired. Silakan coba lagi.`,
            { parse_mode: 'HTML' }
          );
        } catch (_) {}
      }
    } catch (err) {
      logger.error('Topup polling error:', err);
    }
  }, 15000);

  pendingPolls[topupId] = poll;
}

async function handleRiwayat(ctx) {
  try {
    const userId = String(ctx.from.id);
    await ensureUser(ctx);
    const db = getDb();
    const orders = db.orders
      .filter((o) => o.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    if (orders.length === 0) {
      return ctx.reply('Belum ada riwayat transaksi.');
    }

    const lines = orders.map((o, i) => {
      const emoji = statusEmoji(o.status);
      const date = formatDate(o.createdAt);
      if (o.type === 'TOPUP') {
        return `${i + 1}. ${emoji} TOP UP ${formatRupiah(o.amount)} - ${date}`;
      }
      return `${i + 1}. ${emoji} ${o.productName || 'Produk'} x${o.qty} ${formatRupiah(o.totalAmount)} - ${o.status} - ${date}`;
    });

    const text = [
      `┌──────────────────────────────┐`,
      `│   📋 RIWAYAT TRANSAKSI       │`,
      `└──────────────────────────────┘`,
      ``,
      ...lines,
    ].join('\n');

    await ctx.reply(text, { parse_mode: 'HTML' });
  } catch (err) {
    logger.error('handleRiwayat error:', err);
    await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleBestSeller(ctx) {
  try {
    const top = getBestSeller(10);

    if (top.length === 0) {
      return ctx.reply('Belum ada data penjualan.');
    }

    const lines = top.map((p, i) => `${i + 1}. ${p.name} - Terjual: ${p.totalSold || 0}`);

    const text = [
      `┌──────────────────────────────┐`,
      `│       🏆 BEST SELLER         │`,
      `└──────────────────────────────┘`,
      ``,
      ...lines,
    ].join('\n');

    await ctx.reply(text, { parse_mode: 'HTML' });
  } catch (err) {
    logger.error('handleBestSeller error:', err);
    await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleHowToOrder(ctx) {
  const text = [
    `┌──────────────────────────────┐`,
    `│       ❓ CARA ORDER          │`,
    `└──────────────────────────────┘`,
    ``,
    `1️⃣ Ketuk <b>🛍️ List Produk</b> di menu`,
    `2️⃣ Pilih <b>kategori</b> produk`,
    `3️⃣ Pilih <b>produk</b> yang diinginkan`,
    `4️⃣ Atur <b>jumlah (qty)</b> pesanan`,
    `5️⃣ Pilih metode bayar: <b>QRIS</b> atau <b>Saldo</b>`,
    `6️⃣ Lakukan pembayaran & produk dikirim <b>otomatis</b>`,
    ``,
    `💡 Tips:`,
    `• Pastikan saldo cukup untuk bayar via Saldo`,
    `• QRIS aktif selama 10 menit`,
    `• Produk dikirim otomatis setelah bayar`,
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'HTML' });
}

async function handleTestimoni(ctx) {
  try {
    const parts = ctx.callbackQuery.data.split(':');
    const orderId = parts[1];
    const rating = parseInt(parts[2], 10);

    await ctx.answerCbQuery(`Rating ${rating} bintang diberikan! Terima kasih ⭐`);

    const sess = getSession(String(ctx.from.id));
    sess.step = 'TESTIMONI_TEXT';
    sess.data = { orderId, rating };

    await ctx.editMessageText(
      `⭐ Rating ${rating}/5 diterima!\n\nKetik ulasan Anda (atau /skip untuk melewati):`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logger.error('handleTestimoni error:', err);
    await ctx.answerCbQuery('Terjadi kesalahan.');
  }
}

async function handleTestimoniSkip(ctx) {
  await ctx.answerCbQuery('Dilewati.');
  const userId = String(ctx.from.id);
  clearSession(userId);
  await ctx.editMessageText('Terima kasih sudah berbelanja! 🎉');
}

async function handleTestimoniText(ctx, text) {
  const userId = String(ctx.from.id);
  const sess = getSession(userId);
  const { orderId, rating } = sess.data;

  await withDb((db) => {
    const order = db.orders.find((o) => o.id === orderId);
    if (order) {
      order.testimoni = { rating, text, createdAt: new Date().toISOString() };
    }
  });

  clearSession(userId);

  if (config.CHANNEL_ID) {
    try {
      const db = getDb();
      const order = db.orders.find((o) => o.id === orderId);
      await ctx.telegram.sendMessage(
        config.CHANNEL_ID,
        `⭐ ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}\n"${text}"\n— ${ctx.from.first_name}`,
        { parse_mode: 'HTML' }
      );
    } catch (_) {}
  }

  await ctx.reply('✅ Ulasan Anda telah disimpan. Terima kasih! 🎉', mainMenuKeyboard());
}

async function handleTextInput(ctx) {
  const userId = String(ctx.from.id);
  const sess = getSession(userId);
  const text = ctx.message.text.trim();

  if (sess.step === 'TESTIMONI_TEXT') {
    return handleTestimoniText(ctx, text);
  }

  if (text === '/skip' && sess.step === 'TESTIMONI_TEXT') {
    clearSession(userId);
    return ctx.reply('Terima kasih! 🎉', mainMenuKeyboard());
  }

  if (sess.step === 'SELECT_CATEGORY') {
    if (text === '0') {
      clearSession(userId);
      return ctx.reply('Kembali ke menu utama.', mainMenuKeyboard());
    }
    const categories = getDb().categories.filter((c) => c.isActive !== false);
    if (isValidMenuNumber(text, 1, categories.length)) {
      return handleSelectCategory(ctx, parseMenuNumber(text) - 1);
    }
    return ctx.reply(`Masukkan angka 1-${categories.length}`);
  }

  if (sess.step === 'SELECT_PRODUCT') {
    if (text === '0') {
      return handleListProduk(ctx);
    }
    const products = sess.data.products || [];
    if (isValidMenuNumber(text, 1, products.length)) {
      return handleSelectProduct(ctx, parseMenuNumber(text) - 1);
    }
    return ctx.reply(`Masukkan angka 1-${products.length}`);
  }

  if (sess.step === 'SELECT_VARIANT') {
    if (text === '0') {
      const products = sess.data.products || [];
      sess.step = 'SELECT_PRODUCT';
      const lines = products.map((p, i) => {
        const stock = getTotalStock(p);
        return `${i + 1}. ${p.name} - ${formatRupiah(p.price)} (Stok: ${stock})`;
      });
      return ctx.reply(
        [`Pilih produk:`, ...lines, `Ketik 0 untuk kembali`].join('\n'),
        { parse_mode: 'HTML' }
      );
    }
    const variants = sess.data.variants || [];
    if (isValidMenuNumber(text, 1, variants.length)) {
      return handleSelectVariant(ctx, parseMenuNumber(text) - 1);
    }
    return ctx.reply(`Masukkan angka 1-${variants.length}`);
  }
}

function resumePendingPolls(bot) {
  const db = getDb();
  const pendingOrders = db.orders.filter((o) => o.status === 'PENDING' && o.payMethod === 'QRIS');
  for (const order of pendingOrders) {
    logger.info(`Resuming payment poll for order ${order.id}`);
    const fakeCtx = {
      chat: { id: parseInt(order.userId, 10) },
      telegram: bot.telegram,
    };
    startPaymentPolling(fakeCtx, order.id, order.totalAmount, null, order.userId);
  }
}

module.exports = {
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
  ensureUser,
};
