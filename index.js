// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// index.js (CLASS-BASED SUPERIOR ARCHITECTURE EDITION)
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import pLimit from 'p-limit';
import { performance } from 'perf_hooks';
import { loadConfig } from './config.js';
import logger from './logger.js';
import * as BackupManager from './backup-manager.js';
import * as Core from './core.js';

const { createBackup } = BackupManager;
const { scanFilesGenerator, processFiles, initialize, analyzeIgnore } = Core;

/**
 * QuantumRunner Class
 * Mengenkapsulasi semua state dan logika untuk satu sesi formatting.
 */
class QuantumRunner {
    constructor(userOptions = {}) {
        this.emitter = new EventEmitter();
        this.config = null; // Akan diisi saat inisialisasi

        // Validasi dan setel opsi run-time
        this.options = {
            backup: userOptions.backup !== false,
            dryRun: !!userOptions.dryRun,
            reporter: typeof userOptions.reporter === 'string' ? userOptions.reporter : 'summary',
            watch: !!userOptions.watch,
            concurrency: Number.isFinite(userOptions.concurrency) && userOptions.concurrency > 0 ? Math.floor(userOptions.concurrency) : 4,
            retry: Number.isFinite(userOptions.retry) && userOptions.retry >= 0 ? Math.floor(userOptions.retry) : 1,
            timeoutMs: Number.isFinite(userOptions.timeoutMs) && userOptions.timeoutMs > 0 ? Math.floor(userOptions.timeoutMs) : 60_000,
        };

        this.state = {
            sessionId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            shuttingDown: false,
            watcher: null,
            fileLocks: new Map(),
            debounceTimer: null,
            changeBuffer: new Set(),
        };

        // Ganti antrian manual dengan p-limit yang lebih tangguh
        this.queue = pLimit(this.options.concurrency);

        this.boundOnUnhandledRejection = this._onUnhandledRejection.bind(this);
        this.boundOnUncaughtException = this._onUncaughtException.bind(this);

        // Pasang metode shutdown ke emitter untuk akses dari luar
        this.emitter.shutdown = this.gracefulShutdown.bind(this);
    }

    /**
     * Memuat konfigurasi dan menginisialisasi modul Core.
     */
    async initialize() {
        this.emitter.emit('session:start', { sessionId: this.state.sessionId, options: this.options });
        logger.info(`🔧 Starting Quantum-Formatter session: ${this.state.sessionId}`);

        this.config = await loadConfig();
        await initialize(this.config, this.emitter);
        
        // Pasang global error handlers selama sesi aktif
        process.on('unhandledRejection', this.boundOnUnhandledRejection);
        process.on('uncaughtException', this.boundOnUncaughtException);
    }

    /**
     * Menjalankan proses utama: one-shot run atau watch mode.
     */
    async run() {
        if (this.options.watch) {
            await this._startWatcher();
        } else {
            await this._runOnce();
            await this.gracefulShutdown();
        }
        return this.emitter;
    }

    /**
     * Melakukan satu kali proses scan, backup, dan format.
     */
    async _runOnce() {
        if (this.state.shuttingDown) return;

        const telemetry = {
            scan: 0,
            backup: 0,
            processing: 0,
            total: 0,
        };
        const totalStart = performance.now();
        this.emitter.emit('run:start', { sessionId: this.state.sessionId });

        try {
            // Fase 1: Scan (menggunakan generator)
            const scanStart = performance.now();
            const filesIterator = scanFilesGenerator(this.config.rootDir);
            // Kita perlu mengubah iterator menjadi array untuk backup, tapi prosesor bisa stream.
            const filesToProcess = [];
            for await (const file of filesIterator) {
                filesToProcess.push(file);
            }
            telemetry.scan = performance.now() - scanStart;
            this.emitter.emit('scan:complete', { fileCount: filesToProcess.length, sessionId: this.state.sessionId });

            // Fase 2: Backup (opsional)
            if (this.options.backup && !this.options.dryRun) {
                const backupStart = performance.now();
                await createBackup(filesToProcess).catch(bkErr => {
                    this.emitter.emit('backup:error', { error: bkErr, sessionId: this.state.sessionId });
                    logger.warn(`[${this.state.sessionId}] Backup failed: ${bkErr?.message || bkErr}`);
                });
                telemetry.backup = performance.now() - backupStart;
                this.emitter.emit('backup:complete', { sessionId: this.state.sessionId });
            }

            // Fase 3: Processing
            const processingStart = performance.now();
            const processingTasks = filesToProcess.map(file => 
                this.queue(() => this._processFileWithRobustness(file))
            );
            const results = await Promise.allSettled(processingTasks);
            telemetry.processing = performance.now() - processingStart;

            const summary = {
                total: results.length,
                fulfilled: results.filter(s => s.status === 'fulfilled').length,
                rejected: results.filter(s => s.status === 'rejected').length,
                details: results,
                sessionId: this.state.sessionId,
            };

            this.emitter.emit('run:complete', summary);
            return summary;

        } catch (err) {
            this.emitter.emit('run:error', { error: err, sessionId: this.state.sessionId });
            logger.error(`[${this.state.sessionId}] A critical error occurred during run:`, err);
            throw err;
        } finally {
            telemetry.total = performance.now() - totalStart;
            this.emitter.emit('session:report', { sessionId: this.state.sessionId, telemetry });
        }
    }

