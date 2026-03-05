'use strict';

const { Markup } = require('telegraf');

function qtyKeyboard(orderId, qty, maxQty) {
  const rows = [
    [
      Markup.button.callback('➖', `qty_minus:${orderId}`),
      Markup.button.callback(`  ${qty}  `, `qty_show:${orderId}`),
      Markup.button.callback('➕', `qty_plus:${orderId}`),
    ],
    [
      Markup.button.callback('+10', `qty_add:${orderId}:10`),
      Markup.button.callback('+25', `qty_add:${orderId}:25`),
      Markup.button.callback('+50', `qty_add:${orderId}:50`),
    ],
    [
      Markup.button.callback('💳 QRIS', `pay_qris:${orderId}`),
      Markup.button.callback('💰 Saldo', `pay_saldo:${orderId}`),
    ],
    [Markup.button.callback('🔙 Kembali', `order_back:${orderId}`)],
  ];
  return Markup.inlineKeyboard(rows);
}

function payMethodKeyboard(orderId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💳 QRIS', `pay_qris:${orderId}`),
      Markup.button.callback('💰 Saldo', `pay_saldo:${orderId}`),
    ],
    [Markup.button.callback('🔙 Kembali', `order_back:${orderId}`)],
  ]);
}

function topupKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Rp 10.000', 'topup:10000'),
      Markup.button.callback('Rp 25.000', 'topup:25000'),
    ],
    [
      Markup.button.callback('Rp 50.000', 'topup:50000'),
      Markup.button.callback('Rp 100.000', 'topup:100000'),
    ],
  ]);
}

function cancelKeyboard(orderId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Batalkan', `cancel_order:${orderId}`)],
  ]);
}

function testimoniKeyboard(orderId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⭐ 1', `testi:${orderId}:1`),
      Markup.button.callback('⭐ 2', `testi:${orderId}:2`),
      Markup.button.callback('⭐ 3', `testi:${orderId}:3`),
      Markup.button.callback('⭐ 4', `testi:${orderId}:4`),
      Markup.button.callback('⭐ 5', `testi:${orderId}:5`),
    ],
    [Markup.button.callback('Lewati', `testi_skip:${orderId}`)],
  ]);
}

module.exports = { qtyKeyboard, payMethodKeyboard, topupKeyboard, cancelKeyboard, testimoniKeyboard };
