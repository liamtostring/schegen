/**
 * Schema Diff Service
 * Compares old and new JSON-LD schemas to produce field-level diffs.
 */

/**
 * Attempt to parse PHP serialized values, falling back to raw string
 */
function tryParsePhpSerialized(value) {
  if (typeof value !== 'string') return value;

  // Basic PHP serialized detection
  if (/^[aOsidbN]:/.test(value)) {
    try {
      return phpUnserializeBasic(value);
    } catch (e) {
      return value;
    }
  }

  // Try JSON parse
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
}

/**
 * Basic PHP unserialization for common types
 */
function phpUnserializeBasic(str) {
  let pos = 0;

  function read() {
    const type = str[pos];
    pos++; // skip type char
    pos++; // skip ':'

    if (type === 'N') {
      pos++; // skip ';'
      return null;
    }
    if (type === 'b') {
      const val = str[pos] === '1';
      pos += 2; // skip value and ';'
      return val;
    }
    if (type === 'i') {
      const end = str.indexOf(';', pos);
      const val = parseInt(str.substring(pos, end));
      pos = end + 1;
      return val;
    }
    if (type === 'd') {
      const end = str.indexOf(';', pos);
      const val = parseFloat(str.substring(pos, end));
      pos = end + 1;
      return val;
    }
    if (type === 's') {
      const lenEnd = str.indexOf(':', pos);
      const len = parseInt(str.substring(pos, lenEnd));
      pos = lenEnd + 2; // skip ':'  and '"'
      const val = str.substring(pos, pos + len);
      pos += len + 2; // skip value and '";'
      return val;
    }
    if (type === 'a') {
      const lenEnd = str.indexOf(':', pos);
      const count = parseInt(str.substring(pos, lenEnd));
      pos = lenEnd + 2; // skip ':{'
      const obj = {};
      for (let i = 0; i < count; i++) {
        const key = read();
        const value = read();
        obj[key] = value;
      }
      pos++; // skip '}'
      return obj;
    }

    // Fallback: return rest as string
    return str.substring(pos);
  }

  return read();
}

/**
 * Recursively diff two objects, returning added/removed/changed fields
 * @param {*} oldObj - The old value
 * @param {*} newObj - The new value
 * @param {string} path - Current path for reporting
 * @returns {object} - { added: [], removed: [], changed: [] }
 */
function diffObjects(oldObj, newObj, path = '') {
  const result = { added: [], removed: [], changed: [] };

  if (oldObj === newObj) return result;
  if (oldObj === null || oldObj === undefined) {
    result.added.push({ path: path || '(root)', value: newObj });
    return result;
  }
  if (newObj === null || newObj === undefined) {
    result.removed.push({ path: path || '(root)', value: oldObj });
    return result;
  }

  // Different types
  if (typeof oldObj !== typeof newObj) {
    result.changed.push({ path: path || '(root)', oldValue: oldObj, newValue: newObj });
    return result;
  }

  // Primitive comparison
  if (typeof oldObj !== 'object') {
    if (oldObj !== newObj) {
      result.changed.push({ path: path || '(root)', oldValue: oldObj, newValue: newObj });
    }
    return result;
  }

  // Array comparison
  if (Array.isArray(oldObj) && Array.isArray(newObj)) {
    const maxLen = Math.max(oldObj.length, newObj.length);
    for (let i = 0; i < maxLen; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      if (i >= oldObj.length) {
        result.added.push({ path: itemPath, value: newObj[i] });
      } else if (i >= newObj.length) {
        result.removed.push({ path: itemPath, value: oldObj[i] });
      } else {
        const sub = diffObjects(oldObj[i], newObj[i], itemPath);
        result.added.push(...sub.added);
        result.removed.push(...sub.removed);
        result.changed.push(...sub.changed);
      }
    }
    return result;
  }

  // Object comparison
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of allKeys) {
    const fieldPath = path ? `${path}.${key}` : key;
    if (!(key in oldObj)) {
      result.added.push({ path: fieldPath, value: newObj[key] });
    } else if (!(key in newObj)) {
      result.removed.push({ path: fieldPath, value: oldObj[key] });
    } else {
      const sub = diffObjects(oldObj[key], newObj[key], fieldPath);
      result.added.push(...sub.added);
      result.removed.push(...sub.removed);
      result.changed.push(...sub.changed);
    }
  }

  return result;
}

/**
 * Compare two sets of schemas, matching by @type
 * @param {Array} oldSchemas - Array of existing schema objects
 * @param {Array} newSchemas - Array of new schema objects
 * @returns {object} - { summary, diffs[] }
 */
function compareSchemas(oldSchemas, newSchemas) {
  const oldByType = {};
  const newByType = {};

  // Index by type
  for (const s of oldSchemas) {
    const type = s['@type'] || 'Unknown';
    const key = Array.isArray(type) ? type.join(',') : type;
    oldByType[key] = s;
  }
  for (const s of newSchemas) {
    const type = s['@type'] || 'Unknown';
    const key = Array.isArray(type) ? type.join(',') : type;
    newByType[key] = s;
  }

  const allTypes = new Set([...Object.keys(oldByType), ...Object.keys(newByType)]);
  const diffs = [];
  let totalAdded = 0, totalRemoved = 0, totalChanged = 0;

  for (const type of allTypes) {
    if (!(type in oldByType)) {
      diffs.push({ type, status: 'new', diff: null });
      totalAdded++;
    } else if (!(type in newByType)) {
      diffs.push({ type, status: 'removed', diff: null });
      totalRemoved++;
    } else {
      const diff = diffObjects(oldByType[type], newByType[type]);
      const hasChanges = diff.added.length + diff.removed.length + diff.changed.length > 0;
      diffs.push({
        type,
        status: hasChanges ? 'modified' : 'unchanged',
        diff: hasChanges ? diff : null
      });
      if (hasChanges) totalChanged++;
    }
  }

  return {
    summary: {
      totalTypes: allTypes.size,
      newSchemas: totalAdded,
      removedSchemas: totalRemoved,
      modifiedSchemas: totalChanged,
      unchangedSchemas: allTypes.size - totalAdded - totalRemoved - totalChanged
    },
    diffs
  };
}

module.exports = {
  diffObjects,
  compareSchemas,
  tryParsePhpSerialized
};
