# Plan: Remove implicit edge normalization — treat both directions independently

## TL;DR

Der aktuelle Code normalisiert Exit-Keys implizit zu ihren Entrance-Source-Pendants (`normalizeTrackedEntranceKey`) und leitet die Gegenrichtung nur abgeleitet her (`computeExitOverrides`). Das führt dazu, dass bei `display: "exits"` auf der Karte die Exit-Zeile nur Exit-Ziele anbietet und ein ausgewähltes Entrance-Ziel wieder in ein Exit umgewandelt wird.

**Lösung:** Beide Richtungen einer Kante explizit in `entranceOverrides` speichern und beim Setzen einer Richtung automatisch die Gegenrichtung mitsetzen (idempotent). Jede Kante wird über ihren echten Key (`OOT_FIELD_FROM_LOST_WOODS_BRIDGE` oder `OOT_LOST_WOODS_BRIDGE_FROM_FIELD`) direkt angesprochen — keine Normalisierung nach innen mehr im tracker-internen Code. `normalizeTrackedEntranceKey` wird aus allen internen Aufrufen entfernt und durch `getEdgeReverse()`-basierte Auflösung ersetzt. Die einzige verbleibende Normalisierung (Exit→Entrance) findet in `filterEntranceOverridesForSettings` für den OoTMM-Plando-Export statt.

---

## Phase 1: Neue Kernfunktionen in `entranceRandomization.ts`

### 1.1 Hilfsfunktion `getEdgeReverse(key): string | null`

- Allgemeinerer Name als `getExitKeyForEntrance` — gibt den Partner (reverse) eines Keys zurück, wenn vorhanden.
- Ersetzt Aufrufe von `getExitKeyForEntrance` (gleiche Semantik: `ENTRANCES_RAW[key]?.reverse?.trim() || null`).
- `getGameLinkPartner` bleibt für die game-link-spezifischen Prüfungen erhalten (siehe Phase 3.6).

### 1.2 Neue Funktion `computeCoupledReverse(src, dst): { reverseSrc, reverseDst } | null`

- Berechnet aus `src → dst` die Gegenrichtung:
  `reverseSrc = reverse(dst)`, `reverseDst = reverse(src)`
- Beispiel: `OOT_FIELD_FROM_LOST_WOODS_BRIDGE → OOT_TEMPLE_WATER`
  → `{ reverseSrc: OOT_LAKE_HYLIA_FROM_TEMPLE_WATER, reverseDst: OOT_LOST_WOODS_BRIDGE_FROM_FIELD }`

### 1.3 `normalizeTrackedEntranceKey()` komplett entfernen

- Entfernen aus allen tracker-internen Aufrufen:
  - `ENTRANCE_SUBMENU_ENTRIES_BY_ID`: `entranceIds` aus JSON sind bereits echte Keys.
  - `resolveMappedDestinationEntranceId()`: kein normalisieren, direkt Lookup.
  - `getTrackedEntranceKeysForBinding()`: obsolet — entfällt komplett.
  - `filterEntranceOverridesForSettings()`: umgebaut auf `getEdgeReverse`-basierte Auflösung (siehe Phase 7.3).
  - `computeEffectiveTrackedEntranceOverrides()`: kein normalisieren.
  - `OoTMMTracker.vue`: `normalizeTrackedEntranceKey`-Aufrufe entfernen.
- Nach dem Umbau existiert `normalizeTrackedEntranceKey()` nirgendwo mehr als Aufrufer — die Funktion kann komplett gelöscht werden.

---

## Phase 2: Session Store (`ootmmSession.ts`)

### 2.1 `setEntranceOverride(src, dst)` erweitern

- Beim Setzen: zusätzlich `computeCoupledReverse(src, dst)` berechnen und auch den Partner-Override setzen.
- Beim Löschen (dst=null): auch den Partner-Override löschen.
- **Rekursion vermeiden durch Idempotenz**: Vor dem Setzen des Partner-Overrides prüfen, ob der Partner-Key bereits den korrekten Wert hat. Falls ja → nichts tun. Dadurch ist die Kopplung immer aktiv und benötigt keinen `coupled`-Flag.
- **Kein `coupled`-Flag**: Die Idempotenz-Prüfung macht ein separates Flag überflüssig. Auch Sync-Operationen laufen durch die Kopplung — doppelte Einträge im Sync sind harmlos (der Empfänger setzt sie via `setEntranceOverrides`).

### 2.2 `setEntranceOverrides(overrides)` erweitern

- Beim Setzen eines ganzen Override-Blocks (z.B. aus Sync oder Share-Import) werden fehlende Gegenrichtungen **in-place ergänzt**, bevor das Objekt an `entranceOverrides.value` zugewiesen wird.
- Nur Keys hinzufügen, die noch nicht im Block vorhanden sind (kein Überschreiben existierender Werte).
- Dadurch wird `scheduleReinitializeForEntrances` nur einmal getriggert.

