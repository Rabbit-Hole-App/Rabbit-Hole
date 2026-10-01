import './footer-links.css';

// ponytail: leave social icons unlinked until the owner supplies verified profiles.
const profiles = { x: '', linkedin: '' };
const xIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.4l8.1-9.4L.8 2h6.5l5.9 7.9L18.9 2Zm-1.1 18h1.7L6.4 3.9H4.6L17.8 20Z"/></svg>';
const linkedinIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.2 7.6H1.6V22h3.6V7.6ZM3.4 1a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4ZM22.4 13.4c0-4.3-2.3-6.3-5.3-6.3a4.6 4.6 0 0 0-4.1 2.2V7.6H9.4V22H13v-8c0-2.1.8-3.4 2.7-3.4 1.8 0 3.1.9 3.1 3.4v8h3.6v-8.6Z"/></svg>';
const emailIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 7 9-7"/></svg>';
function socialLink(name, url, icon) {
  return url ? `<a class="footer-social-icon" href="${url}" aria-label="Rabbit Hole on ${name}" target="_blank" rel="noopener noreferrer">${icon}</a>`
    : `<span class="footer-social-icon" role="img" aria-label="${name}: profile coming soon" title="${name}: profile coming soon">${icon}</span>`;
}
export function footerLinks() {
  return `<div class="footer-links-row"><nav class="footer-secondary-nav" aria-label="More from Rabbit Hole"><a href="/manifesto">Manifesto</a><a href="/team">Team</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav><div class="footer-socials">${socialLink('X', profiles.x, xIcon)}${socialLink('LinkedIn', profiles.linkedin, linkedinIcon)}<a class="footer-email" href="mailto:hello@digrabbithole.com">${emailIcon}<span>hello@digrabbithole.com</span></a></div></div>`;
}
document.querySelectorAll('[data-footer-links]').forEach(element => { element.innerHTML = footerLinks(); });
