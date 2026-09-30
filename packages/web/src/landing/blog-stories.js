import './blog-art.css';
import './blog-stories.css';

// Local sample content for the card-to-article prototype. No CMS or publishing flow.
const stories=[
  {
    slug:'a-page-that-teaches',category:'Behind the scenes',date:'2026-09-28',dateLabel:'28 Sep 2026',
    title:'Why a landing page should teach you something',
    excerpt:'A first impression can be the beginning of a question. Here is the thought behind ours.',
    mark:'Why?',motif:'question',
    body:`<p>A good first encounter leaves you with something to think about. For an adaptive learning platform, that might be a question you had not considered, or a new connection between two familiar ideas.</p>
      <p>Imagine arriving with a small curiosity: why does a shadow change shape? One useful explanation leads to light, perspective, and the way we make sense of space. The page becomes an invitation to keep looking.</p>
      <h2>Leave room for curiosity</h2>
      <p>That is the idea behind Rabbit Hole's unfolding pages and open-ended paths. The design should give a visitor room to explore while keeping the next step clear.</p>
      <blockquote>A little understanding can be the start of a much bigger question.</blockquote>
      <p>This sample story shows how a longer note from the team could sit alongside the experience: a clear title, a few ideas, and space to follow a thought.</p>`
  },
  {
    slug:'dithering-and-detail',category:'Design notes',date:'2026-09-25',dateLabel:'25 Sep 2026',
    title:'Dithering, and why low resolution is a choice',
    excerpt:'A few dots, a little texture, and enough space for your imagination to finish the picture.',
    mark:'Aa',motif:'dither',
    body:`<p>Look closely at an old printed illustration and the image starts to separate into marks. Step back, and those small marks become a whole picture again.</p>
      <p>We like that change of scale. It feels close to learning: sometimes you need the individual details, and sometimes you need enough distance to see how they belong together.</p>
      <h2>Texture with a purpose</h2>
      <p>For these sample pages, a restrained texture gives the interface a printed quality. The lettering stays crisp, the controls stay readable, and the surrounding artwork can feel a little less polished.</p>
      <blockquote>Keep the words clear. Let the margins have a little character.</blockquote>
      <p>The balance matters more than the effect. A visual choice earns its place when it helps the experience feel considered and leaves the content easy to read.</p>`
  },
  {
    slug:'what-we-mean-by-infinite',category:'Ideas',date:'2026-08-30',dateLabel:'30 Aug 2026',
    title:'What we mean by infinite',
    excerpt:'Every answer has edges. Follow one of them and another question begins to appear.',
    mark:'∞',motif:'infinite',
    body:`<p>“Knowledge is infinite” starts with a familiar feeling. You understand a little more about something, and suddenly you can see questions that were invisible before.</p>
      <p>A question about a tree can lead to roots, soil, seasons, or the way a forest shares space. Each direction offers a different kind of understanding.</p>
      <h2>Depth at your own pace</h2>
      <p>There is no need to follow every branch. Sometimes an overview is enough. Sometimes one detail keeps pulling your attention back, and that is the place to spend a little longer.</p>
      <blockquote>You get to choose which question comes next.</blockquote>
      <p>In this sample editorial, infinite means leaving that possibility open. A learning path can have a useful stopping point while still offering somewhere interesting to return.</p>`
  },
  {
    slug:'a-learning-path-of-your-own',category:'Learning',date:'2026-09-22',dateLabel:'22 Sep 2026',
    title:'A learning path should feel like your own',
    excerpt:'Start with what you know, linger where you need to, and take the next useful step.',
    mark:'A → ?',motif:'path',
    body:`<p>Two people can arrive at the same subject with very different starting points. One has seen the vocabulary before. The other has a practical example in mind and wants to understand what makes it work.</p>
      <p>A useful learning experience leaves room for both. It can offer an overview, an example, or a slower explanation without making every person follow exactly the same sequence.</p>
      <h2>Make the next step useful</h2>
      <p>Imagine learning about probability. You might begin with a coin, compare a few outcomes, then decide whether a diagram or an equation would help you go further.</p>
      <blockquote>The best next step depends on where you are standing.</blockquote>
      <p>This sample story explores the idea behind adaptive learning: a path that stays connected to a learner's questions, existing understanding, and reason for being there.</p>`
  },
  {
    slug:'from-reading-to-understanding',category:'Field notes',date:'2026-09-18',dateLabel:'18 Sep 2026',
    title:'From “I read it” to “I understand it”',
    excerpt:'Try explaining one idea in your own words. Notice which part makes you pause.',
    mark:'Oh!',motif:'understanding',
    body:`<p>Finishing a page can feel satisfying. Yet a new idea often becomes more interesting when you try to explain it without the original words in front of you.</p>
      <p>Take something small: an example from a paper, the purpose of a line of code, or a concept from a lesson. Describe what it does and why it matters to the question you started with.</p>
      <h2>Pay attention to the pause</h2>
      <p>If part of the explanation feels unclear, you have found a useful place to return. You might need a simpler example, a missing definition, or a connection to something you already know.</p>
      <blockquote>A good follow-up question is progress you can see.</blockquote>
      <p>This sample note is an invitation to make a little space after reading: one explanation, one example, and one question to carry into the next session.</p>`
  },
  {
    slug:'leave-a-trail-for-tomorrow',category:'Small practices',date:'2026-09-12',dateLabel:'12 Sep 2026',
    title:'Leave a trail for your future self',
    excerpt:'A useful note remembers where your thinking stopped, so tomorrow has somewhere to begin.',
    mark:'↳',motif:'trail',
    body:`<p>At the end of a learning session, try leaving a short note for the next one. What made sense? What still felt unfinished? Which source would you want to find again?</p>
      <p>The note does not need to capture everything. Its job is to make returning feel easy, especially when the subject has been out of mind for a few days.</p>
      <h2>Keep the thread visible</h2>
      <p>You could save a helpful passage, add a sentence in your own words, and write down the next question. Those three pieces give your future self a small map back into the subject.</p>
      <blockquote>Leave enough of a trail to pick up the thought again.</blockquote>
      <p>This sample story imagines a quieter part of the learning journey: revisiting what you have already found and deciding which thread is worth following next.</p>`
  }
];

