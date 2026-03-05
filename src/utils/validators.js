'use strict';

function isValidMenuNumber(input, min, max) {
  const n = parseInt(input, 10);
  return !isNaN(n) && n >= min && n <= max;
}

function parseMenuNumber(input) {
  return parseInt(input, 10);
}

function parseStockLines(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseStockLinesWithSep(text, sep = '|') {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(sep).map((p) => p.trim());
      return parts;
    });
}

function validateAmount(input) {
  const n = Number(input);
  return !isNaN(n) && n > 0 && Number.isFinite(n);
}

function validatePositiveInt(input) {
  const n = parseInt(input, 10);
  return !isNaN(n) && n > 0;
}

function sanitizeText(text) {
  return String(text || '').replace(/[<>]/g, '').trim();
}

module.exports = {
  isValidMenuNumber,
  parseMenuNumber,
  parseStockLines,
  parseStockLinesWithSep,
  validateAmount,
  validatePositiveInt,
  sanitizeText,
};
