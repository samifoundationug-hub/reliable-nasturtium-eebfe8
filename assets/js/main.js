const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');

if (navToggle && mainNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

document.querySelectorAll('.main-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    if (mainNav) mainNav.classList.remove('open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  });
});

const year = document.querySelector('[data-year]');
if (year) year.textContent = new Date().getFullYear();

const contactForm = document.querySelector('[data-contact-form]');
if (contactForm) {
  contactForm.addEventListener('submit', (event) => {
    const name = contactForm.querySelector('[name="name"]')?.value.trim();
    const message = contactForm.querySelector('[name="message"]')?.value.trim();
    if (!name || !message) {
      event.preventDefault();
      alert('Please fill in your name and message before submitting.');
    }
  });
}
