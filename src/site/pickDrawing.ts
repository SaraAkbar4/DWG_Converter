/** Opens the drawing picker. iPhone greys out a DWG while accept lists .dwg, so that filter is lifted there. */
export function openDrawingPicker(input: HTMLInputElement | null) {
  if (!input) return;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) input.removeAttribute('accept');
  input.click();
}
