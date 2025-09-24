import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import Joi from 'joi';
import prettier from 'prettier';
import acorn from 'acorn';
import pLimit from 'p-limit';
import ignore from 'ignore';
import { pathToFileURL } from 'url';
import logger from './logger.js';

// Variabel tingkat modul untuk menyimpan state
let cache = {};
let config;
let emitter;
let ignorer;

// --- Inisialisasi & Konfigurasi ---

/**
 * Menginisialisasi modul inti dengan konfigurasi, event emitter, dan aturan ignore.
 * @param {object} cfg - Objek konfigurasi yang dimuat.
 * @param {import('events').EventEmitter} eventEmitter - Instance EventEmitter untuk komunikasi antar modul.
 */
export async function initialize(cfg, eventEmitter) {
    config = cfg;
    emitter = eventEmitter;
    ignorer = ignore().add(config.ignorePatterns || []);

    // Memuat aturan .gitignore dari root proyek
    try {
        const gitignorePath = path.join(config.rootDir, '.gitignore');
        const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
        ignorer.add(gitignoreContent);
        emitter.emit('core:gitignore:loaded', { path: gitignorePath });
    } catch (e) {
        // Abaikan jika .gitignore tidak ada
    }

    // --- PEMUAT PLUGIN CERDAS ---
    // Muat dan inisialisasi plugin dengan opsi kustom
    for (const pluginEntry of config.plugins || []) {
        let pluginPath;
        let pluginOptions = {}; // Opsi default adalah objek kosong

        try {
            // Cek apakah entri adalah array [path, options] atau hanya string path
            if (Array.isArray(pluginEntry)) {
                pluginPath = pluginEntry[0];
                pluginOptions = pluginEntry[1] || {};
            } else {
                pluginPath = pluginEntry; // Untuk kompatibilitas mundur
            }

            const absolutePath = path.resolve(config.rootDir, pluginPath);
            const pluginModule = await import(pathToFileURL(absolutePath));
            
            // Melewatkan opsi yang sudah di-parse ke fungsi inisialisasi plugin
            pluginModule.default({ emitter, logger, config: cfg, options: pluginOptions }); 
            
            emitter.emit('core:plugin:loaded', { path: pluginPath });
        } catch (error) {
            logger.error(`Failed to load plugin from ${pluginPath || pluginEntry}`, error);
        }
    }

    await loadCache();
}

/**
 * Menganalisis alasan sebuah file diabaikan.
 * @param {object} cfg - Objek konfigurasi.
 * @param {string} filePath - Path file yang akan dianalisis.
 * @returns {Promise<{rule: string, source: string}|null>}
 */
export async function analyzeIgnore(cfg, filePath) {
    const relativePath = path.relative(cfg.rootDir, filePath);
    
    // Cek aturan dari config
    for (const rule of cfg.ignorePatterns || []) {
        if (ignore().add(rule).ignores(relativePath)) {
            return { rule, source: 'qf.config.js' };
        }
    }
    
    // Cek aturan dari .gitignore
    try {
        const gitignorePath = path.join(cfg.rootDir, '.gitignore');
        const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
        const gitignoreRules = gitignoreContent.split(/\r?\n/).filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
        for (const rule of gitignoreRules) {
             if (ignore().add(rule).ignores(relativePath)) {
                return { rule, source: '.gitignore' };
             }
        }
    } catch (e) {
        // .gitignore tidak ada
    }

    return null;
}

// --- Manajemen Cache ---

/**
 * Memuat cache dari file dan melakukan invalidasi cerdas.
 */
async function loadCache() {
    try {
        const data = await fs.readFile(config.cacheFile, 'utf8');
        const parsedCache = JSON.parse(data);

        // Invalidasi Cache Cerdas: Jika versi cache atau hash config berubah, buang cache lama.
        if (parsedCache.version !== config.cacheVersion || parsedCache.configHash !== config.configHash) {
            logger.warn('Configuration or cache version changed. Invalidating cache.');
            cache = { version: config.cacheVersion, configHash: config.configHash, files: {} };
        } else {
            cache = parsedCache;
        }
    } catch {
        logger.warn('Cache not found. Starting fresh.');
        cache = { version: config.cacheVersion, configHash: config.configHash, files: {} };
    }
}

