'use strict';

const config = require('../config/config');

const TIMEZONE = config.TIMEZONE || 'Asia/Jakarta';

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('id-ID', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + ' WIB';
}

function boxLine(width = 30) {
  return '─'.repeat(width);
}

function boxTitle(title, width = 30) {
  const pad = Math.max(0, Math.floor((width - title.length) / 2));
  return ' '.repeat(pad) + title;
}

function formatBox(title, lines, width = 32) {
  const top = `┌${'─'.repeat(width)}┐`;
  const bottom = `└${'─'.repeat(width)}┘`;
  const titleLine = `│ ${title.padEnd(width - 1)}│`;
  const sep = `├${'─'.repeat(width)}┤`;
  const body = lines.map((l) => `│ ${String(l).padEnd(width - 1)}│`).join('\n');
  return [top, titleLine, sep, body, bottom].join('\n');
}

function statusEmoji(status) {
  const map = {
    PENDING: '⏳',
    PAID: '✅',
    DELIVERED: '📦',
    FAILED: '❌',
    EXPIRED: '⌛',
    CANCELLED: '🚫',
  };
  return map[status] || '❓';
}

module.exports = { formatRupiah, formatDate, boxLine, boxTitle, formatBox, statusEmoji };
