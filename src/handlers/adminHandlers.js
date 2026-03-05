'use strict';

const { withDb, getDb } = require('../db');
const { sendBroadcast } = require('../services/broadcastService');
const { getStats, getBestSeller } = require('../services/statsService');
const { adminMenuKeyboard } = require('../keyboards/adminMenu');
const { mainMenuKeyboard } = require('../keyboards/mainMenu');
const { formatRupiah, formatDate } = require('../utils/format');
const { parseStockLines, sanitizeText, validatePositiveInt } = require('../utils/validators');
const logger = require('../utils/logger');
const config = require('../config/config');

function isAdmin(ctx) {
  return config.ADMIN_IDS.includes(String(ctx.from.id));
}

// Admin sessions per user
const adminSessions = {};

function getAdminSession(userId) {
  if (!adminSessions[userId]) adminSessions[userId] = { step: 'MENU', data: {} };
  return adminSessions[userId];
}

function clearAdminSession(userId) {
  adminSessions[userId] = { step: 'MENU', data: {} };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

async function handleAdminMenu(ctx) {
  if (!isAdmin(ctx)) return;
  const text = [
    `┌──────────────────────────────┐`,
    `│       🔧 MENU ADMIN          │`,
    `└──────────────────────────────┘`,
    ``,
    `Pilih aksi admin:`,
  ].join('\n');
  await ctx.reply(text, { parse_mode: 'HTML', ...adminMenuKeyboard() });
}

async function handleAdminStats(ctx) {
  if (!isAdmin(ctx)) return;
  const stats = getStats();
  const top5 = stats.bestSellers.map((p, i) => `${i + 1}. ${p.name} (${p.totalSold || 0})`);

  const text = [
    `┌──────────────────────────────┐`,
    `│         📊 STATISTIK         │`,
    `└──────────────────────────────┘`,
    ``,
    `👥 Total User   : ${stats.totalUsers}`,
    `📦 Total Terjual: ${stats.totalSold}`,
    `✅ Terselesaikan: ${stats.delivered}`,
    `💵 Total Revenue: ${formatRupiah(stats.totalRevenue)}`,
    ``,
    `🏆 Top 5 Best Seller:`,
    ...top5,
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'HTML' });
}

async function handleAdminAddProduct(ctx) {
  if (!isAdmin(ctx)) return;
  const userId = String(ctx.from.id);
  const sess = getAdminSession(userId);
  sess.step = 'ADD_PRODUCT_NAME';
  sess.data = {};
  await ctx.reply('📦 Masukkan nama produk baru:');
}

async function handleAdminDelProduct(ctx) {
  if (!isAdmin(ctx)) return;
  const db = getDb();
  const products = db.products.filter((p) => p.isActive !== false);
  if (products.length === 0) return ctx.reply('Tidak ada produk aktif.');

  const lines = products.map((p, i) => `${i + 1}. ${p.name}`);
  const text = ['🗑️ Pilih nomor produk yang ingin dihapus:', ...lines, `Ketik 0 untuk batal`].join('\n');

  const userId = String(ctx.from.id);
  const sess = getAdminSession(userId);
  sess.step = 'DEL_PRODUCT_SELECT';
  sess.data = { products };

  await ctx.reply(text);
}

async function handleAdminAddStock(ctx) {
  if (!isAdmin(ctx)) return;
  const db = getDb();
  const products = db.products.filter((p) => p.isActive !== false);
  if (products.length === 0) return ctx.reply('Tidak ada produk aktif.');

  const lines = products.map((p, i) => `${i + 1}. ${p.name}`);
  const text = ['📦 Pilih nomor produk untuk tambah stok:', ...lines, `Ketik 0 untuk batal`].join('\n');

  const userId = String(ctx.from.id);
  const sess = getAdminSession(userId);
  sess.step = 'ADD_STOCK_SELECT_PRODUCT';
  sess.data = { products };

  await ctx.reply(text);
}

async function handleAdminSetHarga(ctx) {
  if (!isAdmin(ctx)) return;
  const db = getDb();
  const products = db.products.filter((p) => p.isActive !== false);
  if (products.length === 0) return ctx.reply('Tidak ada produk aktif.');

  const lines = products.map((p, i) => `${i + 1}. ${p.name} - ${formatRupiah(p.price)}`);
  const text = ['✏️ Pilih nomor produk untuk set harga:', ...lines, `Ketik 0 untuk batal`].join('\n');

  const userId = String(ctx.from.id);
  const sess = getAdminSession(userId);
  sess.step = 'SET_HARGA_SELECT';
  sess.data = { products };

  await ctx.reply(text);
}

async function handleAdminBroadcast(ctx) {
  if (!isAdmin(ctx)) return;
  const userId = String(ctx.from.id);
  const sess = getAdminSession(userId);
  sess.step = 'BROADCAST_TEXT';
  sess.data = {};
  await ctx.reply('📢 Masukkan pesan broadcast (support HTML):');
}

