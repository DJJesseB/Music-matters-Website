export const speechGuideSubject='You’ve got the mic! A little wedding toast inspiration 🎤';
export const speechGuideText=`Hi, favorite people!

We’d love for you to give a toast at our wedding. You mean a lot to us, and having your voice be part of the celebration will make it even more special.

No pressure to become a professional public speaker overnight. A few heartfelt words, a good story, and a little preparation are all you need. Here’s a quick guide from DJ Jesse B to help you feel ready.

AIM FOR 2–3 MINUTES OF YOU BEING YOU

That’s roughly 300–400 words, depending on your pace and those happy pauses. Short speeches can make a big impact—and leave room for everyone else, dinner, and dancing!

Read yours aloud with a timer. If it runs long, keep your favorite story and trim the extra introductions and background.

A SIMPLE RECIPE FOR A GREAT TOAST

1. Introduce yourself. Tell everyone your name and how you know the couple. Even if half the room knows you, the other half will appreciate it.
2. Share one great story. Choose a short, kind story that shows what makes one or both of them special. Give enough context for everyone to enjoy it.
3. Bring it back to the couple. What do you love about them together? How do they support each other? If you’ve mostly known one person, make a point of warmly including their partner.
4. Offer a wish for their future. It can be funny, thoughtful, or wonderfully simple.
5. Invite everyone to raise a glass. Finish with something clear: “To a lifetime of adventures, laughter, and choosing each other. Cheers!”

KEEP THE LOVE. LEAVE THESE OUT.

Skip exes, private arguments, sexual stories, embarrassing secrets, and anything the couple would rather not hear in front of their grandparents—or their boss.

Avoid jokes that need a five-minute explanation, harsh roasts, and stories built around how much someone drank. A little playful teasing can be lovely; making someone uncomfortable isn’t the goal.

And please save surprise announcements, proposals, and major personal news for another day. This is the couple’s moment.

IT’S ABSOLUTELY OKAY TO GET EMOTIONAL

Happy tears are welcome. The crowd loves seeing how much you care.

If your voice catches, stop for a moment, breathe, smile, and take a sip of water. You don’t need to apologize. There’s no prize for getting through it without feeling anything.

You also don’t have to be hilarious. Sincere beats a forced punchline every time.

A LITTLE MICROPHONE MAGIC 🎤

• Hold the microphone a few inches from your mouth, slightly below it. DJ Jesse B will help you find the right position.
• Keep it near your mouth when you turn toward the couple. If your head moves and the microphone doesn’t, your words can disappear!
• Speak in your normal, clear voice. Let the sound system do the heavy lifting.
• Hold the handle, keep the grille uncovered, and please don’t tap or blow into the microphone.
• Stay in the spot the DJ recommends and avoid walking toward the speakers.
• Pause for laughter and applause. Give the room a moment before your next line.

If anything sounds off, pause and look toward Jesse. He’ll help.

NOTES ARE YOUR FRIEND

A printed page or a few large-print note cards are perfectly fine. If you use your phone, turn on Do Not Disturb, increase the text size, and have your speech open before you stand up.

Practice aloud a couple of times. You don’t need to memorize it—just get comfortable with your opening, your story, and your final toast. Water before the microphone is a solid plan; liquid courage is less reliable.

STUCK? GATHER YOUR THOUGHTS AND ASK CHATGPT

Start with a few notes: how you know the couple, one favorite memory, three things you love about them, and a wish for their future.

Then try:
“Help me turn these notes into a warm, natural wedding toast lasting about 2–3 minutes. Keep my voice, include one gentle joke, and don’t invent any stories or facts. End with a toast to both partners.”

Leave out private information, check every detail, and edit anything you wouldn’t naturally say. Use it to help shape your words—not replace your memories.

Most of all, remember: you were asked because you matter to us. We’re excited to hear what’s in your heart.

With love,
The happy couple

With a little microphone wisdom from DJ Jesse B — the right music, the right moment.`;
export function speechGuideMailto(recipients=''){
 const addresses=recipients.split(/[,;\n]+/).map(v=>v.trim()).filter(Boolean);
 if(addresses.length>30||addresses.some(v=>!/^[^\s@<>?,;&]+@[^\s@<>?,;&]+\.[^\s@<>?,;&]+$/.test(v)))throw Error('Enter valid email addresses separated by commas.');
 return 'mailto:?'+Object.entries({...(addresses.length?{bcc:addresses.join(',')}:{}),subject:speechGuideSubject,body:speechGuideText}).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
}
export function openSpeechGuide(trigger){
 const dialog=document.createElement('dialog');dialog.className='speech-guide-dialog';dialog.setAttribute('aria-labelledby','speech-guide-heading');
 dialog.innerHTML='<button type="button" class="secondary" data-close>Close ×</button><span class="badge purple">FOR YOUR WEDDING VIPs</span><h2 id="speech-guide-heading">You’ve got the mic! 🎤</h2><p>Share a little inspiration with the people giving your toasts. Review the letter below, then open an email draft for your VIPs.</p><article class="speech-guide-letter"></article><form><label>VIP email addresses (optional)<input name="recipients" type="text" placeholder="alex@example.com, sam@example.com" autocomplete="off"></label><p><small>Addresses are placed in BCC for privacy and are not saved. You can also add recipients in your email app.</small></p><div class="speech-guide-actions"><button type="submit">Open email draft ↗</button><button type="button" class="secondary" data-copy>Copy letter</button></div><p role="status" data-share-status>Your email app opens with the letter filled in. Review it and press Send there. If it does not open or the letter is incomplete, use Copy letter and paste it into your email.</p></form>';
 dialog.querySelector('article').textContent=speechGuideText;document.body.append(dialog);const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const status=dialog.querySelector('[data-share-status]');dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.querySelector('form').onsubmit=event=>{
  event.preventDefault();
  const recipients=dialog.querySelector('[name=recipients]');
  try{
   const draft=document.createElement('a');
   draft.href=speechGuideMailto(recipients.value);
   draft.target='_blank';
   draft.rel='noopener noreferrer';
   draft.hidden=true;
   dialog.append(draft);
   draft.click();
   draft.remove();
   status.textContent='Email draft requested. Review the recipients and letter in your email app, then press Send. Nothing has been sent by this planner.';
  }catch(error){
   status.textContent=error.message;
   recipients.focus();
  }
 };
 dialog.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(speechGuideSubject+'\n\n'+speechGuideText);status.textContent='Letter copied. Paste it into your email and send it to your VIPs.';}catch{const text=document.createElement('textarea');text.value=speechGuideText;text.readOnly=true;dialog.querySelector('form').append(text);text.select();status.textContent='Select and copy the letter below, then paste it into your email.';}};
 const onNavigate=()=>dialog.close();window.addEventListener('hashchange',onNavigate,{once:true});dialog.addEventListener('close',()=>{window.removeEventListener('hashchange',onNavigate);document.body.style.overflow=overflow;dialog.remove();if(trigger.isConnected)trigger.focus();},{once:true});dialog.showModal();
}
