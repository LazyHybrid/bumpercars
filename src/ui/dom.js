export function show(selector) {
  const el = document.querySelector(selector)
  if (el) el.style.display = ''
}

export function hide(selector) {
  const el = document.querySelector(selector)
  if (el) el.style.display = 'none'
}