### 2.3 `injectEntranceOverridesIntoSettings()` anpassen (Plando-Boundary)

- **Bisher**: Ruft `filterEntranceOverridesForSettings()` auf, die `normalizeTrackedEntranceKey` + `resolveToActiveEntranceKey` nutzt, um Exit-Keys in Entrance-Keys umzuwandeln.
- **Neu**: `filterEntranceOverridesForSettings()` bleibt als **einzige Stelle**, die für den OoTMM-Plando-Export normalisiert. Die Funktion wird aber umgebaut (siehe Phase 7.3):
  - Exit-Keys als Sources werden akzeptiert und via `getEdgeReverse()` in Entrance-Keys aufgelöst.
  - Kein `normalizeTrackedEntranceKey` mehr — stattdessen direkte `getEdgeReverse`-Auflösung.
- `injectEntranceOverridesIntoSettings()` selbst ändert sich nicht — es ruft weiterhin `filterEntranceOverridesForSettings()` auf und schreibt das Ergebnis in `plando.entrances`.
- **Begründung**: Der OoTMM-Core erwartet Entrance-Source-Keys als Plando-Sources, nicht Exit-Keys. Die Normalisierung an dieser Boundary stellt sicher, dass der Core korrekt arbeitet. Intern verwendet der gesamte restliche Code die rohen `entranceOverrides` ohne Normalisierung.
- `normalizeTrackedEntranceKey` ist damit aus ALLEM tracker-internen Code entfernt — es existiert nur noch in `filterEntranceOverridesForSettings` (umbenannt/ersetzt durch `getEdgeReverse`-basierten Lookup).

### 2.4 History/Snapshots

- `captureSessionSnapshot()` speichert bereits `entranceOverrides` mit allen Keys → keine Änderung nötig.
- `snapshotsEqual()` → keine Änderung nötig.

---

## Konzeptionelle Klarstellung: Zwei separate Konzepte

Im Plan wird an mehreren Stellen zwischen zwei unabhängigen Konzepten unterschieden:

**1. UI-„Exit“-Kennzeichnung (Sidebar & Map-Submenu)**

- Bestimmt, ob ein bestimmter Key in der Sidebar unter „Exits“ oder als „Exit“-Row im Map-Submenu angezeigt wird.
- **Kriterium**: `getTrackedEntrancePolarity(key, settings) === 'out'`.
- Keys mit polarity `'out'` (z. B. `'dungeon-exit'`, `'grotto-exit'`, `'region-exit'`, `'indoors-exit'`) werden als Exit-Zeilen dargestellt.
- Keys mit polarity `'in'` (z. B. `'dungeon'`, `'grotto'`, `'indoors'`) oder `'any'` (z. B. `'overworld'`) werden als normale Entrance-Zeilen dargestellt.
- Game-Link-Keys (polarity `'any'`) werden je nach Games-Mode behandelt.
- Diese Kennzeichnung hat **nichts mit der `reverse`-Relation in den Rohdaten zu tun** — sie folgt allein der logischen Richtung des Keys.

**2. Map-Marker-Attribut `display: "exits"`**

- Steuert, welche **Row im Map-Submenu** für einen bestimmten Marker angezeigt wird.
- `display: "exits"` bedeutet: Zeige statt der Entrance-Row des marker-eigenen Keys die Row seines Partners via `getEdgeReverse(key)`.
- Dieses Attribut ist **unabhängig von der Polarity des Keys** — ein Overworld-Key mit polarity `'any'` kann trotzdem `display: "exits"` haben, wenn die Karte die Gegenrichtung zeigen soll.

---

## Phase 3: Entrance-UI-Logik (`useDungeonEntrances.ts`)

### 3.1 `setSelectedDestination(srcKey, dstKey)` umbauen

- Bisher: normalisiert dstKey, speichert nur `nextOverrides[srcKey] = normalizedDst` (eine Richtung).
- Neu: Ruft einfach `sessionStore.setEntranceOverride(srcKey, dstKey)` — die Kopplung (Phase 2.1) passiert im Store, nicht im Composable.
- Komplexe Normalisierungs/Alias-Logik (`getGameLinkPartner`-Herumraterei) und das manuelle Bauen von `nextOverrides`-Objekten entfallen.

### 3.2 `setExitDestination(exitKey, exitDstKey)` umbauen

- Bisher: ruft `deriveEntranceFromExitMapping` auf und speichert die abgeleitete Entrance-Mapping.
- Neu: Speichert direkt den Exit-Key als Source via `sessionStore.setEntranceOverride(exitKey, exitDstKey)`.
- Die Kopplung (Phase 2.1) im Store setzt automatisch die Gegenrichtung.
- **Das ist der Kern der Änderung**: Exit-Destinationen werden wie ganz normale Einträge gespeichert, nicht mehr abgeleitet.

