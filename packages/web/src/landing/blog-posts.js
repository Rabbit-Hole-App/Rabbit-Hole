// Published blog posts. The cards and the story count both render from this array.
export const stories=[
  {
    // PLACEHOLDER post (owner 2026-11-13): the owner writes the real title, excerpt, category, author, read time and body about /explain.
    // Hero: GPT Image 2.5 Flare through scripts/landing-art.mjs blog-hero (prompt in design/art/explain-post-hero.prompt.md).
    slug:'explain-post',category:'Product',tag:'Placeholder',author:'Placeholder author',readTime:'1 min read',
    date:'2026-11-13',dateLabel:'13 Nov 2026',
    title:'Placeholder title for the /explain post',
    excerpt:'Placeholder excerpt: one or two sentences about /explain.',
    mark:'Explain.',motif:'explain',
    hero:'The White Rabbit on a tree stump pointing at a chalkboard that shows a curve and its tangent line, while Alice sits on a mushroom listening, the Caterpillar and the Mad Hatter watch and the Cheshire Cat grins from a bough, in a hand-tinted engraving of Wonderland.',
    body:`<p>Placeholder paragraph. The post about /explain goes here.</p>
      <p>Placeholder paragraph.</p>`
  },
  {
    // Owner-written, 2026-11-02 ("Rabbit Holes, Not Courses.html"; the file dates it only "November 2026").
    slug:'rabbit-holes-not-courses',category:'Behind the scenes',tag:'Founder notes',author:'From the founder',readTime:'5 min read',
    date:'2026-11-02',dateLabel:'2 Nov 2026',
    title:"We're building rabbit holes, not courses",
    excerpt:'For everyone who has twenty tabs open and a README half written.',
    mark:'Not courses.',motif:'courses',
    // Hero: GPT Image 2.5 Flare, the guide's prompt, attempt 4 of 4 (owner GO 2026-11-02), hand-tinted Wonderland scene, JPEG, fitted to 16:5.6 at 2x offline.
    hero:'The White Rabbit, Alice, the Mad Hatter, the Caterpillar and the Cheshire Cat in a hand-tinted engraving of Wonderland, walking through a garden with a tea-party table, playing-card soldiers and a castle behind them.',
    body:`<p><b>TL;DR:</b> Rabbit Hole was a personal tool that I built for myself to track what I learn. Knowledge is meant to be shared, which is why I am sharing this tool with you too.</p>
      <h2>The README I kept writing</h2>
      <p>For many years, I had a consistent way of learning new things. My sources of knowledge were classes, online courses on platforms like Udemy, Coursera, edX or YouTube, scientific papers on arXiv, a simple Google search or, more recently, just asking Claude. I always followed two steps:</p>
      <ol>
        <li>I wrote notes on my iPad.</li>
        <li>I converted those notes into a more structured format and detailed them in a README on GitHub that I would make public.</li>
      </ol>
      <p>The reason is that this helped me dig deeper into certain topics when I wrote my notes in the README and structured my thoughts alongside the project I would build and push on GitHub. Second, it allowed me to come back to a specific topic if I happened to forget some theory or concepts, which helped me revise. Third, sharing this extensive README was a way of sharing what I learned with the online community, and answering issues on GitHub deepened my understanding because I had to explain the steps in my project.</p>
      <p>The README mattered for three reasons:</p>
      <ul>
        <li>I would not forget the material, and I could go back to it.</li>
        <li>It was also a portfolio, proof of what I knew.</li>
        <li>Other people could learn from it.</li>
      </ul>
      <p>This also took a long time. Writing the notes, getting the pictures, the links and the code into a .md file, structuring it, reviewing it: all of this was its own project. Soon enough I realized where the whole system broke.</p>
      <h2>Two problems I kept hitting</h2>
      <ol>
        <li><b>Everything was scattered.</b> The knowledge sources lived on one website, the videos on YouTube, the blog posts in twenty tabs, the code on my laptop and then on GitHub. I put references in each README, but by the second post I could no longer trace which sources I had used for the first, or how they connected.</li>
        <li><b>Every topic branched.</b> One write-up of mine on stereo vision is a good example. The question was whether two cameras could replace a LiDAR. To answer it I had to explain the linear camera model, which meant the mapping from camera to image coordinates, which meant homogeneous coordinates, which meant intrinsic and extrinsic parameters, before I could get to stereo matching at all. The README ended up with a four-part plan and headings numbered 1.1.2. If I followed every branch, it would become too long to read. So I held back on depth to keep it readable, and when a branch really deserved its own write-up, I put it in a separate file. Do that for a few topics and the knowledge base is scattered again.</li>
      </ol>
      <figure>
        <pre>README
├── Problem Statement
├── Abstract
├── Dataset
├── Plan of Action
├── 1. Linear Camera Model
│   └── 1.1 Camera Coordinates to Image Coordinates (3D to 2D)
│       ├── 1.1.1 Image Plane to Image Sensor Mapping
│       └── 1.1.2 Homogeneous Coordinates
├── 2. Intrinsic and Extrinsic Parameters
├── 3. Simple Stereo
└── 4. Application of Simple Stereo</pre>
        <figcaption>The README's outline. Four parts, three levels deep, and I still cut branches.</figcaption>
      </figure>
      <blockquote>Go deeper, and the file gets too long. Split it, and the knowledge scatters.</blockquote>
      <h2>What I built instead</h2>
      <p>I tried ChatGPT and Claude first, and even their learning and study modes. They are great at answering questions, but the answer stays in the chat. There was nowhere to write my own notes next to it, the way I did in a README, nowhere to put a GIF or write some code to explain the theory. Their interfaces were built for asking, not for learning. I had to rethink what an interface for learning would look like.</p>
      <p>So I built a Rabbit Hole for myself. One place where I can learn a topic, write about it, decide how deep to go into each branch, and share the result. The course, the paper, the video and the code sit on one canvas, a single page that holds all of it, and an AI tutor asks me questions about them, so the next thing I learn depends on what I actually understood. Then I got an idea. If I can go from courses to README, then I can also go from README to courses.</p>
      <blockquote>Except it is not a course. There is no syllabus and no finish line; you stop when you stop being curious.</blockquote>
      <p>I built it first to learn about AI and ML topics. I started to notice the same problem everywhere I had ever learned anything:</p>
      <ul>
        <li><b>A LinkedIn post.</b> Someone posts a clear explanation of KV cache. You read it, like it, maybe comment "Great breakdown, thanks for sharing 🙌", and by the next day it is gone from your feed and from your memory. The person who wrote it never finds out what their readers wanted to understand next, or whether they understood it in the first place.</li>
        <li><b>A legacy codebase.</b> At Amazon it took me days, sometimes weeks, to understand one pipeline: how the code ran, and the science behind why it was built that way. Most of that understanding came one question at a time, from a senior developer who, on a good day, had five minutes for me. On other days I learned patience.</li>
        <li><b>At grad school.</b> I took classes where the slides had not changed in ten years and the TAs answered the same questions every term. What the professor could give us was some slides, a few Word documents of notes and a handful of Jupyter notebook exercises, the same three things for every student. This made learning boring. At the end of the course the slides were thrown away, and the learning stopped with them.</li>
      </ul>
      <p>In each case the knowledge existed. What was missing was a place where it could be questioned, taken deeper, and handed to the next person. Now each of them can be the start of a rabbit hole. The post becomes a canvas; whoever forks it can add to it and share it again. The repository gets a tutor that helps you get it working, understand the science behind it, or add to it, depending on your goal. The slides stay with you after the course, and you keep learning in them.</p>
      <p>Looking back, I have always wanted to know how things work around me: why a dead star collapses once it weighs more than 1.4 Suns, why a crowd will do what no one in it would do alone, why interest rates move the price of everything, why our bodies have an appendix at all. There is too much to learn and too little time, and most of what I know I learned from other people through different mediums. Now with Rabbit Hole you can also see how they learned it, and following someone else's path through a subject is often the fastest way to understand it yourself. Rabbit Hole is for every weirdo like me who wants to know about everything and never knew how.</p>
      <p><a href="https://digrabbithole.com">Rabbit Hole is in early access and free.</a></p>`
  }
];

