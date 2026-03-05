'use strict';

const { createBot } = require('./src/bot');
const { resumePendingPolls } = require('./src/handlers/userHandlers');
const logger = require('./src/utils/logger');

async function main() {
  const bot = createBot();

  // Resume any pending payment polls after restart
  resumePendingPolls(bot);

  bot.launch().then(() => {
    logger.info('Bot started successfully!');
  });

  process.once('SIGINT', () => {
    logger.info('Shutting down...');
    bot.stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    logger.info('Shutting down...');
    bot.stop('SIGTERM');
  });
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
