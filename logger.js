// logger.js
import chalk from 'chalk';

const log = console.log;
let isQuiet = false;
let isVerbose = false;

export default {
  setLevels: (options) => {
    isQuiet = options.quiet || false;
    isVerbose = options.verbose || false;
  },
  info: (message) => !isQuiet && log(chalk.blue(`ℹ️ ${message}`)),
  success: (message) => !isQuiet && log(chalk.green(`✅ ${message}`)),
  warn: (message) => !isQuiet && log(chalk.yellow(`⚠️ ${message}`)),
  error: (message, error = null) => {
    log(chalk.red(`❌ ${message}`));
    if (error && isVerbose) {
      log(chalk.red(error.stack || error));
    }
  },
  special: (message) => !isQuiet && log(chalk.magenta(`✨ ${message}`)),
  dim: (message) => !isQuiet && log(chalk.dim(message)),
  verbose: (message) => isVerbose && !isQuiet && log(chalk.gray(`🔧 ${message}`)),
};