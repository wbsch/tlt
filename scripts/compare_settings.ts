import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const TRACKER_SETTINGS_PATH = 'packs/ootmm/src/types/settings.ts';
const CORE_SETTINGS_PATH = 'OoTMM/packages/core/src/settings/data.ts';
const IGNORED_TRACKER_SETTINGS = new Set(['tricks']);

function getAbsolutePath(relativePath: string) {
  return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

function readSourceFile(relativePath: string) {
  const absolutePath = getAbsolutePath(relativePath);
  const sourceText = readFileSync(absolutePath, 'utf8');

  return ts.createSourceFile(
    absolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function getVariableInitializer(
  sourceFile: ts.SourceFile,
  variableName: string,
) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== variableName
      ) {
        continue;
      }

      if (!declaration.initializer) {
        throw new Error(
          `Variable "${variableName}" in ${sourceFile.fileName} has no initializer.`,
        );
      }

      return declaration.initializer;
    }
  }

  throw new Error(
    `Could not find variable "${variableName}" in ${sourceFile.fileName}.`,
  );
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }

  return expression;
}

function getPropertyName(name: ts.PropertyName) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  return undefined;
}

function getObjectKeys(relativePath: string, variableName: string) {
  const sourceFile = readSourceFile(relativePath);
  const initializer = unwrapExpression(
    getVariableInitializer(sourceFile, variableName),
  );

  if (!ts.isObjectLiteralExpression(initializer)) {
    throw new Error(
      `Variable "${variableName}" in ${relativePath} is not an object literal.`,
    );
  }

  const keys: string[] = [];

  for (const property of initializer.properties) {
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }

    const name = getPropertyName(property.name);
    if (name) {
      keys.push(name);
    }
  }

  return keys;
}

function getSettingKeys(relativePath: string, variableName: string) {
  const sourceFile = readSourceFile(relativePath);
  const initializer = unwrapExpression(
    getVariableInitializer(sourceFile, variableName),
  );

  if (!ts.isArrayLiteralExpression(initializer)) {
    throw new Error(
      `Variable "${variableName}" in ${relativePath} is not an array literal.`,
    );
  }

  const keys: string[] = [];

  for (const element of initializer.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      continue;
    }

    for (const property of element.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }

      const propertyName = getPropertyName(property.name);
      if (propertyName !== 'key') {
        continue;
      }

      if (
        ts.isStringLiteral(property.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(property.initializer)
      ) {
        keys.push(property.initializer.text);
      }

      break;
    }
  }

  return keys;
}

function sortKeys(keys: Iterable<string>) {
  return [...keys].sort((left, right) => left.localeCompare(right));
}

function findMissing(source: ReadonlySet<string>, target: ReadonlySet<string>) {
  return sortKeys([...target].filter((key) => !source.has(key)));
}

function printSection(title: string, keys: string[]) {
  console.log(`\n${title}`);

  if (keys.length === 0) {
    console.log('  None');
    return;
  }

  for (const key of keys) {
    console.log(`  - ${key}`);
  }
}

const trackerKeys = new Set(
  getObjectKeys(TRACKER_SETTINGS_PATH, 'DEFAULT_OOTMM_SETTINGS').filter(
    (key) => !IGNORED_TRACKER_SETTINGS.has(key),
  ),
);
const coreKeys = new Set(getSettingKeys(CORE_SETTINGS_PATH, 'SETTINGS'));

const missingInTracker = findMissing(trackerKeys, coreKeys);
const extraInTracker = findMissing(coreKeys, trackerKeys);

console.log('Settings comparison report');
console.log('==========================');
console.log(`Tracker source: ${TRACKER_SETTINGS_PATH}`);
console.log(`Core source:    ${CORE_SETTINGS_PATH}`);
console.log(`Tracker settings: ${trackerKeys.size}`);
console.log(`Core settings:    ${coreKeys.size}`);

printSection(
  `Settings missing in ${TRACKER_SETTINGS_PATH} but present in ${CORE_SETTINGS_PATH}:`,
  missingInTracker,
);
printSection(
  `Additional settings in ${TRACKER_SETTINGS_PATH} that are not present in ${CORE_SETTINGS_PATH}:`,
  extraInTracker,
);

if (missingInTracker.length === 0 && extraInTracker.length === 0) {
  console.log('\nResult: The settings lists match.');
} else {
  console.log('\nResult: The settings lists do not match.');
  process.exitCode = 1;
}
