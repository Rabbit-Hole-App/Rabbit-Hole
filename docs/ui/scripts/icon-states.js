
  const feedback = document.getElementById('feedback-demo');
  const feedbackStatus = document.getElementById('feedback-status');
  feedback.addEventListener('click', event => {
    const button = event.target.closest('[data-feedback]');
    if (!button) return;
    const selected = button.getAttribute('aria-pressed') !== 'true';
    for (const choice of feedback.querySelectorAll('[data-feedback]')) {
      choice.setAttribute('aria-pressed', String(selected && choice === button));
    }
    feedbackStatus.textContent = selected ? `${button.dataset.feedback} selected` : 'Unselected';
  });
  const transport = document.getElementById('transport-toggle');
  const transportStatus = document.getElementById('transport-status');
  transport.addEventListener('click', () => {
    const playing = transport.dataset.playing !== 'true';
    transport.dataset.playing = String(playing);
    transport.querySelector('use').setAttribute('href', playing ? '../../../icons/icons.svg#icon-Pause' : '../../../icons/icons.svg#icon-Play');
    transport.querySelector('span').textContent = playing ? 'Pause' : 'Play';
    transportStatus.textContent = playing ? 'Pause' : 'Play';
  });