const href=story=>`/blog?post=${story.slug}`;
const cover=story=>`<div class="blog-cover blog-cover-${story.motif}" aria-hidden="true"><i></i><i></i><span>${story.mark}</span><small>Rabbit Hole / Notes</small></div>`;
const metadata=story=>`<time datetime="${story.date}">${story.dateLabel}</time><span>1 min read</span>`;
const slug=new URLSearchParams(location.search).get('post');
const reader=document.getElementById('article');

if(slug!==null){
  const story=stories.find(story=>story.slug===slug);
  document.getElementById('blog').hidden=true;
  reader.hidden=false;
  const back='<a class="blog-back" href="/blog#stories"><span aria-hidden="true">←</span> Back to blog</a>';
  if(story){
    document.title=`${story.title} | Rabbit Hole`;
    reader.innerHTML=`${back}<header class="blog-post-heading">
      <p class="blog-post-kicker">${story.category} <span>Sample article</span></p>
      <h1>${story.title}</h1><p class="blog-post-deck">${story.excerpt}</p>
      <div class="blog-post-meta"><span>Rabbit Hole editorial</span>${metadata(story)}</div>
      </header>${cover(story)}<div class="blog-post-body">${story.body}</div>
      <div class="blog-post-end"><p>There is always another question.</p>${back}</div>`;
  }else{
    document.title='Story not found | Rabbit Hole';
    reader.innerHTML=`${back}<header class="blog-post-heading"><p class="blog-post-kicker">Rabbit Hole / Blog</p><h1>This page is still unwritten.</h1><p class="blog-post-deck">That sample story isn't here. Follow another thread from the blog.</p></header>`;
  }
}else{
  document.getElementById('blog-grid').innerHTML=stories.map((story,index)=>`<li><article>
    <a class="card blog-card card-hover" href="${href(story)}" aria-labelledby="story-${story.slug}">
      ${cover(story)}<div class="blog-card-copy">
        <div class="blog-card-category"><span>${story.category}</span><span aria-hidden="true">${String(index+1).padStart(2,'0')}</span></div>
        <h3 id="story-${story.slug}">${story.title}</h3><p>${story.excerpt}</p>
        <div class="blog-card-meta"><span class="blog-card-details">${metadata(story)}</span><span class="card-action" aria-hidden="true"><span class="card-action-label">Read story</span><span class="card-action-icon"><span class="card-action-arrow">↗</span></span></span></div>
      </div>
    </a></article></li>`).join('');
}
