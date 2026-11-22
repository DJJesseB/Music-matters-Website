// Lightweight, browser-local campaign planner. Publishing remains manual.
export function socialMediaUI({app,head,esc,message}) {
  const key='djjesseb.social-media.posts.v1';
  function read(){try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data:[];}catch{return [];}}
  function save(items){localStorage.setItem(key,JSON.stringify(items));}
  function center(){
    const items=read().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
    app.innerHTML=head('PROMOTE THE MOMENTS','Social Media','Plan your Facebook and TikTok content, and keep track of what is ready to publish.')+`
      <section class="social-platforms">
        <div class="card"><span class="badge">FACEBOOK</span><h2>Reach local event planners</h2><p>Share wedding highlights, school dance announcements, testimonials, and availability updates.</p><a class="button secondary" href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer">Open Facebook ↗</a></div>
        <div class="card"><span class="badge purple">TIKTOK</span><h2>Show the energy</h2><p>Plan short performance clips, DJ setup tours, lighting transformations, and dance-floor moments.</p><a class="button secondary" href="https://www.tiktok.com/" target="_blank" rel="noopener noreferrer">Open TikTok ↗</a></div>
      </section>
      <section class="card social-planner"><div class="social-section-head"><div><h2>Content planner</h2><p>Save drafts and mark posts as published after posting on the platform.</p></div><span class="badge">${items.length} posts</span></div>
        <form id="social-post-form" class="social-form">
          <label>Platform<select name="platform" required><option>Facebook</option><option>TikTok</option><option>Both</option></select></label>
          <label>Planned date<input name="date" type="date" required></label>
          <label>Post idea or title<input name="title" maxlength="120" required placeholder="e.g. Wedding dance floor highlight"></label>
          <label class="social-wide">Caption / script<textarea name="caption" rows="4" placeholder="Write your post or video script here..."></textarea></label>
          <label class="social-wide">Media notes<input name="media" placeholder="Which photo or video will you use?"></label>
          <div class="social-wide"><button type="submit" class="button">Save post idea</button></div>
        </form>
        <div class="social-post-list">${items.length?items.map(item=>`<article class="social-post" data-id="${esc(item.id)}"><div><div class="social-post-meta"><span class="badge ${item.platform==='TikTok'?'purple':''}">${esc(item.platform)}</span><span>${esc(item.date||'No date')}</span><span class="badge">${item.published?'Published':'Draft'}</span></div><h3>${esc(item.title)}</h3>${item.caption?`<p>${esc(item.caption)}</p>`:''}${item.media?`<small>Media: ${esc(item.media)}</small>`:''}</div><div class="social-post-actions"><button type="button" class="secondary" data-action="copy">Copy caption</button><button type="button" class="secondary" data-action="toggle">${item.published?'Mark draft':'Mark published'}</button><button type="button" class="secondary" data-action="delete">Delete</button></div></article>`).join(''):'<p class="social-empty">No post ideas yet. Add your first campaign above.</p>'}</div>
      </section><p class="social-note">Drafts are stored only in this browser on this device. They are not synced to DJ Desk, Facebook, or TikTok. No posts are published automatically.</p>`;
    app.querySelector('#social-post-form').addEventListener('submit',event=>{
      event.preventDefault();const fields=new FormData(event.currentTarget);
      const post={id:(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`),platform:fields.get('platform'),date:fields.get('date'),title:String(fields.get('title')||'').trim(),caption:String(fields.get('caption')||'').trim(),media:String(fields.get('media')||'').trim(),published:false};
      if(!post.title||!post.date)return;
      try{save([...read(),post]);center();message('Social media draft saved on this device.');}catch{message('Could not save this draft in browser storage.',true);}
    });
    app.querySelectorAll('.social-post').forEach(row=>row.addEventListener('click',async event=>{
      const action=event.target.closest('button[data-action]')?.dataset.action;if(!action)return;
      const original=read(),item=original.find(post=>post.id===row.dataset.id);if(!item)return;
      if(action==='copy'){
        try{await navigator.clipboard.writeText(item.caption||item.title);message('Caption copied.');}catch{message('Clipboard access unavailable. Select and copy the caption manually.',true);}return;
      }
      if(action==='delete'&&!confirm(`Delete “${item.title}”?`))return;
      const next=action==='delete'?original.filter(post=>post.id!==item.id):original.map(post=>post.id===item.id?{...post,published:!post.published}:post);
      try{save(next);center();}catch{message('Could not update browser storage.',true);}
    }));
  }
  return {center};
}
