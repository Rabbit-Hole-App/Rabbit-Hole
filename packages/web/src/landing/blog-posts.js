// Published blog posts. The cards and the story count both render from this array.
export const stories=[
  {
    // Owner-written, 2026-11-02 ("Rabbit Holes, Not Courses.html"; the file dates it only "November 2026").
    slug:'rabbit-holes-not-courses',category:'Behind the scenes',tag:'Founder notes',author:'From the founder',readTime:'5 min read',
    date:'2026-11-02',dateLabel:'2 Nov 2026',
    title:"We're building rabbit holes, not courses",
    excerpt:'For everyone who has twenty tabs open and a README half written.',
    mark:'Not courses.',motif:'courses',
    // ponytail: no hero image yet (generation is paid and waits for the owner's GO). Once
    // public/landing/blog/rabbit-holes-not-courses-hero.png exists, add the alt text from
    // src/landing/BLOG_IMAGE_GUIDE.md here as hero:'...'.
    body:`<p>Rabbit Hole started as a fix for how I learn. Not a product idea, a personal one. I was spending more time keeping track of what I had learned than learning it.</p>
      <h2>The README I kept writing</h2>
      <p>For years my way of learning anything was the same: start with a course on Coursera or Udemy, or with the slides from a class, then watch the hours of video with my iPad open and take notes. Pause to read blog posts and watch YouTube videos that explained the same thing a different way, and code along with the instructor or do the exercises afterwards. At the end, write a README on GitHub with everything I had learned.</p>
      <p>The README mattered for three reasons: I would not forget the material, and I could go back to it. It was a portfolio, proof of what I knew. And other people could learn from it.</p>
      <p>This also took a long time. Getting the pictures, the links and the code into a .md file, structuring it, reviewing it: all of this was its own project. Soon enough I realized where the whole system broke.</p>
      <h2>Two problems I kept hitting</h2>
      <ol>
        <li><b>Everything was scattered.</b> The course lived on one website, the videos on YouTube, the blog posts in twenty tabs, the code on my laptop and then on GitHub. I put references in each README, but by the second post I could no longer trace which sources I had used for the first, or how they connected.</li>
        <li><b>Every topic branched.</b> One write-up of mine on stereo vision is a good example. The question was whether two cameras could replace a LiDAR. To answer it I had to explain the linear camera model, which meant the mapping from camera to image coordinates, which meant homogeneous coordinates, which meant intrinsic and extrinsic parameters, before I could get to stereo matching at all. The README ended up with a four-part plan and headings numbered 1.1.2. If I followed every branch, it became too long to read. So I held back on depth to keep it readable, and when a branch really deserved its own write-up, I put it in a separate file. Do that for a few topics and the knowledge base is scattered again.</li>
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
      <p>A course could not fix either problem. The course was where I started; the problems came after it ended, when I tried to keep what I knew, go deeper into one part of it, and connect it to the next thing.</p>
      <blockquote>Go deeper, and the file gets too long. Split it, and the knowledge scatters.</blockquote>
      <h2>What we built instead</h2>
      <p>I tried ChatGPT and Claude first. They are great at answering questions, but the answer stays in the chat. There was nowhere to write my own notes next to it, the way I did in a README, nowhere to put a video beside a paper, nowhere to keep the code. Their interfaces were built for asking, not for learning. I had to rethink what an interface for learning would look like, and the answer was an infinite canvas.</p>
      <p>So I built Rabbit Hole for myself. One place where I can learn a topic, write about it, decide how deep to go into each branch, and share the result. The course, the paper, the video and the code sit on one canvas, a single page that holds all of it, and an AI tutor asks me questions about them, so the next thing I learn depends on what I actually understood. That stereo vision write-up keeps its shape here. Every heading in the outline above becomes its own rabbit hole, nested the way it was, with a path back to the question it came from, and nothing has to be cut to keep a file short.</p>
      <blockquote>It is not a course. There is no syllabus and no finish line; you stop when you stop being curious.</blockquote>
      <p>I built it first to learn about AI and ML topics, because that is what I was studying at the time, from Andrew Ng's course on Coursera. Then I noticed the same problem everywhere I had ever learned anything.</p>
      <ul>
        <li><b>A LinkedIn post.</b> Someone posts a clear explanation of KV cache. You read it, like it, maybe comment "Great breakdown, thanks for sharing 🙌", and by the next day it is gone from your feed and from your memory. The person who wrote it never finds out what their readers wanted to understand next, or whether they understood it in the first place.</li>
        <li><b>A legacy codebase.</b> At Microsoft it took me days, sometimes weeks, to understand one pipeline: how the code ran, and the science behind why it was built that way. Most of that understanding came one question at a time, from a senior developer who, on a good day, had five minutes for me. On the other days I learned patience.</li>
        <li><b>At grad school.</b> I took classes where the slides had not changed in ten years and the TAs answered the same questions every term. What the professor could give us was some slides, a few Word documents of notes and a handful of Jupyter notebook exercises, the same three things for every student. This made learning boring. At the end of the course the slides were thrown away, and the learning stopped with them.</li>
      </ul>
      <p>In each case the knowledge existed. What was missing was a place where it could be opened, questioned, taken deeper, and handed to the next person. Now each of them can be the start of a rabbit hole. The post becomes a canvas; whoever forks it can add to it and share it again. The repository gets a tutor that helps you get it working, understand the science behind it, or add to it, depending on your goal. The slides stay with you after the course, and you keep learning in them.</p>
      <p>Looking back, I have always wanted to know how things work: why a dead star collapses once it weighs more than 1.4 Suns, why a crowd will do what no one in it would do alone, why interest rates move the price of everything, why our bodies have an appendix at all. There is too much to learn and too little time, and most of what I know I learned from other people. Now you can also see how they learned it, and following someone else's path through a subject is often the fastest way to understand it yourself. Rabbit Hole is for every weirdo like me who wants to know about everything and never knew how.</p>
      <p><a href="https://digrabbithole.com">Rabbit Hole is in early access and free.</a></p>`
  },
  {
    slug:'a-page-that-teaches',category:'Behind the scenes',date:'2026-09-28',dateLabel:'28 Sep 2026',
    title:'Why a landing page should teach you something',
    excerpt:'A first impression can be the beginning of a question. Here is the thought behind ours.',
    mark:'Why?',motif:'question',
    body:`<p>A good first encounter leaves you with something to think about. For an adaptive learning platform, that might be a question you had not considered, or a new connection between two familiar ideas.</p>
      <p>Imagine arriving with a small curiosity: why does a shadow change shape? One useful explanation leads to light, perspective, and the way we make sense of space. The page becomes an invitation to keep looking.</p>
      <h2>Leave room for curiosity</h2>
      <p>That is the idea behind Rabbit Hole's unfolding pages and open-ended paths. The design should give a visitor room to explore while keeping the next step clear.</p>
      <blockquote>A little understanding can be the start of a much bigger question.</blockquote>`
  }
];

