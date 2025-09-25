// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// config.js (VALIDATION & HIERARCHY SUPERIOR EDITION)
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { cosmiconfig } from 'cosmiconfig';
import Joi from 'joi';
import logger from './logger.js';

const EXPLORER_NAME = 'vrzaq'; // Diganti dari 'razzaq' agar konsisten dengan nama proyek
const ENV_PREFIX = 'VRZAQ_';

// Pola Singleton: cache konfigurasi setelah pemuatan pertama
let loadedConfig = null;

/**
 * Menghitung hash SHA256 dari objek konfigurasi untuk invalidasi cache.
 * @param {object} configObject Objek konfigurasi final.
 * @returns {string} Hash dalam format hex.
 */
function getConfigHash(configObject) {
    // Pastikan properti yang tidak stabil (seperti fungsi) tidak dimasukkan ke dalam hash
    const stableConfigString = JSON.stringify(configObject, (key, value) => 
        typeof value === 'function' ? undefined : value
    );
    return crypto.createHash('sha256').update(stableConfigString).digest('hex');
}

/**
 * Skema validasi Joi untuk semua opsi konfigurasi.
 * Ini memastikan semua konfigurasi valid sebelum aplikasi berjalan.
 */
const configSchema = Joi.object({
    rootDir: Joi.string().default(process.cwd()),
    backupDir: Joi.string().default(path.join(process.cwd(), ".backups_vrzaq")),
    targetExtensions: Joi.array().items(Joi.string().pattern(/^\./)).default(['.js', '.json', '.mjs', '.cjs', '.ts', '.jsx', '.tsx']),
    ignorePatterns: Joi.array().items(Joi.string()).default(['node_modules/**', '.git/**', '.backups_vrzaq/**']),
    backupRetentionLimit: Joi.number().integer().min(0).default(5),
    concurrency: Joi.number().integer().min(1).max(os.cpus().length * 2).default(Math.max(1, os.cpus().length - 1)),
    maxFileSize: Joi.number().integer().min(0).default(5 * 1024 * 1024), // Default 5 MB
    hashAlgorithm: Joi.string().default('sha256'),
    prettier: Joi.object().default({}),

    plugins: Joi.array().items(
        Joi.alternatives().try(
            Joi.string(),
            Joi.array().ordered(Joi.string().required(), Joi.object()).min(1).max(2)
        )
    ).default([]),
    
    cacheVersion: Joi.string().default('1.1.0'), // Versi cache dinaikkan karena struktur berubah
    prettierOverrides: Joi.object().default({}),
    logLevel: Joi.string().valid('verbose', 'info', 'quiet').default('info'),
    
    experimental: Joi.object({
        aiEnhancements: Joi.boolean().default(false),
        detectTODO: Joi.boolean().default(true),
    }).default(),

    // Properti yang dihasilkan secara internal, tidak boleh diisi oleh pengguna
    configHash: Joi.string(),
    cacheFile: Joi.string(),
});


/**
 * Memuat, memvalidasi, dan menggabungkan konfigurasi dari berbagai sumber.
 * Menggunakan pola singleton untuk memastikan ini hanya berjalan sekali.
 * Prioritas: Defaults < File Konfigurasi < Environment Variables.
 * @returns {Promise<object>} Objek konfigurasi yang telah divalidasi dan siap pakai.
 */
export async function loadConfig() {
    if (loadedConfig) {
        logger.verbose("Returning cached configuration.");
        return loadedConfig;
    }

    const explorer = cosmiconfig(EXPLORER_NAME);
    let userConfig = {};
    let configPath = 'defaults';

    try {
        const result = await explorer.search();
        if (result && result.config) {
            userConfig = result.config;
            configPath = result.filepath;
            logger.verbose(`Loaded user configuration from: ${configPath}`);
        } else {
            logger.verbose('No user configuration file found. Using defaults and environment variables.');
        }
    } catch (error) {
        logger.error('Error loading configuration file, falling back to defaults.', error);
    }

    // Ambil overrides dari environment variables
    const envOverrides = {
        concurrency: process.env[`${ENV_PREFIX}CONCURRENCY`] ? parseInt(process.env[`${ENV_PREFIX}CONCURRENCY`], 10) : undefined,
        logLevel: process.env[`${ENV_PREFIX}LOG_LEVEL`],
        // Tambahkan env var lain di sini jika perlu
    };
    
    // Hapus properti undefined agar tidak menimpa
    Object.keys(envOverrides).forEach(key => envOverrides[key] === undefined && delete envOverrides[key]);

    // Gabungkan dengan urutan prioritas: user config, lalu env overrides
    const mergedConfig = { ...userConfig, ...envOverrides };

    // Validasi dan terapkan nilai default menggunakan Joi
    const { error, value: finalConfig } = configSchema.validate(mergedConfig, {
        abortEarly: false, // Tampilkan semua error, bukan hanya yang pertama
        allowUnknown: true, // Izinkan properti tambahan yang tidak ada di skema
        stripUnknown: false, // Jangan hapus properti yang tidak dikenal
    });

    if (error) {
        const errorDetails = error.details.map(d => `  - ${d.message}`).join('\n');
        throw new Error(`Invalid configuration found in ${configPath}:\n${errorDetails}`);
    }

    // Tambahkan hash konfigurasi dan path cache setelah semua digabungkan
    finalConfig.configHash = getConfigHash(finalConfig);
    finalConfig.cacheFile = path.join(
        os.tmpdir(), 
        `vrzaq_cache_${crypto.createHash('sha1').update(finalConfig.rootDir).digest('hex').slice(0, 12)}.json`
    );

    logger.success(`Configuration loaded successfully. Cache key: ${finalConfig.configHash.slice(0, 8)}...`);

    // Simpan ke cache singleton dan kembalikan
    loadedConfig = finalConfig;
    return loadedConfig;
}