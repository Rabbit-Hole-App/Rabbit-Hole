// Published blog posts. The cards and the story count both render from this array.
export const stories=[
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
  }
];

export const href=story=>`/blog?post=${story.slug}`;
export const cover=story=>`<div class="blog-cover blog-cover-${story.motif}" aria-hidden="true"><i></i><i></i><span>${story.mark}</span><small>Rabbit Hole / Notes</small></div>`;
export const metadata=story=>`<time datetime="${story.date}">${story.dateLabel}</time><span>1 min read</span>`;
export const storyCountLabel=count=>`${count} ${count===1?'story':'stories'}`;
export const renderStoryCards=stories=>stories.map((story,index)=>`<li><article>
    <a class="card blog-card card-hover" href="${href(story)}" aria-labelledby="story-${story.slug}">
      ${cover(story)}<div class="blog-card-copy">
        <div class="blog-card-category"><span>${story.category}</span><span aria-hidden="true">${String(index+1).padStart(2,'0')}</span></div>
        <h3 id="story-${story.slug}">${story.title}</h3><p>${story.excerpt}</p>
        <div class="blog-card-meta"><span class="blog-card-details">${metadata(story)}</span><span class="card-action" aria-hidden="true"><span class="card-action-label">Read story</span><span class="card-action-icon"><span class="card-action-arrow">↗</span></span></span></div>
      </div>
    </a></article></li>`).join('');
