// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// plugins/autodoc-predictive-plugin.js (ULTIMATE ALL-IN-ONE ENGINE - TRULY COMPLETE)
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import chalk from 'chalk';
import generate from '@babel/generator';

const SHARED_CONTEXT_KEY = 'vrzaq_autodoc_analysis_context';
const WATERMARK = `\n * --- \n * Auto-documented by vrzaq by Arifi Razzaq\n * Saweria: https://saweria.co/arzzq`;

// ===================================
// 🔹 HELPER CLASSES & FUNCTIONS (FULL IMPLEMENTATION)
// ===================================

class ScopeManager {
    constructor(parent = null) { this.parent = parent; this.variables = new Map(); }
    declare(name, type) { this.variables.set(name, { type }); }
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
    const parsed = { description: '', params: new Map(), returns: null, deprecated: false, tags: [] };
    const lines = commentBlock.split('\n').map(l => l.replace(/^\s*\*\s?/, ''));
    let descriptionBuffer = [];
    let inDescription = true;
    for (const line of lines) {
        const tagMatch = line.match(/^@(\S+)\s*(.*)/);
        if (tagMatch) {
            if (inDescription) {
                parsed.description = descriptionBuffer.join('\n').trim();
                inDescription = false;
            }
            const tagName = tagMatch[1];
            const tagValue = tagMatch[2].trim();
            switch (tagName) {
                case 'param': {
                    const paramMatch = tagValue.match(/\{(.+?)\}\s*(\S+)\s*(.*)/);
                    if (paramMatch) parsed.params.set(paramMatch[2], { type: paramMatch[1], description: paramMatch[3] || '' });
                    break;
                }
                case 'returns': {
                    const returnMatch = tagValue.match(/\{(.+?)\}\s*(.*)/);
                    if (returnMatch) parsed.returns = { type: returnMatch[1], description: returnMatch[2] || '' };
                    break;
                }
                case 'deprecated': parsed.deprecated = true; break;
                default: parsed.tags.push({ tag: tagName, value: tagValue });
            }
        } else if (inDescription) {
            descriptionBuffer.push(line);
        }
    }
    if (inDescription) parsed.description = descriptionBuffer.join('\n').trim();
    return parsed;
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

function generateTypedefFromObject(typeName, objectNode, scope) {
    let typedef = `/**\n * @typedef {object} ${typeName}\n`;
    for (const prop of objectNode.properties) {
        if (prop.type === 'ObjectProperty') {
            const propName = prop.key.name || prop.key.value;
            const propType = inferTypeFromNode(prop.value, scope);
            typedef += ` * @property {${propType}} ${propName}\n`;
        }
    }
    typedef += ` */`;
    return typedef;
}

function composeJSDocPredictive(analysis) {
    let doc = '/**\n';
    if (analysis.description) doc += ` * ${analysis.description.replace(/\n/g, '\n * ')}\n`;
    analysis.params.forEach(p => doc += ` * @param {${p.type}} ${p.name} ${p.description || ''}\n`);
    (analysis.suggestions || []).forEach(s => doc += ` * @suggestion ${s}\n`);
    (analysis.warnings || []).forEach(w => doc += ` * @warning ${w}\n`);
    if (analysis.returns && analysis.returns.type !== 'void') {
        const returnTypeStr = analysis.isAsync ? `Promise<${analysis.returns.type}>` : analysis.returns.type;
        doc += ` * @returns {${returnTypeStr}} ${analysis.returns.description || ''}\n`;
    }
    doc += WATERMARK + '\n */';
    return doc;
}

// ===================================
// 🔹 MAIN PLUGIN: ULTIMATE ENGINE
// ===================================

export default function autodocPredictivePlugin({ emitter, logger }) {
    emitter.on('format:before', (fileData) => {
        const supportedExtensions = ['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx'];
        if (!supportedExtensions.includes(fileData.ext)) {
            return;
        }

        if (!fileData[SHARED_CONTEXT_KEY]) {
             fileData[SHARED_CONTEXT_KEY] = {
                analyses: new Map(), modifications: [], variableStructures: new Map(), typedefs: new Set(),
                functionSignatures: new Map(), deprecatedFunctions: new Set(),
            };
        }
        const context = fileData[SHARED_CONTEXT_KEY];
        context.isComposedByPredictive = true;

        let ast;
        try {
            const cleanContent = fileData.content.replace(/\/\*\*[\s\S]*?Auto-documented by vrzaq[\s\S]*?\*\//g, '');
            ast = parser.parse(cleanContent, { sourceType: 'module', plugins: ['typescript', 'jsx'], attachComment: true, errorRecovery: true });
        } catch (e) { 
            logger.warn(`[predictive-plugin] Parse failed for ${fileData.file}. Skipping.`);
            return;
        }
        
        if (!context.predictive_pass1_complete) {
            traverse(ast, {
                Function(path) {
                    const commentNode = (path.node.leadingComments || []).find(c => c.value.startsWith('*'));
                    const functionName = path.node.id?.name;
                    if (functionName && commentNode) {
                        const sig = parseExistingJSDoc(commentNode.value);
                        context.functionSignatures.set(functionName, sig);
                        if (sig.deprecated) context.deprecatedFunctions.add(functionName);
                    }
                }
            });
            context.predictive_pass1_complete = true;
        }

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
                const existingComment = (node.leadingComments || []).find(c => c.value.startsWith('*'));
                const existingJSDoc = existingComment ? parseExistingJSDoc(existingComment.value) : null;
                
                const analysis = {
                    name: node.id?.name || 'anonymous', params: new Map(), returns: { type: 'void', description: '' }, isAsync: node.async || false,
                    description: existingJSDoc?.description || node.id?.name || '', warnings: [], suggestions: [],
                    nodeStart: node.start, comment: existingComment,
                };

                node.params.forEach(p => {
                    const paramName = p.name;
                    const existingParam = existingJSDoc?.params.get(paramName);
                    analysis.params.set(paramName, { name: paramName, type: existingParam?.type || 'any', description: existingParam?.description || '' });
                });
                
                let canReturnNull = false;
                let complexReturnObjectNode = null;
                path.traverse({
                    ReturnStatement(p) { 
                        if (p.node.argument?.type === 'NullLiteral') canReturnNull = true;
                        if (p.node.argument?.type === 'ObjectExpression') complexReturnObjectNode = p.node.argument;
                        analysis.returns.type = inferTypeFromNode(p.node.argument, p.scope.scopeManager);
                    },
                    CallExpression(callPath) {
                        const calleeName = callPath.node.callee.name;
                        if (context.deprecatedFunctions.has(calleeName)) {
                            analysis.warnings.push(`Calls deprecated function '${calleeName}'.`);
                        }
                    }
                });

                if (complexReturnObjectNode && analysis.returns.type === 'object') {
                    const typeName = `${analysis.name.charAt(0).toUpperCase() + analysis.name.slice(1)}Result`;
                    analysis.returns.type = typeName;
                    context.typedefs.add(generateTypedefFromObject(typeName, complexReturnObjectNode, path.scope.scopeManager));
                }

                if (canReturnNull && analysis.returns && !(analysis.returns.type.includes('null'))) {
                    analysis.suggestions.push(`Return type should be {${analysis.returns.type}|null} to reflect the null return path.`);
                    analysis.returns.type += '|null';
                }
                context.analyses.set(functionId, analysis);
            }
        });
        
        let finalContent = fileData.content;
        const modifications = [];
        context.analyses.forEach(analysis => modifications.push({
            start: analysis.comment ? analysis.comment.start : analysis.nodeStart,
            end: analysis.comment ? analysis.comment.end : analysis.nodeStart,
            content: composeJSDocPredictive(analysis)
        }));
        
        let contentWithoutOldDocs = fileData.content;
        for (const mod of modifications.sort((a,b) => b.start - a.start)) {
            contentWithoutOldDocs = contentWithoutOldDocs.slice(0, mod.start) + contentWithoutOldDocs.slice(mod.end);
        }
        finalContent = contentWithoutOldDocs;
        for (const mod of modifications.sort((a,b) => b.start - a.start)) {
            finalContent = finalContent.slice(0, mod.start) + mod.content + "\n" + finalContent.slice(mod.start);
        }
        
        const typedefBlock = Array.from(context.typedefs).join('\n\n');
        if (typedefBlock) finalContent = typedefBlock + '\n\n' + finalContent;
        fileData.content = finalContent;
    });
    logger.info(chalk.magenta('🚀 Plugin "AutoDoc Predictive Engine" (all-in-one & composer) loaded.'));
}