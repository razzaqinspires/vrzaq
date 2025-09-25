#!/usr/bin/env node

// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// cli.js (INTERACTIVE & VISUAL SUPERIOR FULL EDITION)
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';
import process from 'process';
import prompts from 'prompts';

import { runQuantumFormatter, analyzeWhy } from './index.js';
import * as BackupManager from './backup-manager.js';
import { loadConfig } from './config.js';
import logger from './logger.js';

const program = new Command();
const startTime = performance.now();

/**
 * Membaca package.json untuk mendapatkan versi secara dinamis.
 */
async function getPackageVersion() {
    try {
        const pkg = JSON.parse(await fs.readFile(new URL('./package.json', import.meta.url)));
        return pkg.version || '0.0.0-dev';
    } catch {
        return '0.0.0-dev';
    }
}

/**
 * Mengatur reporter CLI interaktif yang mendengarkan event dari QuantumRunner.
 * @param {import('events').EventEmitter} emitter - Emitter dari QuantumRunner.
 */
function setupCliReporter(emitter) {
    const spinner = ora({ text: 'Initializing...', color: 'cyan' }).start();
    let fileProgress = { processed: 0, total: 0 };

    emitter.on('scan:complete', ({ fileCount }) => {
        fileProgress.total = fileCount;
        spinner.text = `Scan complete. Found ${chalk.bold(fileCount)} files to process.`;
    });

    emitter.on('file:processing', () => {
        fileProgress.processed++;
        const progress = `[${fileProgress.processed}/${fileProgress.total}]`;
        spinner.text = `Processing files... ${chalk.yellow(progress)}`;
    });

    emitter.on('backup:start', () => {
        spinner.text = 'Creating backup...';
    });

    emitter.on('backup:complete', () => {
        spinner.info('Backup created successfully.');
    });

    emitter.on('run:complete', (summary) => {
        spinner.succeed(chalk.green('Formatting run completed!'));
        console.log(chalk.blue(`✨ Formatted: ${summary.fulfilled}, Failed: ${summary.rejected}, Total: ${summary.total}`));
    });

    emitter.on('run:error', ({ error }) => {
        spinner.fail(chalk.red('A critical error occurred during the run.'));
        logger.error(error.message, error);
    });

    emitter.on('watch:run:start', ({ files }) => {
        spinner.start(`Change detected in ${files.length} files. Processing...`);
    });

    emitter.on('watch:run:complete', () => {
        spinner.succeed('Watch mode processed changes.');
        spinner.start('Watching for file changes...');
    });
}

/**
 * Fungsi utama CLI.
 */
