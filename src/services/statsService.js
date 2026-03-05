'use strict';

const { getDb } = require('../db');

function getBestSeller(limit = 10) {
  const db = getDb();
  return db.products
    .filter((p) => p.isActive)
    .sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0))
    .slice(0, limit);
}

function getTotalSold() {
  const db = getDb();
  return db.products.reduce((sum, p) => sum + (p.totalSold || 0), 0);
}

function getTotalTransactions() {
  const db = getDb();
  return db.orders.filter((o) => o.status === 'DELIVERED').length;
}

function getTotalUsers() {
  const db = getDb();
  return Object.keys(db.users).length;
}

function getStats() {
  const db = getDb();
  const totalOrders = db.orders.length;
  const delivered = db.orders.filter((o) => o.status === 'DELIVERED').length;
  const totalRevenue = db.orders
    .filter((o) => o.status === 'DELIVERED')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  return {
    totalUsers: getTotalUsers(),
    totalOrders,
    delivered,
    totalRevenue,
    totalSold: getTotalSold(),
    bestSellers: getBestSeller(5),
  };
}

module.exports = { getBestSeller, getTotalSold, getTotalTransactions, getTotalUsers, getStats };