async function handleAdminTextInput(ctx) {
  if (!isAdmin(ctx)) return;
  const userId = String(ctx.from.id);
  const sess = getAdminSession(userId);
  const text = ctx.message.text.trim();

  if (text === '0' || text === '/batal') {
    clearAdminSession(userId);
    return ctx.reply('Dibatalkan.', adminMenuKeyboard());
  }

  switch (sess.step) {
    case 'ADD_PRODUCT_NAME': {
      sess.data.name = sanitizeText(text);
      sess.step = 'ADD_PRODUCT_CATEGORY';
      const db = getDb();
      const cats = db.categories;
      if (cats.length === 0) {
        sess.step = 'ADD_PRODUCT_NEW_CATEGORY';
        return ctx.reply('Belum ada kategori. Masukkan nama kategori baru:');
      }
      const lines = cats.map((c, i) => `${i + 1}. ${c.name}`);
      return ctx.reply(['Pilih kategori:', ...lines, `${cats.length + 1}. Buat kategori baru`].join('\n'));
    }

    case 'ADD_PRODUCT_NEW_CATEGORY': {
      const catName = sanitizeText(text);
      const catId = generateId();
      await withDb((db) => {
        db.categories.push({ id: catId, name: catName, isActive: true });
      });
      sess.data.categoryId = catId;
      sess.step = 'ADD_PRODUCT_PRICE';
      return ctx.reply(`Kategori "${catName}" dibuat. Masukkan harga produk (angka):`);
    }

    case 'ADD_PRODUCT_CATEGORY': {
      const db = getDb();
      const cats = db.categories;
      const n = parseInt(text, 10);
      if (n === cats.length + 1) {
        sess.step = 'ADD_PRODUCT_NEW_CATEGORY';
        return ctx.reply('Masukkan nama kategori baru:');
      }
      if (!n || n < 1 || n > cats.length) return ctx.reply('Pilihan tidak valid.');
      sess.data.categoryId = cats[n - 1].id;
      sess.step = 'ADD_PRODUCT_PRICE';
      return ctx.reply('Masukkan harga produk (angka):');
    }

    case 'ADD_PRODUCT_PRICE': {
      const price = parseInt(text, 10);
      if (isNaN(price) || price <= 0) return ctx.reply('Harga tidak valid. Masukkan angka positif:');
      sess.data.price = price;
      sess.step = 'ADD_PRODUCT_DESC';
      return ctx.reply('Masukkan deskripsi produk (atau /skip):');
    }

    case 'ADD_PRODUCT_DESC': {
      sess.data.description = text === '/skip' ? '' : sanitizeText(text);
      const prodId = generateId();
      await withDb((db) => {
        db.products.push({
          id: prodId,
          name: sess.data.name,
          categoryId: sess.data.categoryId,
          price: sess.data.price,
          description: sess.data.description,
          isActive: true,
          stock: [],
          variants: [],
          totalSold: 0,
          createdAt: new Date().toISOString(),
        });
      });
      clearAdminSession(userId);
      return ctx.reply(`✅ Produk "<b>${sess.data.name}</b>" berhasil ditambahkan!\nID: <code>${prodId}</code>`, {
        parse_mode: 'HTML',
        ...adminMenuKeyboard(),
      });
    }

    case 'DEL_PRODUCT_SELECT': {
      const products = sess.data.products || [];
      const n = parseInt(text, 10);
      if (!n || n < 1 || n > products.length) return ctx.reply('Pilihan tidak valid.');
      const prod = products[n - 1];
      await withDb((db) => {
        const p = db.products.find((x) => x.id === prod.id);
        if (p) p.isActive = false;
      });
      clearAdminSession(userId);
      return ctx.reply(`✅ Produk "<b>${prod.name}</b>" berhasil dihapus (soft delete).`, {
        parse_mode: 'HTML',
        ...adminMenuKeyboard(),
      });
    }

    case 'ADD_STOCK_SELECT_PRODUCT': {
      const products = sess.data.products || [];
      const n = parseInt(text, 10);
      if (!n || n < 1 || n > products.length) return ctx.reply('Pilihan tidak valid.');
      const prod = products[n - 1];
      sess.data.product = prod;

      if (prod.variants && prod.variants.length > 0) {
        const lines = prod.variants.map((v, i) => `${i + 1}. ${v.name}`);
        sess.step = 'ADD_STOCK_SELECT_VARIANT';
        return ctx.reply(['Pilih variasi:', ...lines].join('\n'));
      }

      sess.step = 'ADD_STOCK_INPUT';
      return ctx.reply(
        `Masukkan stok untuk <b>${prod.name}</b>.\nSatu item per baris:\n<code>item1\nitem2\nitem3</code>`,
        { parse_mode: 'HTML' }
      );
    }

    case 'ADD_STOCK_SELECT_VARIANT': {
      const prod = sess.data.product;
      const n = parseInt(text, 10);
      if (!n || n < 1 || n > prod.variants.length) return ctx.reply('Pilihan tidak valid.');
      sess.data.variant = prod.variants[n - 1];
      sess.step = 'ADD_STOCK_INPUT';
      return ctx.reply(
        `Masukkan stok untuk variasi <b>${sess.data.variant.name}</b>.\nSatu item per baris:`,
        { parse_mode: 'HTML' }
      );
    }

    case 'ADD_STOCK_INPUT': {
      const items = parseStockLines(text);
      if (items.length === 0) return ctx.reply('Tidak ada stok valid.');
      const prod = sess.data.product;
      const variant = sess.data.variant;

      await withDb((db) => {
        const p = db.products.find((x) => x.id === prod.id);
        if (!p) return;
        if (variant) {
          const v = p.variants.find((x) => x.id === variant.id);
          if (v) {
            if (!v.stock) v.stock = [];
            v.stock.push(...items);
          }
        } else {
          if (!p.stock) p.stock = [];
          p.stock.push(...items);
        }
      });

      clearAdminSession(userId);
      return ctx.reply(`✅ ${items.length} item stok berhasil ditambahkan.`, adminMenuKeyboard());
    }

    case 'SET_HARGA_SELECT': {
      const products = sess.data.products || [];
      const n = parseInt(text, 10);
      if (!n || n < 1 || n > products.length) return ctx.reply('Pilihan tidak valid.');
      sess.data.product = products[n - 1];
      sess.step = 'SET_HARGA_INPUT';
      return ctx.reply(`Masukkan harga baru untuk "<b>${sess.data.product.name}</b>" (angka):`, {
        parse_mode: 'HTML',
      });
    }

    case 'SET_HARGA_INPUT': {
      const price = parseInt(text, 10);
      if (isNaN(price) || price <= 0) return ctx.reply('Harga tidak valid.');
      const prod = sess.data.product;
      await withDb((db) => {
        const p = db.products.find((x) => x.id === prod.id);
        if (p) p.price = price;
      });
      clearAdminSession(userId);
      return ctx.reply(`✅ Harga "<b>${prod.name}</b>" diubah ke ${formatRupiah(price)}.`, {
        parse_mode: 'HTML',
        ...adminMenuKeyboard(),
      });
    }

    case 'BROADCAST_TEXT': {
      const result = await sendBroadcast(ctx.telegram, text);
      clearAdminSession(userId);
      return ctx.reply(
        `📢 Broadcast selesai!\n✅ Terkirim: ${result.sent}\n❌ Gagal: ${result.failed}\n👥 Total: ${result.total}`,
        adminMenuKeyboard()
      );
    }

    default:
      break;
  }
}