async function main() {
    const config = await loadConfig();
    const pkgVersion = await getPackageVersion();

    program
        .name('vrzaq')
        .description(chalk.cyan(`⚡ Vrzaq Quantum-Formatter v${pkgVersion} - by Arifi Razzaq`))
        .version(pkgVersion)
        .option('--verbose', 'Enable verbose logging for debugging.', false)
        .option('-q, --quiet', 'Suppress all non-error output.', false)
        .option('-y, --yes', 'Automatically answer yes to prompts.', false)
        .option('--json', 'Output results in JSON format.', false)
        .option('--ci', 'CI mode: enables --quiet, --yes, --json, --no-backup.', false)
        .hook('preAction', (thisCommand) => {
            const opts = thisCommand.opts();
            if (opts.ci) {
                Object.assign(opts, { quiet: true, yes: true, json: true });
            }
            logger.setLevels(opts);
        });

    program
        .command('run [files...]')
        .description('Scan, validate, and format target files. Optionally provide specific files.')
        .option('--no-backup', 'Skip creating a backup before running.')
        .option('--dry-run', 'Simulate formatting without modifying files.')
        .option('--watch', 'Run in continuous watch mode.')
        .action(async (files, options) => {
            const globalOptions = program.opts();
            const runOptions = {
                backup: options.backup && !globalOptions.ci,
                dryRun: options.dryRun,
                watch: options.watch,
                files: files.length > 0 ? files : null,
            };

            try {
                const emitter = await runQuantumFormatter(runOptions);
                if (globalOptions.json) {
                    emitter.on('run:complete', (summary) => console.log(JSON.stringify(summary, null, 2)));
                    emitter.on('run:error', (error) => {
                        console.error(JSON.stringify({ success: false, error }, null, 2));
                        process.exitCode = 1;
                    });
                } else {
                    setupCliReporter(emitter);
                }
                if (runOptions.watch) {
                    const shutdownHandler = async () => {
                        console.log(chalk.yellow('\n⚠️ Termination signal received. Shutting down gracefully...'));
                        await emitter.shutdown?.();
                        process.exit(0);
                    };
                    process.on('SIGINT', shutdownHandler);
                    process.on('SIGTERM', shutdownHandler);
                }
            } catch (error) {
                logger.error('Fatal error executing the run command:', error);
                process.exitCode = 1;
            }
        });

    program
        .command('why <file_path>')
        .description('Analyze and report why a specific file is being ignored.')
        .action(async (filePath) => {
            const spinner = ora('Analyzing ignore rules...').start();
            try {
                const result = await analyzeWhy(filePath);
                spinner.stop();
                if (program.opts().json) {
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    const status = result.isIgnored ? chalk.yellow('Ignored') : chalk.green('Not Ignored');
                    console.log(`- File:    ${chalk.cyan(result.file)}`);
                    console.log(`- Status:  ${status}`);
                    if (result.isIgnored) {
                        console.log(`- Rule:    ${chalk.magenta(result.reason.rule)}`);
                        console.log(`- Source:  ${chalk.dim(result.reason.source)}`);
                    }
                }
            } catch (err) {
                spinner.fail('Analysis failed.');
                logger.error('Error during analysis:', err);
                process.exitCode = 1;
            }
        });

    const backupCommand = program.command('backup').description('Manage project backups.');

    backupCommand.command('list').description('List all available backups.').action(async () => {
        const spinner = ora('Fetching backup list...').start();
        try {
            const backups = await BackupManager.listBackups();
            if (backups.length === 0) {
                spinner.info('No backups found.');
                return;
            }
            spinner.succeed('Available backups:');
            if (program.opts().json) {
                console.log(JSON.stringify(backups, null, 2));
            } else {
                backups.forEach(b => console.log(`  - ${chalk.cyan(b.name)} ${chalk.dim(`(${new Date(b.createdAt).toLocaleString()})`)}`));
            }
        } catch (err) {
            spinner.fail('Failed to list backups.');
            logger.error(err);
            process.exitCode = 1;
        }
    });

    backupCommand.command('restore <filename>').description('Restore a project state from a backup.').action(async (filename) => {
        if (!program.opts().yes) {
            const response = await prompts({ type: 'confirm', name: 'value', message: `Restore from "${filename}"? This will overwrite current files.`, initial: false });
            if (!response.value) {
                logger.warn('Restore operation cancelled.');
                return;
            }
        }
        const spinner = ora(`Restoring from backup "${filename}"...`).start();
        try {
            await BackupManager.restoreBackup(filename, true);
            spinner.succeed(chalk.green(`Backup "${filename}" restored successfully.`));
        } catch (err) {
            spinner.fail(chalk.red('Restore failed.'));
            logger.error('Details:', err);
            process.exitCode = 1;
        }
    });

    backupCommand.command('clean').description('Delete old backups.').option('-l, --limit <number>', 'Number of recent backups to keep.', '5').action(async (options) => {
        if (!program.opts().yes) {
            const response = await prompts({ type: 'confirm', name: 'value', message: `Proceed with deleting old backups (keeping ${options.limit})?`, initial: false });
            if (!response.value) {
                logger.warn('Cleanup cancelled.');
                return;
            }
        }
        const spinner = ora('Cleaning old backups...').start();
        try {
            const limit = parseInt(options.limit, 10);
            await BackupManager.cleanBackups(limit, true);
            spinner.succeed(`Cleanup complete. Kept ${limit} most recent backup(s).`);
        } catch (err) {
            spinner.fail('Backup cleanup failed.');
            logger.error('Details:', err);
            process.exitCode = 1;
        }
    });
    
    // Tambahkan potongan kode ini di dalam file cli.js
    backupCommand.command('verify').description('Verify integrity of all backups against their manifests.').action(async () => {
        const spinner = ora('Verifying all backup archives...').start();
        try {
            const report = await BackupManager.verifyBackups();
            spinner.succeed('Verification complete.');

            if (program.opts().json) {
                console.log(JSON.stringify(report, null, 2));
                return;
            }

            console.log(chalk.green(`  ✔ Healthy: ${report.healthy.length}`));
            if (report.corrupt.length > 0) {
                console.log(chalk.red(`  ✖ Corrupt: ${report.corrupt.length}`));
                report.corrupt.forEach(b => console.log(`    - ${b.file} (${b.reason})`));
            }
            if (report.orphaned_archives.length > 0) {
                console.log(chalk.yellow(`   orphaned Archives: ${report.orphaned_archives.length}`));
                report.orphaned_archives.forEach(f => console.log(`    - ${f}`));
            }
        } catch (err) {
            spinner.fail('Backup verification failed.');
            logger.error('Details:', err);
            process.exitCode = 1;
        }
    });
    
    backupCommand.command('info <filename>').description('Show detailed manifest info of a backup.').action(async (filename) => {
        const spinner = ora(`Fetching manifest for "${filename}"...`).start();
        try {
            const manifestPath = path.join(config.backupDir, `${filename}.manifest.json`);
            const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
            spinner.stop();
            if (program.opts().json) {
                console.log(JSON.stringify(manifest, null, 2));
            } else {
                console.log(chalk.cyan.bold(`Manifest for: ${manifest.archive}`));
                console.log(`- Created At:  ${new Date(manifest.createdAt).toLocaleString()}`);
                console.log(`- File Count:  ${manifest.files.count}`);
                console.log(`- Total Size:  ${manifest.files.totalSize} bytes`);
                console.log(`- Hash:        ${chalk.dim(manifest.archiveHash)}`);
            }
        } catch (err) {
            spinner.fail(`Failed to read manifest for "${filename}".`);
            if (err.code === 'ENOENT') {
                logger.error('Manifest file not found. The backup might be incomplete or from an older version.');
            } else {
                logger.error('Details:', err);
            }
            process.exitCode = 1;
        }
    });

    program.addHelpText('after', chalk.yellow(`
Examples:
  $ npx vrzaq run
  $ npx vrzaq run src/components/Button.js
  $ npx vrzaq run --watch
  $ npx vrzaq why ./node_modules/some-file.js
  $ npx vrzaq backup list
`));

    await program.parseAsync(process.argv);

    const executedCommand = program.args[0];
    if (executedCommand === 'run' && !program.rawArgs.includes('--watch')) {
        const endTime = performance.now();
        logger.verbose(`Total execution time: ${((endTime - startTime) / 1000).toFixed(2)}s`);
    }
}

main().catch((err) => {
    logger.error('A fatal unexpected error occurred in the CLI:', err);
    process.exit(1);
});