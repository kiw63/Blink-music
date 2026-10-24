(function(){
'use strict';
const $=id=>document.getElementById(id);
const STORE='blink_music_local_v1';
const SESSION='blink_music_session_v1';
const DEVELOPER='https://t.me/Marvel_sh';
const STOREFRONTS=[['Indonesia','id'],['Amerika Serikat','us'],['Britania Raya','gb'],['Jepang','jp'],['Korea Selatan','kr'],['China','cn'],['Rusia','ru'],['India','in'],['Brasil','br'],['Prancis','fr'],['Jerman','de'],['Turki','tr'],['Thailand','th'],['Australia','au'],['Meksiko','mx']];
const AUDIUS_API='https://api.audius.co/v1';
const AUDIUS_APP='BlinkMusic';
const state={mode:'login',user:null,users:{},page:'home',query:'',tracks:[],allTracks:[],queue:[],queueIndex:-1,playing:false,busy:false,homeLoaded:false,activeStore:'global',favorites:[],savedTracks:[],playlists:[],history:[],lastToast:null,currentTrack:null,recommendations:{trending:[],viral:[],newReleases:[],world:[],instrumental:[],throwbacks:[]}};
const audio=$('audio');
let toastTimer=0;
let searchAbort=0;
let headerSearchTimer=0;
let lyricRequestId=0;
let lyricLines=[];
let lastLyricIndex=-1;
const lyricsCache=new Map();

function safeParse(v,fb){
  try{return v?JSON.parse(v):fb}catch(_){return fb}
}
function loadStore(){
  try{
    const s=safeParse(localStorage.getItem(STORE),{users:{}});
    state.users=s.users&&typeof s.users==='object'?s.users:{};
  }catch(_){state.users={};}
}
function persist(){
  try{
    localStorage.setItem(STORE,JSON.stringify({users:state.users}));
    return true;
  }catch(e){
    notify('Penyimpanan browser tidak tersedia. Data hanya bertahan selama halaman ini terbuka.');
    return false;
  }
}
function userData(){
  if(!state.user)return {favorites:[],savedTracks:[],playlists:[],history:[]};
  return state.users[state.user]||{favorites:[],savedTracks:[],playlists:[],history:[]};
}
function saveUserData(){
  if(!state.user)return;
  const d=userData();
  d.favorites=state.favorites;
  d.savedTracks=state.savedTracks;
  d.playlists=state.playlists;
  d.history=state.history;
  state.users[state.user]=d;
  persist();
}
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function notify(msg){
  const t=$('toast');
  t.textContent=msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.add('hidden'),3300);
}
function setAuthMode(mode){
  state.mode=mode;
  $('tabLogin').classList.toggle('active',mode==='login');
  $('tabRegister').classList.toggle('active',mode==='register');
  $('authTitle').textContent=mode==='login'?'Selamat datang.':'Buat akun Blink.';
  $('authSubtitle').textContent=mode==='login'?'Masuk untuk membuka perpustakaan musikmu.':'Mulai simpan lagu favorit di perangkat ini.';
  $('authSubmit').textContent=mode==='login'?'Masuk ke Blink →':'Buat akun →';
  $('emailField').classList.toggle('hidden',mode==='login');
  $('password').autocomplete=mode==='login'?'current-password':'new-password';
}
async function hashPassword(p){
  if(window.crypto&&crypto.subtle){
    const bytes=new TextEncoder().encode(p);
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  return 'local-'+p;
}
$('tabLogin').addEventListener('click',()=>setAuthMode('login'));
$('tabRegister').addEventListener('click',()=>setAuthMode('register'));

$('authForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const name=$('username').value.trim().toLowerCase();
  const pass=$('password').value;
  const email=$('email').value.trim();

  if(!/^[a-z0-9_.-]{3,24}$/.test(name)){
    notify('Nama pengguna: 3–24 karakter, huruf/angka/._- saja.');
    return;
  }
  if(pass.length<6){
    notify('Kata sandi minimal 6 karakter.');
    return;
  }

  const hashed=await hashPassword(pass);
  if(state.mode==='register'){
    if(state.users[name]){
      notify('Nama pengguna sudah terdaftar di browser ini.');
      return;
    }
    state.users[name]={password:hashed,email,favorites:[],playlists:[],history:[]};
    persist();
    state.user=name;
    openApp();
    notify('Akun lokal dibuat. Selamat datang!');
  }else{
    const u=state.users[name];
    if(!u||u.password!==hashed){
      notify('Nama pengguna atau kata sandi tidak cocok di perangkat ini.');
      return;
    }
    state.user=name;
    openApp();
    notify('Berhasil masuk.');
  }
});

function openApp(){
  try{localStorage.setItem(SESSION,state.user)}catch(_){}
  const d=userData();
  state.favorites=Array.isArray(d.favorites)?d.favorites:[];
  state.savedTracks=Array.isArray(d.savedTracks)?d.savedTracks:[];
  state.playlists=Array.isArray(d.playlists)?d.playlists:[];
  state.history=Array.isArray(d.history)?d.history:[];
  $('auth').classList.add('hidden');
  $('application').classList.remove('hidden');
  $('profileButton').textContent=state.user.slice(0,1).toUpperCase();
  $('player').classList.add('hidden');
  $('player').classList.remove('is-visible');
  renderPage('home');
  if(!state.homeLoaded)loadHome();
}
function logout(){
  try{localStorage.removeItem(SESSION)}catch(_){}
  state.user=null;
  state.favorites=[];
  state.playlists=[];
  state.history=[];
  audio.pause();
  state.playing=false;
  $('application').classList.add('hidden');
  $('player').classList.add('hidden');
  $('auth').classList.remove('hidden');
  $('username').value='';
  $('password').value='';
  setAuthMode('login');
}
$('profileButton').addEventListener('click',()=>showModal(
  `<div class="modal"><h2>Profil Blink</h2><p class="muted">Masuk sebagai <strong>${esc(state.user)}</strong>.</p><p class="note">Data profil dan playlist tersimpan pada browser ini saja. Untuk sinkron HP–laptop diperlukan backend akun.</p><div class="modal-actions"><button class="btn secondary" id="closeModal">Tutup</button><button class="btn" id="logoutNow">Keluar</button></div></div>`
));
function showModal(html){
  $('modalRoot').innerHTML=`<div class="modal-bg" id="modalBackdrop">${html}</div>`;
  $('modalBackdrop').addEventListener('click',e=>{
    if(e.target.id==='modalBackdrop')closeModal();
  });
  $('modalRoot').querySelectorAll('#closeModal').forEach(b=>b.addEventListener('click',closeModal));
  $('modalRoot').querySelectorAll('#logoutNow').forEach(b=>b.addEventListener('click',()=>{
    closeModal();
    logout();
  }));
}
function closeModal(){$('modalRoot').innerHTML=''}
function reportTelegram(){window.open(DEVELOPER,'_blank','noopener,noreferrer')}
$('reportButton').addEventListener('click',reportTelegram);
$('sideReport').addEventListener('click',reportTelegram);

function setPageActive(page){
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>renderPage(b.dataset.page)));

