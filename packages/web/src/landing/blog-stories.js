import './blog-art.css';
import './blog-stories.css';

import {stories,cover,metadata,storyCountLabel,renderStoryCards} from './blog-posts.js';

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
  document.getElementById('blog-grid').innerHTML=renderStoryCards(stories);
  document.getElementById('blog-count').textContent=storyCountLabel(stories.length);
}