### 3.3 Exit-bezogene Computed Properties umbauen

**`exitOverridesMap`**:

- Bisher: `computeExitOverrides(normalizedEntranceOverrides)` — abgeleitet.
- Neu: entfernen, überall `entranceOverrides.value` direkt verwenden.

**`getDisplayExitDestination(exitKey)`**:

- Bisher: `exitOverridesMap.value[exitKey] ?? displayEntranceOverrides.value[exitKey] ?? ''`.
- Neu: `entranceOverrides.value[exitKey] ?? ''`.

**`destinationOptionsForExit(exit)`**:

- Bisher: filtert aus `exitDestinationOptions` (nur Exit-Keys).
- Neu: filtert aus `destinationOptions` (alle Keys).
- Filtert nur nach **Pool** und **Game**.
- **Kein Polarity-Filter**: Exit-Source-Keys haben polarity `'out'`, Entrance-Destination-Keys haben `'in'` — `doTrackedEntrancePolaritiesMatch` würde immer `false` liefern und alle Optionen blockieren.
- Stattdessen: Destination muss ein Key sein, dessen Reverse (`getEdgeReverse`) ein aktiver Entrance-Source-Key ist (d.h. die resultierende Entrance-Mapping ist via Kopplung gültig).
- **Fallback**: Wenn `getEdgeReverse(destinationKey)` `null` zurückgibt (z.B. One-Way-Warps ohne Reverse), ist die Destination für diese Exit-Quelle nicht gültig und wird herausgefiltert.

**`activeExitEntries`**:

- Bisher: für jeden Entrance den Exit-Key via `getExitKeyForEntrance` berechnen.
- Neu: Für jeden Entrance in `activeEntrances` den Reverse-Key via `getEdgeReverse(entrance.key)` berechnen. Wenn vorhanden, als Exit-Entry führen. Wenn `null` (z.B. One-Way-Warps ohne Reverse), kein Exit-Entry.
- **Wichtig**: `activeEntrances` enthält nur Source-Type-Keys (polarity `'in'` oder `'any'`) — der Polarity-Ansatz würde eine leere Exit-Liste produzieren. Die Exit-Entries werden daher weiterhin aus den Reverse-Partnern abgeleitet, aber jetzt via `getEdgeReverse()`.
- Game-Link-Keys (polarity `'any'`) werden je nach Games-Mode entweder als Entrance- oder Exit-Zeile behandelt (wie bisher: in ootmm mode werden Game-Link-Exit-Keys selbst als Entrance-Zeilen geführt, daher kein Exit-Entry für sie).
- **`sourceEntranceKey`-Feld**: Entfällt aus `ExitEntry`. Die Sidebar (`OoTMMEntrances.vue`) nutzte es als `title`-Attribut für Tooltips (Zeile 238). Ersatz: `title` mit dem eigenen Key befüllen, oder das Attribut entfernen. Da der Key jetzt direkt in `entranceOverrides` gespeichert ist, ist ein Verweis auf den Entrance-Source-Key nicht mehr nötig.

### 3.4 `destinationOptions` (Basis-Destinationen-Pool) erweitern

- Bisher: baut für jeden Entrance-Source-Key die möglichen Destinationen (inkl. manuell hinzugefügter Exit-Aliases).
- Neu: `destinationOptions` enthält **alle Keys** (Entrance UND Exit) als potentielle Zielwerte — einheitliche Basis-Liste statt Entrance-Keys + Exit-Alias-Erweiterung.
- **Die Filterung nach Pool und Game** erfolgt pro Source-Key in `destinationOptionsForEntrance()` / `destinationOptionsForExit()`.
- Für Entrance-Quellen: zusätzlich Polarity-Filter (`doTrackedEntrancePolaritiesMatch`) wie bisher.
- Für Exit-Quellen: **kein Polarity-Filter** (siehe 3.3), stattdessen Prüfung ob `getEdgeReverse(destinationKey)` ein aktiver Entrance-Source-Key ist.
- Keine "Exit-Alias"-Logik mehr nötig, weil Exit-Keys jetzt direkt in `destinationOptions` enthalten sind.

### 3.5 `isDestinationUsed` anpassen

- Bisher: vergleicht mit `rawActiveEntranceOverrides` (normalisiert).
- Neu: vergleicht mit `entranceOverrides` direkt. Beide Richtungen einer Kante gelten als "used".

### 3.6 Game-Link-Key-Handling (detailliert)

Die Spezialbehandlung für `INTERIOR_GAME_LINK_*` muss erhalten bleiben, aber wird vereinfacht:

**Game-Link-Keys im `destinationOptions`-Pool**:

