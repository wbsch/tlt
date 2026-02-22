const fs = require('fs');
const path = require('path');

const itemsDir = './OoTMMR_tracker_pack/items';
const files = fs.readdirSync(itemsDir).filter((f) => f.endsWith('.json'));

const codeToName = {};

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(itemsDir, file), 'utf-8'));
  if (!Array.isArray(data)) continue;

  for (const item of data) {
    const name = item.name;
    if (!name) continue;

    // Check for direct codes
    if (item.codes) {
      const codes = item.codes.split(',').map((c) => c.trim());
      for (const code of codes) {
        if (code && !codeToName[code]) {
          codeToName[code] = name;
        }
      }
    }

    // Check stages for codes
    if (item.stages) {
      for (const stage of item.stages) {
        if (stage.codes) {
          const codes = stage.codes.split(',').map((c) => c.trim());
          for (const code of codes) {
            if (code && !codeToName[code]) {
              codeToName[code] = name;
            }
          }
        }
      }
    }
  }
}

// Output as TypeScript
console.log('// Auto-generated from OoTMMR_tracker_pack/items/*.json');
console.log('export const ITEM_NAMES: Record<string, string> = {');
for (const [code, name] of Object.entries(codeToName).sort()) {
  console.log(`  '${code}': '${name.replace(/'/g, "\\'")}',`);
}
console.log('};');
