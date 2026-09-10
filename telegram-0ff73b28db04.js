(() => {
  'use strict';
  const tg = window.Telegram?.WebApp;
  const app = document.getElementById('app'), canvas = document.getElementById('canvas');
  const editor = document.getElementById('editor'), input = document.getElementById('text-input');
  const submit = document.getElementById('submit'), queue = [];
  let state = {mode:''}, mode = '', lastWord = '', raf = 0, backScreen = '';
  let lastUsableHeight = window.innerHeight;
  let language = 'en';
  let composing = false, compositionEnded = -Infinity;
  const ru = {'YOUR FIRST DAY':'ПЕРВЫЙ РАБОЧИЙ ДЕНЬ','CHOOSE YOUR BOSS':'ВЫБЕРИТЕ БОССА','NAME YOUR OFFICE':'НАЗОВИТЕ СВОЙ ОФИС','Office name':'Название офиса','OPEN COMPANY':'ОТКРЫТЬ КОМПАНИЮ','INBOX RUSH':'СРОЧНАЯ ПОЧТА','TYPE THE WORD':'ВВЕДИТЕ СЛОВО','Type the word':'Введите слово','SEND':'ОТПРАВИТЬ','TIME':'ВРЕМЯ','WORDS':'СЛОВА','Back':'Назад','Choose first boss':'Первый босс','Choose second boss':'Второй босс','Rent is 50 coins each game week: seven new levels completed.':'Первая неделя оплачена. Далее аренда — 50 монет каждые семь дней.'};
  const locales=window.SpendTimeLocales;
  const t = text => locales[language]?.[text] || (language==='ru'?ru[text]:null) || text;
  function applyLanguage(code){
    language=Object.hasOwn(locales,code)?code:'en';
    document.documentElement.lang=language==='zh'?'zh-Hans':language;
    document.documentElement.dir=language==='ar'?'rtl':'ltr';
    input.lang=document.documentElement.lang;input.dir=language==='ar'?'rtl':'auto';
  }
  const number = value => Number.isFinite(Number(value)) ? Math.max(0,Number(value)) : 0;
  const setText = (id,text) => { const el=document.getElementById(id); if(el.textContent!==String(text)) el.textContent=String(text); };
  function layout() {
    raf = 0;
    const vv = window.visualViewport;
    const width = vv?.width || window.innerWidth;
    const offsetTop = vv?.offsetTop || 0, offsetLeft = vv?.offsetLeft || 0;
    // visualViewport follows the keyboard. Ignore transient bogus 0/1px Telegram heights.
    const heights = [vv?.height,window.innerHeight,tg?.viewportHeight].filter(v=>Number.isFinite(v)&&v>=160);
    let height = heights.length ? Math.min(...heights) : lastUsableHeight;
    if (height>=160) lastUsableHeight=height;
    const safe=tg?.safeAreaInset || {}, content=tg?.contentSafeAreaInset || {};
    const top=number(safe.top)+number(content.top), bottom=number(safe.bottom)+number(content.bottom);
    const left=number(safe.left)+number(content.left), right=number(safe.right)+number(content.right);
    const w=Math.max(180,width-left-right), h=Math.max(120,height-top-bottom);
    Object.assign(app.style,{left:`${offsetLeft+left}px`,top:`${offsetTop+top}px`,width:`${w}px`,height:`${h}px`});
    app.classList.toggle('compact',h<520);
    const scale=Math.min(w/384,h/720);
    // Match the backing canvas to physical pixels; Godot keeps logical input coordinates.
    const density=Math.min(window.devicePixelRatio||1,3);
    const pixelWidth=Math.round(384*scale*density),pixelHeight=Math.round(720*scale*density);
    if(canvas.width!==pixelWidth || canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;}
    Object.assign(canvas.style,{width:`${384*scale}px`,height:`${720*scale}px`,left:`${(w-384*scale)/2}px`,top:`${(h-720*scale)/2}px`});
    if(mode && document.activeElement===input) {
      const r=input.getBoundingClientRect(), bounds=app.getBoundingClientRect();
      if(r.bottom>bounds.bottom-60 || r.top<bounds.top) editor.scrollTop += r.bottom-(bounds.bottom-70);
    }
  }
  function scheduleLayout(){if(!raf)raf=requestAnimationFrame(layout);}
  window.addEventListener('resize',scheduleLayout);
  window.addEventListener('orientationchange',scheduleLayout);
  visualViewport?.addEventListener('resize',scheduleLayout);
  visualViewport?.addEventListener('scroll',scheduleLayout);
  input.addEventListener('focus',scheduleLayout); input.addEventListener('blur',scheduleLayout);
  input.addEventListener('input',()=>{submit.disabled=!input.value.trim();});
  input.addEventListener('compositionstart',()=>{composing=true;});
  input.addEventListener('compositionend',()=>{composing=false;compositionEnded=performance.now();});
  // Stop engine listeners seeing physical keys while a native text field owns the keyboard.
  for(const name of ['keydown','keyup','keypress']) input.addEventListener(name,event=>event.stopPropagation());
  document.getElementById('text-form').addEventListener('submit',event=>{
    event.preventDefault(); if(composing || performance.now()-compositionEnded<100 || !input.value.trim() || !mode) return;
    queue.push({action:'submit',value:input.value.normalize('NFC')});
    if(mode==='typing') input.focus({preventScroll:true});
  });
  submit.addEventListener('pointerdown',event=>event.preventDefault());
  document.getElementById('back').addEventListener('click',()=>{input.blur();queue.push({action:'back'});});
  for(const button of document.querySelectorAll('[data-boss]')) {
    button.addEventListener('pointerdown',event=>event.preventDefault());
    button.addEventListener('click',()=>queue.push({action:'boss',value:Number(button.dataset.boss)}));
  }
  const image = new Image();
  image.onload=()=>{
    for(const button of document.querySelectorAll('[data-boss]')) {
      const temp=document.createElement('canvas');temp.width=141;temp.height=230;
      const ctx=temp.getContext('2d',{willReadFrequently:true});
      const second=button.dataset.boss==='1';
      ctx.drawImage(image,second?1000:702,386,second?124:141,230,0,0,141,230);
      const pixels=ctx.getImageData(0,0,141,230);
      for(let i=0;i<pixels.data.length;i+=4){if(Math.min(pixels.data[i],pixels.data[i+2])-pixels.data[i+1]>35)pixels.data[i+3]=0;}
      ctx.putImageData(pixels,0,0);button.querySelector('canvas').getContext('2d').drawImage(temp,0,0,48,70);
    }
  }; image.src='office-atlas-key.png?v=0ff73b28db04';
  function update(serialized) {
    state=JSON.parse(serialized);
    const languageChanged=language!==state.language;
    applyLanguage(state.language);
    if(mode!==state.mode || languageChanged){
      mode=state.mode; editor.hidden=!mode;canvas.style.visibility=mode?'hidden':'visible';editor.scrollTop=0;
      if(mode){
        const naming=mode==='name';input.value=naming?state.name:'';
        input.maxLength=naming?18:24;input.placeholder=t(naming?'Office name':'Type the word');
        input.enterKeyHint=naming?'go':'send';
        document.getElementById('boss-choice').hidden=!naming;
        document.getElementById('typing-task').hidden=naming;
        document.getElementById('rent-help').hidden=!naming;
        setText('editor-title',t(naming?'YOUR FIRST DAY':'INBOX RUSH'));
        setText('input-label',t(naming?'NAME YOUR OFFICE':'TYPE THE WORD'));
        setText('submit',t(naming?'OPEN COMPANY':'SEND'));lastWord=state.wordIndex;
        document.querySelector('#boss-choice p').textContent=t('CHOOSE YOUR BOSS');
        document.querySelector('#typing-task .stats span:first-child').firstChild.textContent=t('TIME')+' ';
        document.querySelector('#typing-task .stats span:last-child').firstChild.textContent=t('WORDS')+' ';
        setText('rent-help',t('Rent is 50 coins each game week: seven new levels completed.'));
        document.getElementById('back').setAttribute('aria-label',t('Back'));
        for(const button of document.querySelectorAll('[data-boss]'))button.setAttribute('aria-label',t(button.dataset.boss==='0'?'Choose first boss':'Choose second boss'));
        // A real tap on this visible field opens iOS's keyboard. No delayed autofocus.
      }else{input.blur();tg?.hideKeyboard?.();}
      scheduleLayout();
    }
    if(mode==='typing') {
      if(lastWord!==state.wordIndex){input.value='';lastWord=state.wordIndex;}
      setText('word',state.word);setText('seconds',state.seconds);setText('correct',state.correct);
    }
    setText('input-notice',state.notice||'');submit.disabled=!input.value.trim();
    for(const button of document.querySelectorAll('[data-boss]'))button.setAttribute('aria-pressed',String(Number(button.dataset.boss)===state.boss));
    if(tg?.BackButton && backScreen!==state.screen){backScreen=state.screen;if(state.screen==='menu')tg.BackButton.hide();else tg.BackButton.show();}
  }
  // Local-only game: the Telegram id scopes saves on shared devices; it is not authentication.
  const user=tg?.initDataUnsafe?.user?.id || 'browser';
  const key=`spend-time:v1:${user}`;
  try { applyLanguage(JSON.parse(localStorage.getItem(key)||'{}').language); } catch { applyLanguage('en'); }
  setText('load-status',t('LOADING YOUR OFFICE…'));
  setText('retry',t('RETRY'));
  window.spendTimeText=t;
  window.SpendTime={update,drain:()=>JSON.stringify(queue.splice(0)),
    loadProfile(slot){try{return localStorage.getItem(key+(slot?':backup':''))||'';}catch{return '';}},
    saveProfile(serialized){try{const old=localStorage.getItem(key);if(old)localStorage.setItem(key+':backup',old);localStorage.setItem(key,serialized);return true;}catch{return false;}},
    ready(){tg?.ready?.();scheduleLayout();}
  };
  if(tg){
    tg.ready();tg.expand();
    tg.setHeaderColor?.('#cec4ab');tg.setBackgroundColor?.('#cec4ab');
    if(tg.isVersionAtLeast?.('7.7'))tg.disableVerticalSwipes();
    for(const event of ['viewportChanged','safeAreaChanged','contentSafeAreaChanged','fullscreenChanged'])tg.onEvent(event,scheduleLayout);
    tg.BackButton?.onClick(()=>{input.blur();queue.push({action:'back'});});
  }
  scheduleLayout();
})();

