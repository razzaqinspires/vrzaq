/**
 * AutoDoc Ultimate — Robust autodoc plugin (ESM)
 *
 * Perbaikan kunci:
 *  - Menangani "traverse is not a function" dengan deteksi eksport & fallback traversal.
 *  - Validasi parse yang sangat ketat + fallback parsing.
 *  - Path wrapper minimal yang menyediakan path.traverse(...) untuk visitor internal.
 *  - Logging, sanitizer, dan proteksi agar tidak merusak file asli.
 *
 * Pastikan dependency:
 *  - @babel/parser
 *  - @babel/traverse (opsional; plugin bekerja tanpa traverse yang asli)
 *
 * Jangan ubah arsitektur: plugin masih ekspor default function autodocPlugin({ emitter, logger, options })
 */

import * as parser from '@babel/parser';
import * as traverseModuleRaw from '@babel/traverse'; // support many bundler shapes
// NOTE: we purposely import as namespace to examine possible shapes (default, named, function)

const _getTraverseFn = (() => {
  // Try to resolve a real traverse function from import
  const candidate = traverseModuleRaw;
  try {
    if (!candidate) return null;
    if (typeof candidate === 'function') return candidate;
    if (typeof candidate.default === 'function') return candidate.default;
    if (typeof candidate.traverse === 'function') return candidate.traverse;
    // Some bundlers might wrap exports under 'default' object with property 'default'
    if (candidate.default && typeof candidate.default.default === 'function') return candidate.default.default;
  } catch (err) {
    // swallow
  }
  return null;
})();

/**
 * fallbackTraverse(ast, visitors)
 * - polyfill traversal that supports the subset of features needed by this plugin:
 *   - visitor keys like 'A|B|C' or single 'A'
 *   - visitor functions or { enter() {} , exit() {} }
 *   - top-level enter / exit
 *   - path.traverse(subVisitors) to traverse subtree
 *
 * This is intentionally conservative and safe: tidak mengubah AST, hanya membaca.
 */
function fallbackTraverse(ast, visitors = {}) {
  if (!ast || typeof ast !== 'object') return;

  const visitorEntries = Object.entries(visitors || {});

  // normalize visitors: map of matcher -> { enter?, exit? } where matcher is array of types
  const normalized = visitorEntries.map(([key, val]) => {
    // Skip if key is not a visitor key
    const types = key.split('|').map(s => s.trim()).filter(Boolean);
    if (types.length === 0 && (key !== 'enter' && key !== 'exit')) return null;
    if (typeof val === 'function') {
      return { key, types, enter: val, exit: null };
    } else if (val && typeof val === 'object') {
      return { key, types, enter: typeof val.enter === 'function' ? val.enter : null, exit: typeof val.exit === 'function' ? val.exit : null };
    } else {
      return { key, types, enter: null, exit: null };
    }
  }).filter(Boolean);

  // Utility: create a "path" wrapper for a node
  function makePath(node, parentPath = null) {
    return {
      node,
      parentPath,
      get parent() { return parentPath?.node || null; },
      // traverse on a subtree (node) using visitors same semantics
      traverse(subVisitors = {}) {
        // subVisitors may be a different visitor object; call fallbackTraverse on current node with that
        fallbackTraverse(node, subVisitors);
      },
      // convenient helper to replicate behavior used in plugin: parentPath?.node
    };
  }

  // Walk recursively
  function walk(node, parentPath) {
    if (!node || typeof node !== 'object') return;

    const path = makePath(node, parentPath);

    // call global enter (visitors.enter)
    if (typeof visitors.enter === 'function') {
      try { visitors.enter(path); } catch (err) { /* swallow visitor error */ }
    }

    // call matching type-specific visitor enters
    for (const v of normalized) {
      // handle 'enter' or 'exit' special keys
      if (v.key === 'enter' || v.key === 'exit') continue;
      if (v.types.includes(node.type)) {
        if (v.enter) {
          try { v.enter(path); } catch (err) { /* swallow */ }
        }
      }
    }

    // Traverse children
    for (const prop of Object.keys(node)) {
      if (prop === 'loc' || prop === 'start' || prop === 'end' || prop === 'range' || prop === 'leadingComments' || prop === 'trailingComments') {
        continue; // skip loc/comment meta when walking children
      }
      const child = node[prop];
      if (Array.isArray(child)) {
        for (const el of child) {
          if (el && typeof el === 'object' && typeof el.type === 'string') {
            walk(el, path);
          }
        }
      } else if (child && typeof child === 'object' && typeof child.type === 'string') {
        walk(child, path);
      }
    }

    // call matching type-specific visitor exits
    for (const v of normalized) {
      if (v.key === 'enter' || v.key === 'exit') continue;
      if (v.types.includes(node.type)) {
        if (v.exit) {
          try { v.exit(path); } catch (err) { /* swallow */ }
        }
      }
    }

    // call global exit
    if (typeof visitors.exit === 'function') {
      try { visitors.exit(path); } catch (err) { /* swallow */ }
    }
  }

  // Start walking from Program.body or ast itself
  // If ast.type === 'Program' traverse its body entries
  if (ast.type === 'Program' && Array.isArray(ast.body)) {
    for (const node of ast.body) walk(node, null);
  } else {
    walk(ast, null);
  }
}

