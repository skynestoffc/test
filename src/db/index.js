'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

const DB_PATH = path.resolve(config.DB_PATH);

const defaultDb = {
  users: {},
  categories: [],
  products: [],
  orders: [],
  settings: {
    welcomeMessage: 'Selamat datang di Auto Order Bot!',
    botName: 'Auto Order Bot',
  },
};

let _db = null;
let _locked = false;
const _queue = [];

function acquireLock() {
  return new Promise((resolve) => {
    if (!_locked) {
      _locked = true;
      resolve();
    } else {
      _queue.push(resolve);
    }
  });
}

function releaseLock() {
  if (_queue.length > 0) {
    const next = _queue.shift();
    next();
  } else {
    _locked = false;
  }
}

function load() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2), 'utf8');
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    _db = JSON.parse(raw);

    if (!_db.users) _db.users = {};
    if (!_db.categories) _db.categories = [];
    if (!_db.products) _db.products = [];
    if (!_db.orders) _db.orders = [];
    if (!_db.settings) _db.settings = defaultDb.settings;

    return _db;
  } catch (err) {
    logger.error('Failed to load DB:', err);
    _db = JSON.parse(JSON.stringify(defaultDb));
    return _db;
  }
}

function getDb() {
  if (!_db) load();
  return _db;
}

async function saveDb() {
  await acquireLock();
  try {
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_PATH);
  } catch (err) {
    logger.error('Failed to save DB:', err);
    throw err;
  } finally {
    releaseLock();
  }
}

async function withDb(fn) {
  await acquireLock();
  try {
    if (!_db) load();
    const result = await fn(_db);
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_PATH);
    return result;
  } catch (err) {
    logger.error('withDb error:', err);
    throw err;
  } finally {
    releaseLock();
  }
}

module.exports = { load, getDb, saveDb, withDb };
