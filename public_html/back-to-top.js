(() => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'back-to-top';
  button.setAttribute('aria-label', 'Back to top');
  button.innerHTML = '<span aria-hidden="true">↑</span> Top';
  button.hidden = true;
  document.body.append(button);

  const update = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    button.hidden = scrollable <= 0 || window.scrollY < scrollable * 0.3;
  };
  button.addEventListener('click', () => window.scrollTo({top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}));
  window.addEventListener('scroll', update, {passive: true});
  window.addEventListener('resize', update);
  new ResizeObserver(update).observe(document.body);
  update();
})();
