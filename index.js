// index.js
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import { loadConfig } from './config.js';
import { createBackup } from './backup-manager.js';
import { scanFiles, processFiles, initialize, analyzeIgnore } from './core.js';
import logger from './logger.js';

// Ekspor fungsi inti
export { BackupManager, Core } from './export-bridge.js'; // Buat file untuk re-export

/**
 * Fungsi inti yang dapat diekspor untuk menjalankan Quantum-Formatter secara programatik.
 * @param {object} options - Opsi untuk menjalankan proses.
 * @returns {Promise<EventEmitter>} Sebuah emitter yang akan menyiarkan event selama proses.
 */
export async function runQuantumFormatter(options = {}) {
    const emitter = new EventEmitter();
    const runOptions = {
        backup: options.backup !== false,
        dryRun: options.dryRun || false,
        reporter: options.reporter || 'summary',
        watch: options.watch || false,
    };

    const config = await loadConfig();
    await initialize(config, emitter); // Inisialisasi core dan berikan emitter

    async function run() {
        try {
            emitter.emit('run:start', { options: runOptions });
            const filesToProcess = await scanFiles(config.rootDir);
            emitter.emit('scan:complete', { fileCount: filesToProcess.length });
            
            if (runOptions.backup) {
                await createBackup(filesToProcess);
                emitter.emit('backup:complete');
            }

            const result = await processFiles(filesToProcess, runOptions.dryRun);
            emitter.emit('run:complete', result);
            return result;
        } catch (error) {
            emitter.emit('run:error', error);
            throw error;
        }
    }

    // --- Logika Mode Pengawasan (Watch Mode) ---
    if (runOptions.watch) {
        logger.info('👁️ Entering watch mode... (Press Ctrl+C to exit)');
        const watcher = chokidar.watch('.', {
            ignored: config.ignorePatterns,
            persistent: true,
            ignoreInitial: true,
        });

        const handleFileChange = async (filePath) => {
            logger.special(`File changed: ${filePath}. Triggering run...`);
            try {
                // Proses hanya file yang berubah untuk efisiensi maksimum
                const result = await processFiles([filePath], runOptions.dryRun);
                emitter.emit('watch:run:complete', result);
            } catch (error) {
                emitter.emit('watch:run:error', { filePath, error });
            }
        };
        
        watcher.on('add', handleFileChange).on('change', handleFileChange);
    } else {
        // --- Eksekusi Satu Kali ---
        const result = await run();
        const reporter = await loadReporter(runOptions.reporter);
        reporter(result);
    }

    return emitter;
}

// Helper untuk memuat reporter secara dinamis
async function loadReporter(name) {
    try {
        const { default: reporter } = await import(`./reporters/${name}-reporter.js`);
        return reporter;
    } catch (e) {
        logger.warn(`Reporter "${name}" not found. Falling back to summary.`);
        const { default: summary } = await import('./reporters/summary-reporter.js');
        return summary;
    }
}

export async function analyzeWhy(filePath) {
    const config = await loadConfig();
    const reason = await analyzeIgnore(config, filePath);
    return { // <-- KUNCI: Kembalikan objek hasil
        isIgnored: !!reason,
        reason: reason || null,
        file: filePath
    };
}