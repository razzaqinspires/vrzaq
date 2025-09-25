// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// core.js (EXTREME SUPERIOR EDITION)
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import Joi from 'joi';
import prettier from 'prettier';
import * as acorn from 'acorn';
import pLimit from 'p-limit';
import ignore from 'ignore';
import { pathToFileURL } from 'url';
import { performance } from 'perf_hooks';
import logger from './logger.js';

// =======================
// 🔹 State Modul Terenkapsulasi
// =======================
const state = {
    cache: {},
    config: null,
    emitter: null,
    ignorer: null,
    cacheLock: false,
    telemetryStats: {
        startTime: Date.now(),
        processed: 0,
        errors: 0,
        formatted: 0,
        verified: 0,
    },
};

// =======================
// 🔹 Utility Functions
// =======================

/**
 * Menghitung hash dari konten dengan fallback algorithm jika terjadi error.
 * @param {string|Buffer} content Konten untuk di-hash.
 * @param {string[]} algos Algoritma yang akan dicoba berurutan.
 * @returns {Promise<string>} Nilai hash dalam hex.
 */
async function safeHash(content, algos = ['sha256', 'md5']) {
    for (const algo of algos) {
        try {
            return crypto.createHash(algo).update(content).digest('hex');
        } catch (e) {
            logger.warn(`Hash algorithm ${algo} not supported, falling back...`);
        }
    }
    return crypto.createHash('sha1').update(content).digest('hex'); // Fallback pamungkas
}

/**
 * Menyimpan file recovery ke direktori terpusat untuk mencegah polusi direktori kerja.
 * @param {string} file Path file asli.
 * @param {string} content Konten untuk disimpan.
 */
async function saveRecoveryFile(file, content) {
    try {
        const recoveryDir = path.join(os.tmpdir(), 'razzaq_recovery');
        await fs.mkdir(recoveryDir, { recursive: true });
        const recoveryPath = path.join(recoveryDir, `${path.basename(file)}.recovery-${Date.now()}`);
        await fs.writeFile(recoveryPath, content, 'utf8');
        logger.warn(`Recovery file created: ${recoveryPath}`);
        state.emitter?.emit('file:recovery:saved', { file, recoveryPath });
    } catch (err) {
        logger.error(`Failed to create recovery file for ${file}:`, err);
    }
}

/**
 * Memuat cache dari disk. Menginvalidasi jika versi atau hash konfigurasi berubah.
 */
async function loadCache() {
    try {
        const data = await fs.readFile(state.config.cacheFile, 'utf8');
        const parsedCache = JSON.parse(data);

        // Validasi yang lebih ketat: versi dan hash config harus cocok.
        if (parsedCache.version !== state.config.cacheVersion || parsedCache.configHash !== state.config.configHash) {
            logger.warn('⚠️ Cache invalidated due to version/config mismatch. Starting fresh.');
            state.cache = { version: state.config.cacheVersion, configHash: state.config.configHash, files: {} };
        } else {
            state.cache = parsedCache;
            logger.verbose(`Cache loaded. Found ${Object.keys(state.cache.files).length} entries.`);
        }
        state.emitter?.emit('cache:loaded', { count: Object.keys(state.cache.files).length });
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.info('Cache file not found, starting fresh.');
        } else {
            logger.warn('Cache file corrupted or unreadable, starting fresh.', err);
        }
        state.cache = { version: state.config.cacheVersion, configHash: state.config.configHash, files: {} };
    }
}

/**
 * Menyimpan cache ke disk menggunakan metode penulisan atomik untuk mencegah korupsi.
 */
async function saveCache() {
    if (state.cacheLock) {
        logger.debug('Cache save skipped, lock is active.');
        return;
    }
    state.cacheLock = true;
    const tempFile = `${state.config.cacheFile}.${Date.now()}.tmp`;
    try {
        await fs.writeFile(tempFile, JSON.stringify(state.cache, null, 2));
        await fs.rename(tempFile, state.config.cacheFile); // Operasi atomik
        state.emitter?.emit('cache:saved', { count: Object.keys(state.cache.files).length });
    } catch (err) {
        logger.error('Failed to save cache:', err);
        // Coba hapus file sementara jika masih ada
        await fs.unlink(tempFile).catch(() => {});
    } finally {
        state.cacheLock = false;
    }
}

