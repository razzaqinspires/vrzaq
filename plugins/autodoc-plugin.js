import * as parser from '@babel/parser';
import traverse from '@babel/traverse';

const AR_WATERMARK = `\n * --- \n * Auto-documented by vrzaq by Arifi Razzaq\n * Saweria: https://saweria.co/arzzq`;

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
const typedefs = new Map();
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
        } else {
            type = '*';
        }
        props.push({ name: keyName, type });
    });
    return props;
}
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
            if (value.elements && value.elements.length > 0 && value.elements[0] && value.elements[0].type === 'ObjectExpression') {
                const nestedName = `${parentName}_${key}_Item`;
                const nestedProps = extractObjectExpression(value.elements[0], nestedName);
                const itemTypedef = buildTypedef(nestedName, nestedProps);
                type = `Array<${itemTypedef}>`;
            } else {
                type = 'Array';
            }
        } else if (value.type === 'Identifier') {
            type = '*';
        } else {
            type = '*';
        }
        props.push({ name: key, type });
    });
    return props;
}
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
                    const actualName = buildTypedef(typedefName, props);
                    returnType = actualName;
                    break;
                }
                case 'ArrayExpression': {
                    const elems = arg.elements || [];
                    if (elems.length > 0 && elems[0] && elems[0].type === 'ObjectExpression') {
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
        try {
            typedefs.clear();

            const ast = parser.parse(fileData.content, {
                sourceType: "module",
                plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator"]
            });

            const modifications = [];

            traverse(ast, {
                FunctionDeclaration(path) {
                    const name = path.node.id?.name ?? 'anonymousFn';
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
                        } else if (param.type === 'ArrayPattern') {
                            return { name: `arr${i}`, type: 'Array' };
                        } else {
                            return { name: `param${i}`, type: '*' };
                        }
                    });
                    const returnType = inferReturnType(path, name);
                    const jsdoc = buildJSDoc({ name, params, returnType });
                    modifications.push({
                        start: path.node.start,
                        leadingComments: path.node.leadingComments,
                        jsdoc
                    });
                },
                FunctionExpression(path) {
                    let name = 'anonymousFn';
                    const parent = path.parentPath;
                    if (parent.node.type === 'VariableDeclarator' && parent.node.id && parent.node.id.name) {
                        name = parent.node.id.name;
                    } else if (parent.node.type === 'AssignmentExpression' && parent.node.left && parent.node.left.type === 'MemberExpression') {
                        if (parent.node.left.property && parent.node.left.property.name) {
                            name = parent.node.left.property.name;
                        }
                    }
                    const params = path.node.params.map((param, i) => {
                        if (param.type === 'Identifier') return { name: param.name, type: '*' };
                        if (param.type === 'AssignmentPattern') return { name: param.left.name, type: inferType(param.right) };
                        if (param.type === 'RestElement') return { name: '...' + (param.argument?.name ?? `rest${i}`), type: 'Array<any>' };
                        if (param.type === 'ObjectPattern') {
                            const typedefName = `${name}Options`;
                            const props = extractObjectPattern(param, typedefName);
                            const actualTypedefName = buildTypedef(typedefName, props);
                            return { name: 'options', type: actualTypedefName };
                        }
                        if (param.type === 'ArrayPattern') return { name: `arr${i}`, type: 'Array' };
                        return { name: `param${i}`, type: '*' };
                    });
                    const returnType = inferReturnType(path, name);
                    const jsdoc = buildJSDoc({ name, params, returnType });
                    const insertPos = parent.node.start ?? path.node.start;
                    modifications.push({
                        start: insertPos,
                        leadingComments: parent.node.leadingComments || path.node.leadingComments,
                        jsdoc
                    });
                },
                ArrowFunctionExpression(path) {
                    let name = 'anonymousArrow';
                    const parent = path.parentPath;
                    if (parent.node.type === 'VariableDeclarator' && parent.node.id && parent.node.id.name) {
                        name = parent.node.id.name;
                    } else if (parent.node.type === 'AssignmentExpression' && parent.node.left && parent.node.left.type === 'MemberExpression') {
                        if (parent.node.left.property && parent.node.left.property.name) {
                            name = parent.node.left.property.name;
                        }
                    }
                    const params = path.node.params.map((param, i) => {
                        if (param.type === 'Identifier') return { name: param.name, type: '*' };
                        if (param.type === 'AssignmentPattern') return { name: param.left.name, type: inferType(param.right) };
                        if (param.type === 'RestElement') return { name: '...' + (param.argument?.name ?? `rest${i}`), type: 'Array<any>' };
                        if (param.type === 'ObjectPattern') {
                            const typedefName = `${name}Options`;
                            const props = extractObjectPattern(param, typedefName);
                            const actualTypedefName = buildTypedef(typedefName, props);
                            return { name: 'options', type: actualTypedefName };
                        }
                        if (param.type === 'ArrayPattern') return { name: `arr${i}`, type: 'Array' };
                        return { name: `param${i}`, type: '*' };
                    });
                    const returnType = inferReturnType(path, name);
                    const insertPos = parent.node.start ?? path.node.start;
                    const jsdoc = buildJSDoc({ name, params, returnType });
                    modifications.push({
                        start: insertPos,
                        leadingComments: parent.node.leadingComments || path.node.leadingComments,
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
                                        const actualTypedefName = buildTypedef(typedefName, props);
                                        return { name: 'options', type: actualTypedefName };
                                    }
                                    return { name: `param${i}`, type: '*' };
                                });
                                methodPath.traverse({
                                    AssignmentExpression(assignPath) {
                                        if (
                                            assignPath.node.left.type === 'MemberExpression' &&
                                            assignPath.node.left.object.type === 'ThisExpression'
                                        ) {
                                            const propName = assignPath.node.left.property.name;
                                            const propType = inferType(assignPath.node.right);
                                            properties.push({
                                                name: propName,
                                                type: propType
                                            });
                                        }
                                    }
                                });
                            }
                        }
                    });
                    const jsdoc = buildJSDoc({
                        name: className,
                        params: constructorParams,
                        properties,
                        isClass: true
                    });
                    modifications.push({
                        start: path.node.start,
                        leadingComments: path.node.leadingComments,
                        jsdoc
                    });
                }
            });

            modifications.reverse().forEach(mod => {
                let startPos = mod.start;
                let endPos = mod.start;
                if (mod.leadingComments && mod.leadingComments.length > 0) {
                    startPos = mod.leadingComments[0].start;
                }
                fileData.content =
                    fileData.content.slice(0, startPos) +
                    mod.jsdoc + '\n' +
                    fileData.content.slice(endPos);
            });

            if (typedefs.size > 0) {
                const typedefBlock = Array.from(typedefs.values()).map(v => v.jsdoc).join('\n');
                fileData.content = typedefBlock + '\n' + fileData.content;
            }

        } catch (error) {
            logger.warn(`[autodoc-plugin] Failed to parse ${fileData.path}: ${error.message}`);
        }
    });

    logger.info('⚡ Plugin "AutoDoc Ultimate" loaded. Return-object typedef generation active.');
}