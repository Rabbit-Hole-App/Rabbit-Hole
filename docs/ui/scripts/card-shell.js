const getTemplate = id => document.getElementById(id).content.firstElementChild.cloneNode(true);
    let cardId = 0;

    // The visual and the controls are independent slots. The shell owns dimensions and scroll.
    function createCard({ type, title, subtitle = '', concept, instruction = '', visual = null, caption = '' }) {
      const node = getTemplate('card-shell');
      const slot = name => node.querySelector(`[data-slot="${name}"]`);
      const titleId = `card-title-${++cardId}`;
      slot('title').id = titleId;
      slot('title').textContent = title;
      slot('subtitle').textContent = subtitle;
      slot('subtitle').hidden = !subtitle;
      node.setAttribute('aria-labelledby', titleId);
      node.dataset.command = type === 'explain' ? '/explain' : '/interactive';
      slot('pill').classList.add(type);
      slot('pill').textContent = type === 'explain' ? 'Explanation' : 'Interactive';
      slot('body').setAttribute('aria-label', `${title} content`);
      slot('concept').textContent = concept;
      slot('instruction').textContent = instruction;
      slot('instruction').hidden = !instruction;
      const handle = node.querySelector('.resize-handle');
      handle.setAttribute('aria-label', `Resize ${title}`);
      installResize(node, handle);
      function setVisual(element, text = '') {
        slot('visual').replaceChildren(...(element ? [element] : []));
        slot('figure').hidden = !element;
        slot('caption').textContent = text;
        slot('caption').hidden = !text;
      }
      setVisual(visual, caption);
      return {
        node,
        setVisual,
        headerActions: slot('header-actions'),
        controls: slot('controls'),
        showReason(message, decision) {
          slot('why').dataset.decision = decision;
          slot('why').hidden = !message;
          slot('reason').textContent = message;
        },
      };
    }

    function showExample(label, card) {
      const demo = document.createElement('section');
      demo.className = 'demo';
      const name = document.createElement('p');
      name.className = 'demo-label';
      name.textContent = label;
      demo.append(name, card.node);
      document.getElementById('examples').append(demo);
    }