- In `ootmm`-Mode: `OOT_SHOP_MASKS` und `MM_CLOCK_TOWER_FROM_CLOCK_TOWN` (exit keys) sind aktiv. Sie erscheinen als normale Entrance-Rows (polarity `'any'` → `'any'` matcht immer). Ihre Destination-Optionen enthalten Entrance-Source-Keys.
- In `oot`-Mode: `OOT_MARKET_FROM_MASK_SHOP` (source key) ist aktiv. Seine Destination-Optionen enthalten entrance-source keys. Sein Partner `OOT_SHOP_MASKS` ist via `getEdgeReverse` erreichbar.
- In `mm`-Mode: `MM_CLOCK_TOWN_FROM_CLOCK_TOWER` (source key) ist aktiv. Analog.

**`destinationOptionsForEntrance` für Game-Link-Quellen**:

- Game-Link-Keys haben polarity `'any'`. `doTrackedEntrancePolaritiesMatch(src, dst)` gibt für `'any'` immer `true` zurück — kein Problem.
- Der Pool- und Game-Filter funktioniert wie für alle anderen Quellen.
- Keine Sonderbehandlung mehr nötig: Die alte Logik, die `getGameLinkPartner` nutzte um den "primary value" für Destination-Optionen zu bestimmen, entfällt. Alle Keys sind jetzt gleichberechtigt in `destinationOptions`.

**`destinationOptionsForExit` für Game-Link-Quellen**:

- Exit-Quellen (wenn sie als Exit-Rows erscheinen) filtern nach Pool und Game.
- Zusätzlich: `getEdgeReverse(destinationKey)` muss ein aktiver Entrance-Source-Key sein (wie bei allen Exit-Quellen, siehe 3.3). Game-Link-Keys haben gültige `reverse`-Einträge.

**Vanilla Game-Link Exit Mappings im Tracker**:

- `tracker.ts` fügt Vanilla-Exit-Mappings (`GAME_LINK_VANILLA_EXIT_MAPPING`) in `finalPlandoEntrances` ein. Diese verwenden bereits Exit-Keys als Sources (z.B. `OOT_SHOP_MASKS`).
- Keine Änderung nötig — `computeEffectiveTrackedEntranceOverrides` validiert diese Einträge weiterhin (Phase 7.2).

**`getGameLinkPartner`**: Bleibt für die vanillamapping-Logik in `tracker.ts` und für `isDestinationUsed` erhalten, wird aber nicht mehr für UI-Alias-Logik gebraucht.

### 3.7 `computeDisplayEntranceOverrides` — entfernen

- **Aktuell**: Alias für `computeEffectiveTrackedEntranceOverrides`. Wird verwendet in:
  - `useDungeonEntrances.ts`: `displayEntranceOverrides` (für `getSelectedDestination`, `isEntranceMapped`)
  - `OoTMMTracker.vue`: `mapSelectorVisibleEntranceCountByMap`
- **Entscheidung**: Entfernen. Nach dem Umbau wird überall direkt `entranceOverrides.value` verwendet.
  - `displayEntranceOverrides` → ersetzt durch `entranceOverrides`
  - `isEntranceMapped` → prüft direkt `entranceOverrides.value[key]`
  - `mapSelectorVisibleEntranceCountByMap` → nutzt direkt `entranceOverrides.value`
- Kein Wrapper nötig, da die Validierung (gültige Keys, Spawn-Validierung) bereits beim Setzen in `setEntranceOverride` passiert (Kopplung garantiert valide Reverse-Paare).

---

## Phase 4: Map Component (`OoTMMMap.vue`)

### 4.1 `display: "exits"` → Partner-Key-Lookup

- Für einen Marker mit `entranceIds: [key]` und `display: "exits"`:
  - Finde `partner = getEdgeReverse(key)`
  - Zeige eine **normale Entrance-Row** (mit Entrance-Zielen als Destination-Optionen) für `partner` an.
  - Bisher wurde stattdessen eine "Exit-Row" (nur Exit-Ziele) für `getExitKeyForEntrance(key)` angezeigt — der Key ist derselbe (`partner`), aber der Row-Typ ändert sich.
- **Wichtig**: `display: "exits"` ist unabhängig von der Polarity-basierten Exit-Kennzeichnung (Phase 3.3). Ein Marker mit `display: "exits"` auf einem Key mit polarity `'in'` zeigt die Row des Partners (der polarity `'out'` haben kann), aber die _Kennzeichnung_ der Row als „Exit" erfolgt separat über die Polarity des angezeigten Keys.
- **One-Way-Warps ohne Reverse**: Wenn `getEdgeReverse(key)` `null` zurückgibt (z.B. One-Way-Song-Warps, die keinen Reverse-Eintrag in `ENTRANCES_RAW` haben), kann keine Partner-Row angezeigt werden. In diesem Fall wird der Marker ohne Entrance/Exit-Row gerendert (nur Submenu-Checks). Dieses Verhalten ist korrekt: One-Way-Warps haben keine Gegenrichtung, die auf einer anderen Karte dargestellt werden müsste.

