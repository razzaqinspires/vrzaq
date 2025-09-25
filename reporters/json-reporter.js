// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// reporters/json-reporter.js (ROBUST SCHEMA SUPERIOR EDITION)
import fs from 'fs';

// Tentukan versi skema JSON saat ini.
const JSON_SCHEMA_VERSION = '2.0.0';

/**
 * Mengubah objek Error menjadi representasi JSON yang bersih.
 * @param {Error} error - Objek Error.
 * @returns {object} Objek error yang dapat diserialisasi.
 */
function serializeError(error) {
    if (!(error instanceof Error)) {
        return {
            message: 'An unknown error occurred.',
            details: String(error),
        };
    }
    return {
        name: error.name,
        message: error.message,
        code: error.code, // misal 'E_TIMEOUT', 'ENOENT', dll.
        stack: error.stack,
    };
}

/**
 * JSON Reporter v2
 * Menghasilkan output JSON yang terstruktur, kaya, dan dapat dibaca mesin.
 * @param {object} summary - Hasil dari Quantum Formatter (dari event 'run:complete')
 * @param {object} [options] - Opsi tambahan
 * @param {string} [options.outputFile] - Jika diisi, JSON disimpan ke file
 * @param {string} [options.version] - Versi aplikasi vrzaq
 */
export default function jsonReporter(summary, options = {}) {
    const { total, fulfilled, rejected, details, telemetry, files } = summary;

    const payload = {
        schemaVersion: JSON_SCHEMA_VERSION,
        success: rejected === 0,
        metadata: {
            toolVersion: options.version || 'unknown',
            generatedAt: new Date().toISOString(),
            sessionId: summary.sessionId,
            performance: telemetry ? {
                scanMs: parseFloat(telemetry.scan.toFixed(2)),
                backupMs: parseFloat(telemetry.backup.toFixed(2)),
                processingMs: parseFloat(telemetry.processing.toFixed(2)),
                totalMs: parseFloat(telemetry.total.toFixed(2)),
            } : null,
        },
        summary: {
            totalFiles: total,
            successful: fulfilled,
            failed: rejected,
        },
        results: [],
    };

    // Petakan hasil `details` kembali ke nama file berdasarkan indeks
    if (details && files && details.length === files.length) {
        payload.results = details.map((result, index) => {
            const file = files[index];
            if (result.status === 'fulfilled') {
                // Di masa depan, `result.value` bisa berisi detail lebih lanjut
                // seperti 'formatted', 'unchanged', 'skipped_cache'
                return {
                    file: file,
                    status: 'success',
                    details: result.value || { outcome: 'processed' },
                };
            } else {
                // result.status === 'rejected'
                return {
                    file: file,
                    status: 'failure',
                    error: serializeError(result.reason),
                };
            }
        });
    }

    const jsonOutput = JSON.stringify(payload, null, 2);

    if (options.outputFile) {
        try {
            fs.writeFileSync(options.outputFile, jsonOutput, 'utf8');
            // Hindari console.log dalam reporter JSON murni kecuali jika itu adalah bagian dari kontrak.
            // Pelaporan ke stderr adalah praktik yang lebih baik untuk log.
            console.error(`📦 JSON report saved to: ${options.outputFile}`);
        } catch (err) {
            console.error(`❌ Failed to save JSON report to ${options.outputFile}:`, err);
        }
    } else {
        // Output utama harus ke stdout
        process.stdout.write(jsonOutput);
    }
}