const input = document.getElementById('search');
const category = document.getElementById('category');
const entries = [...document.querySelectorAll('.entry')];
function filterCatalog() {
  const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let visible = 0;
  for (const entry of entries) {
    const match = (!category.value || entry.dataset.category === category.value) && terms.every(term => entry.dataset.search.includes(term));
    entry.hidden = !match;
    if (match) visible++;
  }
  document.getElementById('count').textContent = `${visible} of ${entries.length} entries`;
  document.getElementById('empty').hidden = visible !== 0;
}
input.addEventListener('input', filterCatalog);
category.addEventListener('change', filterCatalog);
filterCatalog();
