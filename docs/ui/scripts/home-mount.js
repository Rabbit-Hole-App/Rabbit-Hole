// Compose the existing sidebar with Home instead of its empty review surface.
const homeSlot=document.getElementById('home-main-template');
document.querySelector('.sidebar-canvas').replaceWith(homeSlot.content.cloneNode(true));
const startSection=document.getElementById('dialog');startSection.removeAttribute('role');startSection.removeAttribute('aria-modal');
