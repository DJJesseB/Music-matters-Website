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
export function openSpeechGuide(trigger){
 const dialog=document.createElement('dialog');dialog.className='speech-guide-dialog';dialog.setAttribute('aria-labelledby','speech-guide-heading');
 dialog.innerHTML='<button type="button" class="secondary" data-close>Close ×</button><h2 id="speech-guide-heading">Share with your VIPs</h2><p>This letter helps the people giving toasts prepare a short, heartfelt wedding speech. It covers what to say, how long to speak, and how to use the microphone.</p><details><summary>View guide</summary><article class="speech-guide-letter"></article></details><div class="speech-guide-actions"><button type="button" data-copy>Copy letter</button></div><p>When you’re ready to share, copy the letter and paste it into a text, group chat, or email.</p><p role="status" data-share-status></p><textarea data-manual-copy aria-label="Speech guide letter" readonly hidden rows="6"></textarea>';
 dialog.querySelector('article').textContent=speechGuideText;document.body.append(dialog);const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const status=dialog.querySelector('[data-share-status]');dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 const letter=speechGuideSubject+'\n\n'+speechGuideText;
 const manualCopy=dialog.querySelector('[data-manual-copy]');
 dialog.querySelector('[data-copy]').onclick=async()=>{
  try{
   await navigator.clipboard.writeText(letter);
   manualCopy.hidden=true;
   status.textContent='Letter copied. Paste it into your message.';
  }catch{
   manualCopy.value=letter;
   manualCopy.hidden=false;
   manualCopy.focus();
   manualCopy.select();
   status.textContent='Copy the selected letter, then paste it into your message.';
  }
 };
 const onNavigate=()=>dialog.close();window.addEventListener('hashchange',onNavigate,{once:true});dialog.addEventListener('close',()=>{window.removeEventListener('hashchange',onNavigate);document.body.style.overflow=overflow;dialog.remove();if(trigger.isConnected)trigger.focus();},{once:true});dialog.showModal();
}