### 4.2 `resolveMappedDestinationEntranceId()` anpassen

- Wenn der Key nicht in `activeEntranceById` ist (weil es ein Exit-Type-Key ist), nicht nach `activeEntranceById` suchen, sondern direkt in `entranceOverrides` nachschlagen.

### 4.3 Submenu-Panel-Rendering (Template)

- Exit-Entries im Submenu-Panel zeigen jetzt die Zuweisung des Partner-Keys.
- Template-Änderungen:
  - `getExitDestinationOptions` → durch `getEntranceDestinationOptions` für den Partner-Key ersetzen.
  - `getExitDestinationValue` → durch `getEntranceDestinationValue(partnerKey)` ersetzen.
  - Die `destination-combobox`-Instanz bleibt, aber die Props ändern sich.

### 4.4 `ENTRANCE_SUBMENU_ENTRIES_BY_ID` & `ENTRANCE_CHECK_CODES_BY_ID`

- `normalizeTrackedEntranceKey(id.trim())` entfernen. Die `entranceIds` in den JSONs sind bereits die echten Keys — direkt verwenden.
- `getTrackedEntranceKeysForBinding()` entfällt (siehe Phase 7.1). Die Binding-Logik, die Exit-Keys zusätzlich zu Entrance-Keys in die Map aufnahm, ist nicht mehr nötig: Exit-Keys werden nicht mehr als separate Bindings gebraucht, da `display: "exits"`-Marker jetzt über den Partner-Key (via `getEdgeReverse`) die Entrance-Row anzeigen.
- **Verifikation**: Sicherstellen, dass alle JSON `entranceIds` Entrance-Source-Keys sind (keine Exit-Keys). Die Map-JSONs unter `packs/ootmm/src/data/maps/` sollten bereits nur Source-Keys enthalten — dies wurde beim letzten Audit bestätigt.

### 4.5 UX-Änderung: `display: "exits"` Marker zeigen jetzt Entrance-Rows

**Was sich ändert**:

- Die Combobox zeigt **Entrance-Destination-Optionen** (z.B. "Temple Water from Field") statt Exit-Destination-Optionen (z.B. "Field from Lost Woods Bridge").
- Die Row-Label verwendet `entranceDisplayLabel` (z.B. "Field to Lost Woods Bridge") statt `getExitLabel` (z.B. "Lost Woods Bridge to Field").
- Die "Exits"-Header im Submenu-Panel wird für diese Rows unzutreffend — die Rows erscheinen jetzt im Entrance-Bereich des Panels, nicht im Exit-Bereich.

**Begründung**: Dies ist der Kern des Fixes. Vorher wurden Entrance-Ziele in Exit-Rows fälschlich zurücknormalisiert. Jetzt sind es echte Entrance-Rows, die Entrance-Ziele akzeptieren und speichern.

---

## Phase 5: Entrance Sidebar (`OoTMMEntrances.vue`)

### 5.1 Exit-Rows-Darstellung

- Exit-Rows werden behalten.
- **Kriterium für Exit-Rows**: `getTrackedEntrancePolarity(key, settings) === 'out'` — Keys mit polarity `'out'` erscheinen unter „Exits“. Keys mit polarity `'in'` oder `'any'` erscheinen als normale Entrance-Rows.
- Die Zuweisung wird direkt aus `entranceOverrides[key]` gelesen (nicht mehr abgeleitet).
- `sourceEntranceKey` entfällt, da jeder Key selbst in `entranceOverrides` gespeichert ist.

### 5.2 `filteredExitEntries`

- Vereinfachen: nicht mehr `exitOverridesMap` nutzen, sondern `entranceOverrides` direkt.

---

## Phase 6: OoTMMTracker.vue (`mapSelectorVisibleEntranceCountByMap`, etc.)

### 6.1 `computeExitOverrides()`-Aufrufe ersetzen

- `mapSelectorVisibleEntranceCountByMap` nutzt `computeExitOverrides`. Ersetzen durch Lookup in `entranceOverrides` direkt.

### 6.2 `addEntranceBoundCodes()` anpassen

- `normalizeTrackedEntranceKey(srcId.trim())` und `resolveToActiveEntranceKey` entfernen — direkt den Key aus `entranceIds` verwenden.
- **Defensiver Fallback für Destination-Lookup**: `ENTRANCE_CHECK_CODES_BY_ID` enthält nur Entrance-Source-Keys. Falls eine Destination (aus `overrides[effectiveSrc]`) ein Exit-Key sein sollte (z.B. durch einen künftigen Sync eines älteren Clients), als Fallback `getEdgeReverse(destination)` versuchen:
  ```ts
  const dstEntries =
    ENTRANCE_CHECK_CODES_BY_ID.get(resolvedEntranceId) ??
    (getEdgeReverse(resolvedEntranceId)
      ? ENTRANCE_CHECK_CODES_BY_ID.get(getEdgeReverse(resolvedEntranceId)!)
      : undefined);
  ```
  Dies ist nur eine Sicherheitsmaßnahme — nach Phase 7.3 sollten im Normalfall keine Exit-Keys mehr als Destinations im Plando-Output auftauchen.

