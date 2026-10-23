;(function () {
  try {
    var saved = localStorage.getItem('theme')
    var theme = saved === 'light' || saved === 'dark'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    var colors = { light: '#F6F2E8', dark: '#14110F' }
    var themeColor = document.querySelector('meta[name="theme-color"]')
    if (themeColor) themeColor.content = colors[theme]
  } catch (error) {
    console.warn('The saved color theme could not be restored.', error)
  }
})()
