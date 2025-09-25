// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// plugins/auto-remove-console-plugin.js (AUTO-FIXER SUPERIOR EDITION)
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import chalk from 'chalk';

/**
 * Plugin untuk secara otomatis MENGHAPUS panggilan console.* dari kode.
 * Bekerja dengan presisi menggunakan AST untuk menghindari false positive dan kerusakan kode.
 * @param {{ emitter: import('events').EventEmitter, logger: object, options?: object }}
 */
export default function autoRemoveConsolePlugin({ emitter, logger, options = {} }) {
    // Pengguna bisa menentukan metode mana yang ingin dihapus.
    // Defaultnya adalah log dan debug yang paling umum untuk debugging.
    const methodsToRemove = new Set(options.methodsToRemove || ['log', 'debug', 'warn', 'info', 'table']);
    
    // Mode "reportOnly" memungkinkan pengguna melihat apa yang AKAN dihapus tanpa benar-benar mengubah file.
    const isReportOnly = options.reportOnly || false;

    // Menyimpan catatan dari semua tindakan untuk laporan akhir.
    const removalReport = new Map();

    emitter.on('format:before', (fileData) => {
        const supportedExtensions = ['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx'];
        if (!supportedExtensions.includes(fileData.ext)) {
            return;
        }

        let ast;
        try {
            ast = parser.parse(fileData.content, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx'],
                locations: true, // Pastikan info lokasi (baris/kolom) ada
            });
        } catch (e) {
            logger.verbose(`[auto-remove-console] Skipping file due to parse error: ${fileData.file}`);
            return;
        }

        const removedNodes = [];

        // Jelajahi AST untuk menemukan dan (jika perlu) menghapus node
        traverse(ast, {
            CallExpression(path) {
                const callee = path.get('callee');

                if (callee.isMemberExpression() && callee.get('object').isIdentifier({ name: 'console' })) {
                    const methodName = callee.get('property').node.name;

                    if (methodsToRemove.has(methodName)) {
                        // Dapatkan seluruh pernyataan (misal: `console.log('hi');` bukan hanya `log('hi')`)
                        const statementPath = path.getStatementParent();
                        if (statementPath) {
                            // Catat apa yang kita temukan/hapus untuk laporan
                            removedNodes.push({
                                line: statementPath.node.loc.start.line,
                                pattern: `console.${methodName}`,
                                code: generate(statementPath.node).code,
                            });

                            // Hapus node dari pohon jika bukan mode report-only
                            if (!isReportOnly) {
                                statementPath.remove();
                            }
                        }
                    }
                }
            },
        });

        // Jika ada perubahan, generate ulang kode dari AST yang telah dimodifikasi
        if (removedNodes.length > 0) {
            if (!isReportOnly) {
                const { code } = generate(ast, { retainLines: true, comments: true });
                fileData.content = code;
            }
            removalReport.set(fileData.file, removedNodes);
        }
    });

    emitter.on('run:complete', () => {
        if (removalReport.size === 0) {
            logger.success('✅ No removable console usage found.');
            return;
        }

        const reportType = isReportOnly ? 'Analysis Report' : 'Removal Report';
        const actionVerb = isReportOnly ? 'Found' : 'Removed';

        // --- Laporan Visual Superior ---
        console.log('');
        console.log(chalk.redBright(`┌─ 🗑️  Console ${reportType} ──────────────┐`));
        
        let totalRemovals = 0;
        removalReport.forEach((removals, filePath) => {
            console.log(chalk.redBright('│ ') + chalk.whiteBright.underline(filePath));
            removals.forEach(r => {
                totalRemovals++;
                const lineInfo = chalk.cyan(`(Line: ${r.line})`);
                console.log(chalk.redBright('│') + `  - ${actionVerb} ${chalk.yellow.bold(r.pattern)} ${lineInfo}`);
            });
        });
        
        const summary = `${actionVerb} ${totalRemovals} call(s) in ${removalReport.size} file(s).`;
        const padding = ' '.repeat(51 - summary.length);
        console.log(chalk.redBright('├────────────────────────────────────────────────────┤'));
        console.log(chalk.redBright('│ ') + chalk.bold(summary) + padding + chalk.redBright('│'));
        console.log(chalk.redBright('└────────────────────────────────────────────────────┘'));
        console.log('');
    });

    logger.info(`🔌 Plugin "Auto Remove Console" (Auto-Fixer Edition) loaded.`);
}