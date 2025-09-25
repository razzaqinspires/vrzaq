// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// plugins/enforce-license-header-plugin.js (SUPERIOR EDITION - FINAL POLISH)
import chalk from 'chalk';
import path from 'path';

// ... (DEFAULT_LICENSE_HEADER dan fungsi lainnya tetap sama) ...
const DEFAULT_LICENSE_HEADER = `/**
 * @file {{fileName}}
 * This file is part of a project formatted by vrzaq.
 * © {{year}}–present {{author}} | {{license}} License
 * Support ❤️ saweria.co/arzzq
 */`;

export default function enforceLicenseHeaderPlugin({ emitter, logger, options = {} }) {
    const headerTemplate = options.header || DEFAULT_LICENSE_HEADER;
    // Ekstensi default dikurangi, tidak termasuk JSON
    const supportedExtensions = options.extensions || ['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'css', 'scss']; 
    const mode = options.mode || 'add';
    const headerSignature = options.signature || '©';

    let addedCount = 0, updatedCount = 0, skippedCount = 0;

    emitter.on('format:before', (fileData) => {
        // --- PERBAIKAN FINAL: PENJAGA EKSTENSI FILE ---
        // Plugin ini hanya boleh berjalan pada file yang mendukung komentar /** */
        if (!supportedExtensions.includes(fileData.ext)) {
            return;
        }
        // ---------------------------------------------

        let content = fileData.content;
        let shebang = '';

        if (content.startsWith('#!')) {
            const firstLineEnd = content.indexOf('\n');
            shebang = content.substring(0, firstLineEnd + 1);
            content = content.substring(firstLineEnd + 1);
        }

        const normalizedContent = content.trimStart();
        const headerRegex = new RegExp(`^/\\*\\*[\\s\\S]*?${headerSignature}[\\s\\S]*?\\*/`);
        const existingHeaderMatch = normalizedContent.match(headerRegex);

        const placeholderValues = {
            year: new Date().getFullYear(),
            fileName: path.basename(fileData.file),
            filePath: fileData.file,
            author: options.author || 'Arifi Razzaq',
            license: options.license || 'MIT',
        };
        const finalHeader = headerTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => placeholderValues[key] ?? `{{${key}}}`);

        if (mode === 'update' && existingHeaderMatch) {
            const oldHeader = existingHeaderMatch[0];
            if (oldHeader.trim() !== finalHeader.trim()) {
                content = content.replace(oldHeader, finalHeader);
                updatedCount++;
                logger.dim(`[header-plugin] 🔄 Header updated in ${fileData.file}`);
            } else {
                skippedCount++;
            }
        } else if (mode === 'add' && !existingHeaderMatch) {
            content = `${finalHeader}\n\n${content}`;
            addedCount++;
            logger.dim(`[header-plugin] ✅ Header added to ${fileData.file}`);
        } else {
            skippedCount++;
            return;
        }

        fileData.content = shebang + content;
    });

    emitter.on('run:complete', () => { /* ... (Logika laporan tetap sama) ... */ });
    logger.info('🔌 Plugin "Enforce License Header" (Superior Edition) loaded.');
}