
import json

def get_category(item_id):
    if 'KEY' in item_id: return 'key'
    if 'SONG' in item_id: return 'song'
    if 'MASK' in item_id: return 'mask'
    if 'SWORD' in item_id or 'SHIELD' in item_id or 'TUNIC' in item_id or 'BOOTS' in item_id: return 'equipment'
    if 'BOW' in item_id or 'HOOKSHOT' in item_id or 'HAMMER' in item_id or 'OCARINA' in item_id or 'LENS' in item_id: return 'equipment'
    if 'SCALE' in item_id or 'STRENGTH' in item_id or 'WALLET' in item_id or 'MAGIC' in item_id: return 'equipment'
    if 'MEDALLION' in item_id or 'STONE' in item_id or 'REMAINS' in item_id: return 'quest'
    if 'TRAP' in item_id: return 'trap'
    if 'MAP' in item_id or 'COMPASS' in item_id: return 'dungeon'
    if 'STRAY_FAIRY' in item_id: return 'dungeon'
    if 'GS_TOKEN' in item_id: return 'token'
    if 'SOUL' in item_id: return 'soul'
    if 'RUPEE' in item_id: return 'consumable' # or currency
    return 'misc'

def get_name(item_id):
    return item_id.replace('OOT_', '').replace('MM_', '').replace('SHARED_', '').replace('_', ' ').title()

def get_game(item_id):
    if item_id.startswith('MM_'): return 'mm'
    if item_id.startswith('OOT_'): return 'oot'
    return 'shared'

existing_ids = set()
manual_defs = []

import re

with open('packs/ootmm/src/data/items.ts', 'r') as f:
    content = f.read()
    # extracting objects is hard with regex, assuming lines
    # valid lines look like: { id: '...', ... },
    for line in content.split('\n'):
        match = re.search(r"id:\s*'([^']+)'", line)
        if match:
            existing_ids.add(match.group(1))
            manual_defs.append(line.rstrip(',')) 

print("import type { OoTMMItem } from '../types'")
print("")
print("export const ITEM_DATABASE: OoTMMItem[] = [")
# Print manual definitions first
for line in manual_defs:
    print(line + ",")

with open('all_items.txt', 'r') as f:
    items = [line.strip() for line in f if line.strip()]

for item_id in items:
    if item_id in existing_ids:
        continue
        
    cat = get_category(item_id)
    if cat in ['soul', 'trap']: # Skip souls and traps to keep UI clean enough
        continue
    if 'KEY_RING' in item_id: # Skip key rings if individual keys are present? Or maybe include them.
        pass 
        # Actually logic might use key rings. Keeping them is safer.
        
    game = get_game(item_id)
    name = get_name(item_id)
    
    # Manual icon mapping (simplified)
    icon = '❓'
    if cat == 'key': icon = '🔑'
    if 'BOSS_KEY' in item_id: icon = '🗝️'
    if cat == 'song': icon = '🎵'
    if cat == 'mask': icon = '🎭'
    if 'SWORD' in item_id: icon = '⚔️'
    if 'SHIELD' in item_id: icon = '🛡️'
    if 'BOW' in item_id: icon = '🏹'
    if 'BOMB' in item_id: icon = '💣'
    if 'POTION' in item_id: icon = '🧪'
    if 'BOTTLE' in item_id: icon = '🍾'
    if 'MAP' in item_id: icon = 'Map'
    if 'COMPASS' in item_id: icon = 'Comp'
    if 'GS_TOKEN' in item_id: icon = '💀'
    if 'HEART' in item_id: icon = '❤️'
    if 'MEDALLION' in item_id: icon = '🏅'
    if 'STONE' in item_id: icon = '💎'
    if 'REMAINS' in item_id: icon = '👹'
    
    item_def = {
        'id': item_id,
        'name': name,
        'category': cat,
        'game': game,
        'icon': icon
    }
    
    print(f"  {{ id: '{item_def['id']}', name: \"{item_def['name']}\", category: '{item_def['category']}', game: '{item_def['game']}', icon: '{item_def['icon']}' }},")
print("]")
