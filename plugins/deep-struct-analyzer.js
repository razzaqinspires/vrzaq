// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// plugins/deep-struct-analyzer.js (SPECIALIST AGENT - WITH EXTENSION GUARD)
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import chalk from 'chalk';

const SHARED_CONTEXT_KEY = 'vrzaq_autodoc_analysis_context';

function analyzeNodeStructure(node) {
    if (!node) return 'any';

    switch (node.type) {
        case 'StringLiteral': return 'string';
        case 'NumericLiteral': return 'number';
        case 'BooleanLiteral': return 'boolean';
        case 'Identifier': return node.name === 'undefined' ? 'undefined' : 'any';
        
        case 'ArrayExpression': {
            // Menganalisis elemen pertama dari array untuk menebak tipe array
            if (node.elements.length > 0) {
                const elementType = analyzeNodeStructure(node.elements[0]);
                if (typeof elementType === 'object') {
                    return `Array<${JSON.stringify(elementType)}>`; // Tidak ideal, tapi representatif
                }
                return `Array<${elementType}>`;
            }
            return 'Array<any>';
        }
        case 'ObjectExpression': {
            const structure = {};
            for (const prop of node.properties) {
                if (prop.type === 'ObjectProperty') {
                    const propName = prop.key.name || prop.key.value;
                    structure[propName] = analyzeNodeStructure(prop.value);
                }
            }
            return structure;
        }
        default: return 'any';
    }
}

export default function deepStructAnalyzerPlugin({ emitter, logger }) {
    emitter.on('format:before', (fileData) => {
        // --- PENAMBAHAN PENTING: PENJAGA EKSTENSI FILE ---
        const supportedExtensions = ['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx'];
        if (!supportedExtensions.includes(fileData.ext)) {
            return; // Abaikan file seperti .json, .md, dll.
        }
        // ---------------------------------------------------

        if (!fileData[SHARED_CONTEXT_KEY]) {
            fileData[SHARED_CONTEXT_KEY] = {
                analyses: new Map(), modifications: [], variableStructures: new Map(),
                typedefs: new Set(), functionSignatures: new Map(), deprecatedFunctions: new Set(),
            };
        }
        const context = fileData[SHARED_CONTEXT_KEY];
        if (context.structure_analysis_complete) return;

        let ast;
        try {
            ast = parser.parse(fileData.content, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true });
        } catch (e) {
            logger.warn(`[deep-analyzer] Parse failed for ${fileData.file}. Skipping structure analysis.`);
            return;
        }

        traverse(ast, {
            VariableDeclarator(path) {
                if (path.node.init && path.node.init.type === 'ObjectExpression') {
                    const varName = path.node.id.name;
                    if (varName) {
                        const structure = analyzeNodeStructure(path.node.init);
                        context.variableStructures.set(varName, structure);
                        logger.verbose(`[deep-analyzer] Mapped structure for variable '${varName}'`);
                    }
                }
            },
        });

        context.structure_analysis_complete = true;
    });

    logger.info(chalk.gray('🔎 Plugin "Deep Struct Analyzer" (specialist agent) loaded.'));
}