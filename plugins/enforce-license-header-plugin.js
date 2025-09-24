/**
 * Header default yang akan digunakan jika pengguna tidak menyediakannya sendiri.
 * Berisi informasi lisensi, donasi, dan kontak kreator.
 */
const DEFAULT_LICENSE_HEADER = `/**
 * This file is part of a project formatted — by Arifi Razzaq
 * © 2025–present | MIT License | github.com/razzaqinspires/quantum-formatter
 * Support ❤️ saweria.co/arzzq | 📞 +62-831-9390-5842
 */`;

/**
 * Plugin untuk memastikan setiap file memiliki header.
 * Jika pengguna menyediakan header kustom, itu akan digunakan.
 * Jika tidak, header default akan diterapkan sebagai fallback.
 * @param {{ emitter: import('events').EventEmitter, logger: object, options: object }}
 */
export default function enforceLicenseHeaderPlugin({ emitter, logger, options }) {

    // --- LOGIKA FALLBACK ---
    // Gunakan header dari opsi pengguna. Jika tidak ada, gunakan DEFAULT_LICENSE_HEADER.
    const headerToUse = options.header || DEFAULT_LICENSE_HEADER;

    emitter.on('format:before', (fileData) => {
        // Cek apakah header sudah ada untuk menghindari duplikasi.
        // Logika ini mengasumsikan header selalu berupa blok komentar di awal file.
        if (fileData.content.trim().startsWith('/**')) {
            return;
        }

        // Tentukan ekstensi file mana yang akan ditambahkan header.
        // Pengguna bisa menimpanya melalui opsi.
        const supportedExtensions = options.extensions || ['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx'];
        if (supportedExtensions.includes(fileData.ext)) {
            logger.verbose(`[enforce-license-header-plugin] Adding header to ${fileData.path}`);
            
            // Tambahkan header ke konten file.
            fileData.content = `${headerToUse}\n\n${fileData.content}`;
        }
    });

    logger.info('🔌 Plugin "Enforce License Header" loaded.');
}