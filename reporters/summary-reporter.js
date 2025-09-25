// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// reporters/summary-reporter.js (ENHANCED DEBUGGING EDITION)
import chalk from 'chalk';

const BOX_CHARS = {
    topLeft: '┌', topRight: '┐',
    bottomLeft: '└', bottomRight: '┘',
    middle: '│', left: '├', right: '┤',
    horizontal: '─',
};

function formatLine(content, width) {
    // Menghapus kode warna ANSI saat mengukur panjang untuk padding yang akurat
    const strippedContent = content.replace(/\u001b\[[0-9;]*m/g, '');
    const padding = ' '.repeat(Math.max(0, width - strippedContent.length + 1));
    return `${BOX_CHARS.middle} ${content}${padding}${BOX_CHARS.middle}`;
}

function formatTitle(title, width) {
    const padding = Math.floor((width - title.length) / 2);
    const titleLine = `${BOX_CHARS.horizontal.repeat(padding)} ${chalk.bold(title)} ${BOX_CHARS.horizontal.repeat(width - title.length - padding)}`;
    return `${BOX_CHARS.topLeft}${titleLine}${BOX_CHARS.topRight}`;
}

export default function summaryReporter(summary, options = {}) {
    const { total, fulfilled, rejected, details, telemetry, files } = summary;
    const { isDryRun = false, isVerbose = false } = options;

    const terminalWidth = process.stdout.columns || 80;
    const contentWidth = Math.min(terminalWidth - 6, 100);

    console.log('');
    console.log(formatTitle('Vrzaq Run Report', contentWidth));
    
    if (isDryRun) {
        console.log(formatLine(chalk.yellow.bold('DRY RUN MODE ENABLED - NO FILES WERE CHANGED'), contentWidth));
    }

    console.log(`${BOX_CHARS.left}${BOX_CHARS.horizontal.repeat(contentWidth + 2)}${BOX_CHARS.right}`);
    console.log(formatLine(`${chalk.bold('Total Files:')}   ${chalk.cyan(total)}`, contentWidth));
    console.log(formatLine(`${chalk.green.bold('Successful:')}    ${chalk.green(fulfilled)}`, contentWidth));
    console.log(formatLine(`${chalk.red.bold('Failed:')}        ${chalk.red(rejected)}`, contentWidth));
    
    if (rejected > 0) {
        console.log(`${BOX_CHARS.left}${BOX_CHARS.horizontal.repeat(contentWidth + 2)}${BOX_CHARS.right}`);
        console.log(formatLine(chalk.red.bold('▼ FAILED FILES DETAILS'), contentWidth));
        
        details.forEach((result, index) => {
            if (result.status === 'rejected') {
                const filePath = files[index] || 'Unknown file';
                const errorMessage = result.reason?.message || 'An unknown error occurred.';
                
                console.log(formatLine(`📄 ${chalk.yellow(filePath)}`, contentWidth));
                console.log(formatLine(`   ${chalk.dim(errorMessage.split('\n')[0])}`, contentWidth));

                if (isVerbose && result.reason?.stack) {
                    const stackLines = result.reason.stack.split('\n').slice(1);
                    stackLines.forEach(line => console.log(formatLine(`     ${chalk.gray(line.trim())}`, contentWidth)));
                }
            }
        });
    }

    if (telemetry) {
        console.log(`${BOX_CHARS.left}${BOX_CHARS.horizontal.repeat(contentWidth + 2)}${BOX_CHARS.right}`);
        console.log(formatLine(chalk.magenta.bold('🚀 PERFORMANCE TELEMETRY'), contentWidth));
        const formatMs = (ms) => chalk.magenta(`${ms.toFixed(2)} ms`);
        
        console.log(formatLine(`Scan Phase:          ${formatMs(telemetry.scan)}`, contentWidth));
        if (telemetry.backup > 0) console.log(formatLine(`Backup Phase:        ${formatMs(telemetry.backup)}`, contentWidth));
        console.log(formatLine(`Processing Phase:    ${formatMs(telemetry.processing)}`, contentWidth));
        console.log(formatLine(`${chalk.bold('Total Duration:')}        ${formatMs(telemetry.total)}`, contentWidth));
    }
    
    console.log(`${BOX_CHARS.bottomLeft}${BOX_CHARS.horizontal.repeat(contentWidth + 2)}${BOX_CHARS.bottomRight}`);
    console.log('');
}