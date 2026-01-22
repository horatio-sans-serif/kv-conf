# kv-conf

A simple key-value configuration file format with nesting, type conversion, and async API.

## Format

UTF-8, line-oriented, `#` for comments, `key = value` pairs.

### Syntax

```kv
# Comments start with #

engine = pocket_tts
voice = azelma

# Nested objects use 2-space indentation with no value after =
output =
  path = ~/.local/share/speeker
  format = mp3

# Empty strings (explicit empty value after =)
empty_string = ""
another_empty = ""

# Lists are CSV with proper CSV quoting
likes = football,large language models,"ice cream, cones"

# Types are auto-detected:
count = 42
enabled = true
pi = 3.14
hex = 0xFF
```

### Value Rules

| Syntax | Meaning | Result |
|--------|---------|--------|
| `key = value` | Normal value | `key: "value"` |
| `key =` | Empty string | `key: ""` |
| `key = ""` | Explicit empty string | `key: ""` |
| `key =` followed by indented lines | Nested object | `key: { nested: ... }` |

### Type Conversion

| Pattern | Type | Examples |
|---------|------|----------|
| `^\d+$` | Integer | `42`, `100` |
| `^0x[A-Fa-f0-9]+$` | Hex | `0xFF`, `0x10` |
| `^\d+\.\d+` | Float | `3.14`, `0.5` |
| `^\d+[eE][+-]?\d+$` | Scientific | `1.5e10`, `2e-3` |
| `^true\|false$` | Boolean | `true`, `false` |
| Contains `,` | CSV List | `a,b,c` |
| Otherwise | String | `hello world` |

## API

```js
import { file } from 'kv-conf';

const config = await file('path/to/config.kv');

// Get a value (throws if not found)
const engine = await config.get('engine');

// Get with default
const voice = await config.get('voice', 'default');

// Set a value
await config.set('engine', 'kokoro');

// Set nested value
await config.set('output.path', '/new/path');

// Merge object
await config.merge({
  newKey: 'value',
  output: { format: 'wav' }
});

// Check if key exists
if (await config.has('engine')) {
  // ...
}

// Delete keys
await config.delete('oldKey', 'nested.unused');

// Iterate all keys
await config.each(async (key, value) => {
  console.log(`${key} = ${value}`);
});

// Write changes to file
await config.write();
```

## Installation

```bash
cd ~/projects/kv-conf.js
npm install
```

## Testing

```bash
npm test
```

## License

MIT
