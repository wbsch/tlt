const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../packs/ootmm/src/data/items.ts');
let content = fs.readFileSync(filePath, 'utf8');

const updates = {
  OOT_SMALL_KEY_FOREST: 5,
  OOT_SMALL_KEY_FIRE: 8,
  OOT_SMALL_KEY_WATER: 6,
  OOT_SMALL_KEY_SPIRIT: 5,
  OOT_SMALL_KEY_SHADOW: 5,
  OOT_SMALL_KEY_BOTW: 3,
  OOT_SMALL_KEY_GTG: 9,
  OOT_SMALL_KEY_GANON: 2,
  OOT_SMALL_KEY_GF: 4,
  MM_SMALL_KEY_WF: 1,
  MM_SMALL_KEY_SH: 3,
  MM_SMALL_KEY_GB: 1,
  MM_SMALL_KEY_ST: 4,
  // Add Bombchus and other consumables if needed
  OOT_BOMBCHU_5: 10, // Just a guess, assuming pack logic handles amounts
  OOT_BOMBCHU_10: 10,
  OOT_BOMBCHU_20: 10,
  OOT_BOMBS_5: 10,
  MM_BOMBCHU: 10,
  MM_BOMBCHU_10: 10,
  MM_BOMBCHU_5: 10,
  MM_BOMBS_10: 10,
  // Gs Tokens
  OOT_GS_TOKEN: 100,
  MM_GS_TOKEN_SWAMP: 30,
  MM_GS_TOKEN_OCEAN: 30,
  // Triforce?
};

for (const [id, count] of Object.entries(updates)) {
  const regex = new RegExp(`({ id: '${id}', [^}]+)( })`);
  if (regex.test(content)) {
    content = content.replace(regex, `$1, maxCount: ${count}$2`);
  }
}

fs.writeFileSync(filePath, content);
console.log('Updated items.ts');
