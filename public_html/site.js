// Availability requests and all event planning now begin in DJ-Desk.
document.querySelectorAll('[data-request]').forEach(button => button.addEventListener('click', () => {
  window.location.href = '/dj-desk/#inquire';
}));

const backToTop = document.querySelector('#back-to-top');
if (backToTop) {
  const update = () => {
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    backToTop.hidden = distance <= 0 || window.scrollY < distance * 0.3;
  };
  backToTop.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));
  window.addEventListener('scroll', update, {passive: true});
  window.addEventListener('resize', update);
  update();
}
