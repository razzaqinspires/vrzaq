import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { cosmiconfig } from 'cosmiconfig';
import logger from './logger.js';

// Mengubah modul yang dicari oleh cosmiconfig menjadi 'razzaq'
const explorer = cosmiconfig('razzaq');

// Fungsi untuk menghitung hash dari objek konfigurasi
function getConfigHash(configObject) {
    const configString = JSON.stringify(configObject);
    return crypto.createHash('sha256').update(configString).digest('hex');
}

export async function loadConfig() {
    let userConfig = {};
    try {
        const result = await explorer.search();
        if (result && result.config) {
            userConfig = result.config;
            logger.verbose(`Loaded user configuration from: ${result.filepath}`);
        } else {
            logger.verbose('No user configuration found. Using defaults.');
        }
    } catch (error) {
        logger.error('Error loading configuration, falling back to defaults.', error);
    }
    
    // Menggabungkan konfigurasi default dengan konfigurasi pengguna
    const defaultConfig = {
        rootDir: process.cwd(),
        backupDir: path.join(process.cwd(), ".backups_vrzaq"),
        targetExtensions: ['.js', '.json', '.mjs', '.cjs', '.ts'],
        ignorePatterns: ['node_modules/**', '.git/**', '.backups_vrzaq/**'],
        backupRetentionLimit: 5,
        concurrency: Math.max(1, os.cpus().length),
        hashAlgorithm: 'sha256',
        plugins: [],
        cacheVersion: '1.0.0', // Versi untuk invalidasi cache
    };

    const finalConfig = { ...defaultConfig, ...userConfig };

    // Tambahkan hash konfigurasi untuk invalidasi cache cerdas
    finalConfig.configHash = getConfigHash(finalConfig);
    finalConfig.cacheFile = path.join(os.tmpdir(), `vrzaq_cache_${path.basename(finalConfig.rootDir)}.json`);

    return finalConfig;
}