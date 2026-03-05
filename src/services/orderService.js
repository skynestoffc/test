'use strict';

const { withDb, getDb } = require('../db');
const logger = require('../utils/logger');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

async function createOrder({ userId, productId, variantId, qty, payMethod }) {
  const db = getDb();
  const product = db.products.find((p) => p.id === productId && p.isActive);
  if (!product) throw new Error('Produk tidak ditemukan');

  const variant = product.variants
    ? product.variants.find((v) => v.id === variantId)
    : null;

  const stock = variant ? variant.stock : product.stock || [];
  if (!stock || stock.length < qty) {
    throw new Error('Stok tidak mencukupi');
  }

  const price = variant ? variant.price : product.price;
  const totalAmount = price * qty;

  const order = {
    id: generateId(),
    userId: String(userId),
    productId,
    variantId: variantId || null,
    productName: product.name,
    variantName: variant ? variant.name : null,
    qty,
    price,
    totalAmount,
    payMethod,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deliveredStock: [],
    testimoni: null,
  };

  await withDb((d) => {
    d.orders.push(order);
  });

  return order;
}

async function deliverStock(orderId) {
  return withDb((d) => {
    const order = d.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order tidak ditemukan');
    if (order.status === 'DELIVERED') return order;

    const product = d.products.find((p) => p.id === order.productId);
    if (!product) throw new Error('Produk tidak ditemukan');

    const variant = order.variantId
      ? product.variants && product.variants.find((v) => v.id === order.variantId)
      : null;

    const stockArr = variant ? variant.stock : product.stock;
    if (!stockArr || stockArr.length < order.qty) {
      order.status = 'FAILED';
      order.updatedAt = new Date().toISOString();
      throw new Error('Stok habis saat pengiriman');
    }

    const delivered = stockArr.splice(0, order.qty);
    order.deliveredStock = delivered;
    order.status = 'DELIVERED';
    order.updatedAt = new Date().toISOString();

    product.totalSold = (product.totalSold || 0) + order.qty;

    return order;
  });
}

async function finalizeOrder(orderId, payMethod) {
  const db = getDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new Error('Order tidak ditemukan');

  if (payMethod === 'SALDO') {
    return withDb((d) => {
      const user = d.users[order.userId];
      if (!user) throw new Error('User tidak ditemukan');
      if ((user.saldo || 0) < order.totalAmount) {
        throw new Error('Saldo tidak mencukupi');
      }
      user.saldo -= order.totalAmount;
      const o = d.orders.find((x) => x.id === orderId);
      o.status = 'PAID';
      o.updatedAt = new Date().toISOString();
      return o;
    });
  }
  return order;
}

async function rollbackOrder(orderId) {
  return withDb((d) => {
    const order = d.orders.find((o) => o.id === orderId);
    if (order && order.status === 'PENDING') {
      order.status = 'EXPIRED';
      order.updatedAt = new Date().toISOString();
    }
    return order;
  });
}

module.exports = { createOrder, finalizeOrder, deliverStock, rollbackOrder };