---

## Phase 7: Entfernen alter Funktionen

### 7.1 Aus `entranceRandomization.ts` entfernen

- `computeExitOverrides()` (nachdem alle Aufrufer migriert sind)
- `computeDisplayEntranceOverrides()` (Alias, alle Aufrufer nutzen direkt `entranceOverrides`)
- `deriveEntranceFromExitMapping()`
- `getExitKeyForEntrance()` → durch `getEdgeReverse()` ersetzen
- `normalizeTrackedEntranceKey()` — komplett gelöscht (auch aus `isTrackedEntranceAvailable` entfernen; dort durch `getEdgeReverse`-basierten Dual-Check ersetzen: sowohl den Roh-Key als auch `getEdgeReverse(key)` gegen `JP_LAYOUT_GROTTO_KEYS` prüfen)
- `normalizeTrackedDestinationKeyForSource()` entfernen
- `getTrackedDestinationValidationKeyForSource()` entfernen
- `resolveToActiveEntranceKey()` entfernen
- `getTrackedEntranceKeysForBinding()` entfernen

### 7.2 `computeEffectiveTrackedEntranceOverrides()` vereinfachen

- Ruft aktuell `computeExitOverrides()` auf, um Exit-Overrides aus Entrance-Overrides abzuleiten.
- Neu: Da beide Richtungen jetzt explizit in `entranceOverrides` gespeichert sind, entfällt die Ableitung. Die Funktion validiert nur noch, dass jeder Eintrag einen gültigen Source- und Destination-Key hat (beide in `ENTRANCES_RAW`).
- `isTrackedDestinationAllowedForSource`-Calls bleiben für die Spawn-Validierung erhalten.

### 7.3 `filterEntranceOverridesForSettings()` umbauen (einzige verbleibende Normalisierungsstelle)

- **Bleibt erhalten** als Plando-Boundary-Funktion — die einzige Stelle, die Exit→Entrance-Normalisierung durchführt.
- Ruft nicht mehr `normalizeTrackedEntranceKey` auf. Stattdessen:
  - **Nur Sources akzeptieren, die direkt in `activeKeys` sind** (Entrance-Fall). Exit-Source-Keys werden **nicht** via `getEdgeReverse` aufgelöst, sondern komplett übersprungen. Begründung: Die Kopplung in `setEntranceOverride` (Phase 2.1) garantiert, dass für jedes Exit→Exit-Paar ein korrespondierendes Entrance→Entrance-Paar existiert. Das Entrance→Entrance-Paar ist die kanonische Repräsentation für den Plando-Export.
  - **Destination-Normalisierung**: Ist der Destination-Key eines akzeptierten Eintrags ein Exit-Key (nicht in `activeKeys`), wird dieser via `getEdgeReverse(dst)` in einen Entrance-Key normalisiert. Gibt `getEdgeReverse(dst)` einen gültigen Entrance-Source-Key zurück, wird dieser als normalisierte Destination verwendet. Andernfalls wird der Eintrag verworfen (ungültige Destination).
  - Diese doppelte Normalisierung (Source nur direkt, Destination via `getEdgeReverse`) stellt sicher, dass **alle** Keys im Plando-Output Entrance-Source-Keys sind — sowohl Sources als auch Destinations. Das verhindert, dass Exit-Keys als Destinations in `ENTRANCE_CHECK_CODES_BY_ID`-Lookups fehlschlagen (siehe Phase 6.2).
- `isTrackedDestinationAllowedForSource` muss entsprechend angepasst werden (siehe Phase 7.4).
- `resolveToActiveEntranceKey` entfällt — die Auflösung Exit→Entrance passiert direkt via `getEdgeReverse`.
- **Deduplizierung**: Durch das Überspringen von Exit-Source-Einträgen entstehen keine doppelten Richtungen im Plando-Output mehr. Jede Kante erscheint genau einmal (als Entrance→Entrance).

### 7.4 `isTrackedDestinationAllowedForSource()` umbauen