function runSearchFromInput(value){
  const q=String(value||'').trim();
  if(!q){
    notify('Ketik judul lagu, artis, atau album terlebih dahulu.');
    return;
  }
  clearTimeout(headerSearchTimer);
  state.query=q;
  $('searchInput').value=q;
  renderPage('search');
  const inline=$('searchInlineInput');
  if(inline)inline.value=q;
  searchSongs(q);
}
function clearShortSearch(q){
  state.query=q;
  state.tracks=[];
  state.busy=false;
  if(state.page!=='search')return;
  const status=$('searchStatus');
  const grid=$('resultsGrid');
  const fallback=$('fallbackLinks');
  const count=$('resultsCount');
  if(grid)grid.innerHTML='';
  if(fallback)fallback.innerHTML='';
  if(status){
    status.classList.remove('error');
    status.removeAttribute('aria-busy');
    status.textContent=q?'Ketik minimal 2 karakter untuk mencari.':'Ketik judul lagu, artis, atau album untuk mencari.';
  }
  if(count)count.textContent='Cari lintas katalog';
}
$('searchForm').addEventListener('submit',e=>{
  e.preventDefault();
  runSearchFromInput($('searchInput').value);
});
$('searchInput').addEventListener('input',()=>{
  clearTimeout(headerSearchTimer);
  const raw=$('searchInput').value;
  const q=raw.trim();
  searchAbort++;
  state.busy=false;
  const inline=$('searchInlineInput');
  if(inline)inline.value=raw;
  if(q.length<2){
    clearShortSearch(q);
    return;
  }
  headerSearchTimer=setTimeout(()=>{
    state.query=q;
    if(state.page!=='search')renderPage('search');
    const currentInline=$('searchInlineInput');
    if(currentInline)currentInline.value=raw;
    searchSongs(q);
  },500);
});
function routeSearch(q){runSearchFromInput(q)}

