import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default;

const AR_WATERMARK = `\n * --- \n * Auto-documented by vrzaq by Arifi Razzaq\n * Saweria: https://saweria.co/arzzq`;

/**
 * Infer tipe sederhana berdasarkan AST node.
 */
function inferType(node) {
    if (!node) return '*';

    switch (node.type) {
        case 'StringLiteral': return 'string';
        case 'NumericLiteral': return 'number';
        case 'BooleanLiteral': return 'boolean';
        case 'NullLiteral': return 'null';
        case 'ObjectExpression': return 'Object';
        case 'ArrayExpression': return 'Array';
        case 'Identifier': return '*';
        case 'ArrowFunctionExpression':
        case 'FunctionExpression': return 'Function';
        default: return '*';
    }
}

/**
 * Map untuk menyimpan typedef unik
 */
const typedefs = new Map();

/**
 * Generate / reuse typedef docstring.
 */
function buildTypedef(name, properties) {
    const signature = JSON.stringify(properties.map(p => ({ name: p.name, type: p.type })));
    if (typedefs.has(signature)) {
        return typedefs.get(signature).name;
    }

    let finalName = name;
    let suffix = 1;
    const existingNames = new Set(Array.from(typedefs.values()).map(v => v.name));
    while (existingNames.has(finalName)) {
        finalName = `${name}_${suffix++}`;
    }

    let jsdoc = `/**\n * @typedef {Object} ${finalName}\n`;
    properties.forEach(prop => {
        jsdoc += ` * @property {${prop.type}} ${prop.name}\n`;
    });
    jsdoc += ` */\n`;

    typedefs.set(signature, { name: finalName, jsdoc });
    return finalName;
}

/**
 * Extract ObjectPattern (parameter destructuring) menjadi list properti.
 */
function extractObjectPattern(pattern, parentName) {
    const props = [];
    pattern.properties.forEach(prop => {
        if (prop.type === 'RestElement' && prop.argument && prop.argument.name) {
            props.push({ name: '...' + prop.argument.name, type: 'Array<any>' });
            return;
        }

        const keyName = prop.key && (prop.key.name || (prop.key.value ?? null));
        if (!keyName) return;

        let type = '*';
        if (prop.value && prop.value.type === 'ObjectPattern') {
            const nestedName = `${parentName}_${keyName}`;
            const nestedProps = extractObjectPattern(prop.value, nestedName);
            type = buildTypedef(nestedName, nestedProps);
        } else if (prop.value && prop.value.type === 'ArrayPattern') {
            type = 'Array<any>';
        }

        props.push({ name: keyName, type });
    });
    return props;
}

/**
 * Extract ObjectExpression (returned object) menjadi list properti.
 */
function extractObjectExpression(node, parentName) {
    if (!node || node.type !== 'ObjectExpression') return [];

    const props = [];
    node.properties.forEach(prop => {
        if (prop.type === 'SpreadElement') {
            props.push({ name: '...' + (prop.argument?.name ?? 'spread'), type: '*' });
            return;
        }

        const key = prop.key && (prop.key.name || (prop.key.value ?? null));
        if (!key) return;

        let type = '*';
        const value = prop.value;
        if (!value) {
            type = '*';
        } else if (value.type === 'StringLiteral') {
            type = 'string';
        } else if (value.type === 'NumericLiteral') {
            type = 'number';
        } else if (value.type === 'BooleanLiteral') {
            type = 'boolean';
        } else if (value.type === 'NullLiteral') {
            type = 'null';
        } else if (value.type === 'ObjectExpression') {
            const nestedName = `${parentName}_${key}`;
            const nestedProps = extractObjectExpression(value, nestedName);
            type = buildTypedef(nestedName, nestedProps);
        } else if (value.type === 'ArrayExpression') {
            if (value.elements && value.elements.length > 0 && value.elements[0]?.type === 'ObjectExpression') {
                const nestedName = `${parentName}_${key}_Item`;
                const nestedProps = extractObjectExpression(value.elements[0], nestedName);
                const itemTypedef = buildTypedef(nestedName, nestedProps);
                type = `Array<${itemTypedef}>`;
            } else {
                type = 'Array';
            }
        } else if (value.type === 'Identifier') {
            type = '*';
        }

        props.push({ name: key, type });
    });

    return props;
}

/**
 * Infer return type.
 */
function inferReturnType(path, contextName = 'ReturnType') {
    let returnType = 'any';

    path.traverse({
        ReturnStatement(returnPath) {
            const arg = returnPath.node.argument;
            if (!arg) {
                returnType = 'void';
                return;
            }

            switch (arg.type) {
                case 'StringLiteral':
                    returnType = 'string';
                    break;
                case 'NumericLiteral':
                    returnType = 'number';
                    break;
                case 'BooleanLiteral':
                    returnType = 'boolean';
                    break;
                case 'NullLiteral':
                    returnType = 'null';
                    break;
                case 'ObjectExpression': {
                    const typedefName = `${contextName}Return`;
                    const props = extractObjectExpression(arg, typedefName);
                    if (props.length > 0) {
                       returnType = buildTypedef(typedefName, props);
                    } else {
                       returnType = 'Object';
                    }
                    break;
                }
                case 'ArrayExpression': {
                    const elems = arg.elements || [];
                    if (elems.length > 0 && elems[0]?.type === 'ObjectExpression') {
                        const typedefName = `${contextName}Item`;
                        const props = extractObjectExpression(elems[0], typedefName);
                        const itemName = buildTypedef(typedefName, props);
                        returnType = `Array<${itemName}>`;
                    } else {
                        returnType = 'Array';
                    }
                    break;
                }
                case 'Identifier':
                    returnType = '*';
                    break;
                case 'ArrowFunctionExpression':
                case 'FunctionExpression':
                    returnType = 'Function';
                    break;
                default:
                    returnType = '*';
            }
        }
    });

    return returnType;
}

