const main = document.getElementById('support-main');
const route = location.pathname.replace(/\/$/, '') || '/';
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';

const documents = {
  '/privacy': {
    title: 'Privacy policy.', intro: 'Your learning is personal. Understanding what happens to your information should be simple.',
    note: 'This is draft copy for review, not a final privacy notice. Operator details, data practices and contact arrangements still need to be confirmed.',
    sections: [
      ['about', 'About this notice', 'Rabbit Hole is an adaptive learning platform for exploring questions, working with sources and returning to what you have learned. This draft describes the topics our final privacy notice will cover.', 'The legal operator and its contact details will be identified in the final notice. This draft does not replace any notice that already applies to an existing workspace.'],
      ['information', 'Information you provide', 'Learning with Rabbit Hole can involve account details, questions, source documents, repository content, notes and saved learning material. The final notice will explain which information is collected for each feature and why.', 'The new sign-in and sign-up forms on this preview site do not submit their contents. Existing workspace features operate separately from these preview forms.'],
      ['use', 'How information is used', 'The proposed scope includes delivering learning features, keeping saved work available, protecting accounts and responding to support requests. The final notice will state the actual purposes and applicable legal grounds for each use.', 'Product illustrations and draft plan descriptions are not a complete account of how the service handles data.'],
      ['providers', 'AI and service providers', 'Some learning features use external AI and hosting services. The final notice will identify the relevant providers, the information they receive and the purposes for which it is processed.', 'Provider retention, model-training arrangements and international data transfers must be confirmed before this draft becomes the final notice.'],
      ['technical', 'Cookies and technical information', 'Website hosting and security services may process technical information such as IP addresses, device details and request logs. Existing workspace sign-in uses a session cookie.', 'The final notice will describe the cookies and other technologies actually used, their purposes and any available choices. This draft does not make an unverified promise that no technical data is processed.'],
      ['choices', 'Retention and your choices', 'The final notice will explain how long different kinds of information are kept, how deletion works and how to request access or correction where applicable.', 'Retention schedules, request channels and rights for the regions we serve are still being confirmed. No retention period or response deadline is established by this draft.'],
      ['questions', 'Questions and updates', 'The final version will include a working privacy contact, the responsible operator and an effective date. Material changes will be explained in the published notice.', 'For questions, email <a href="mailto:hello@digrabbithole.com">hello@digrabbithole.com</a>.'],
    ],
  },
  '/terms': {
    title: 'Terms of use.', intro: 'A shared understanding of learning with Rabbit Hole.',
    note: 'These are draft terms for review, not a final agreement. The legal operator, eligibility, governing law and commercial terms still need confirmation.',
    sections: [
      ['service', 'Learning with Rabbit Hole', 'Rabbit Hole is being built to help people explore sources, ask questions and develop understanding. Features and illustrative demos on this site show the direction of the product; availability may differ in the current preview.', 'Final terms will identify the operator and the service covered by the agreement. These draft pages do not replace existing workspace agreements.'],
      ['accounts', 'Accounts and access', 'The proposed account terms will cover accurate account information, protecting credentials and using only accounts and workspaces you are authorized to access.', 'Eligibility and any age requirements will be established in the final terms. The new sign-up form is a UI preview and does not create an account.'],
      ['sources', 'Your sources and learning material', 'The proposed usage rules ask you to bring only material you have permission to use. Keep credentials, confidential third-party information and restricted content out of sources unless the relevant permissions and service arrangements are in place.', 'Final terms must describe content ownership, the permissions needed to operate the service, exports and deletion. No additional content license is granted by this draft.'],
      ['ai', 'AI-assisted learning', 'AI-generated explanations can be incomplete or incorrect. Check important claims against the underlying sources and use your own judgment when applying what you learn.', 'Rabbit Hole is intended as a learning aid. The final agreement will explain the service’s limitations without treating generated material as a guarantee of accuracy.'],
      ['conduct', 'Use it thoughtfully', 'The proposed rules prohibit unauthorized access, attempts to compromise the service, abusive activity and infringement of other people’s rights.', 'The final terms will set out how concerns, restrictions and account closure are handled. This draft does not establish a final enforcement or appeals process.'],
      ['plans', 'Plans and payments', 'The pricing page currently shows planned packages and free early access. The sign-up preview does not collect payment or start a paid subscription.', 'Before paid billing is introduced, prices, billing periods, renewal, cancellation and any refund terms need to be stated clearly in the actual purchase flow.'],
      ['details', 'The final agreement', 'The final version needs the operator’s legal details, applicable law, any dispute process and reviewed provisions on responsibility and service availability. Those details are intentionally not invented here.', 'Visit <a href="/privacy">Privacy</a> for the draft privacy notice or email <a href="mailto:hello@digrabbithole.com">hello@digrabbithole.com</a> with a question.'],
    ],
  },
};

function documentPage(doc) {
  document.title = `${route === '/privacy' ? 'Privacy' : 'Terms'} | Rabbit Hole`;
  main.innerHTML = `<header class="legal-header"><p class="support-eyebrow">Rabbit Hole / ${route === '/privacy' ? 'Privacy' : 'Terms'}</p><h1 class="support-title">${doc.title}</h1><p class="support-lead">${doc.intro}</p><div class="legal-draft"><strong>Draft for review</strong><p>${doc.note}</p></div></header>
    <div class="legal-layout"><nav class="legal-contents" aria-label="On this page"><h2>On this page</h2><ol>${doc.sections.map(([id,title]) => `<li><a href="#${id}">${title}</a></li>`).join('')}</ol></nav>
    <article class="legal-copy">${doc.sections.map(([id,title,...paragraphs]) => `<section id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${title}</h2>${paragraphs.map(p => `<p>${p}</p>`).join('')}</section>`).join('')}<p class="legal-note">Looking for something else? <a href="mailto:hello@digrabbithole.com">Say hello.</a></p></article></div>`;
  main.querySelectorAll('.legal-contents a').forEach(link => link.addEventListener('click', () => {
    main.querySelector('[aria-current="location"]')?.removeAttribute('aria-current');
    link.setAttribute('aria-current', 'location');
  }));
  // The document is inserted after native anchor resolution on a direct deep link.
  const target = document.getElementById(location.hash.slice(1));
  if (target && main.contains(target)) requestAnimationFrame(() => target.scrollIntoView());
}

function notFoundPage() {
  document.title = 'Page not found | Rabbit Hole';
  document.body.classList.add('not-found-page');
  main.innerHTML = `<div class="lost-number" aria-hidden="true"><span>4</span><span class="lost-zero"><span class="rh-mark"></span></span><span>4</span></div><p class="support-eyebrow">404 / Page not found</p><h1 class="support-title">A little too far<br>down the hole.</h1><p class="support-lead">This page isn’t here. Let’s get you back to a good question.</p><div class="lost-actions"><a class="support-button" href="/">Back to Rabbit Hole ${arrow}</a><a href="/features">Explore the features</a></div>`;
}

if (documents[route]) documentPage(documents[route]);
else notFoundPage();
