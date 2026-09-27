const params = new URLSearchParams(window.location.search)
const bookmarkId = params.get('bookmarkId') || ''
const initialTitle = params.get('title') || ''
const url = params.get('url') || ''

const titleInput = document.getElementById('title-input')
const btnSave = document.getElementById('btn-save')
const btnRemove = document.getElementById('btn-remove')

titleInput.value = initialTitle

setTimeout(() => {
  titleInput.focus()
  titleInput.select()
}, 30)

function closePopup() {
  window.browserAPI.closeBookmarkPopup()
}

btnSave.addEventListener('click', async () => {
  await window.browserAPI.popupSave({
    bookmarkId,
    title: titleInput.value,
    url,
  })
  closePopup()
})

btnRemove.addEventListener('click', async () => {
  await window.browserAPI.popupRemove({ bookmarkId })
  closePopup()
})

titleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    btnSave.click()
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    closePopup()
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePopup()
})

// Тема и акцент: см. shared/theme.js