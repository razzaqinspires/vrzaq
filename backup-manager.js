// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co.arzzq

// backup-manager.js (INTEGRITY & EFFICIENCY SUPERIOR EDITION)
import fs from 'fs'; // Dibutuhkan untuk stream
import fsp from 'fs/promises';
import path from 'path';
import * as tar from 'tar';
import crypto from 'crypto';
import os from 'os';
import { performance } from 'perf_hooks';
import { loadConfig } from './config.js';
import logger from './logger.js';

// Custom Errors untuk penanganan yang lebih spesifik
class IntegrityMismatchError extends Error { constructor(message) { super(message); this.name = 'IntegrityMismatchError'; } }
class ManifestNotFoundError extends Error { constructor(message) { super(message); this.name = 'ManifestNotFoundError'; } }

const config = await loadConfig();
const AUDIT_LOG = path.join(config.backupDir, '.backup-audit.log');

/**
 * Utility: Tulis log audit yang komprehensif.
 */
async function writeAudit(action, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    ...details,
  };
  await fsp.mkdir(config.backupDir, { recursive: true });
  await fsp.appendFile(AUDIT_LOG, JSON.stringify(entry) + '\n');
}

/**
 * Menghitung hash dari file menggunakan stream untuk efisiensi memori.
 * @param {string} filePath Path ke file.
 * @param {string} algorithm Algoritma hash.
 * @returns {Promise<string>} Hash dalam format hex.
 */
function getStreamHash(filePath, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Menghasilkan manifest dengan hash berbasis stream.
 */
async function generateManifest(archivePath, fileList) {
  const archiveHash = await getStreamHash(archivePath, config.hashAlgorithm);
  const fileStats = await Promise.all(
    fileList.map(async f => {
      try {
        const stats = await fsp.stat(path.join(config.rootDir, f));
        return { file: f, size: stats.size };
      } catch { return { file: f, size: 0, error: 'File not found during manifest creation' }; }
    })
  );

  return {
    createdAt: new Date().toISOString(),
    archive: path.basename(archivePath),
    archiveHash,
    algorithm: config.hashAlgorithm,
    environment: { os: `${os.type()} ${os.release()}`, node: process.version },
    files: {
      count: fileStats.length,
      totalSize: fileStats.reduce((a, b) => a + b.size, 0),
      details: fileStats,
    },
  };
}

/**
 * Membuat backup dengan efisiensi memori dan logging yang ditingkatkan.
 */
export async function createBackup(fileList) {
  const start = performance.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(config.backupDir, `backup-${timestamp}.tar.gz`);
  const manifestFile = `${backupFile}.manifest.json`;

  try {
    await fsp.mkdir(config.backupDir, { recursive: true });
    logger.info(`Creating backup with ${fileList.length} files...`);

    // Gunakan opsi kompresi dari config
    const gzipOptions = config.backup?.compressionLevel ? { level: config.backup.compressionLevel } : true;
    await tar.c({ gzip: gzipOptions, file: backupFile, cwd: config.rootDir }, fileList);

    const manifest = await generateManifest(backupFile, fileList);
    await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2));

    const duration = performance.now() - start;
    logger.success(`Backup created: ${path.basename(backupFile)} (${manifest.files.totalSize} bytes in ${duration.toFixed(2)}ms)`);
    await writeAudit('createBackup', { backup: path.basename(backupFile), status: 'SUCCESS', duration, files: manifest.files.count });
    return backupFile;
  } catch (error) {
    const duration = performance.now() - start;
    await writeAudit('createBackup', { status: 'FAILURE', duration, error: error.message });
    throw error;
  }
}

/**
 * Menampilkan daftar backup.
 */
