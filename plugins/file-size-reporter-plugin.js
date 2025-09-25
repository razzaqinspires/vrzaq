// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// plugins/file-size-reporter-plugin.js (SUPERIOR EDITION)
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

const BOX_CHARS = {
    topLeft: '┌', topRight: '┐',
    bottomLeft: '└', bottomRight: '┘',
    middle: '│', left: '├', right: '┤',
    horizontal: '─',
};

/**
 * Plugin untuk melaporkan file-file terbesar dalam proyek dengan akurasi tinggi.
 * @param {{ emitter: import('events').EventEmitter, logger: object, options?: { limit?: number } }}
 */
export default function fileSizeReporterPlugin({ emitter, logger, options = {} }) {
    const limit = options.limit ?? 5; // Ambil limit dari opsi, default 5

    /**
     * Memformat ukuran byte menjadi string yang mudah dibaca (KB, MB, GB).
     * @param {number} bytes 
     * @returns {string}
     */
    function formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    /**
     * Fungsi utama yang dijalankan setelah semua proses selesai.
     * Lebih efisien dan akurat karena hanya bekerja dengan data final.
     */
    emitter.on('run:complete', async (summary) => {
        // 'summary.files' harus disediakan oleh runner untuk akurasi maksimal
        const allScannedFiles = summary.files || [];

        if (allScannedFiles.length === 0) {
            return; // Tidak perlu melapor jika tidak ada file
        }
        
        logger.info('📊 Generating File Size Report...');

        try {
            // Dapatkan statistik (ukuran) untuk semua file secara paralel
            const fileStatsPromises = allScannedFiles.map(async (filePath) => {
                try {
                    const stats = await fs.stat(filePath);
                    return { path: filePath, size: stats.size };
                } catch {
                    return { path: filePath, size: 0 }; // Handle file yang mungkin terhapus
                }
            });
            
            const filesWithSize = await Promise.all(fileStatsPromises);

            // Urutkan file dari yang terbesar ke terkecil
            filesWithSize.sort((a, b) => b.size - a.size);

            // Ambil N file teratas
            const topFiles = filesWithSize.slice(0, limit);
            const totalSize = filesWithSize.reduce((sum, f) => sum + f.size, 0);

            // --- Tampilan Laporan Superior ---
            const terminalWidth = process.stdout.columns || 80;
            const contentWidth = Math.min(terminalWidth - 6, 100);
            
            const title = `📊 Top ${limit} Largest Files Report`;
            const titlePadding = '─'.repeat(contentWidth - title.length + 1);

            console.log('');
            console.log(chalk.blue(`${BOX_CHARS.topLeft}─ ${title} ${titlePadding}${BOX_CHARS.topRight}`));
            
            topFiles.forEach((file, idx) => {
                const relativePath = path.relative(process.cwd(), file.path);
                const sizeStr = chalk.yellow(formatSize(file.size).padEnd(10));
                const line = ` ${idx + 1}. ${sizeStr} ${chalk.dim(relativePath)}`;
                const padding = ' '.repeat(Math.max(0, contentWidth - chalk.stripColor(line).length + 2));
                console.log(`${BOX_CHARS.middle}${line}${padding}${BOX_CHARS.middle}`);
            });

            console.log(`${BOX_CHARS.left}${BOX_CHARS.horizontal.repeat(contentWidth + 2)}${BOX_CHARS.right}`);
            
            const totalStr = `📦 Total Size: ${chalk.bold(formatSize(totalSize))} (${filesWithSize.length} files)`;
            const totalPadding = ' '.repeat(Math.max(0, contentWidth - chalk.stripColor(totalStr).length + 2));
            console.log(`${BOX_CHARS.middle} ${totalStr}${totalPadding}${BOX_CHARS.middle}`);

            console.log(`${BOX_CHARS.bottomLeft}${BOX_CHARS.horizontal.repeat(contentWidth + 2)}${BOX_CHARS.bottomRight}`);
            console.log('');

        } catch (error) {
            logger.error('Failed to generate file size report:', error);
        }
    });

    logger.info('🔌 Plugin "File Size Reporter" (Superior Edition) loaded.');
}