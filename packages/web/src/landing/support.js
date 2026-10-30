const main = document.getElementById('support-main');
const route = location.pathname.replace(/\/$/, '') || '/';
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';

const mail = '<a href="mailto:hello@digrabbithole.com">hello@digrabbithole.com</a>';
// Owner facts (2026-10-29): the operator is an individual; no company name or incorporation is claimed.
const operator = 'Yudhisteer Chintaram, an individual, at 16595 Redmond Way, Redmond, WA 98052, United States';
const effective = 'Effective date: November 1, 2026';

// Each section is [id, heading, ...blocks]; a block is a paragraph, or an array of list items.
// Every statement is checked against the code and configuration, and each provider practice against that provider's own published
// policy (sources: docs/features/rabbit-hole-support-pages.md). Owner-approved for publication 2026-10-29 (18+, effective November 1, 2026).
const documents = {
  '/privacy': {
    title: 'Privacy Policy', intro: 'How Rabbit Hole handles your information.',
    sections: [
      ['about', 'About this policy', 'Rabbit Hole is a learning app at digrabbithole.com. You bring questions, files, links and repositories to a canvas, and AI features help you explain, practise and generate material.', `Rabbit Hole is operated by ${operator} (“we” or “us”). It is offered primarily in the United States.`, `This policy covers the Rabbit Hole website, the app and the public pages people can open without an account. For privacy questions and requests, email ${mail}.`],
      ['account', 'Account information', 'You sign in with Google, GitHub or a sign-in link we email to you. What we keep depends on the method:', [
        '<strong>Google</strong>: your Google account identifier and your verified email address. We ask Google only for your email address.',
        '<strong>GitHub</strong>: your GitHub account number, your name or username, and your email address if GitHub provides it.',
        '<strong>Email link</strong>: your email address and a record of each link we send (when it was sent, when it expires and when it was used). A link works once and expires after 15 minutes.',
      ], 'You can also add a display name, a profile picture, a public @handle and a short description. We do not copy a profile picture from Google or GitHub.'],
      ['content', 'Chats, uploads and saved canvases', 'To keep your work available on every device, we store what you create and add:', [
        'Canvases: their cards, notes, drawings and the chat exchanges shown on them.',
        'Files you upload, and media Rabbit Hole generates for you, such as images and videos.',
        'A copy of a public GitHub repository you connect, on the branch you choose.',
        'Web pages you add, which we open and capture on our servers.',
        'Learning records: Tutor goals, practice answers, marks and progress.',
        'Comments, and files attached to comments.',
      ], 'This information is stored with Cloudflare, which hosts Rabbit Hole, in its databases (D1), file storage (R2) and Durable Objects.', 'Your browser also keeps a local copy of canvases, notes and graphs as a draft and recovery copy. A canvas too large to save to our servers stays only in that browser.'],
      ['providers', 'AI processing and service providers', 'When you use a feature, the information it needs is sent to the provider that does the work. The keys for AI providers stay on our servers; your browser never receives them.', [
        '<strong>Cloudflare</strong>: hosting, databases, file storage, request logs, web page capture and page-performance measurement.',
        '<strong>Anthropic</strong> (Claude API): Chat and Tutor messages, the canvas context and files you include, and requests to generate explanations, CAD models and videos. Signed-in searches of Explore send the titles, descriptions and handles of published canvases.',
        '<strong>OpenAI</strong> (API): image prompts and reference images when you generate an image with an OpenAI model, the image and selected area when you edit an image, and the audio of an Explain-back voice note, transcribed when you submit the answer.',
        '<strong>Google</strong> (Gemini API): image prompts and reference images when you generate an image with a Gemini model.',
        '<strong>Fly.io</strong>: runs our services for repository lessons (the repository name and commit), CAD models, generated videos and converting some uploaded files, such as documents, slides, audio and 3D models.',
        '<strong>TypeSafe</strong>: a practice question and your answer, to check the answer; and, when you add a web page card, screenshots of the captured page, its extracted text, its title and its web address, to screen the page for sexually explicit or graphic content.',
        '<strong>Fish Audio</strong>: text that Rabbit Hole reads aloud.',
        '<strong>ElevenLabs</strong>: voice input, which is currently paused. When it is on, your browser sends your microphone audio directly to ElevenLabs for transcription.',
        '<strong>Resend</strong>: your email address and the content of sign-in and invitation emails.',
        '<strong>Google and GitHub</strong>: sign-in, if you choose them.',
        '<strong>Pexels</strong>: the words you search for when you look for a stock photo.',
        '<strong>Wikipedia and arXiv</strong>: the article titles, searches and paper identifiers you look up.',
      ], 'Some content loads from other services in your browser: YouTube for video cards, Desmos for graphs, Google Fonts for the public pages and jsDelivr for running Python code.', 'What these providers publish about how they handle the data they receive:', [
        'Anthropic states that by default it does not use inputs or outputs from its commercial products to train its models, and that it deletes API inputs and outputs within 30 days, with exceptions such as enforcing its usage policy or meeting legal requirements.',
        'OpenAI states that data sent to its API is not used to train or improve its models unless the customer opts in, and that its abuse-monitoring logs, including for image generation and edits, are kept for up to 30 days.',
        'TypeSafe states that it does not train or fine-tune AI models on prompts or other input.',
        'Fly.io states that, for data in the applications its customers run, it acts as a processor on the customer’s instructions.',
        'ElevenLabs states that by default it retains speech-to-text audio and transcripts in line with its privacy policy; Rabbit Hole uses that default.',
      ], 'We have not negotiated separate agreements with these providers: each processes data under its own standard terms. The other providers’ practices are not summarized here.'],
      ['use', 'Why we use information and where', 'We use your information to provide the features you ask for, to keep Rabbit Hole and the people who use it secure, to meet legal obligations, and, where we ask for it, with your consent. Where data-protection law requires a legal basis, these are the purposes we rely on.', 'Rabbit Hole runs on Cloudflare’s global network, and our service providers process information in the countries where they operate. Your information may therefore be processed outside the country where you live, including in the United States, where Rabbit Hole is operated. We rely on our providers’ published terms for how they protect it.'],
      ['sharing', 'Sharing and forking', 'A new canvas is private: only you can open it. You choose whether to share it:', [
        '<strong>Share link</strong>: anyone signed in who has the link can view the canvas read-only. If you turn on public view, people who are not signed in can view it too.',
        '<strong>Explore</strong>: publishing lists the canvas publicly under your @handle. Anyone can find and open it read-only without signing in, and it shows your later edits.',
        '<strong>Embed</strong>: a canvas with a public view link, or a published one, can be embedded on another website.',
      ], 'People who can view a shared or published canvas see:', [
        'Its cards, notes, drawings and the chat exchanges on it.',
        'The files those cards use, such as images, PDFs and clips.',
        'Its title, its fork and star counts, and your @handle and display name.',
      ], 'They do not see your email address, your practice answers, marks, highlights or progress, your Materials list, the Context and Files panels, or the code of a private repository. Your public profile at /@handle shows your handle, name, picture and description.', 'Viewers who are not signed in can ask a limited number of questions about a shared canvas. People can comment only where you allow it, and comments show a name, handle and picture, never an email address. When you invite someone to a canvas by email, the invitation shows your name or @handle and the canvas title.', 'Anyone signed in who can view a shared or published canvas can fork it: make their own private, editable copy, including the files its cards use. A fork belongs to the person who made it. Your chats, voice transcripts, context documents, marks and share settings are not copied. We keep a record of which canvas a fork came from.', 'Turning off the link, making the canvas private, removing it from Explore or moving it to Trash stops new access. <strong>Existing forks are not deleted</strong>: they stay with the people who made them, and their “forked from” credit shows the original as unavailable. If you turn the same link back on, the links you shared before work again.'],
      ['technical', 'Cookies and technical logs', 'Rabbit Hole sets these cookies:', [
        '<code>small_session</code>: keeps you signed in, for up to 7 days.',
        '<code>rh_oauth</code>: protects a Google or GitHub sign-in while it completes, for up to 10 minutes.',
        '<code>rh_guest</code>: a random identifier that counts a signed-out visitor’s questions about a shared canvas, for up to a year.',
        '<code>rh_embed</code>: the same count inside an embedded canvas, kept separately for each website, for up to a year.',
      ], 'Our pages include Cloudflare’s Web Analytics script, which measures page loading and the page path. Cloudflare states that it does not use cookies or local storage.', 'When something goes wrong in the app, your browser sends a short error report: the kind of error, the page type, your browser and device type, and counts. It never includes error text, page content, web addresses or share links. When you are signed in, the report is linked to your account. Your IP address is used in a scrambled form to limit repeated reports and is not stored.', 'The Tutor records learning events, such as identifiers, counts and timings, without the words of your goals, questions or answers. Our servers also keep request and error logs.'],
      ['choices', 'Retention, deletion and privacy requests', 'We keep your account information and the content you save for as long as your account exists. Automatic deletion schedules are not yet in place for account information, saved content, sign-in records or technical records. We will update this policy when they are.', 'What you can do today:', [
        '<strong>Trash</strong>: moving a canvas to Trash stops its links and removes it from Explore. Items in Trash are kept until you restore them; permanent deletion from Trash is not yet available.',
        '<strong>Your files</strong>: download the original files and PDFs you added. Exporting a whole canvas or your account is not yet available.',
        '<strong>Signing out</strong>: Log out ends your sessions on every device.',
      ], `To ask us to delete your account or specific content, or for a copy or correction of your information, email ${mail} from the address you sign in with. We will confirm what we deleted.`, 'Copies that other people forked from content you shared belong to them and are not deleted with your account. Our service providers keep data under their own retention terms, described above.'],
      ['changes', 'Changes to this policy', 'When Rabbit Hole’s handling of information changes, we will update this page and its effective date.'],
    ],
  },
  '/terms': {
    title: 'Terms of Use', intro: 'The terms for using Rabbit Hole.',
    sections: [
      ['provider', 'Who provides Rabbit Hole', `Rabbit Hole is provided by ${operator} (“we” or “us”). These terms apply when you use the Rabbit Hole website and app.`],
      ['accounts', 'Accounts and eligibility', 'You create an account by signing in with Google, GitHub or a sign-in link sent to your email address. Signing in again with the same method reaches the same account.', [
        'Use only your own account and keep access to your sign-in method secure.',
        'Choose a @handle and profile that do not impersonate anyone.',
      ], 'You must be 18 or older to use Rabbit Hole.'],
      ['use', 'Permitted use', 'Use Rabbit Hole to learn: explore sources, ask questions, practise and create learning material. Do not:', [
        'Open other people’s canvases, accounts or private material without their permission.',
        'Try to break, overload or get around the service’s security or credit limits.',
        'Upload or share material you have no right to use, or that is unlawful or abusive.',
        'Use Rabbit Hole to harass people or to infringe their rights.',
      ]],
      ['content', 'Your content and permissions', 'You keep ownership of what you add to Rabbit Hole and what you create in it.', 'So that Rabbit Hole can work, you give us permission to store, copy, process and display your content, and to send the parts a feature needs to the service providers listed in the <a href="/privacy#providers">Privacy Policy</a>. This permission is only for running, securing and improving Rabbit Hole for you, and it ends when your content is deleted, except as described below.', 'When you share a canvas by link, publish it to Explore or allow it to be embedded, you also let the people who can view it see it, and let signed-in viewers fork it: make their own editable copy, including the files its cards use. A fork belongs to the person who made it. Turning sharing off or deleting your canvas does not delete forks that already exist, so the permission you gave for those copies continues.', 'Only add and share material you have the right to use and share. Keep passwords, confidential third-party information and restricted content out of your sources.'],
      ['sharing', 'Sharing and forks', 'Canvases are private until you share them. A share link lets people view a canvas read-only; publishing to Explore makes it public under your @handle.', [
        'Anyone signed in who can view a shared or published canvas can fork their own editable copy, including the files its cards use.',
        'A fork belongs to the person who made it.',
        'Turning sharing off or unpublishing stops new access but does not delete forks that already exist.',
      ], 'Share and publish only material you are allowed to share. The <a href="/privacy#sharing">Privacy Policy</a> lists exactly what viewers can see.'],
      ['ai', 'AI limitations', 'AI-generated explanations, answers, marks and images can be incomplete or wrong. Generated cards list the sources they drew on: check important claims against them, and use your own judgment before relying on what you learn.', 'Rabbit Hole is a learning aid. Generated material is not a guarantee of accuracy.'],
      ['credits', 'Credits and payments', 'Early access is free and needs no credit card.', [
        'Every account receives 2,500 AI credits each month, renewed at the start of each month (UTC).',
        'AI work uses credits: Chat and Tutor answers, generated material, and changes made by AI, such as editing an explanation with /explain or editing an image with Ctrl+K.',
        'Reading, checking your practice answers and editing a canvas yourself (typing, moving and arranging cards) are free.',
        'Larger generations show a review card first; nothing runs until you press Generate.',
        'Without enough credits, a request is refused before any AI runs.',
      ], 'Your balance and renewal time are in Settings &gt; AI usage.', 'Credits cannot be bought yet. The Buy credits option only shows “Credit purchases are coming soon.” and takes no payment. The paid plans on the <a href="/pricing">Pricing</a> page are planned, not available.'],
      ['closure', 'Suspension and closure', 'We may limit, suspend or close access to Rabbit Hole, or remove content, if it is used in a way that breaks these terms, puts other people or the service at risk, or if the law requires it. Where we can, we will tell you by email and explain why, and you can reply to ask us to reconsider.', `You can stop using Rabbit Hole at any time. Log out ends your sessions on every device. Account deletion is not yet available in Settings: to close your account, email ${mail} and we will delete it manually.`, 'Canvas owners can remove comments on their canvases and block people from commenting there.'],
      ['contact', 'Contact and changes', `For questions about these terms, email ${mail}, or write to ${operator.replace(', an individual, at', ',')}.`, 'When the terms change, we will update this page and its effective date.'],
    ],
  },
};

function documentPage(doc) {
  document.title = `${doc.title} | Rabbit Hole`;
  main.innerHTML = `<header class="legal-header"><p class="support-eyebrow">Rabbit Hole / ${route === '/privacy' ? 'Privacy' : 'Terms'}</p><h1 class="support-title">${doc.title}</h1><p class="support-lead">${doc.intro}</p><p class="legal-effective">${effective}</p></header>
    <div class="legal-layout"><nav class="legal-contents" aria-label="On this page"><h2>On this page</h2><ol>${doc.sections.map(([id,title]) => `<li><a href="#${id}">${title}</a></li>`).join('')}</ol></nav>
    <article class="legal-copy">${doc.sections.map(([id,title,...blocks]) => `<section id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${title}</h2>${blocks.map(b => Array.isArray(b) ? `<ul>${b.map(item => `<li>${item}</li>`).join('')}</ul>` : `<p>${b}</p>`).join('')}</section>`).join('')}<p class="legal-note">Looking for something else? <a href="mailto:hello@digrabbithole.com">Say hello.</a></p></article></div>`;
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