export const href=story=>`/blog?post=${story.slug}`;
// story.hero is the hero image's alt text; the image itself is public/landing/blog/<slug>-hero.jpg (BLOG_IMAGE_GUIDE.md).
// A hero image fills the whole cover (owner 2026-11-02): no side margins, no label, no decorative marks.
export const cover=story=>story.hero
  ?`<div class="blog-cover blog-cover-${story.motif}"><div class="hero-wash"><img src="/landing/blog/${story.slug}-hero.jpg" alt="${story.hero}"></div></div>`
  :`<div class="blog-cover blog-cover-${story.motif}" aria-hidden="true"><i></i><i></i><span>${story.mark}</span><small>Rabbit Hole / Notes</small></div>`;
export const metadata=story=>`<time datetime="${story.date}">${story.dateLabel}</time><span>${story.readTime??'1 min read'}</span>`;
export const storyCountLabel=count=>`${count} ${count===1?'story':'stories'}`;
export const renderStoryCards=stories=>stories.map((story,index)=>`<li><article>
    <a class="card blog-card card-hover" href="${href(story)}" aria-labelledby="story-${story.slug}">
      ${cover(story)}<div class="blog-card-copy">
        <div class="blog-card-category"><span>${story.category}</span><span aria-hidden="true">${String(stories.length-index).padStart(2,'0')}</span></div>
        <h3 id="story-${story.slug}">${story.title}</h3><p>${story.excerpt}</p>
        <div class="blog-card-meta"><span class="blog-card-details">${metadata(story)}</span><span class="card-action" aria-hidden="true"><span class="card-action-label">Read story</span><span class="card-action-icon"><span class="card-action-arrow">↗</span></span></span></div>
      </div>
    </a></article></li>`).join('');