async function handleAdminInlineCallback(ctx) {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Akses ditolak.');
    return;
  }

  const data = ctx.callbackQuery.data;
  const [action, productId] = data.split(':');

  const userId = String(ctx.from.id);
  const sess = getAdminSession(userId);

  if (action === 'admin_deactivate') {
    await withDb((db) => {
      const p = db.products.find((x) => x.id === productId);
      if (p) p.isActive = false;
    });
    await ctx.answerCbQuery('Produk dinonaktifkan.');
    return ctx.editMessageText(`🚫 Produk <code>${productId}</code> dinonaktifkan.`, { parse_mode: 'HTML' });
  }

  if (action === 'admin_add_variant') {
    sess.step = 'ADMIN_ADD_VARIANT_NAME';
    sess.data = { productId };
    await ctx.answerCbQuery();
    return ctx.reply(`Masukkan nama variasi baru untuk produk <code>${productId}</code>:`, { parse_mode: 'HTML' });
  }

  if (action === 'admin_del_variant') {
    const db = getDb();
    const prod = db.products.find((p) => p.id === productId);
    if (!prod || !prod.variants || prod.variants.length === 0) {
      await ctx.answerCbQuery('Tidak ada variasi.');
      return;
    }
    sess.step = 'ADMIN_DEL_VARIANT_SELECT';
    sess.data = { productId, variants: prod.variants };
    await ctx.answerCbQuery();
    const lines = prod.variants.map((v, i) => `${i + 1}. ${v.name}`);
    return ctx.reply(['Pilih variasi yang dihapus:', ...lines].join('\n'));
  }

  if (action === 'admin_add_stock') {
    sess.step = 'ADMIN_ADD_STOCK_DIRECT';
    sess.data = { productId };
    await ctx.answerCbQuery();
    return ctx.reply(`Masukkan stok untuk produk <code>${productId}</code>.\nSatu item per baris:`, {
      parse_mode: 'HTML',
    });
  }

  if (action === 'admin_del_stock') {
    await withDb((db) => {
      const p = db.products.find((x) => x.id === productId);
      if (p) p.stock = [];
    });
    await ctx.answerCbQuery('Stok dihapus.');
    return ctx.editMessageText(`🗑️ Stok produk <code>${productId}</code> dihapus.`, { parse_mode: 'HTML' });
  }

  await ctx.answerCbQuery();
}

function getAdminSessionForBot(userId) {
  return adminSessions[userId] || null;
}

module.exports = {
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
};
