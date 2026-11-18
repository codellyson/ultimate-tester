// Sections fade up once as they reach the screen. Without JS they're simply visible.
document.documentElement.classList.add('js');
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0.12 });
for (const el of document.querySelectorAll('.step, .final')) { el.classList.add('reveal'); io.observe(el); }
