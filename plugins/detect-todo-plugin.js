// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// plugins/detect-todo-plugin.js (CONTEXTUAL AI ASSISTANT SUPERIOR EDITION)
import fetch from 'node-fetch';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import ora from 'ora';
import chalk from 'chalk';
import pLimit from 'p-limit';

/**
 * Panggil provider AI untuk menghasilkan saran atas TODO.
 * @param {object} finding - Objek temuan (file, line, text, context).
 * @param {object} aiConfig - Konfigurasi AI dari vrzaq.config.js.
 * @returns {Promise<string>} Saran yang dihasilkan oleh AI.
 */
async function generateSuggestion(finding, aiConfig) {
    const { provider, apiKey, model, promptTemplate } = aiConfig;

    const userPrompt = (promptTemplate || `Given the code context below, suggest a concrete fix or enhancement for the developer's comment: "{{todoText}}".\n\nCode Context:\n\`\`\`javascript\n{{codeContext}}\n\`\`\``)
        .replace('{{todoText}}', finding.text)
        .replace('{{codeContext}}', finding.context);

    if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model || 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are an expert AI pair programmer. Your suggestions are concise and actionable.' },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 150,
                temperature: 0.5,
            }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Unknown OpenAI error');
        return data.choices[0].message.content.trim();
    
    } else if (provider === 'gemini') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash-latest'}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }],
                generationConfig: { maxOutputTokens: 150, temperature: 0.5 },
            }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Unknown Gemini error');
        return data.candidates[0].content.parts[0].text.trim();
    }

    throw new Error(`Unsupported AI provider: ${provider}`);
}


/**
 * Plugin untuk mendeteksi TODO/FIXME dan memberikan saran cerdas dari AI.
 */
export default function detectTodoPlugin({ emitter, logger, config }) {
    const findings = [];
    const keywords = new Set(['TODO', 'FIXME']);

    const supportedExtensions = ['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx'];

    emitter.on('format:before', (fileData) => {
        // --- PERBAIKAN FINAL: PENJAGA EKSTENSI FILE ---
        if (!supportedExtensions.includes(fileData.ext)) {
            return;
        }
        // ---------------------------------------------
        let ast;
        try {
            ast = parser.parse(fileData.content, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx'],
                attachComment: true,
                errorRecovery: true,
            });
        } catch (e) { return; }

        // Traverse AST untuk mencari komentar, bukan teks mentah
        traverse(ast, {
            enter(path) {
                // Cek semua jenis komentar yang menempel pada sebuah node
                (path.node.leadingComments || []).concat(path.node.trailingComments || []).forEach(comment => {
                    const commentText = comment.value.trim();
                    for (const keyword of keywords) {
                        if (commentText.startsWith(keyword)) {
                            // Dapatkan konteks kode dari node induk
                            const contextNode = path.node;
                            const { code } = generate(contextNode, { comments: false });

                            findings.push({
                                file: fileData.file,
                                line: comment.loc.start.line,
                                text: commentText,
                                context: code.substring(0, 1500), // Batasi konteks agar tidak terlalu besar
                            });
                        }
                    }
                });
            }
        });
    });

    emitter.on('run:complete', async () => {
        if (findings.length === 0) {
            logger.success('✅ No TODO/FIXME comments found.');
            return;
        }

        console.log('');
        console.log(chalk.cyan('┌─ 📝 TODO/FIXME Report ──────────────────────────┐'));
        findings.forEach(f => {
            const lineInfo = chalk.yellow(`L${f.line}`);
            const textPreview = f.text.length > 60 ? f.text.substring(0, 57) + '...' : f.text;
            console.log(chalk.cyan('│ ') + `${chalk.whiteBright.underline(f.file)}:${lineInfo}`);
            console.log(chalk.cyan('│ ') + `  └─ ${chalk.dim(textPreview)}`);
        });
        console.log(chalk.cyan('└──────────────────────────────────────────────────┘'));
        console.log('');
        
        const aiConfig = config?.experimental?.ai;
        if (aiConfig?.provider && aiConfig?.apiKey) {
            const spinner = ora('🤖 Generating AI suggestions for TODOs...').start();
            const limit = pLimit(5); // Batasi 5 permintaan AI secara bersamaan
            
            const suggestionPromises = findings.map(f => limit(async () => {
                try {
                    const suggestion = await generateSuggestion(f, aiConfig);
                    return { ...f, suggestion };
                } catch (err) {
                    return { ...f, error: err.message };
                }
            }));
            
            const results = await Promise.all(suggestionPromises);
            spinner.stop();

            console.log(chalk.magenta('┌─ ✨ AI-Powered Suggestions ───────────────────┐'));
            results.forEach(r => {
                console.log(chalk.magenta('│ ') + chalk.whiteBright.underline(r.file) + chalk.yellow(`:L${r.line}`));
                if (r.suggestion) {
                    console.log(chalk.magenta('│ ') + chalk.greenBright('└─💡 Suggestion: ') + chalk.white(r.suggestion));
                } else {
                    console.log(chalk.magenta('│ ') + chalk.red('└─⚠️ AI Error: ') + chalk.dim(r.error));
                }
            });
            console.log(chalk.magenta('└──────────────────────────────────────────────────┘'));
            
        } else {
            logger.dim('✨ Hint: Set AI provider and API key in config to enable auto-suggestions.');
        }
    });

    logger.info('🔌 Plugin "Detect TODO/FIXME" (Contextual AI Edition) loaded.');
}