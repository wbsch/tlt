import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Returns the combobox input locator for the entrance row whose label
 * contains the given text.
 */
export function entranceCombobox(page: Page, labelText: string): Locator {
  return page
    .locator('.entrance-row:not(.exit-row)')
    .filter({
      has: page.locator('.entrance-label', { hasText: labelText }),
    })
    .locator('.entrance-select-input');
}

/**
 * Opens the dropdown on the given entrance combobox input, finds the option
 * whose `data-value` matches the given ID, and clicks it.
 */
export async function selectEntranceById(
  input: Locator,
  id: string,
): Promise<void> {
  await input.click();
  // Clear any existing query text so all options are shown
  await input.fill('');
  const listbox = input.locator('..').locator('.entrance-dest-options');
  const option = listbox.locator(`.entrance-dest-option[data-value="${id}"]`);
  await expect(option).toBeVisible();
  await option.click();
}

/**
 * Opens the dropdown on the given entrance combobox input, finds the option
 * whose visible label contains the given text, and clicks it.
 */
export async function selectEntranceByLabel(
  input: Locator,
  label: string,
): Promise<void> {
  await input.click();
  await input.fill(label);
  const listbox = input.locator('..').locator('.entrance-dest-options');
  const option = listbox
    .locator('.entrance-dest-option')
    .filter({ hasText: label })
    .first();
  await expect(option).toBeVisible();
  await option.click();
}

/**
 * Clears the current entrance mapping by clicking the clear (×) button.
 */
export async function clearEntranceMapping(input: Locator): Promise<void> {
  const clearButton = input.locator('..').locator('.entrance-select-clear');
  await expect(clearButton).toBeVisible();
  await clearButton.click();
}

/**
 * Asserts that the entrance combobox has the given ID selected
 * (via its `data-selected` attribute).
 */
export async function expectEntranceSelectedId(
  input: Locator,
  expectedId: string,
): Promise<void> {
  await expect(input).toHaveAttribute('data-selected', expectedId);
}

/**
 * Asserts that the entrance combobox is unmapped
 * (its `data-selected` attribute is empty).
 */
export async function expectEntranceUnmapped(input: Locator): Promise<void> {
  await expect(input).toHaveAttribute('data-selected', '');
}