/**
 * Build JSDoc block untuk function/class.
 */
function buildJSDoc({ name, params, returnType, properties = [], isClass = false }) {
    let jsdoc = '/**\n';

    if (isClass) {
        jsdoc += ` * @class ${name}\n`;
        properties.forEach(prop => {
            jsdoc += ` * @property {${prop.type}} ${prop.name}\n`;
        });
    }

    params.forEach(p => {
        jsdoc += ` * @param {${p.type}} ${p.name}\n`;
    });

    if (!isClass) {
        jsdoc += ` * @returns {${returnType}}\n`;
    }

    jsdoc += `${AR_WATERMARK}\n */`;
    return jsdoc;
}

export default function autodocPlugin({ emitter, logger }) {
    emitter.on('format:before', (fileData) => {
        // PERBAIKAN #2: Hanya proses file JavaScript, abaikan JSON, dll.
        const supportedExtensions = ['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx'];
        if (!supportedExtensions.includes(fileData.ext)) {
            return;
        }

        try {
            typedefs.clear();
            const ast = parser.parse(fileData.content, {
                sourceType: "module",
                plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator"]
            });
            const modifications = [];

            const visitor = {
                'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression'(path) {
                    let name;
                    const parent = path.parentPath;
                    if (path.node.type === 'FunctionDeclaration') {
                        name = path.node.id?.name ?? 'anonymousFn';
                    } else { // FunctionExpression or ArrowFunctionExpression
                        if (parent.node.type === 'VariableDeclarator' && parent.node.id?.type === 'Identifier') {
                            name = parent.node.id.name;
                        } else if (parent.node.type === 'AssignmentExpression' && parent.node.left?.property?.type === 'Identifier') {
                            name = parent.node.left.property.name;
                        } else {
                            name = path.node.id?.name ?? 'anonymousFn';
                        }
                    }

                    const params = path.node.params.map((param, i) => {
                        if (param.type === 'Identifier') {
                            return { name: param.name, type: '*' };
                        } else if (param.type === 'AssignmentPattern') {
                            return { name: param.left.name, type: inferType(param.right) };
                        } else if (param.type === 'RestElement') {
                            return { name: '...' + (param.argument?.name ?? `rest${i}`), type: 'Array<any>' };
                        } else if (param.type === 'ObjectPattern') {
                            const typedefName = `${name}Options`;
                            const props = extractObjectPattern(param, typedefName);
                            const actualTypedefName = buildTypedef(typedefName, props);
                            return { name: 'options', type: actualTypedefName };
                        }
                        return { name: `param${i}`, type: '*' };
                    });
                    
                    const returnType = inferReturnType(path, name);
                    const jsdoc = buildJSDoc({ name, params, returnType });
                    
                    const targetNode = (path.node.type === 'FunctionDeclaration' ? path.node : parent.node);
                    modifications.push({
                        start: targetNode.start,
                        leadingComments: targetNode.leadingComments,
                        jsdoc
                    });
                },
                ClassDeclaration(path) {
                    const className = path.node.id?.name ?? 'AnonymousClass';
                    let constructorParams = [];
                    let properties = [];

                    path.traverse({
                        ClassMethod(methodPath) {
                            if (methodPath.node.kind === 'constructor') {
                                constructorParams = methodPath.node.params.map((p, i) => {
                                    if (p.type === 'Identifier') return { name: p.name, type: '*' };
                                    if (p.type === 'AssignmentPattern') return { name: p.left.name, type: inferType(p.right) };
                                    if (p.type === 'ObjectPattern') {
                                        const typedefName = `${className}CtorOptions`;
                                        const props = extractObjectPattern(p, typedefName);
                                        return { name: 'options', type: buildTypedef(typedefName, props) };
                                    }
                                    return { name: `param${i}`, type: '*' };
                                });

                                methodPath.traverse({
                                    AssignmentExpression(assignPath) {
                                        if (assignPath.node.left.type === 'MemberExpression' && assignPath.node.left.object.type === 'ThisExpression') {
                                            const propName = assignPath.node.left.property.name;
                                            const propType = inferType(assignPath.node.right);
                                            properties.push({ name: propName, type: propType });
                                        }
                                    }
                                });
                            }
                        }
                    });

                    const jsdoc = buildJSDoc({ name: className, params: constructorParams, properties, isClass: true });
                    modifications.push({ start: path.node.start, leadingComments: path.node.leadingComments, jsdoc });
                }
            };
            
            traverse(ast, visitor);

            modifications.reverse().forEach(mod => {
                let startPos = mod.start;
                let endPos = mod.start;
                if (mod.leadingComments && mod.leadingComments.length > 0) {
                    startPos = mod.leadingComments[0].start;
                }
                fileData.content = fileData.content.slice(0, startPos) + mod.jsdoc + '\n' + fileData.content.slice(endPos);
            });

            if (typedefs.size > 0) {
                const typedefBlock = Array.from(typedefs.values()).map(v => v.jsdoc).join('\n');
                fileData.content = typedefBlock + '\n' + fileData.content;
            }

        } catch (error) {
            logger.warn(`[autodoc-plugin] Failed to parse ${fileData.path}: ${error.message}`);
        }
    });

    logger.info('⚡ Plugin "AutoDoc Ultimate" loaded. Code intelligence active.');
}