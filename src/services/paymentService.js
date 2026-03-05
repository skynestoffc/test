'use strict';

const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');
const { withDb, getDb } = require('../db');

const API_BASE = 'https://api.komputerz.site/';

async function createPayment(amount) {
  const url = `${API_BASE}?action=createpayment&apikey=${config.APIKEY}&username=${config.USERNAME_API}&amount=${amount}&token=${config.TOKEN_API}`;
  try {
    const res = await axios.get(url, { timeout: 15000 });
    return res.data;
  } catch (err) {
    logger.error('createPayment error:', err.message);
    throw err;
  }
}

async function checkMutasi() {
  const url = `${API_BASE}?action=mutasiqr&apikey=${config.APIKEY}&username=${config.USERNAME_API}&token=${config.TOKEN_API}`;
  try {
    const res = await axios.get(url, { timeout: 15000 });
    return res.data;
  } catch (err) {
    logger.error('checkMutasi error:', err.message);
    throw err;
  }
}

async function verifyPaid(orderId, amount) {
  const db = getDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return { paid: false };

  try {
    const mutasiData = await checkMutasi();
    const mutations = Array.isArray(mutasiData)
      ? mutasiData
      : mutasiData && Array.isArray(mutasiData.data)
        ? mutasiData.data
        : [];

    for (const m of mutations) {
      const mAmount = Number(m.amount || m.nominal || 0);
      const mId = String(m.id || m.trxId || m.ref || '');

      if (!db.usedMutationIds) db.usedMutationIds = [];

      if (mAmount >= amount && !db.usedMutationIds.includes(mId)) {
        await withDb((d) => {
          if (!d.usedMutationIds) d.usedMutationIds = [];
          if (!d.usedMutationIds.includes(mId)) {
            d.usedMutationIds.push(mId);
          }
        });
        return { paid: true, mutationId: mId };
      }
    }
    return { paid: false };
  } catch (err) {
    logger.error('verifyPaid error:', err.message);
    return { paid: false };
  }
}

module.exports = { createPayment, checkMutasi, verifyPaid };
