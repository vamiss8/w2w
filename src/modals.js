// every modal is an overlay switched by a class and hidden with opacity, so
// it can fade. while one is open the body gets auth-open, the class the
// sign-in overlay uses, which stops the page scrolling underneath.

export function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;

  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("auth-open");
}

export function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;

  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("auth-open");
}
