export function selectSearchInputText(event: FocusEvent | MouseEvent): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }
  if (!target.value) {
    return
  }
  target.select()
}