function renderPage(page){
  state.page=page;
  setPageActive(page);
  const main=$('mainContent');
  if(page==='home'){
    main.innerHTML=homeTemplate();
    renderHomeRecommendations();
  }else if(page==='search'){
    main.innerHTML=searchTemplate();
    $('searchInput').value=state.query;
    const inline=$('searchInlineInput');
    if(inline){
      inline.value=state.query;
      inline.addEventListener('input',()=>{
        clearTimeout(headerSearchTimer);
        const raw=inline.value;
        const q=raw.trim();
        $('searchInput').value=raw;
        searchAbort++;
        state.busy=false;
        if(q.length<2){
          clearShortSearch(q);
          return;
        }
        headerSearchTimer=setTimeout(()=>{
          state.query=q;
          $('searchInput').value=raw;
          searchSongs(q);
        },450);
      });
    }
    $('searchInlineForm').addEventListener('submit',e=>{
      e.preventDefault();
      const q=inline?inline.value:$('searchInput').value;
      runSearchFromInput(q);
    });
    if(state.tracks.length)renderTrackGrid('resultsGrid',state.tracks);
    else if(!state.busy)$('searchStatus').textContent='Ketik judul lagu, artis, atau album untuk mencari.';
  }else if(page==='favorites'){
    main.innerHTML=standardHead('Favorit','Lagu yang kamu simpan di perangkat ini.');
    const ids=new Set(state.favorites);
    const ts=dedupe(state.savedTracks.concat(state.allTracks,state.tracks)).filter(t=>ids.has(String(t.trackId)));
    if(ts.length)mountGrid(main,ts);
    else main.insertAdjacentHTML('beforeend',emptyTemplate('♡','Belum ada favorit','Tekan ♡ pada kartu lagu untuk menyimpannya.'));
  }else if(page==='playlists'){
    main.innerHTML=standardHead('Playlist','Buat nama playlist sendiri dan unggah foto sampul opsional.')+
      `<section class="playlist-create-panel"><div class="playlist-create-fields"><label class="field" for="newPlaylistName">Nama playlist<input id="newPlaylistName" maxlength="50" placeholder="Contoh: Lagu yang sering kuputar" autocomplete="off"></label><label class="field" for="newPlaylistPhoto">Foto sampul (opsional)<input id="newPlaylistPhoto" type="file" accept="image/*"><span class="note">Foto akan diperkecil otomatis sebelum disimpan.</span></label><div class="playlist-create-actions"><button class="btn yellow" id="makePlaylist" type="button">＋ Buat playlist</button><span class="note">Playlist tersimpan pada browser ini.</span></div></div></section><div id="playlistList"></div><div id="playlistDetail" class="hidden"></div>`;
    bindPlaylistPhoto();
    $('makePlaylist').addEventListener('click',createPlaylist);
    renderPlaylists();
  }
      }
  function standardHead(title,desc){
  return `<div class="page-head"><div><div class="eyebrow">BLINK MUSIC</div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div></div>`;
}
function homeTemplate(){
  return `<section class="hero-strip"><div><div class="eyebrow">BLINK MUSIC</div><h2>Musik yang kamu suka.</h2><p>Cari lagu dari judul, artis, atau album. Jelajahi hits, rilisan baru, musik dunia, instrumental, dan lagu lama.</p><button class="btn yellow" id="exploreNow" type="button">Cari musik</button></div></section>
  <section class="section"><div class="section-title"><h2>Hits & tren</h2><button id="refreshRecommendations" type="button">Muat ulang</button></div><div id="homeTrending" class="track-grid"></div></section>
  <section class="section"><div class="section-title"><h2>Viral & populer</h2></div><div id="homeViral" class="track-grid"></div></section>
  <section class="section"><div class="section-title"><h2>Rilisan terbaru</h2></div><div id="homeNew" class="track-grid"></div></section>
  <section class="section"><div class="section-title"><h2>Musik dari berbagai negara</h2></div><div id="homeWorld" class="track-grid"></div></section>
  <section class="section"><div class="section-title"><h2>Instrumental</h2></div><div id="homeInstrumental" class="track-grid"></div></section>
  <section class="section"><div class="section-title"><h2>Lagu lama & throwback</h2></div><div id="homeThrowbacks" class="track-grid"></div></section>`;
}
function searchTemplate(){
  return `${standardHead('Cari musik','Cari berdasarkan judul lagu, nama artis, atau nama album. Negara bukan filter pencarian.')}
  <form id="searchInlineForm" class="inline-search"><input id="searchInlineInput" type="search" placeholder="Ketik judul, artis, atau album..." autocomplete="off"><button class="btn yellow" type="submit">Cari</button></form>
  <div class="results-toolbar"><span id="resultsCount">Cari lintas katalog</span></div>
  <div id="searchStatus" class="status">Ketik judul lagu, artis, atau album untuk mencari.</div>
  <div id="resultsGrid" class="track-grid"></div><div id="fallbackLinks"></div>`;
}
function emptyTemplate(icon,title,desc){
  return `<div class="empty"><div class="big">${icon}</div><strong>${esc(title)}</strong><p>${esc(desc)}</p></div>`;
}
function populateStoreSelector(){
  const s=$('storeSelect');
  if(s){
    s.value=state.activeStore||'global';
    s.onchange=()=>{
      state.activeStore=s.value;
      if(state.query)searchSongs(state.query);
    };
  }
}
function shuffleCopy(list){
  const a=list.slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function paintHomeTrackGroup(id,items){
  const el=$(id);
  if(!el)return;
  const list=dedupe(items||[]).slice(0,8);
  if(!list.length){el.innerHTML='';return}
  renderTrackGrid(id,list);
}
function renderHomeRecommendations(){
  if(state.page!=='home')return;
  const r=state.recommendations||{};
  paintHomeTrackGroup('homeTrending',r.trending||[]);
  paintHomeTrackGroup('homeViral',r.viral||[]);
  paintHomeTrackGroup('homeNew',r.newReleases||[]);
  paintHomeTrackGroup('homeWorld',r.world||[]);
  paintHomeTrackGroup('homeInstrumental',r.instrumental||[]);
  paintHomeTrackGroup('homeThrowbacks',r.throwbacks||[]);
}
async function fetchAudiusCollection(path){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const response=await fetch(AUDIUS_API+path+(path.includes('?')?'&':'?')+'app_name='+AUDIUS_APP,{signal:controller.signal});
    if(!response.ok)throw new Error('Audius request failed');
    const data=await response.json();
    return Array.isArray(data.data)?data.data:[];
  }finally{clearTimeout(timer)}
}
function reconcileRecommendations(){
  const order=['trending','viral','newReleases','world','instrumental','throwbacks'];
  const seen=new Set();
  for(const key of order){
    const unique=[];
    for(const track of state.recommendations[key]||[]){
      const id=String(track.trackId);
      if(!id||seen.has(id))continue;
      seen.add(id);
      unique.push(track);
    }
    state.recommendations[key]=unique;
  }
}
function setHomeGroup(key,items){
  state.recommendations[key]=shuffleCopy(dedupe((state.recommendations[key]||[]).concat(items||[])));
  reconcileRecommendations();
  if(state.page==='home')renderHomeRecommendations();
}
function loadHome(){
  if(state.homeLoaded&&state.allTracks.length){
    renderHomeRecommendations();
    return;
  }
  state.homeLoaded=true;
  state.recommendations={trending:[],viral:[],newReleases:[],world:[],instrumental:[],throwbacks:[]};
  renderHomeRecommendations();
  const tasks=[
    fetchAudiusCollection('/tracks/trending?time=week&limit=25').then(xs=>setHomeGroup('trending',xs.map(normalizeAudiusTrack))),
    searchAudius('viral hits',20).then(xs=>setHomeGroup('viral',xs)),
    searchAudius('new release',20).then(xs=>setHomeGroup('newReleases',xs)),
    searchAudius('world music',20).then(xs=>setHomeGroup('world',xs)),
    searchAudius('instrumental',20).then(xs=>setHomeGroup('instrumental',xs)),
    searchAudius('classic hits',20).then(xs=>setHomeGroup('throwbacks',xs))
  ];
  Promise.allSettled(tasks).then(()=>{
    state.allTracks=dedupe(Object.values(state.recommendations).flat());
    if(state.page==='home')renderHomeRecommendations();
    if(!state.allTracks.length)notify('Katalog belum merespons. Periksa koneksi internet lalu coba lagi.');
  });
}
function requestStore(query,country){
  return new Promise((resolve,reject)=>{
    const callbackName='blinkJsonp_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const script=document.createElement('script');
    const timer=setTimeout(()=>{
      cleanup();
      reject(new Error('Catalog request timeout'));
    },7000);
    function cleanup(){
      clearTimeout(timer);
      try{delete window[callbackName]}catch(_){window[callbackName]=undefined}
      if(script.parentNode)script.parentNode.removeChild(script);
    }
    window[callbackName]=data=>{
      cleanup();
      if(data&&Array.isArray(data.results))resolve(data.results);
      else resolve([]);
    };
    script.onerror=()=>{
      cleanup();
      reject(new Error('Catalog request failed'));
    };
    const params=new URLSearchParams({
      term:query,
      country:country||'id',
      media:'music',
      entity:'song',
      limit:'25',
      callback:callbackName
    });
    script.src='https://itunes.apple.com/search?'+params.toString();
    document.head.appendChild(script);
  });
}
async function fetchCatalog(query,countries){
  const q=query.trim();
  if(!q)return[];
  const cs=countries||['id'];
  const tasks=cs.map(async country=>{
    const results=await requestStore(q,country);
    return results.map(x=>normalizeTrack(x,country));
  });
  const settled=await Promise.allSettled(tasks);
  return dedupe(settled.flatMap(x=>x.status==='fulfilled'?x.value:[]));
}
function normalizeTrack(x,country){
  return {
    trackId:x.trackId,
    trackName:x.trackName||'',
    artistName:x.artistName||'Artis tidak diketahui',
    collectionName:x.collectionName||'',
    artworkUrl100:secureUrl(x.artworkUrl100||''),
    previewUrl:secureUrl(x.previewUrl||''),
    trackViewUrl:secureUrl(x.trackViewUrl||''),
    trackTimeMillis:Number(x.trackTimeMillis||0),
    primaryGenreName:x.primaryGenreName||'Musik',
    releaseDate:x.releaseDate||'',
    country:country||'',
    source:'Apple/iTunes',
    streamUrl:'',
    fullPlayback:false
  };
}
function secureUrl(url){
  return String(url||'').replace(/^http:/i,'https:');
}
async function searchAudius(query,limit=30){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const url=AUDIUS_API+'/tracks/search?query='+encodeURIComponent(query)+'&limit='+limit+'&app_name='+AUDIUS_APP;
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok)throw new Error('Audius search failed');
    const data=await response.json();
    return (Array.isArray(data.data)?data.data:[]).map(normalizeAudiusTrack);
  }finally{clearTimeout(timer)}
}
function normalizeAudiusTrack(x){
  const id=x.id||x.track_id;
  const art=x.artwork&&(x.artwork['1000x1000']||x.artwork['480x480']||x.artwork['150x150'])||'';
  const permalink=x.permalink?(x.permalink.startsWith('http')?x.permalink:'https://audius.co'+x.permalink):'';
  return {
    trackId:'audius-'+id,
    audiusId:id,
    trackName:x.title||'',
    artistName:x.user&&x.user.name||'Artis tidak diketahui',
    collectionName:x.album_name||'',
    artworkUrl100:secureUrl(art),
    previewUrl:'',
    trackViewUrl:permalink,
    trackTimeMillis:Number(x.duration||0)*1000,
    primaryGenreName:x.genre||'Musik',
    releaseDate:x.release_date||x.created_at||'',
    country:'',
    source:'Audius',
    streamUrl:id?AUDIUS_API+'/tracks/'+encodeURIComponent(id)+'/stream?app_name='+AUDIUS_APP:'',
    fullPlayback:!!id
  };
}
function dedupe(list){
  const seen=new Set();
  return list.filter(x=>{
    const key=(String(x.trackName||'').trim().toLowerCase()+'|'+String(x.artistName||'').trim().toLowerCase());
    if(!x.trackId||seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
async function searchSongs(q){
  const id=++searchAbort;
  state.busy=true;
  state.query=q;
  state.tracks=[];
  const status=$('searchStatus');
  const grid=$('resultsGrid');
  if(!status||!grid){state.busy=false;return}
  status.classList.remove('error');
  status.setAttribute('aria-busy','true');
  status.innerHTML='<span class="spinner"></span>Mencari lagu…';
  grid.innerHTML='';
  const count=$('resultsCount');
  if(count)count.textContent='Sedang mencari…';
  try{
    const countries=state.activeStore==='global'?['id','us','gb','kr','jp','cn','ru','in','br','fr']: [state.activeStore];
    const [audius,apple]=await Promise.all([
      searchAudius(q,30).catch(()=>[]),
      fetchCatalog(q,countries).catch(()=>[])
    ]);
    if(id!==searchAbort)return;
    const results=dedupe(audius.concat(apple));
    state.tracks=results;
    state.allTracks=dedupe(state.allTracks.concat(results));
    state.busy=false;
    status.removeAttribute('aria-busy');
    if(count)count.textContent=results.length+' hasil';
    if(!results.length){
      status.classList.add('error');
      status.textContent='Tidak ada hasil dari katalog yang terhubung. Coba judul atau nama artis lain.';
      return;
    }
    status.textContent='Pencarian selesai. Ketersediaan pemutaran bergantung pada sumber lagu.';
    renderTrackGrid('resultsGrid',results);
  }catch(_){
    if(id!==searchAbort)return;
    state.busy=false;
    status.removeAttribute('aria-busy');
    status.classList.add('error');
    status.textContent='Pencarian gagal. Periksa koneksi internet dan coba lagi.';
  }
    }
  function renderTrackGrid(id,tracks){
  const node=$(id);
  if(!node)return;
  node.innerHTML='';
  if(!tracks.length)return;
  node.innerHTML=tracks.map((t,i)=>trackTemplate(t,i)).join('');
  node.querySelectorAll('[data-play-index]').forEach(button=>{
    button.addEventListener('click',()=>{
      const index=Number(button.dataset.playIndex);
      playTrack(tracks[index],tracks,index);
    });
  });
  node.querySelectorAll('[data-fav-index]').forEach(button=>{
    button.addEventListener('click',()=>{
      const track=tracks[Number(button.dataset.favIndex)];
      if(track)toggleFavorite(track.trackId,track);
    });
  });
  node.querySelectorAll('[data-add-index]').forEach(button=>{
    button.addEventListener('click',()=>{
      const track=tracks[Number(button.dataset.addIndex)];
      if(track)openAddToPlaylist(track);
    });
  });
}
function trackTemplate(t,i){
  const isFav=state.favorites.includes(String(t.trackId));
  const art=t.artworkUrl100
    ?`<img class="cover" loading="lazy" src="${esc(t.artworkUrl100)}" alt="Sampul ${esc(t.trackName)}">`
    :`<div class="cover cover-fallback">♫</div>`;
  const duration=fmt(Number(t.trackTimeMillis||0)/1000);
  const source=esc(t.source||'Katalog');
  return `<article class="track" data-track-id="${esc(t.trackId)}">
    <div class="cover-wrap">${art}</div>
    <div class="track-title">${esc(t.trackName||'Judul tidak tersedia')}</div>
    <div class="track-artist">${esc(t.artistName||'Artis tidak diketahui')}</div>
    <div class="track-meta"><span>${source}</span><span>${duration}</span></div>
    <div class="track-buttons">
      <button class="mini play" type="button" data-play-index="${i}">▶ Putar</button>
      <button class="mini fav ${isFav?'on':''}" type="button" data-fav-index="${i}" aria-label="Favorit">${isFav?'♥':'♡'}</button>
      <button class="mini" type="button" data-add-index="${i}" aria-label="Tambah ke playlist">＋</button>
    </div>
  </article>`;
}
function mountGrid(main,tracks){
  const div=document.createElement('div');
  div.className='track-grid';
  div.id='dynamicGrid';
  main.appendChild(div);
  renderTrackGrid('dynamicGrid',tracks);
}
function toggleFavorite(id,track){
  id=String(id);
  if(state.favorites.includes(id)){
    state.favorites=state.favorites.filter(x=>x!==id);
    state.savedTracks=state.savedTracks.filter(x=>String(x.trackId)!==id);
    notify('Dihapus dari favorit.');
  }else{
    state.favorites.push(id);
    if(track&&!state.savedTracks.some(x=>String(x.trackId)===id))state.savedTracks.push(track);
    notify('Ditambahkan ke favorit.');
  }
  saveUserData();
  if(state.page==='favorites')renderPage('favorites');
  else if(state.page==='search'&&state.tracks.length)renderTrackGrid('resultsGrid',state.tracks);
  else if(state.page==='home')renderHomeRecommendations();
  updateExpandedFavorite();
}
function playlistCoverInput(){
  return `<label class="field">Foto playlist (opsional)<input id="playlistPhoto" type="file" accept="image/*"><span class="note">Foto akan diperkecil otomatis agar hemat ruang.</span></label>`;
}
function readPlaylistImage(file){
  return new Promise((resolve,reject)=>{
    if(!file){resolve('');return}
    if(!file.type.startsWith('image/')){
      reject(new Error('Pilih file gambar.'));
      return;
    }
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Foto tidak dapat dibaca.'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('File gambar tidak valid.'));
      img.onload=()=>{
        const max=500;
        const scale=Math.min(1,max/Math.max(img.width,img.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',0.78));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function bindPlaylistPhoto(){
  const inp=$('playlistPhoto');
  if(!inp)return;
  inp.addEventListener('change',async()=>{
    const file=inp.files&&inp.files[0];
    if(!file)return;
    try{
      await readPlaylistImage(file);
      notify('Foto dipilih. Foto akan disimpan saat playlist dibuat.');
    }catch(e){notify(e.message||'Foto tidak dapat digunakan.')}
  });
}
function openAddToPlaylist(track){
  if(!state.playlists.length){
    showModal(`<div class="modal"><h2>Simpan lagu ke playlist</h2><p class="muted">Kamu belum punya playlist. Buat playlist terlebih dahulu.</p><div class="modal-actions"><button class="btn secondary" id="closeModal">Tutup</button><button class="btn yellow" id="makeFirstPlaylist" type="button">Buat playlist</button></div></div>`);
    const b=$('makeFirstPlaylist');
    if(b)b.addEventListener('click',()=>{
      closeModal();
      renderPage('playlists');
      $('newPlaylistName').focus();
    });
    return;
  }
  const options=state.playlists.map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join('');
  showModal(`<div class="modal"><h2>Tambah ke playlist</h2><p>${esc(track.trackName)} — ${esc(track.artistName)}</p><label class="field">Pilih playlist<select id="playlistChoice">${options}</select></label><div class="modal-actions"><button class="btn secondary" id="closeModal">Batal</button><button class="btn yellow" id="confirmAddTrack" type="button">Tambah lagu</button></div></div>`);
  $('confirmAddTrack').addEventListener('click',()=>{
    const index=Number($('playlistChoice').value);
    const playlist=state.playlists[index];
    if(!playlist)return;
    playlist.tracks=Array.isArray(playlist.tracks)?playlist.tracks:[];
    if(!playlist.tracks.some(x=>String(x.trackId)===String(track.trackId))){
      playlist.tracks.push(track);
      saveUserData();
      notify('Lagu ditambahkan ke playlist.');
    }else notify('Lagu ini sudah ada di playlist.');
    closeModal();
    renderPlaylists();
  });
}
function createPlaylistForTrack(track){
  showModal(`<div class="modal"><h2>Playlist baru</h2><div class="form-stack"><label class="field">Nama playlist<input id="playlistName" maxlength="50" placeholder="Nama playlist"></label>${playlistCoverInput()}</div><div class="modal-actions"><button class="btn secondary" id="closeModal">Batal</button><button class="btn yellow" id="savePlaylistForTrack" type="button">Buat playlist</button></div></div>`);
  bindPlaylistPhoto();
  $('savePlaylistForTrack').addEventListener('click',async()=>{
    const name=$('playlistName').value.trim();
    if(!name){notify('Isi nama playlist dahulu.');return}
    try{
      const photo=$('playlistPhoto').files[0];
      const cover=await readPlaylistImage(photo);
      const playlist={id:'pl-'+Date.now(),name,cover,tracks:[track],createdAt:Date.now()};
      state.playlists.push(playlist);
      saveUserData();
      closeModal();
      renderPlaylists();
      notify('Playlist dibuat dan lagu ditambahkan.');
    }catch(e){notify(e.message||'Playlist gagal dibuat.')}
  });
}
function renderPlaylists(){
  const root=$('playlistList');
  if(!root)return;
  if(!state.playlists.length){
    root.innerHTML=emptyTemplate('♫','Belum ada playlist','Buat playlist, beri nama, lalu unggah foto sampul jika mau.');
    return;
  }
  root.innerHTML=state.playlists.map((p,i)=>{
    const cover=p.cover
      ?`<img class="playlist-cover" src="${esc(p.cover)}" alt="Sampul ${esc(p.name)}">`
      :`<div class="playlist-cover cover-fallback">♫</div>`;
    const count=Array.isArray(p.tracks)?p.tracks.length:0;
    return `<article class="playlist-card">
      ${cover}
      <h3>${esc(p.name)}</h3>
      <p class="muted">${count} lagu</p>
      <div class="playlist-actions">
        <button class="btn cyan" data-plopen="${i}" type="button">Buka</button>
        <button class="btn white" data-plrename="${i}" type="button">Ubah nama</button>
        <button class="btn white" data-pldelete="${i}" type="button">Hapus</button>
      </div>
    </article>`;
  }).join('');
  root.querySelectorAll('[data-plopen]').forEach(b=>b.addEventListener('click',()=>{
    openPlaylistDetail(Number(b.dataset.plopen));
  }));
  root.querySelectorAll('[data-plrename]').forEach(b=>b.addEventListener('click',()=>{
    renamePlaylist(Number(b.dataset.plrename));
  }));
  root.querySelectorAll('[data-pldelete]').forEach(b=>b.addEventListener('click',()=>{
    deletePlaylist(Number(b.dataset.pldelete));
  }));
}
async function createPlaylist(){
  const nameInput=$('newPlaylistName');
  const photoInput=$('newPlaylistPhoto');
  const name=nameInput?nameInput.value.trim():'';
  if(!name){
    notify('Isi nama playlist dahulu.');
    if(nameInput)nameInput.focus();
    return;
  }
  try{
    const file=photoInput&&photoInput.files?photoInput.files[0]:null;
    const cover=await readPlaylistImage(file);
    state.playlists.push({id:'pl-'+Date.now(),name,cover,tracks:[],createdAt:Date.now()});
    saveUserData();
    if(nameInput)nameInput.value='';
    if(photoInput)photoInput.value='';
    renderPlaylists();
    notify('Playlist berhasil dibuat.');
  }catch(e){
    notify(e.message||'Playlist gagal dibuat.');
  }
}
function renamePlaylist(index){
  const p=state.playlists[index];
  if(!p)return;
  showModal(`<div class="modal"><h2>Ubah nama playlist</h2><label class="field">Nama baru<input id="renamePlaylistInput" maxlength="50" value="${esc(p.name)}"></label><div class="modal-actions"><button class="btn secondary" id="closeModal">Batal</button><button class="btn yellow" id="savePlaylistName" type="button">Simpan</button></div></div>`);
  $('savePlaylistName').addEventListener('click',()=>{
    const name=$('renamePlaylistInput').value.trim();
    if(!name){notify('Nama playlist tidak boleh kosong.');return}
    p.name=name;
    saveUserData();
    closeModal();
    renderPlaylists();
    notify('Nama playlist diperbarui.');
  });
}
function deletePlaylist(index){
  const p=state.playlists[index];
  if(!p)return;
  showModal(`<div class="modal"><h2>Hapus playlist?</h2><p>Playlist <strong>${esc(p.name)}</strong> akan dihapus dari browser ini.</p><div class="modal-actions"><button class="btn secondary" id="closeModal">Batal</button><button class="btn yellow" id="confirmDeletePlaylist" type="button">Hapus</button></div></div>`);
  $('confirmDeletePlaylist').addEventListener('click',()=>{
    state.playlists.splice(index,1);
    saveUserData();
    closeModal();
    renderPlaylists();
    notify('Playlist dihapus.');
  });
}
function openPlaylistDetail(index){
  const p=state.playlists[index];
  if(!p)return;
  const detail=$('playlistDetail');
  if(!detail)return;
  const tracks=Array.isArray(p.tracks)?p.tracks:[];
  detail.classList.remove('hidden');
  detail.innerHTML=`<div class="playlist-detail-head">${p.cover?`<img src="${esc(p.cover)}" alt="">`:'<div class="cover-fallback">♫</div>'}<div><h2>${esc(p.name)}</h2><p>${tracks.length} lagu dalam playlist ini</p><button class="btn yellow" id="playPlaylist" type="button">▶ Putar playlist</button></div></div><div id="playlistSongs"></div>`;
  const list=$('playlistSongs');
  if(!tracks.length){
    list.innerHTML=emptyTemplate('♫','Playlist masih kosong','Cari lagu lalu tekan tombol + untuk menambahkan lagu ke playlist ini.');
  }else{
    list.innerHTML=tracks.map((t,i)=>`<div class="playlist-row"><img src="${esc(t.artworkUrl100||'')}" alt=""><div class="row-info"><div class="row-title">${esc(t.trackName)}</div><div class="row-artist">${esc(t.artistName)}</div></div><button class="mini" data-play-pl="${i}" type="button">▶</button><button class="mini" data-remove-pl="${i}" type="button">Hapus</button></div>`).join('');
  }
  $('playPlaylist').addEventListener('click',()=>{
    if(!tracks.length){notify('Playlist masih kosong.');return}
    playTrack(tracks[0],tracks,0);
  });
  list.querySelectorAll('[data-play-pl]').forEach(b=>b.addEventListener('click',()=>{
    const i=Number(b.dataset.playPl);
    playTrack(tracks[i],tracks,i);
  }));
  list.querySelectorAll('[data-remove-pl]').forEach(b=>b.addEventListener('click',()=>{
    const i=Number(b.dataset.removePl);
    tracks.splice(i,1);
    p.tracks=tracks;
    saveUserData();
    openPlaylistDetail(index);
    renderPlaylists();
  }));
}
  
