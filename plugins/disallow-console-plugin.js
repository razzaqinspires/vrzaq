// plugins/disallow-console-plugin.js

/**
 * Plugin untuk mendeteksi dan melaporkan penggunaan console.log/error.
 * @param {{ emitter: import('events').EventEmitter, logger: object }}
 */
export default function disallowConsolePlugin({ emitter, logger }) {
    
    // Kita "mendengarkan" event sebelum file divalidasi oleh inti.
    emitter.on('file:before_validate', (fileData) => {
        const forbiddenPatterns = ['console.log', 'console.debug'];
        const lowerCaseContent = fileData.content.toLowerCase();

        for (const pattern of forbiddenPatterns) {
            if (lowerCaseContent.includes(pattern)) {
                // Jika ditemukan, kita bisa langsung melempar error untuk menghentikan proses
                // atau hanya menampilkan peringatan. Di sini kita akan melempar error.
                throw new Error(`Forbidden pattern "${pattern}" found in ${fileData.path}`);
            }
        }

        logger.verbose(`[disallow-console-plugin] File ${fileData.path} passed validation.`);
    });

    logger.info('🔌 Plugin "Disallow Console" loaded.');
}