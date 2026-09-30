import './content-footer.css';
import { footerLinks } from './footer-links.js';

const footer=document.querySelector('[data-content-footer]');
if(footer){
  footer.classList.add('content-footer');
  footer.innerHTML=`
    <div class="content-footer-main">
      <div class="content-footer-brand">
        <a href="/" aria-label="Rabbit Hole home"><span class="rh-mark" aria-hidden="true"></span>Rabbit Hole</a>
        <p>Knowledge is infinite.</p>
      </div>
      <nav aria-label="Footer">
        <a href="/features">Features</a>
        <a href="/blog">Blog</a>
        <a href="/pricing">Pricing</a>
        <a href="/docs">Docs</a>
        <a class="content-footer-start" href="/sign-up">Get started</a>
      </nav>
    </div>
    ${footerLinks()}
    <div class="content-footer-bottom">
      <span>© 2026 Rabbit Hole</span>
      <a href="#">Back to top <span aria-hidden="true">↑</span></a>
    </div>`;
  for(const link of footer.querySelectorAll('nav a')){
    if(link.getAttribute('href')===location.pathname)link.setAttribute('aria-current','page');
  }
}