export const href=story=>`/blog?post=${story.slug}`;
// story.hero is the hero image's alt text; the image itself is public/landing/blog/<slug>-hero.png (BLOG_IMAGE_GUIDE.md).
export const cover=story=>story.hero
  ?`<div class="blog-cover blog-cover-${story.motif}"><i></i><i></i><div class="hero-wash"><img src="/landing/blog/${story.slug}-hero.png" alt="${story.hero}"></div><small aria-hidden="true">Rabbit Hole / Notes</small></div>`
  :`<div class="blog-cover blog-cover-${story.motif}" aria-hidden="true"><i></i><i></i><span>${story.mark}</span><small>Rabbit Hole / Notes</small></div>`;
export const metadata=story=>`<time datetime="${story.date}">${story.dateLabel}</time><span>${story.readTime??'1 min read'}</span>`;
export const storyCountLabel=count=>`${count} ${count===1?'story':'stories'}`;
export const renderStoryCards=stories=>stories.map((story,index)=>`<li><article>
    <a class="card blog-card card-hover" href="${href(story)}" aria-labelledby="story-${story.slug}">
      ${cover(story)}<div class="blog-card-copy">
        <div class="blog-card-category"><span>${story.category}</span><span aria-hidden="true">${String(index+1).padStart(2,'0')}</span></div>
        <h3 id="story-${story.slug}">${story.title}</h3><p>${story.excerpt}</p>
        <div class="blog-card-meta"><span class="blog-card-details">${metadata(story)}</span><span class="card-action" aria-hidden="true"><span class="card-action-label">Read story</span><span class="card-action-icon"><span class="card-action-arrow">↗</span></span></span></div>
      </div>
    </a></article></li>`).join('');