- **Bisher**: Nutzt `normalizeTrackedEntranceKey(destinationKey)` + `resolveToActiveEntranceKey` um zu prüfen, ob eine Destination für eine Source gültig ist. Hat spezielle Spawn-Logik via `getTrackedDestinationValidationKeyForSource`.
- **Neu**:
  - Für **nicht-Spawn-Quellen**: Prüft, ob `destinationKey` selbst in `activeKeys` ist, ODER ob `getEdgeReverse(destinationKey)` in `activeKeys` ist (Exit→Entrance-Auflösung).
  - Für **Spawn-Quellen**: Die Spawn-spezifische Logik (`getSpawnDestinationTypes`, Game-Check) bleibt erhalten, aber ohne `normalizeTrackedEntranceKey`. Stattdessen:
    - Direkter Check: Ist `destinationKey` oder `getEdgeReverse(destinationKey)` ein gültiger Spawn-Destination-Key?
    - `getTrackedDestinationValidationKeyForSource` kann entfallen, da seine einzige Aufgabe die `normalizeTrackedEntranceKey`-Normalisierung war.
- **Wichtig**: Diese Funktion wird NUR noch in `filterEntranceOverridesForSettings` (Plando-Boundary) und `computeEffectiveTrackedEntranceOverrides` (Tracker-Init-Validierung) aufgerufen. UI-Code ruft sie nicht direkt auf.

---

## Phase 8: Tests und Validierung

### 8.1 Pathfinder-Tests

- Bestehende Tests müssen weiterlaufen: `node --import tsx scripts/pathfinder-tests/reachability_full_inventory.ts`
- Die Plando-Zufuhr (Phase 2.3) bleibt kompatibel (beide Richtungen).

### 8.2 Build

- `npm run build` muss durchlaufen.

### 8.3 Manuelle Tests (Browser)

1. Overworld Shuffle aktivieren (`erOverworld: "all"`)
2. Map auf **Hyrule Field** (`oot_hyrule_field`), Marker mit `display: "exits"` für `OOT_LOST_WOODS_BRIDGE_FROM_FIELD`:
   - Der Marker `oot_hyrule_field:7` oder ähnlich — prüfen welche Marker `display: "exits"` haben via `scripts/generate_map_icon_index.ts` oder direkt in `packs/ootmm/src/data/maps/oot_hyrule_field.ts`
3. Die Row sollte **Entrance-Ziele** anzeigen (z.B. "Kakariko from Field", "Zora River from Field") — nicht nur Exit-Ziele
4. Ein Entrance-Ziel auswählen → die Auswahl sollte gespeichert bleiben (nicht zurückgesetzt oder re-normalisiert werden)
5. Die Partner-Zuweisung sollte automatisch gesetzt sein (in der Sidebar unter "Exits" sichtbar)
6. **`display: "exits"` auf anderen Maps testen**: z.B. Lost Woods (`oot_lost_woods`), Zora River (`oot_zora_river`) — gleiche Verifikation
7. Debug: "Activate All" → 697/697 Checks erreichbar
8. Cross-tab Sync: Entrance-Override in Tab A setzen → erscheint korrekt in Tab B
9. Undo/Redo: Entrance-Override setzen, Undo, Redo → beide Richtungen korrekt wiederhergestellt

---

## Zusammenfassung der Dateien

| Datei                                                | Änderungen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packs/ootmm/src/utils/entranceRandomization.ts`     | Neu: `getEdgeReverse()`, `computeCoupledReverse()`. Entfernen: `computeExitOverrides()`, `deriveEntranceFromExitMapping()`, `getExitKeyForEntrance()`, `getTrackedEntranceKeysForBinding()`, `resolveToActiveEntranceKey()`, `normalizeTrackedEntranceKey()`, `normalizeTrackedDestinationKeyForSource()`, `getTrackedDestinationValidationKeyForSource()`, `computeDisplayEntranceOverrides()`. Umbauen: `filterEntranceOverridesForSettings()` (nur direkte `activeKeys`-Sources, Destination-Normalisierung via `getEdgeReverse`), `computeEffectiveTrackedEntranceOverrides()` (kein `computeExitOverrides`-Aufruf mehr), `isTrackedDestinationAllowedForSource()` (nutzt `getEdgeReverse` für Exit→Entrance-Auflösung), `isTrackedEntranceAvailable()` (ersetzt `normalizeTrackedEntranceKey` durch `getEdgeReverse`-Dual-Check). |
| `packs/ootmm/src/stores/ootmmSession.ts`             | `setEntranceOverride()` + `setEntranceOverrides()` um idempotente Kopplung erweitern (kein `coupled`-Flag). `injectEntranceOverridesIntoSettings()`: ruft weiterhin `filterEntranceOverridesForSettings()` auf (einzige Normalisierungsstelle für OoTMM-Plando-Export).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `packs/ootmm/src/composables/useDungeonEntrances.ts` | `setSelectedDestination()`/`setExitDestination()` umbauen (rufen nur noch `sessionStore.setEntranceOverride` auf, Kopplung passiert im Store). `exitOverridesMap` entfernen. `activeExitEntries` leitet Exit-Entries via `getEdgeReverse()` ab (kein Polarity-Ansatz). `destinationOptionsForExit()` filtert nach **Pool** und **Game**, kein Polarity-Filter (würde Exit→Entrance-Match blockieren). `destinationOptions` enthält alle Keys. `normalizeTrackedEntranceKey`/`normalizeTrackedDestinationKeyForSource`/`resolveToActiveEntranceKey`/GameLink-Alias-Logik entfernen.                                                                                                                                                                                                                                                     |
| `packs/ootmm/src/components/OoTMMMap.vue`            | `display: "exits"` → Partner-Key-Lookup. Submenu-Panel-Exit-Rows nutzen Partner-Key. `normalizeTrackedEntranceKey`/`getTrackedEntranceKeysForBinding` entfernen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `packs/ootmm/src/components/OoTMMEntrances.vue`      | Exit-Rows lesen direkt aus `entranceOverrides`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packs/ootmm/src/components/OoTMMTracker.vue`        | `computeExitOverrides()`-Aufrufe ersetzen durch direkten Lookup in `entranceOverrides`. `normalizeTrackedEntranceKey`/`resolveToActiveEntranceKey` aus `addEntranceBoundCodes`/`ENTRANCE_CHECK_CODES_BY_ID`/`mapSelectorEntranceIdsByMap`/`mapSelectorVisibleEntranceCountByMap` entfernen. `addEntranceBoundCodes`: defensiver `getEdgeReverse`-Fallback für Destination-Lookup in `ENTRANCE_CHECK_CODES_BY_ID`.                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## Entscheidungen