export async function listBackups() {
  try {
    const files = (await fsp.readdir(config.backupDir)).filter(f => f.endsWith('.tar.gz'));
    const results = [];
    for (const f of files) {
      const manifestPath = path.join(config.backupDir, `${f}.manifest.json`);
      try {
        const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
        results.push({ name: f, createdAt: manifest.createdAt, size: manifest.files.totalSize, fileCount: manifest.files.count });
      } catch {
        results.push({ name: f, note: '⚠️ Manifest missing or corrupt' });
      }
    }
    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Restore dengan validasi dan snapshot otomatis (tanpa prompt UI).
 */
export async function restoreBackup(filename) {
  const start = performance.now();
  const filePath = path.join(config.backupDir, filename);
  const manifestPath = `${filePath}.manifest.json`;

  try {
    const manifestData = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
    const currentHash = await getStreamHash(filePath, manifestData.algorithm);

    if (currentHash !== manifestData.archiveHash) {
      throw new IntegrityMismatchError('Backup corrupt! Integrity hash mismatch.');
    }
    logger.success('Backup archive integrity verified.');

    const allFiles = (await fsp.readdir(config.rootDir, { recursive: true })).filter(f => f.isFile());
    const snapshotFile = await createBackup(allFiles);
    logger.dim(`Automatic snapshot created before restore: ${snapshotFile}`);

    await tar.x({ file: filePath, C: config.rootDir });
    const duration = performance.now() - start;
    logger.success(`Restored backup: ${filename}`);
    await writeAudit('restoreBackup', { backup: filename, status: 'SUCCESS', duration });
  } catch (error) {
    const duration = performance.now() - start;
    await writeAudit('restoreBackup', { backup: filename, status: 'FAILURE', duration, error: error.message });
    if (error.code === 'ENOENT' && error.path === manifestPath) {
      throw new ManifestNotFoundError(`Manifest file not found for ${filename}. Cannot restore securely.`);
    }
    throw error;
  }
}

/**
 * Menjalankan verifikasi integritas proaktif pada semua backup.
 */
export async function verifyBackups() {
    const report = { healthy: [], corrupt: [], orphaned_archives: [], orphaned_manifests: [] };
    const files = await fsp.readdir(config.backupDir);
    const archives = new Set(files.filter(f => f.endsWith('.tar.gz')));
    const manifests = new Set(files.filter(f => f.endsWith('.manifest.json')));

    for (const manifestFile of manifests) {
        const archiveFile = manifestFile.replace('.manifest.json', '');
        if (archives.has(archiveFile)) {
            try {
                const manifestData = JSON.parse(await fsp.readFile(path.join(config.backupDir, manifestFile), 'utf8'));
                const currentHash = await getStreamHash(path.join(config.backupDir, archiveFile), manifestData.algorithm);
                if (currentHash === manifestData.archiveHash) {
                    report.healthy.push(archiveFile);
                } else {
                    report.corrupt.push({ file: archiveFile, reason: 'Hash mismatch' });
                }
            } catch (err) {
                report.corrupt.push({ file: archiveFile, reason: `Manifest unreadable: ${err.message}` });
            }
            archives.delete(archiveFile); // Hapus dari set agar sisanya adalah yatim
        } else {
            report.orphaned_manifests.push(manifestFile);
        }
    }
    report.orphaned_archives = [...archives];
    await writeAudit('verifyBackups', { status: 'SUCCESS', report });
    return report;
}


/**
 * Membersihkan backup lama (tanpa prompt UI).
 */
export async function cleanBackups(limit) {
    const start = performance.now();
    try {
        const allBackups = await listBackups(); // listBackups sudah diurutkan
        const toDelete = allBackups.slice(limit);

        if (toDelete.length === 0) {
            logger.info('No old backups to clean.');
            return;
        }

        const deletedFiles = [];
        for (const backup of toDelete) {
            const backupPath = path.join(config.backupDir, backup.name);
            const manifestPath = `${backupPath}.manifest.json`;
            await fsp.unlink(backupPath).catch(() => {});
            await fsp.unlink(manifestPath).catch(() => {});
            deletedFiles.push(backup.name);
            logger.warn(`Deleted old backup: ${backup.name}`);
        }
        
        const duration = performance.now() - start;
        await writeAudit('cleanBackups', { status: 'SUCCESS', deletedCount: deletedFiles.length, keptCount: limit, duration, deletedFiles });
    } catch (error) {
        if (error.code !== 'ENOENT') {
            const duration = performance.now() - start;
            await writeAudit('cleanBackups', { status: 'FAILURE', duration, error: error.message });
            logger.error('Failed to clean backups.', error);
        }
    }
}