/**
 * Resolve traverse to either babel's traverse or the fallback
 */
const traverse = _getTraverseFn || fallbackTraverse;

/* ---------------------------
   Begin existing plugin code (enhanced)
   --------------------------- */

const AR_WATERMARK = `\n * --- \n * Auto-documented by vrzaq by Arifi Razzaq\n * Saweria: https://saweria.co/arzzq`;

/**
 * Cache global untuk typedefs (signature -> { name, jsdoc })
 */
const typedefs = new Map();

/**
 * Utility: safe stringify untuk signature typedef yang deterministik
 */
function typedefSignature(properties) {
  const normalized = (properties || [])
    .map(p => ({ name: String(p.name), type: String(p.type) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(normalized);
}

/**
 * Infer tipe dari AST node dengan validasi, heuristik lengkap, dan fallback
 */
function inferType(node) {
  if (!node) return '*';

  try {
    switch (node.type) {
      case 'StringLiteral': return 'string';
      case 'NumericLiteral': return 'number';
      case 'BooleanLiteral': return 'boolean';
      case 'NullLiteral': return 'null';
      case 'ObjectExpression': return 'Object';
      case 'ArrayExpression': return 'Array';
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
      case 'FunctionDeclaration': return 'Function';

      case 'Identifier':
        // heuristik nama identifier
        if (/^(err|error)$/i.test(node.name)) return 'Error | null';
        if (/^(cb|callback|next)$/i.test(node.name)) return 'Function';
        if (/^(is|has|can|should)$/i.test(node.name)) return 'boolean';
        if (/^(num|count|total|length)$/i.test(node.name)) return 'number';
        return '*';

      case 'CallExpression':
        // Jika memanggil fungsi terkenal, inferensi
        try {
          if (node.callee && node.callee.type === 'MemberExpression') {
            const calleeName = node.callee.property?.name || '';
            if (calleeName === 'isArray') return 'Array';
            if (calleeName === 'keys') return 'Array';
            if (calleeName === 'parseInt' || calleeName === 'parseFloat') return 'number';
          } else if (node.callee && node.callee.type === 'Identifier') {
            const name = node.callee.name || '';
            if (/^(Number|String|Boolean|Object|Array)$/i.test(name)) return name.toLowerCase();
          }
        } catch (err) { /* ignore */ }
        return '*';

      case 'TemplateLiteral': return 'string';

      case 'TSAsExpression':
      case 'TSTypeReference':
      case 'TSTypeLiteral':
      case 'TSTypeAssertion':
      case 'TSUnionType':
      case 'TSIntersectionType':
        // Dukungan untuk TypeScript
        return 'any';

      default:
        return '*';
    }
  } catch (err) {
    return '*';
  }
}

/**
 * Membuat atau reuse typedef berdasarkan properti
 */
function buildTypedef(baseName, properties) {
  const signature = typedefSignature(properties || []);
  if (typedefs.has(signature)) return typedefs.get(signature).name;

  const existingNames = new Set(Array.from(typedefs.values()).map(v => v.name));
  let base = sanitizeName(baseName || 'AutoType');
  let finalName = base;
  let idx = 1;
  while (existingNames.has(finalName)) {
    finalName = `${base}_${idx++}`;
  }

  let jsdoc = `/**\n * @typedef {Object} ${finalName}\n`;
  (properties || []).forEach(p => {
    const t = p.type || '*';
    const n = String(p.name);
    jsdoc += ` * @property {${t}} ${n}\n`;
  });
  jsdoc += ` */\n`;

  typedefs.set(signature, { name: finalName, jsdoc });
  return finalName;
}

/**
 * Sanitasi nama agar valid sebagai identifier JS
 */
function sanitizeName(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1')
    .replace(/__+/g, '_') || 'AutoType';
}

/**
 * Ekstraksi properti dari ObjectPattern (destructuring)
 */
function extractObjectPattern(pattern, parentName) {
  const props = [];
  if (!pattern || !pattern.properties) return props;

  for (const prop of pattern.properties) {
    try {
      if (!prop) continue;

      if (prop.type === 'RestElement') {
        const argName = prop.argument?.name ?? 'rest';
        props.push({ name: '...' + argName, type: 'Array<any>' });
        continue;
      }

      const keyName = prop.key?.name || prop.key?.value || prop.key?.raw;
      if (!keyName) continue;

      if (prop.value && prop.value.type === 'ObjectPattern') {
        const nestedName = `${parentName}_${keyName}`;
        const nestedProps = extractObjectPattern(prop.value, nestedName);
        const t = buildTypedef(nestedName, nestedProps);
        props.push({ name: keyName, type: t });
      } else if (prop.value && prop.value.type === 'ArrayPattern') {
        props.push({ name: keyName, type: 'Array<any>' });
      } else if (prop.value && prop.value.type === 'AssignmentPattern') {
        const rightType = inferType(prop.value.right);
        props.push({ name: keyName, type: rightType });
      } else if (prop.value && prop.value.type === 'Identifier') {
        props.push({ name: keyName, type: '*' });
      } else {
        props.push({ name: keyName, type: '*' });
      }
    } catch (err) {
      // ignore per-property failures
      continue;
    }
  }

  return props;
}

/**
 * Ekstraksi properti dari ObjectExpression (literal objek)
 */
function extractObjectExpression(node, parentName) {
  if (!node || node.type !== 'ObjectExpression') return [];
  const props = [];
  for (const prop of node.properties) {
    try {
      if (!prop) continue;
      if (prop.type === 'SpreadElement') {
        props.push({ name: '...' + (prop.argument?.name ?? 'spread'), type: '*' });
        continue;
      }

      const key = prop.key?.name || prop.key?.value || prop.key?.raw;
      if (!key) continue;

      const value = prop.value;
      if (!value) {
        props.push({ name: key, type: '*' });
        continue;
      }

      switch (value.type) {
        case 'StringLiteral': props.push({ name: key, type: 'string' }); break;
        case 'NumericLiteral': props.push({ name: key, type: 'number' }); break;
        case 'BooleanLiteral': props.push({ name: key, type: 'boolean' }); break;
        case 'NullLiteral': props.push({ name: key, type: 'null' }); break;
        case 'ObjectExpression': {
          const nestedName = `${parentName}_${key}`;
          const nestedProps = extractObjectExpression(value, nestedName);
          const t = buildTypedef(nestedName, nestedProps);
          props.push({ name: key, type: t });
          break;
        }
        case 'ArrayExpression': {
          const elems = value.elements || [];
          if (elems.length > 0 && elems[0]?.type === 'ObjectExpression') {
            const nestedName = `${parentName}_${key}_Item`;
            const nestedProps = extractObjectExpression(elems[0], nestedName);
            const itemType = buildTypedef(nestedName, nestedProps);
            props.push({ name: key, type: `Array<${itemType}>` });
          } else {
            props.push({ name: key, type: 'Array' });
          }
          break;
        }
        case 'Identifier': props.push({ name: key, type: '*' }); break;
        case 'CallExpression': props.push({ name: key, type: '*' }); break;
        default: props.push({ name: key, type: '*' });
      }
    } catch (err) {
      continue;
    }
  }
  return props;
}

/**
 * Infer return tipe dari fungsi berdasarkan traversing dan heuristik
 * - menggunakan path.traverse jika path menyediakan, atau melakukan fallback traverse pada node
 */
function inferReturnType(path, contextName = 'ReturnType') {
  // path may be a babel 'path' or a node wrapped by our fallbackTraverse's path
  let returnType = 'any';
  try {
    const walker = (p) => {
      // If p has traverse (babel or our wrapper), use it
      if (p && typeof p.traverse === 'function') {
        // use visitor to capture ReturnStatement nodes
        try {
          p.traverse({
            ReturnStatement(returnPath) {
              try {
                const arg = returnPath.node?.argument;
                if (!arg) {
                  returnType = 'void';
                  return;
                }
                switch (arg.type) {
                  case 'StringLiteral': returnType = 'string'; break;
                  case 'NumericLiteral': returnType = 'number'; break;
                  case 'BooleanLiteral': returnType = 'boolean'; break;
                  case 'NullLiteral': returnType = 'null'; break;
                  case 'ObjectExpression': {
                    const typedefName = `${contextName}Return`;
                    const props = extractObjectExpression(arg, typedefName);
                    returnType = props.length > 0 ? buildTypedef(typedefName, props) : 'Object';
                    break;
                  }
                  case 'ArrayExpression': {
                    const elems = arg.elements || [];
                    if (elems.length > 0 && elems[0]?.type === 'ObjectExpression') {
                      const typedefName = `${contextName}Item`;
                      const props = extractObjectExpression(elems[0], typedefName);
                      const itemType = buildTypedef(typedefName, props);
                      returnType = `Array<${itemType}>`;
                    } else {
                      returnType = 'Array';
                    }
                    break;
                  }
                  case 'Identifier': returnType = '*'; break;
                  case 'ArrowFunctionExpression':
                  case 'FunctionExpression': returnType = 'Function'; break;
                  default: returnType = '*';
                }
              } catch (err) { /* ignore individual return processing error */ }
            }
          });
        } catch (err) {
          // if p.traverse threw (rare), fallback to manual traversal
          try {
            fallbackTraverse(p.node, { ReturnStatement(returnPath) {
              try {
                const arg = returnPath.node?.argument;
                if (!arg) {
                  returnType = 'void';
                  return;
                }
                if (arg.type === 'ObjectExpression') {
                  const typedefName = `${contextName}Return`;
                  const props = extractObjectExpression(arg, typedefName);
                  returnType = props.length > 0 ? buildTypedef(typedefName, props) : 'Object';
                } else if (arg.type === 'ArrayExpression') {
                  const elems = arg.elements || [];
                  if (elems.length > 0 && elems[0]?.type === 'ObjectExpression') {
                    const typedefName = `${contextName}Item`;
                    const props = extractObjectExpression(elems[0], typedefName);
                    const itemType = buildTypedef(typedefName, props);
                    returnType = `Array<${itemType}>`;
                  } else {
                    returnType = 'Array';
                  }
                } else {
                  // let earlier logic handle basic literals if needed
                }
              } catch (err) { /* ignore */ }
            }});
          } catch (er) { /* ignore */ }
        }
      } else {
        // p doesn't have traverse: maybe it's direct AST node — apply fallback traversal
        fallbackTraverse(p?.node || p, {
          ReturnStatement(returnPath) {
            try {
              const arg = returnPath.node?.argument;
              if (!arg) {
                returnType = 'void';
                return;
              }
              switch (arg.type) {
                case 'StringLiteral': returnType = 'string'; break;
                case 'NumericLiteral': returnType = 'number'; break;
                case 'BooleanLiteral': returnType = 'boolean'; break;
                case 'NullLiteral': returnType = 'null'; break;
                case 'ObjectExpression': {
                  const typedefName = `${contextName}Return`;
                  const props = extractObjectExpression(arg, typedefName);
                  returnType = props.length > 0 ? buildTypedef(typedefName, props) : 'Object';
                  break;
                }
                case 'ArrayExpression': {
                  const elems = arg.elements || [];
                  if (elems.length > 0 && elems[0]?.type === 'ObjectExpression') {
                    const typedefName = `${contextName}Item`;
                    const props = extractObjectExpression(elems[0], typedefName);
                    const itemType = buildTypedef(typedefName, props);
                    returnType = `Array<${itemType}>`;
                  } else {
                    returnType = 'Array';
                  }
                  break;
                }
                case 'Identifier': returnType = '*'; break;
                default: returnType = '*';
              }
            } catch (err) { /* ignore */ }
          }
        });
      }
    };

    walker(path);
  } catch (err) {
    returnType = '*';
  }
  return returnType;
}

/**
 * Membuat blok JSDoc lengkap, termasuk parameter, return, dan property
 */
function buildJSDoc({ name, params = [], returnType = 'any', properties = [], isClass = false }) {
  let js = '/**\n';

  if (isClass) {
    js += ` * @class ${name}\n`;
    (properties || []).forEach(p => {
      js += ` * @property {${p.type}} ${p.name}\n`;
    });
  }

  (params || []).forEach(p => {
    const pname = p?.name ?? 'param';
    const ptype = p?.type ?? '*';
    js += ` * @param {${ptype}} ${pname}\n`;
  });

  // Jika bukan class dan return bukan void
  if (!isClass && returnType !== 'void') {
    js += ` * @returns {${typeof returnType === 'string' ? returnType : '*'}}\n`;
  }

  js += `${AR_WATERMARK}\n */`;
  return js;
}

/**
 * Memeriksa keberadaan JSDoc existing pada node
 */
function hasExistingJSDoc(node) {
  try {
    if (!node) return false;
    // check node.leadingComments and also attached comments
    const comments = node.leadingComments || node.comments || [];
    return comments.some(c => typeof c.value === 'string' && /\*\*/.test(c.value));
  } catch (err) {
    return false;
  }
}

/**
 * Menyisipkan konten ke posisi tertentu dalam string
 */
function insertAt(content, index, toInsert) {
  if (typeof content !== 'string') return content;
  const idx = Math.max(0, Math.min(content.length, index || 0));
  return content.slice(0, idx) + toInsert + content.slice(idx);
}

/**
 * Main plugin export
 */
export default function autodocPlugin({ emitter, logger, options = {} } = {}) {
  const supportedExtensions = Array.isArray(options.supportedExtensions) ? options.supportedExtensions : (options.supportedExtensions ? [options.supportedExtensions] : ['js', 'mjs', 'cjs', 'ts', 'tsx']);

  emitter.on('format:before', (fileData) => {
    // --- Validation awal
    if (!fileData || typeof fileData !== 'object') {
      logger?.warn?.('[autodoc-plugin] Ignoring invalid fileData (not an object).');
      return;
    }
    if (!fileData.ext || typeof fileData.ext !== 'string') {
      logger?.debug?.('[autodoc-plugin] Missing extension; skipping file.');
      return;
    }
    if (!supportedExtensions.includes(fileData.ext)) {
      logger?.debug?.(`[autodoc-plugin] Unsupported extension (${fileData.ext}); skipping.`);
      return;
    }
    if (typeof fileData.content !== 'string') {
      logger?.warn?.('[autodoc-plugin] fileData.content is not a string; skipping.');
      return;
    }

    try {
      // reset typedefs per-file to avoid leakage between files
      typedefs.clear();

      // Parse dengan beberapa fallback options (lebih resilient)
      let ast = null;
      const parseAttempts = [
        // default: modern set
        {
          sourceType: 'module',
          plugins: [
            'jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator',
            'objectRestSpread', 'dynamicImport', 'topLevelAwait', 'decorators-legacy', 'typescript'
          ],
          errorRecovery: false,
        },
        // fallback 1: allow error recovery
        {
          sourceType: 'unambiguous',
          plugins: [
            'jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator',
            'objectRestSpread', 'dynamicImport', 'topLevelAwait', 'decorators-legacy', 'typescript'
          ],
          errorRecovery: true,
        },
        // fallback 2: looser parser (allowReturnOutsideFunction)
        {
          sourceType: 'unambiguous',
          plugins: [
            'jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator',
            'objectRestSpread', 'dynamicImport', 'topLevelAwait', 'decorators-legacy', 'typescript'
          ],
          allowReturnOutsideFunction: true,
          errorRecovery: true,
        }
      ];

      let lastParseError = null;
      for (const opts of parseAttempts) {
        try {
          ast = parser.parse(fileData.content, opts);
          // basic sanity: expect Program node
          if (ast && ast.type === 'File') {
            ast = ast.program || ast;
          }
          if (ast && (ast.type === 'Program' || ast.type === 'File')) break;
        } catch (err) {
          lastParseError = err;
          logger?.debug?.(`[autodoc-plugin] parse attempt failed (${JSON.stringify(opts)}): ${err?.message?.slice?.(0,200)}`);
          // continue to next attempt
        }
      }

      if (!ast) {
        logger?.warn?.(`[autodoc-plugin] Gagal parse file ${fileData.path || '(unknown)'} — melewati autopilot. Error: ${lastParseError?.message || 'unknown'}`);
        return;
      }

      // Koleksi modifikasi
      const modifications = [];

      // Traverse AST (menggunakan babel traverse jika ada, atau fallback)
      traverse(ast, {
        enter(_path) {
          // no-op global enter (left for future hooks)
        },

        // support visitor key forms exactly like plugin expects
        'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression'(path) {
          try {
            // Menentukan nama
            let name = 'anonymousFn';
            const node = path.node;
            const parent = path.parentPath?.node || path.parent || (path?.parent ? path.parent.node : undefined) || {};

            if (node.id && node.id.name) name = node.id.name;
            else if (parent && parent.type === 'VariableDeclarator' && parent.id?.name) name = parent.id.name;
            else if (parent && parent.type === 'AssignmentExpression' && parent.left) {
              if (parent.left.type === 'MemberExpression') name = parent.left.property?.name || name;
              else if (parent.left.type === 'Identifier') name = parent.left.name || name;
            } else if (parent && parent.type === 'ExportDefaultDeclaration') {
              name = 'default';
            } else if (node.type === 'ArrowFunctionExpression' && parent && parent.type === 'CallExpression') {
              name = parent.callee?.name || name;
            }

            if (!name) name = 'anonymousFn';

            // Mengecek existing JSDoc
            const targetNode = (node.type === 'FunctionDeclaration') ? node : (path.parentPath?.node || node);
            if (hasExistingJSDoc(targetNode)) return;

            // Mengumpulkan parameter
            const params = (node.params || []).map((param, i) => {
              if (!param) return { name: `param${i}`, type: '*' };
              switch (param.type) {
                case 'Identifier': return { name: param.name, type: '*' };
                case 'AssignmentPattern': return { name: param.left?.name ?? `param${i}`, type: inferType(param.right) };
                case 'RestElement': return { name: '...' + (param.argument?.name ?? `rest${i}`), type: 'Array<any>' };
                case 'ObjectPattern':
                  const typedefName = `${sanitizeName(name)}Options`;
                  const props = extractObjectPattern(param, typedefName);
                  const t = buildTypedef(typedefName, props);
                  return { name: 'options', type: t };
                case 'ArrayPattern': return { name: `arr${i}`, type: 'Array' };
                default: return { name: `param${i}`, type: '*' };
              }
            });

            // Menentukan tipe return
            const returnType = inferReturnType(path, sanitizeName(name));

            // Membuat JSDoc
            const jsdoc = buildJSDoc({ name, params, returnType });

            // Posisi penyisipan
            let startPos = (targetNode && (typeof targetNode.start === 'number' ? targetNode.start : (targetNode.range ? targetNode.range[0] : undefined))) || 0;
            // If there are leading comments, use the earliest leading comment start to preserve order
            const leadingComments = targetNode?.leadingComments || (targetNode?.comments || []);
            if (Array.isArray(leadingComments) && leadingComments.length > 0 && typeof leadingComments[0].start === 'number') {
              startPos = leadingComments[0].start;
            }

            modifications.push({ start: startPos, jsdoc });
          } catch (err) {
            logger?.debug?.(`[autodoc-plugin] Function processing failed: ${err?.message?.slice?.(0,200)}`);
          }
        },

        ClassDeclaration(path) {
          try {
            const node = path.node;
            const className = node.id?.name || 'AnonymousClass';

            if (hasExistingJSDoc(node)) return;

            let constructorParams = [];
            const properties = [];

            // Traversing class methods
            path.traverse({
              ClassMethod(methodPath) {
                try {
                  if (methodPath.node.kind === 'constructor') {
                    constructorParams = (methodPath.node.params || []).map((p, i) => {
                      if (!p) return { name: `param${i}`, type: '*' };
                      if (p.type === 'Identifier') return { name: p.name, type: '*' };
                      if (p.type === 'AssignmentPattern') return { name: p.left?.name ?? `param${i}`, type: inferType(p.right) };
                      if (p.type === 'ObjectPattern') {
                        const typedefName = `${sanitizeName(className)}CtorOptions`;
                        const props = extractObjectPattern(p, typedefName);
                        const t = buildTypedef(typedefName, props);
                        return { name: 'options', type: t };
                      }
                      return { name: `param${i}`, type: '*' };
                    });

                    // Mengumpulkan properti dari assignment di dalam constructor
                    methodPath.traverse({
                      AssignmentExpression(assignPath) {
                        try {
                          const left = assignPath.node.left;
                          if (left && left.type === 'MemberExpression' && left.object && left.object.type === 'ThisExpression') {
                            const pname = left.property?.name || left.property?.value || null;
                            if (pname) {
                              properties.push({ name: pname, type: inferType(assignPath.node.right) });
                            }
                          }
                        } catch (err) { /* ignore per-assignment errors */ }
                      }
                    });
                  }
                } catch (err) { /* ignore method processing errors */ }
              }
            });

            // Membuat JSDoc untuk class
            const jsdoc = buildJSDoc({ name: className, params: constructorParams, properties, isClass: true });
            let startPos = (node && (typeof node.start === 'number' ? node.start : (node.range ? node.range[0] : undefined))) || 0;
            if (node.leadingComments && node.leadingComments.length > 0 && typeof node.leadingComments[0].start === 'number') startPos = node.leadingComments[0].start;
            modifications.push({ start: startPos, jsdoc });
          } catch (err) {
            logger?.debug?.(`[autodoc-plugin] Class processing failed: ${err?.message?.slice?.(0,200)}`);
          }
        }
      });

      // Terapkan perubahan dari belakang ke depan agar offset tidak terganggu
      modifications.sort((a, b) => (b.start || 0) - (a.start || 0));
      let content = fileData.content;
      for (const mod of modifications) {
        // ensure jsdoc ends with newline
        const jsdocBlock = (typeof mod.jsdoc === 'string' ? mod.jsdoc : '') + '\n';
        content = insertAt(content, mod.start || 0, jsdocBlock);
      }

      // Menambahkan typedefs di atas (jika ada)
      if (typedefs.size > 0) {
        // deduplicate and join
        const typedefBlock = Array.from(typedefs.values()).map(v => v.jsdoc).join('\n') + '\n';
        // insert at top but after any existing file-level shebang (#!) or 'use strict' pragma
        let insertAtPos = 0;
        if (content.startsWith('#!')) {
          const idx = content.indexOf('\n');
          insertAtPos = idx === -1 ? 0 : idx + 1;
        } else {
          // if file begins with 'use strict' or a leading comment, insert after it to keep shebang / pragmas
          const firstLine = content.split('\n', 1)[0] || '';
          if (/^['"]use strict['"]/.test(firstLine)) {
            // find eol of first line
            const idx = content.indexOf('\n');
            insertAtPos = idx === -1 ? 0 : idx + 1;
          }
        }
        content = insertAt(content, insertAtPos, typedefBlock);
      }

      fileData.content = content;
    } catch (err) {
      logger?.warn?.(`[autodoc-plugin] Failed to process ${fileData.path || '(unknown)'}: ${err?.message?.slice?.(0,200)}`);
    }
  });

  logger && logger.info && logger.info('⚡ Plugin "AutoDoc Ultimate" loaded. Enhanced code intelligence aktif.');

  // If babel traverse was missing, surface a friendly logger message
  if (!_getTraverseFn) {
    logger?.warn?.('[autodoc-plugin] Perhatian: @babel/traverse tidak dieksport sebagai function pada environment ini. Plugin menggunakan fallback traversal (lebih lambat tapi aman). Untuk performa optimal, pastikan @babel/traverse versi kompatibel tersedia.');
  }
}