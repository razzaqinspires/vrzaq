// backup-manager.js

import fs from 'fs/promises';
import path from 'path';
import tar from 'tar';
import crypto from 'crypto';
import prompts from 'prompts';
import { loadConfig } from './config.js';
import logger from './logger.js';

// Memuat konfigurasi sekali saat modul diinisialisasi
const config = await loadConfig();

/**
 * Menghasilkan file manifest yang berisi hash integritas dari arsip dan file di dalamnya.
 * @param {string} archivePath - Path ke file arsip .tar.gz.
 * @returns {Promise<object>} Objek manifest.
 */
async function generateManifest(archivePath) {
  const archiveData = await fs.readFile(archivePath);
  const archiveHash = crypto.createHash(config.hashAlgorithm).update(archiveData).digest('hex');

  return {
    createdAt: new Date().toISOString(),
    archiveHash,
    algorithm: config.hashAlgorithm,
    // Di masa depan, kita bisa menambahkan hash per file di sini untuk verifikasi yang lebih mendalam
  };
}

/**
 * Membuat backup dari direktori root ke dalam file .tar.gz dengan file manifest.
 * @param {string[]} fileList - Daftar file yang akan dimasukkan ke dalam backup.
 * @returns {Promise<string>} Path ke file backup yang telah dibuat.
 */
export async function createBackup(fileList) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(config.backupDir, `backup-${timestamp}.tar.gz`);
  const manifestFile = `${backupFile}.manifest.json`;

  await fs.mkdir(config.backupDir, { recursive: true });

  await tar.c({ gzip: true, file: backupFile, cwd: config.rootDir }, fileList);
  
  const manifest = await generateManifest(backupFile);
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2));

  logger.success(`Backup created: ${path.basename(backupFile)}`);
  logger.dim(`Manifest integrity file created: ${path.basename(manifestFile)}`);
  return backupFile;
}

/**
 * Menampilkan daftar semua backup yang tersedia di direktori backup.
 */
export async function listBackups() {
  try {
    const files = (await fs.readdir(config.backupDir)).filter(f => f.endsWith('.tar.gz'));
    if (files.length === 0) {
      logger.info('No backups found.');
      return;
    }
    logger.info('📂 Available backups:');
    files.forEach((f, i) => console.log(`${i + 1}. ${f}`));
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.info('Backup directory does not exist. No backups found.');
    } else {
      logger.error('Failed to list backups.', error);
    }
  }
}

/**
 * Memulihkan proyek dari file backup yang ditentukan setelah verifikasi integritas.
 * @param {string} filename - Nama file backup yang akan dipulihkan.
 * @param {boolean} [force=false] - Jika true, lewati prompt konfirmasi.
 */
export async function restoreBackup(filename, force = false) {
    if (!force) {
        const response = await prompts({
            type: 'confirm',
            name: 'value',
            message: `Are you sure you want to restore from "${filename}"? This will overwrite current files.`,
            initial: false
        });
        if (!response.value) {
            logger.warn('Restore operation cancelled by user.');
            return;
        }
    }

    const filePath = path.join(config.backupDir, filename);
    const manifestPath = `${filePath}.manifest.json`;

    try {
        const manifestData = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        const archiveData = await fs.readFile(filePath);
        const currentArchiveHash = crypto.createHash(manifestData.algorithm).update(archiveData).digest('hex');

        if (currentArchiveHash !== manifestData.archiveHash) {
            throw new Error('Backup archive is corrupt! Integrity hash mismatch.');
        }
        logger.success('Backup archive integrity verified.');

        await tar.x({ file: filePath, C: config.rootDir });
        logger.success(`Restored backup from ${filename}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.error(`Restore failed: Backup file or manifest not found for "${filename}".`);
        } else {
            logger.error(`Restore failed: ${error.message}`, error);
        }
    }
}

/**
 * Membersihkan backup lama, hanya menyisakan sejumlah backup terbaru sesuai limit.
 * @param {number} limit - Jumlah backup terbaru yang akan disimpan.
 * @param {boolean} [force=false] - Jika true, lewati prompt konfirmasi.
 */
export async function cleanBackups(limit, force = false) {
  try {
    const files = await fs.readdir(config.backupDir);
    const backups = files
      .filter(f => f.endsWith('.tar.gz'))
      .map(async f => ({
        name: f,
        time: (await fs.stat(path.join(config.backupDir, f))).mtime.getTime(),
      }));

    const sortedBackups = (await Promise.all(backups)).sort((a, b) => b.time - a.time);

    if (sortedBackups.length <= limit) {
      logger.info('No cleanup needed.');
      return;
    }

    const toDelete = sortedBackups.slice(limit);

    if (!force) {
        logger.warn(`The following old backups will be deleted:`);
        toDelete.forEach(f => logger.dim(`  - ${f.name}`));
        const response = await prompts({
            type: 'confirm',
            name: 'value',
            message: `Proceed with deleting ${toDelete.length} backup(s)?`,
            initial: false
        });
        if (!response.value) {
            logger.warn('Cleanup operation cancelled by user.');
            return;
        }
    }
    
    for (const file of toDelete) {
      const backupPath = path.join(config.backupDir, file.name);
      const manifestPath = `${backupPath}.manifest.json`;
      // Menghapus file backup dan manifest-nya secara bersamaan
      await fs.unlink(backupPath);
      // Menggunakan .catch() untuk mengabaikan error jika file manifest tidak ada karena suatu alasan
      await fs.unlink(manifestPath).catch(() => {});
      logger.warn(`Deleted old backup: ${file.name}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('Failed to clean backups.', error);
    }
  }
}