// =======================
// 🔹 Initialization
// =======================
export async function initialize(cfg, eventEmitter) {
    state.config = cfg;
    state.emitter = eventEmitter;
    state.ignorer = ignore().add(state.config.ignorePatterns || []);

    // Load .gitignore
    try {
        const gitignorePath = path.join(state.config.rootDir, '.gitignore');
        const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
        state.ignorer.add(gitignoreContent);
        state.emitter.emit('core:gitignore:loaded', { path: gitignorePath });
    } catch {
        logger.verbose('No .gitignore found, skipping.');
    }

    // Load plugins
    for (const pluginEntry of state.config.plugins || []) {
        let pluginPath, pluginOptions = {};
        try {
            if (Array.isArray(pluginEntry)) {
                [pluginPath, pluginOptions] = pluginEntry;
            } else {
                pluginPath = pluginEntry;
            }

            const absolutePath = path.resolve(state.config.rootDir, pluginPath);
            const pluginModule = await import(pathToFileURL(absolutePath));
            
            // Panggil plugin dengan API yang diperkaya
            pluginModule.default?.({ emitter: state.emitter, logger, config: cfg, options: pluginOptions });

            state.emitter.emit('core:plugin:loaded', { path: pluginPath });
        } catch (err) {
            logger.error(`Plugin load failed for ${pluginPath}`, err);
        }
    }

    await loadCache();
}

// =======================
// 🔹 Ignore Analyzer
// =======================
export async function analyzeIgnore(cfg, filePath) {
    const relativePath = path.relative(cfg.rootDir, filePath);

    for (const rule of cfg.ignorePatterns || []) {
        if (ignore().add(rule).ignores(relativePath)) {
            return { rule, source: 'razzaq.config.js' };
        }
    }

    try {
        const gitignorePath = path.join(cfg.rootDir, '.gitignore');
        const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
        const gitignoreRules = gitignoreContent
            .split(/\r?\n/)
            .filter(line => line.trim() && !line.trim().startsWith('#'));

        for (const rule of gitignoreRules) {
            if (ignore().add(rule).ignores(relativePath)) {
                return { rule, source: '.gitignore' };
            }
        }
    } catch {}
    return null;
}

// =======================
// 🔹 Validation
// =======================
async function validateFile(filePath, stat) {
    try {
        if (stat.size === 0) {
            state.emitter.emit('file:validate:skip', { file: filePath, reason: 'Empty file' });
            return { isValid: true, reason: 'Empty file' };
        }
        
        if (stat.size > state.config.maxFileSize) {
            return { isValid: false, reason: `File too large (${stat.size} bytes vs limit ${state.config.maxFileSize})` };
        }
        
        const content = await fs.readFile(filePath, 'utf8');
        const contentHash = await safeHash(content);
        const ext = path.extname(filePath).slice(1);

        // Syntax check
        if (['json', 'jsonc'].includes(ext)) {
            try {
                JSON.parse(content);
            } catch (e) {
                return { isValid: false, reason: `Invalid JSON syntax: ${e.message}` };
            }
        } else if (['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx'].includes(ext)) {
            try {
                // Gunakan sourceType 'unambiguous' untuk fleksibilitas
                acorn.parse(content, { ecmaVersion: 'latest', sourceType: 'unambiguous', locations: false });
            } catch (e) {
                return { isValid: false, reason: `Invalid JS/TS syntax: ${e.message}` };
            }
        }

        state.emitter.emit('file:validated', { file: filePath, hash: contentHash, size: stat.size });
        return { isValid: true, hash: contentHash };
    } catch (err) {
        return { isValid: false, reason: err.message };
    }
}

// =======================
// 🔹 File Scanning (Skalabilitas Tinggi dengan Generator)
// =======================
/**
 * Memindai file secara rekursif sebagai async generator untuk efisiensi memori.
 * @param {string} dir Direktori awal.
 * @yields {string} Path lengkap ke file yang ditemukan.
 */
export async function* scanFilesGenerator(dir) {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(state.config.rootDir, fullPath);

            if (state.ignorer.ignores(relativePath)) {
                state.emitter?.emit('file:ignored', { file: fullPath, reason: 'Matches ignore pattern' });
                continue;
            }

            if (entry.isDirectory()) {
                yield* scanFilesGenerator(fullPath);
            } else if (state.config.targetExtensions.includes(path.extname(entry.name))) {
                yield fullPath;
            }
        }
    } catch (err) {
        logger.error(`Error scanning directory ${dir}:`, err);
        state.emitter?.emit('scan:error', { directory: dir, error: err });
    }
}

