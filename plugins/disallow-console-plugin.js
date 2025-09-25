// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// plugins/disallow-console-plugin.js (AST-BASED LINTER SUPERIOR EDITION)
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import chalk from 'chalk';

/**
 * Custom error class for linting violations.
 */
class LintViolationError extends Error {
    constructor(message, details) {
        super(message);
        this.name = 'LintViolationError';
        this.details = details;
    }
}

/**
 * Plugin untuk mendeteksi dan melaporkan penggunaan console.* dengan presisi tinggi menggunakan AST.
 * @param {{ emitter: import('events').EventEmitter, logger: object, options?: object }}
 */
export default function disallowConsolePlugin({ emitter, logger, options = {} }) {
    const forbiddenMethods = new Set(options.forbidden || ['log', 'debug', 'error', 'warn', 'info', 'table']);
    const mode = options.mode || 'warn'; // 'strict' | 'warn'
    const supportedExtensions = options.extensions || ['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx'];

    // Gunakan Map untuk menyimpan pelanggaran dengan lebih terstruktur
    const violations = new Map();

    // Event 'format:before' lebih cocok karena terjadi sebelum modifikasi lain
    emitter.on('format:before', (fileData) => {
        const fileExt = fileData.ext;
        if (!supportedExtensions.includes(fileExt)) {
            return;
        }

        let ast;
        try {
            // Kita parse kode menjadi AST untuk analisis yang akurat
            ast = parser.parse(fileData.content, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx'],
                errorRecovery: true, // Coba pulih dari syntax error kecil
            });
        } catch (e) {
            logger.verbose(`[disallow-console] Skipping file due to parse error: ${fileData.file}`);
            return;
        }

        // Traverse (jelajahi) AST untuk mencari pola yang dilarang
        traverse(ast, {
            // Kita hanya tertarik pada node "CallExpression" (panggilan fungsi)
            CallExpression(path) {
                const callee = path.get('callee');

                // Cek apakah ini adalah `console.something()`
                if (callee.isMemberExpression() && callee.get('object').isIdentifier({ name: 'console' })) {
                    const property = callee.get('property');
                    const methodName = property.node.name;

                    if (forbiddenMethods.has(methodName)) {
                        const { line, column } = path.node.loc.start;
                        const violation = {
                            file: fileData.file,
                            pattern: `console.${methodName}`,
                            line,
                            column,
                        };

                        if (mode === 'strict') {
                            // Melempar error akan ditangkap oleh QuantumRunner per-file,
                            // tidak akan menghentikan seluruh proses.
                            throw new LintViolationError(
                                `Forbidden console usage: "${violation.pattern}" at line ${line}`,
                                violation
                            );
                        } else {
                            if (!violations.has(fileData.file)) {
                                violations.set(fileData.file, []);
                            }
                            violations.get(fileData.file).push(violation);
                        }
                    }
                }
            },
        });
    });

    emitter.on('run:complete', () => {
        if (mode === 'strict') {
            // Di mode strict, error sudah ditangani sebagai file gagal
            logger.info('✅ Console check complete (strict mode). Violations are reported as file errors.');
            return;
        }

        if (violations.size === 0) {
            logger.success('✅ No forbidden console usage detected.');
            return;
        }

        // --- Laporan Visual Superior ---
        console.log('');
        console.log(chalk.yellow('┌─ 🚫 Forbidden Console Usage Report ───────────────┐'));
        
        let totalViolations = 0;
        violations.forEach((fileViolations, filePath) => {
            console.log(chalk.yellow('│ ') + chalk.whiteBright.underline(filePath));
            fileViolations.forEach(v => {
                totalViolations++;
                const lineInfo = chalk.cyan(`  (Line: ${v.line})`);
                console.log(chalk.yellow('│') + `  - Found ${chalk.red.bold(v.pattern)} ${lineInfo}`);
            });
        });
        
        const summary = `Found ${totalViolations} violation(s) in ${violations.size} file(s).`;
        const padding = ' '.repeat(51 - summary.length);
        console.log(chalk.yellow('├────────────────────────────────────────────────────┤'));
        console.log(chalk.yellow('│ ') + chalk.bold(summary) + padding + chalk.yellow('│'));
        console.log(chalk.yellow('└────────────────────────────────────────────────────┘'));
        console.log('');
    });

    logger.info(`🔌 Plugin "Disallow Console" (AST Edition) loaded in [${mode.toUpperCase()}] mode.`);
}