// reporters/summary-reporter.js
import logger from '../logger.js';

export default function summaryReporter(result) {
    logger.success('Run completed.');
    logger.dim(`Result: ${result.stats.formatted} formatted, ${result.stats.skipped} skipped, ${result.stats.unchanged} unchanged, ${result.stats.invalid} invalid/error.`);
    if (result.errors.length > 0) {
        logger.warn('Errors occurred on the following files:');
        result.errors.forEach(err => logger.dim(`  - ${err.file}: ${err.error.message}`));
    }
}