- **Plando-Export**: `filterEntranceOverridesForSettings()` bleibt als einzige Normalisierungsstelle erhalten. Sie verarbeitet **nur** Einträge, deren Source direkt in `activeKeys` ist (Entrance-Fall). Exit-Source-Einträge werden übersprungen, da die Kopplung (Phase 2.1) für jedes Exit→Exit-Paar ein korrespondierendes Entrance→Entrance-Paar garantiert. Zusätzlich werden Destination-Keys, die Exit-Keys sind, via `getEdgeReverse(dst)` in Entrance-Keys normalisiert. Ergebnis: Alle Keys im Plando-Output sind Entrance-Source-Keys — sowohl Sources als auch Destinations. Der OoTMM-Core erwartet Entrance-Source-Keys, nicht Exit-Keys — die Normalisierung an dieser Boundary ist notwendig für korrektes Verhalten.
- **Exit-Rows in Sidebar**: Behalten (Option B) — sie zeigen die Zuweisung des Partner-Keys aus `entranceOverrides` direkt, nicht mehr abgeleitet.
- **Kopplung**: Immer aktiv, idempotent. Kein `coupled`-Flag. Die Idempotenz-Prüfung (Partner bereits korrekt gesetzt?) verhindert Rekursion und doppelte Sync-Publikation.
- **`computeDisplayEntranceOverrides`**: Entfernt. Alle Aufrufer verwenden direkt `entranceOverrides.value`.

---

## Weiterführende Überlegungen

1. **Performance**: `setEntranceOverride` triggert 2 Override-Speicherungen + 1× `scheduleReinitializeForEntrances`. Die Idempotenz-Prüfung verhindert, dass die Kopplung bei bereits korrektem Zustand erneut feuert. Bei Bulk-Operationen via `setEntranceOverrides` wird die Kopplung in-place angewendet, sodass nur eine Reinitialisierung getriggert wird.
2. **Undo/Redo**: Die History speichert `entranceOverrides`-Snapshots. Da beide Richtungen jetzt explizit gespeichert sind, sind Undo/Redo-Operationen korrekt (sie stellen den vollen Zustand wieder her).
3. **Rekursion vermeiden**: Gelöst durch Idempotenz-Prüfung: Vor dem Setzen des Partner-Overrides wird `entranceOverrides.value[partnerSrc]` mit dem Soll-Wert verglichen. Nur bei Abweichung wird gesetzt — keine Rekursion möglich.
4. **Sync-Konsistenz**: Ältere Clients könnten ungekoppelte Overrides senden. `setEntranceOverrides` ergänzt fehlende Gegenrichtungen automatisch — der Empfänger ist immer konsistent. Doppelte Einträge (wenn beide Clients die Kopplung anwenden) sind harmlos, da die Werte identisch sind.

---

## Verifikation

1. `npm run build` läuft fehlerfrei
2. `node --import tsx scripts/pathfinder-tests/reachability_full_inventory.ts` → alle Tests bestanden
3. Browser: Overworld Shuffle aktivieren, `display: "exits"`-Marker auf Hyrule Field → Entrance-Optionen sichtbar → Auswahl bleibt erhalten
4. Browser: Debug "Activate All" → 697/697 Checks
5. Cross-tab Sync: Entrance-Override in Tab A setzen → erscheint in Tab B
