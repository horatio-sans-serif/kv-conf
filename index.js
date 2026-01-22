import fs from 'fs/promises';
import path from 'path';

const INDENT = '  ';

function parseValue(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return rawValue;
  }

  const trimmed = rawValue.trim();

  if (trimmed === '""') return '';
  if (trimmed === '') return '';

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^0x[A-Fa-f0-9]+$/.test(trimmed)) return parseInt(trimmed, 16);
  if (/^\d+\.\d+([eE][+-]?\d+)?$/.test(trimmed)) return parseFloat(trimmed);
  if (/^\d+([eE][+-]?\d+)$/.test(trimmed)) return parseFloat(trimmed);

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }

  if (trimmed.includes(',')) {
    try {
      const result = [];
      let current = '';
      let inQuotes = false;
      let escapeNext = false;

      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];

        if (escapeNext) {
          current += char;
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inQuotes = !inQuotes;
          current += char;
          continue;
        }

        if (char === ',' && !inQuotes) {
          const trimmed = current.trim();
          result.push(parseValue(trimmed ? trimmed : current));
          current = '';
          continue;
        }

        current += char;
      }

      if (current.trim()) {
        result.push(parseValue(current.trim()));
      }

      return result;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function parseKey(line, indentLevel) {
  const trimmedLine = line.trimRight();
  const match = trimmedLine.match(/^(\s*)(?<key>[^=]+?)\s*=\s*(?<value>.*)?$/);
  if (!match) return null;

  const keyIndent = match[1].length;
  if (keyIndent % 2 !== 0) {
    throw new Error(`Indentation jump detected at line: ${line}`);
  }

  const keyIndentLevel = keyIndent / 2;
  if (keyIndentLevel > indentLevel + 1) {
    throw new Error(`Indentation jump detected at line: ${line}`);
  }

  const key = match.groups.key.trim();
  let value = match.groups.value;

  if (value !== undefined) {
    value = value.trim();
    if (value.includes('#')) {
      value = value.split('#')[0].trim();
    }
  }

  return {
    key,
    value,
    indentLevel: keyIndentLevel
  };
}

function buildTree(lines) {
  const root = {};
  const stack = [{ obj: root, level: -1 }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parsed = parseKey(line, stack[stack.length - 1].level);
    if (!parsed) continue;

    const { key, value, indentLevel } = parsed;

    while (stack.length > 1 && indentLevel <= stack[stack.length - 1].level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (value === undefined) {
      const nextLine = lines[i + 1];
      const nextParsed = nextLine ? parseKey(nextLine, indentLevel) : null;

      if (nextParsed && nextParsed.indentLevel > indentLevel) {
        const newObj = {};
        parent[key] = newObj;
        stack.push({ obj: newObj, level: indentLevel });
      } else {
        parent[key] = '';
      }
    } else {
      parent[key] = parseValue(value);
    }
  }

  return root;
}

export async function file(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#');
  });

  const config = buildTree(filtered);

  return {
    data: config,

    async get(key, defaultValue) {
      if (key in config) {
        return config[key];
      }

      const keys = key.split('.');
      let current = config;

      for (const k of keys) {
        if (current === null || current === undefined) {
          break;
        }
        if (typeof current !== 'object') {
          throw new Error(`Cannot access key '${k}' on non-object value`);
        }
        current = current[k];
      }

      if (current === undefined) {
        if (defaultValue === undefined) {
          throw new Error(`Key not found: ${key}`);
        }
        return defaultValue;
      }

      return current;
    },

    async set(key, value) {
      const keys = key.split('.');
      let current = config;

      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!(k in current) || typeof current[k] !== 'object') {
          current[k] = {};
        }
        current = current[k];
      }

      current[keys[keys.length - 1]] = value;
    },

    async merge(obj) {
      function mergeDeep(target, source) {
        for (const key in source) {
          if (key in target && typeof target[key] === 'object' && typeof source[key] === 'object' && !Array.isArray(target[key]) && !Array.isArray(source[key])) {
            mergeDeep(target[key], source[key]);
          } else {
            target[key] = source[key];
          }
        }
      }
      mergeDeep(config, obj);
    },

    async delete(...keys) {
      for (const key of keys) {
        const keyParts = key.split('.');
        let current = config;

        for (let i = 0; i < keyParts.length - 1; i++) {
          const k = keyParts[i];
          if (!(k in current)) return;
          current = current[k];
        }

        const lastKey = keyParts[keyParts.length - 1];
        if (lastKey in current) {
          delete current[lastKey];
        }
      }
    },

    async has(key) {
      const keys = key.split('.');
      let current = config;

      for (const k of keys) {
        if (!(k in current)) return false;
        current = current[k];
      }

      return true;
    },

    async each(handler) {
      async function walk(obj, prefix = '') {
        for (const key in obj) {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          const value = obj[key];
          await handler(fullKey, value);

          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            await walk(value, fullKey);
          }
        }
      }
      await walk(config);
    },

    async write() {
      function flatten(obj, prefix = '', result = []) {
        for (const key in obj) {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          const value = obj[key];

          if (value === null) {
            result.push({ key: fullKey, value: '' });
          } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            result.push({ key: fullKey, value: null });
            flatten(value, fullKey, result);
          } else if (Array.isArray(value)) {
            const csv = value.map(v => {
              if (typeof v === 'string') {
                if (v.includes(',') || v.includes('"')) {
                  return `"${v.replace(/"/g, '""')}"`;
                }
                return v;
              }
              return String(v);
            }).join(',');
            result.push({ key: fullKey, value: csv });
          } else {
            result.push({ key: fullKey, value: String(value) });
          }
        }
        return result;
      }

      const flat = flatten(config);

      const lines = [];
      let currentIndent = 0;

      for (const { key, value } of flat) {
        const keyParts = key.split('.');
        const indentLevel = keyParts.length - 1;
        const indent = INDENT.repeat(indentLevel);
        const lastKey = keyParts[keyParts.length - 1];

        if (value === null) {
          lines.push(`${indent}${lastKey} =`);
        } else {
          lines.push(`${indent}${lastKey} = ${value}`);
        }
      }

      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
    }
  };
}

export default { file };
