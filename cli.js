#!/usr/bin/env node

import { Command } from 'commander';
import { runQuantumFormatter, analyzeWhy } from './index.js';
import { listBackups, restoreBackup, cleanBackups } from './backup-manager.js';
import { loadConfig } from './config.js';
import logger from './logger.js';
import { performance } from 'perf_hooks';

const program = new Command();

/**
 * Fungsi utama untuk menginisialisasi dan menjalankan Command-Line Interface.
 */
async function cli() {
    const startTime = performance.now();

    // Memuat konfigurasi untuk mendapatkan nilai default untuk beberapa opsi
    const config = await loadConfig();

    program
        .name('razzaq') // <-- Diperbarui sesuai brand Anda
        .description('An extensible, event-driven code processing platform by Razzaq.')
        .version('5.0.0') // Merefleksikan evolusi besar
        .option('-v, --verbose', 'Enable verbose logging for debugging.')
        .option('-q, --quiet', 'Suppress all output except for errors.')
        .option('-y, --yes', 'Automatically say yes to all prompts.');

    // Mengatur level log segera setelah opsi global di-parse
    const globalOptions = program.opts();
    logger.setLevels(globalOptions);
    
    //-------------------------------------------------------------------------
    // PERINTAH UTAMA: RUN
    //-------------------------------------------------------------------------
    program
        .command('run')
        .description('Scan, validate, and format target files.')
        .option('--no-backup', 'Skip creating a backup before running.')
        .option('--dry-run', 'Simulate formatting without modifying files.')
        .option('--watch', 'Run in continuous watch mode to format files on change.')
        .option('--reporter <name>', 'Specify the output format (summary, json)', 'summary')
        .action(async (options) => {
            try {
                // Meneruskan semua opsi yang relevan ke fungsi inti
                await runQuantumFormatter({
                    backup: options.backup,
                    dryRun: options.dryRun,
                    watch: options.watch,
                    reporter: options.reporter,
                });
            } catch (error) {
                logger.error('The CLI process encountered a fatal error:', error);
                process.exit(1);
            }
        });

    //-------------------------------------------------------------------------
    // PERINTAH ANALISIS: WHY
    //-------------------------------------------------------------------------
    program
        .command('why <file_path>')
        .description('Analyze and report exactly why a specific file is being ignored.')
        .action(analyzeWhy);

    //-------------------------------------------------------------------------
    // SUITE PERINTAH: BACKUP
    //-------------------------------------------------------------------------
    const backupCommand = program.command('backup').description('Manage project backups.');

    backupCommand
        .command('list')
        .description('List all available backups.')
        .action(listBackups);

    backupCommand
        .command('restore <filename>')
        .description('Restore a project state from a backup.')
        .action((filename) => {
            // Menggunakan opsi global --yes
            restoreBackup(filename, globalOptions.yes);
        });

    backupCommand
        .command('clean')
        .description('Delete old backups, keeping the most recent N backups.')
        .option('-l, --limit <number>', 'Number of recent backups to keep.', config.backupRetentionLimit.toString())
        .action((options) => {
            // Menggunakan opsi global --yes
            cleanBackups(parseInt(options.limit, 10), globalOptions.yes);
        });

    //-------------------------------------------------------------------------
    // EKSEKUSI
    //-------------------------------------------------------------------------
    await program.parseAsync(process.argv);
    
    // Menampilkan metrik performa di akhir eksekusi (tidak berlaku untuk mode --watch)
    if (program.args.includes('run') && !program.args.includes('--watch')) {
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        logger.verbose(`Total execution time: ${duration}s | Peak memory usage: ${memoryUsage} MB`);
    }
}


// Menjalankan fungsi CLI dan menangani error tak terduga
cli().catch(err => {
    logger.error('A fatal unexpected error occurred:', err);
    process.exit(1);
});