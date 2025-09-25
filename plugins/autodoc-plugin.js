// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// plugins/autodoc-plugin.js (RESTORED AI AGENT & COMPOSER EDITION)
// Peran: Generator dokumentasi utama. Mampu bekerja mandiri dengan analisis lingkup
// dan inferensi tipe. Jika `deep-struct-analyzer` aktif, ia akan menggunakan datanya
// untuk membuat @typedef yang superior. Bertindak sebagai komposer final jika
// plugin `predictive` tidak aktif.

import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import chalk from 'chalk';

const SHARED_CONTEXT_KEY = 'vrzaq_autodoc_analysis_context';
const WATERMARK = `\n * --- \n * Auto-documented by vrzaq by Arifi Razzaq\n * Saweria: https://saweria.co/arzzq`;

// --- Helper & Class Canggih yang Dipulihkan ---
class ScopeManager {
    constructor(parent = null) {
        this.parent = parent;
        this.variables = new Map();
    }
    declare(name, type) {
        this.variables.set(name, { type });
    }
    lookup(name) {
        let scope = this;
        while (scope) {
            if (scope.variables.has(name)) return scope.variables.get(name).type;
            scope = scope.parent;
        }
        return 'any';
    }
}

function parseExistingJSDoc(commentBlock) {
    const parsed = { description: '', params: new Map(), returns: null };
    const lines = commentBlock.replace(/\/\*\*|\*\//g, '').split('\n').map(l => l.replace(/^\s*\*\s?/, ''));
    let inDesc = true;
    for (const line of lines) {
        const tagMatch = line.match(/^@(\S+)\s*(.*)/);
        if (tagMatch) {
            inDesc = false;
            const [, tagName, tagValue] = tagMatch;
            if (tagName === 'param') {
                const paramMatch = tagValue.match(/\{(.+?)\}\s*(\S+)\s*(.*)/);
                if (paramMatch) parsed.params.set(paramMatch[2], { type: paramMatch[1], description: paramMatch[3] || '' });
            }
        } else if (inDesc) {
            parsed.description = (parsed.description + ' ' + line).trim();
        }
    }
    return parsed;
}

function generateTypedefFromStructure(typeName, structure) {
    let typedef = `/**\n * @typedef {object} ${typeName}\n`;
    for (const propName in structure) {
        const propType = typeof structure[propName] === 'object' ? `object` : structure[propName];
        typedef += ` * @property {${propType}} ${propName}\n`;
    }
    typedef += ` */`;
    return typedef;
}

function inferTypeFromNode(node, scope) {
    if (!node) return 'any';
    switch (node.type) {
        case 'StringLiteral': return 'string';
        case 'NumericLiteral': return 'number';
        case 'BooleanLiteral': return 'boolean';
        case 'NullLiteral': return 'null';
        case 'ObjectExpression': return 'object';
        case 'ArrayExpression': return 'Array';
        case 'NewExpression': return node.callee.name || 'object';
        case 'Identifier': return node.name === 'undefined' ? 'undefined' : scope.lookup(node.name);
        default: return 'any';
    }
}

function composeJSDocFromAnalysis(analysis, addWatermark = true) {
    let doc = '/**\n';
    if (analysis.description) doc += ` * ${analysis.description.replace(/\n/g, '\n * ')}\n`;
    
    analysis.params.forEach(p => {
        doc += ` * @param {${p.type}} ${p.name} ${p.description || ''}\n`;
    });

    if (analysis.returns && analysis.returns.type !== 'void') {
        const returnType = analysis.isAsync ? `Promise<${analysis.returns.type}>` : analysis.returns.type;
        doc += ` * @returns {${returnType}} ${analysis.returns.description || ''}\n`;
    }
    
    if (addWatermark) doc += WATERMARK;
    doc += `\n */`;
    return doc;
}

export default function autodocAiAgentPlugin({ emitter, logger }) {
    emitter.on('format:before', (fileData) => {
        if (!fileData[SHARED_CONTEXT_KEY]) {
             fileData[SHARED_CONTEXT_KEY] = {
                analyses: new Map(), modifications: [], variableStructures: new Map(), typedefs: new Set(),
            };
        }
        const context = fileData[SHARED_CONTEXT_KEY];
        if (context.isComposedByPredictive) return;

        let ast;
        try {
            ast = parser.parse(fileData.content, { sourceType: 'module', plugins: ['typescript', 'jsx'], attachComment: true });
        } catch (e) { return; }

        const globalScope = new ScopeManager();

        traverse(ast, {
            Scope: { enter(path) { path.scope.scopeManager = new ScopeManager(path.scope.parent.scopeManager || globalScope); } },
            VariableDeclarator(path) {
                if (path.node.id.type === 'Identifier') {
                    const varType = inferTypeFromNode(path.node.init, path.scope.scopeManager);
                    path.scope.scopeManager.declare(path.node.id.name, varType);
                }
            },
            Function(path) {
                const node = path.node;
                const functionId = `${node.start}-${node.end}`;
                if (context.analyses.has(functionId)) return;

                const existingComment = (node.leadingComments || []).find(c => c.value.startsWith('*'));
                const existingJSDoc = existingComment ? parseExistingJSDoc(existingComment.value) : null;
                
                const analysis = {
                    name: node.id?.name || 'anonymous',
                    params: new Map(),
                    returns: { type: 'void', description: '' },
                    isAsync: node.async || false,
                    description: existingJSDoc?.description || node.id?.name || '',
                };

                node.params.forEach(p => {
                    const paramName = p.name;
                    const existingParam = existingJSDoc?.params.get(paramName);
                    analysis.params.set(paramName, { name: paramName, type: existingParam?.type || 'any', description: existingParam?.description || '' });
                });

                path.traverse({
                    ReturnStatement(returnPath) {
                        const returnNode = returnPath.node.argument;
                        if (returnNode && returnNode.type === 'Identifier' && context.variableStructures.has(returnNode.name)) {
                            const struct = context.variableStructures.get(returnNode.name);
                            const typeName = `${analysis.name.charAt(0).toUpperCase() + analysis.name.slice(1)}Result`;
                            context.typedefs.add(generateTypedefFromStructure(typeName, struct));
                            analysis.returns = { type: typeName, description: existingJSDoc?.returns?.description || '' };
                        } else if (returnNode) {
                            analysis.returns = { type: inferTypeFromNode(returnNode, path.scope.scopeManager), description: existingJSDoc?.returns?.description || '' };
                        }
                    }
                });
                
                context.analyses.set(functionId, { ...analysis, nodeStart: node.start, comment: existingComment });
            }
        });
        
        // --- Tahap Komposisi (Hanya jika tidak ada komposer lain) ---
        setTimeout(() => {
            if (context.isComposedByPredictive) return;
            
            let finalContent = fileData.content;
            const modifications = [];
            context.analyses.forEach(analysis => {
                modifications.push({ 
                    start: analysis.comment ? analysis.comment.start : analysis.nodeStart, 
                    end: analysis.comment ? analysis.comment.end : analysis.nodeStart, 
                    content: composeJSDocFromAnalysis(analysis, true)
                });
            });

            // Hapus komentar lama sebelum menambahkan yang baru
            for (const mod of modifications.sort((a, b) => b.start - a.start)) {
                finalContent = finalContent.slice(0, mod.start) + finalContent.slice(mod.end);
            }
            // Tambahkan komentar baru
            for (const mod of modifications.sort((a, b) => b.start - a.start)) {
                finalContent = finalContent.slice(0, mod.start) + mod.content + finalContent.slice(mod.start);
            }
            
            const typedefBlock = Array.from(context.typedefs).join('\n\n');
            if (typedefBlock) {
                finalContent = typedefBlock + '\n\n' + finalContent;
            }
            fileData.content = finalContent;
        }, 0);
    });

    logger.info(chalk.blue('💠 Plugin "AutoDoc AI Agent" (foundation & composer) loaded.'));
}