async function saveCache() {
    await fs.writeFile(config.cacheFile, JSON.stringify(cache, null, 2));
}

// --- Utilitas ---

async function getFileHash(content) {
  return crypto.createHash(config.hashAlgorithm).update(content).digest('hex');
}

// --- Logika Inti ---

/**
 * Memvalidasi file berdasarkan metadata, sintaks, dan plugin.
 * @param {string} filePath - Path ke file.
 * @returns {Promise<{isValid: boolean, reason?: string, hash?: string}>}
 */
async function validateFile(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size === 0) return { isValid: true, reason: 'Empty file' };

    const content = await fs.readFile(filePath);
    const contentHash = await getFileHash(content);
    const ext = path.extname(filePath).substring(1);

    // Validasi sintaks dasar
    if (ext === 'json') {
      try { JSON.parse(content.toString('utf8')); } 
      catch (e) { return { isValid: false, reason: `Invalid JSON syntax: ${e.message}` }; }
    } else if (['js', 'mjs', 'cjs'].includes(ext)) {
      try { acorn.parse(content.toString('utf8'), { ecmaVersion: 'latest', sourceType: 'module' }); } 
      catch (e) { return { isValid: false, reason: `Invalid JS syntax: ${e.message}` }; }
    }

    const fileData = { path: filePath, content: content.toString('utf8'), hash: contentHash, ext, size: stat.size };
    emitter.emit('file:before_validate', fileData);

    return { isValid: true, hash: contentHash };
  } catch (error) {
    return { isValid: false, reason: error.message };
  }
}

/**
 * Memindai file secara rekursif dengan mematuhi aturan ignore.
 * @param {string} dir - Direktori awal.
 * @returns {Promise<string[]>}
 */
export async function scanFiles(dir) {
  let results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(config.rootDir, fullPath);

    if (ignorer.ignores(relativePath)) continue;
    
    if (entry.isDirectory()) {
      results = results.concat(await scanFiles(fullPath));
    } else if (config.targetExtensions.includes(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Memproses semua file yang ditemukan secara paralel.
 * @param {string[]} files - Daftar file yang akan diproses.
 * @param {boolean} dryRun - Mode simulasi.
 * @returns {Promise<{stats: object, errors: object[]}>}
 */
export async function processFiles(files, dryRun = false) {
  const limit = pLimit(config.concurrency);
  const stats = { formatted: 0, skipped: 0, unchanged: 0, invalid: 0, total: files.length };
  const errors = [];

  const tasks = files.map(file => limit(async () => {
    const { isValid, reason, hash } = await validateFile(file);

    emitter.emit('file:validate', { file, isValid, reason });

    if (!isValid) {
        stats.invalid++;
        errors.push({ file, error: new Error(reason) });
        return;
    }
    
    if (cache.files && cache.files[file] === hash) {
        stats.skipped++;
        return;
    }

    if (dryRun) {
        logger.info(`DRY-RUN: Would format ${file}`);
        stats.formatted++;
        return;
    }

    try {
        const fileData = {
            path: file,
            content: await fs.readFile(file, 'utf8'),
        };
        emitter.emit('format:before', fileData);

        const options = await prettier.resolveConfig(file);
        const formatted = await prettier.format(fileData.content, { ...options, filepath: file });

        emitter.emit('format:after', { file, originalContent: fileData.content, formattedContent: formatted });

        if (fileData.content !== formatted) {
            await fs.writeFile(file, formatted, 'utf8');
            const newContent = await fs.readFile(file);
            cache.files[file] = await getFileHash(newContent);
            stats.formatted++;
        } else {
            cache.files[file] = hash;
            stats.unchanged++;
        }
    } catch (err) {
        stats.invalid++;
        errors.push({ file, error: err });
        emitter.emit('format:error', { file, error: err });
    }
  }));

  await Promise.all(tasks);
  await saveCache();
  
  return { stats, errors };
}