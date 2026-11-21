// Availability requests and all event planning now begin in DJ-Desk.
document.querySelectorAll('[data-request]').forEach(button => button.addEventListener('click', () => {
  window.location.href = '/dj-desk/#inquire';
}));