// =======================
// 🔹 Processing Files
// =======================
export async function processFiles(filesIterator, dryRun = false) {
    const limit = pLimit(state.config.concurrency);
    const stats = { formatted: 0, skipped: 0, unchanged: 0, invalid: 0, total: 0 };
    const errors = [];
    const tasks = [];

    for await (const file of filesIterator) {
        stats.total++;
        tasks.push(limit(async () => {
            const processStart = performance.now();
            let originalContent;

            try {
                // 1. Dapatkan stat file sekali untuk efisiensi
                const fileStat = await fs.stat(file);
                originalContent = await fs.readFile(file, 'utf8');

                // 2. Validasi file
                const { isValid, reason, hash } = await validateFile(file, fileStat);
                if (!isValid) {
                    stats.invalid++;
                    errors.push({ file, error: new Error(reason) });
                    state.emitter.emit('file:validate:fail', { file, reason });
                    return;
                }

                // 3. Cek Cache yang Diperkuat (hash + mtime)
                const cacheEntry = state.cache.files?.[file];
                if (cacheEntry && cacheEntry.hash === hash && cacheEntry.mtime === fileStat.mtimeMs) {
                    stats.skipped++;
                    state.emitter.emit('file:cache:hit', { file });
                    return;
                }
                state.emitter.emit('file:cache:miss', { file });

                if (dryRun) {
                    logger.info(`DRY-RUN: Would format ${file}`);
                    stats.formatted++;
                    return;
                }

                // 4. Proses Formatting
                state.emitter.emit('format:before', { file, originalContent });
                const prettierConfigFromFile = await prettier.resolveConfig(file);
                
                // Langkah 2: Dapatkan overrides dari vrzaq.config.js
                const vrzaqPrettierOptions = state.config.prettier || {};
                // Langkah 3: Gabungkan semua konfigurasi dengan prioritas yang benar
                const finalPrettierOptions = {
                    ...prettierConfigFromFile, // Opsi dari .prettierrc
                    ...vrzaqPrettierOptions,    // Opsi dari vrzaq.config.js (akan menimpa jika ada yang sama)
                    filepath: file,             // Wajib ada agar Prettier tahu parser yang harus digunakan
                };

                const options = await prettier.resolveConfig(file);
                const formatted = await prettier.format(originalContent, { ...options, filepath: file, ...state.config.prettierOverrides });
                state.emitter.emit('format:after', { file, formattedContent: formatted });
                
                // 5. Tulis & Verifikasi
                if (originalContent !== formatted) {
                    await fs.writeFile(file, formatted, 'utf8');
                    
                    // 5a. VERIFIKASI EKSTREM: Baca kembali dan bandingkan hash
                    state.emitter.emit('file:verify:start', { file });
                    const writtenContent = await fs.readFile(file, 'utf8');
                    const newHash = await safeHash(formatted);
                    const writtenHash = await safeHash(writtenContent);

                    if (newHash !== writtenHash) {
                        throw new Error('Integrity check failed! File on disk differs from formatted content.');
                    }
                    state.telemetryStats.verified++;
                    state.emitter.emit('file:verify:success', { file });

                    // Update cache setelah verifikasi berhasil
                    const updatedStat = await fs.stat(file);
                    state.cache.files[file] = { hash: newHash, mtime: updatedStat.mtimeMs };
                    stats.formatted++;
                } else {
                    // Konten tidak berubah, cukup update cache
                    state.cache.files[file] = { hash, mtime: fileStat.mtimeMs };
                    stats.unchanged++;
                }

            } catch (err) {
                stats.invalid++;
                errors.push({ file, error: err });
                if (originalContent) { // Hanya buat recovery jika konten asli berhasil dibaca
                    await saveRecoveryFile(file, originalContent);
                }
                state.emitter.emit('format:error', { file, error: err });
            } finally {
                const duration = (performance.now() - processStart).toFixed(2);
                state.emitter.emit('file:processed', { file, duration });
            }
        }));
    }

    await Promise.all(tasks);
    await saveCache();

    state.telemetryStats.processed += stats.total;
    state.telemetryStats.formatted += stats.formatted;
    state.telemetryStats.errors += stats.invalid;

    return { stats, errors, telemetry: state.telemetryStats };
}