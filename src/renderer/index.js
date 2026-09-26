const form = document.getElementById('search-form')
const input = document.getElementById('search-input')

form.addEventListener('submit', (event) => {
  event.preventDefault()

  const query = input.value.trim()
  if (!query) return

  window.api.search(query)
  input.value = ''
})