    /**
     * Memproses satu file dengan mekanisme lock, retry, dan timeout.
     */
    async _processFileWithRobustness(filePath) {
        if (this.state.fileLocks.has(filePath)) {
            logger.special(`Waiting for existing lock on: ${filePath}`);
            return this.state.fileLocks.get(filePath);
        }

        const lockPromise = new Promise(async (resolve, reject) => {
            for (let attempt = 1; attempt <= this.options.retry + 1; attempt++) {
                if (this.state.shuttingDown) {
                    return reject(new Error('Shutdown initiated, aborting file processing.'));
                }
                
                try {
                    this.emitter.emit('file:processing', { file: filePath, attempt });
                    
                    const processingPromise = processFiles([filePath], this.options.dryRun);
                    const timeoutPromise = new Promise((_, rej) => 
                        setTimeout(() => rej(new Error('Processing timed out')), this.options.timeoutMs)
                    );
                    
                    const result = await Promise.race([processingPromise, timeoutPromise]);
                    
                    this.emitter.emit('file:complete', { file: filePath, result });
                    return resolve(result);

                } catch (err) {
                    this.emitter.emit('file:error', { file: filePath, attempt, error: err });
                    if (attempt > this.options.retry) {
                        return reject(err);
                    }
                    this.emitter.emit('file:retry', { file: filePath, nextAttempt: attempt + 1 });
                    await new Promise(r => setTimeout(r, 200 * attempt)); // Exponential backoff
                }
            }
        }).finally(() => {
            this.state.fileLocks.delete(filePath);
        });

        this.state.fileLocks.set(filePath, lockPromise);
        return lockPromise;
    }

    /**
     * Memulai watch mode menggunakan chokidar.
     */
    async _startWatcher() {
        logger.info('👁️ Entering watch mode... (Press Ctrl+C to exit)');
        
        await this._runOnce(); // Jalankan sekali di awal

        const watchOptions = {
            ignored: this.config.ignorePatterns,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
        };
        
        this.state.watcher = chokidar.watch(this.config.rootDir, watchOptions);

        const handleChange = (filePath) => {
            if (this.state.shuttingDown) return;
            logger.special(`File change detected: ${filePath}. Buffering for processing...`);
            this.state.changeBuffer.add(filePath);
            this._scheduleBufferedProcessing();
        };

        this.state.watcher
            .on('add', handleChange)
            .on('change', handleChange)
            .on('error', (err) => this.emitter.emit('watch:error', { error: err }));
    }

    /**
     * Menjadwalkan pemrosesan file yang berubah dengan debounce.
     */
    _scheduleBufferedProcessing() {
        if (this.state.debounceTimer) clearTimeout(this.state.debounceTimer);
        
        this.state.debounceTimer = setTimeout(async () => {
            const filesToProcess = Array.from(this.state.changeBuffer);
            this.state.changeBuffer.clear();

            if (filesToProcess.length > 0) {
                this.emitter.emit('watch:run:start', { files: filesToProcess });
                const tasks = filesToProcess.map(file => this.queue(() => this._processFileWithRobustness(file)));
                const results = await Promise.allSettled(tasks);
                this.emitter.emit('watch:run:complete', { results });
            }
        }, 300); // Debounce 300ms
    }

    /**
     * Melakukan graceful shutdown.
     */
    async gracefulShutdown() {
        if (this.state.shuttingDown) return;
        this.state.shuttingDown = true;
        this.emitter.emit('session:shutdown:start', { sessionId: this.state.sessionId });

        if (this.state.watcher) await this.state.watcher.close();
        if (this.state.debounceTimer) clearTimeout(this.state.debounceTimer);

        // Tunggu semua task yang sedang berjalan di antrian selesai
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        while (this.queue.activeCount > 0 || this.queue.pendingCount > 0) {
            await delay(50); // Cek status antrian setiap 50ms
        }

        // Hapus global handlers
        process.off('unhandledRejection', this.boundOnUnhandledRejection);
        process.off('uncaughtException', this.boundOnUncaughtException);

        this.emitter.emit('session:stop', { sessionId: this.state.sessionId });
        logger.info(`[${this.state.sessionId}] Shutdown complete.`);
    }
    
    // Global error handlers
    _onUnhandledRejection(reason) {
        logger.error(`[${this.state.sessionId}] Unhandled Promise Rejection:`, reason);
        this.emitter.emit('internal:unhandledRejection', { reason, sessionId: this.state.sessionId });
    }
    _onUncaughtException(err) {
        logger.error(`[${this.state.sessionId}] Uncaught Exception:`, err);
        this.emitter.emit('internal:uncaughtException', { error: err, sessionId: this.state.sessionId });
    }
}

// =======================
// 🔹 Public API
// =======================

/**
 * API utama: Menjalankan formatter dengan opsi yang diberikan.
 * Berfungsi sebagai factory untuk kelas QuantumRunner.
 */
export async function runQuantumFormatter(userOptions = {}) {
    const runner = new QuantumRunner(userOptions);
    try {
        await runner.initialize();
        // Jangan await run() di sini agar bisa kembali emitter untuk mode watch
        runner.run().catch(err => {
            logger.error('Quantum Runner execution failed.', err);
            // Pastikan shutdown dipanggil meskipun ada error
            runner.gracefulShutdown();
        });
        return runner.emitter;
    } catch (err) {
        logger.error('Quantum Runner initialization failed.', err);
        await runner.gracefulShutdown(); // Lakukan cleanup jika inisialisasi gagal
        throw err;
    }
}

/**
 * Menganalisis mengapa sebuah file diabaikan.
 */
export async function analyzeWhy(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        throw new TypeError('analyzeWhy expects a non-empty string for filePath');
    }
    const config = await loadConfig(); // Menggunakan config singleton
    const reason = await analyzeIgnore(config, filePath);
    return {
        isIgnored: !!reason,
        reason: reason || 'Not ignored by any rule.',
        file: filePath
    };
}