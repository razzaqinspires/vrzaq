// plugins/file-size-reporter-plugin.js

/**
 * Plugin untuk melaporkan file-file terbesar dalam proyek.
 * @param {{ emitter: import('events').EventEmitter, logger: object }}
 */
export default function fileSizeReporterPlugin({ emitter, logger }) {
    const files = [];

    // Setiap kali sebuah file divalidasi, kita kumpulkan datanya.
    emitter.on('file:validate', (fileData) => {
        if (fileData.isValid && fileData.size > 0) {
            files.push({
                path: fileData.path,
                size: fileData.size,
            });
        }
    });

    // Setelah semua proses selesai, kita olah data yang terkumpul.
    emitter.on('run:complete', () => {
        // Urutkan file dari yang terbesar ke terkecil
        files.sort((a, b) => b.size - a.size);

        // Ambil 5 file teratas
        const top5Files = files.slice(0, 5);

        if (top5Files.length > 0) {
            logger.info('📊 Top 5 Largest Files Report:');
            top5Files.forEach(file => {
                const sizeInKb = (file.size / 1024).toFixed(2);
                logger.special(`  - ${sizeInKb} KB \t ${file.path}`);
            });
        }
    });
    
    logger.info('🔌 Plugin "File Size Reporter" loaded.');
}