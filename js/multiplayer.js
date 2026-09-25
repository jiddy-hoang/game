// Kết nối nhiều người qua playhtml (playhtml.fun): danh sách phòng, 4 bàn mỗi phòng, người trong phòng.
// Dữ liệu dùng chung (createPageData):
//   ott-rooms          { CODE: {createdAt, updatedAt, players} }   – danh sách phòng
//   ott-CODE-t0..t3    trạng thái 4 bàn cờ (mỗi bàn 2 ghế → tối đa 8 người chơi)
// Ai đang ở phòng nào được báo qua presence (kênh "ott"), không giới hạn số người xem.
(function(){
const TABLES = 4;
const ROOM_TTL = 24*3600*1000;   // phòng không hoạt động quá 1 ngày thì ẩn/xoá khỏi danh sách
const SEAT_GRACE = 15000;        // người ngồi rời phòng quá 15 giây thì giải phóng ghế

let PH = null, connected = false, lobbyCh = null;
let code = null, chans = [], cache = [];
let presences = new Map(), missingSince = {};
const listeners = [], roomListeners = [];

let myId = null;
try{ myId = localStorage.getItem("ott_id"); }catch(e){}
if(!myId){ myId = "u" + Math.random().toString(36).slice(2,10); try{ localStorage.setItem("ott_id", myId); }catch(e){} }
let myName = "Người chơi";

// playhtml chỉ có bản ES module: index.html import rồi gắn vào window.playhtmlLib.
function loadLib(){
  if(window.playhtmlLib) return Promise.resolve(window.playhtmlLib);
  return new Promise((ok, fail) => {
    window.addEventListener("playhtml-loaded", () => ok(window.playhtmlLib), {once:true});
    setTimeout(() => fail(new Error("không tải được thư viện playhtml")), 15000);
  });
}

async function connect(){
  PH = await loadLib();
  await new Promise((ok, fail) => {
    // Mạng chặn WebSocket thì playhtml chờ mãi, nên tự báo lỗi sau 20 giây.
    const timer = setTimeout(() => fail(new Error("quá thời gian kết nối tới api.playhtml.fun")), 20000);
    PH.init({ room: "ottv2-game", cursors: {enabled:false}, onError: () => fail(new Error("mất kết nối máy chủ playhtml")) })
      .then(() => PH.ready)
      .then(() => { clearTimeout(timer); ok(); }, fail);
  });
  connected = true;
  lobbyCh = PH.createPageData("ott-rooms", {});
  lobbyCh.onUpdate(() => roomListeners.forEach(f => f()));
  PH.presence.onPresenceChange("ott", m => {
    presences = m;
    roomListeners.forEach(f => f());
    if(code){ cleanupSeats(); emit(); }
  });
  publish();
  setInterval(() => { if(code) cleanupSeats(); }, 5000);
}

function publish(){
  if(!connected) return;
  try{ PH.presence.setMyPresence("ott", {room: code || "", id: myId, name: myName}); }catch(e){}
}
function presenceData(v){ return (v && (v.ott || v)) || {}; }
function idsIn(room){
  const s = new Set();
  for(const v of presences.values()){ const p = presenceData(v); if(p.room === room && p.id) s.add(p.id); }
  if(room === code) s.add(myId);
  return s;
}

function listRooms(){
  const now = Date.now(), data = connected ? lobbyCh.getData() : {};
  return Object.entries(data||{})
    .filter(([,r]) => r && now - (r.updatedAt||0) < ROOM_TTL)
    .map(([c, r]) => ({code: c, players: r.players||0, inRoom: idsIn(c).size, canDelete: canDelete(c)}))
    .sort((a,b) => (data[b.code].updatedAt||0) - (data[a.code].updatedAt||0))
    .slice(0, 20);
}
function roomExists(c){ return connected && !!(lobbyCh.getData()||{})[c]; }
function makeCode(){
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s;
  do{ s = ""; for(let i=0;i<5;i++) s += a[Math.floor(Math.random()*a.length)]; } while(roomExists(s));
  return s;
}
// create = true chỉ khi vừa tạo phòng; các lần sau chỉ cập nhật để phòng đã bị xoá không tự sống lại.
function touchRoom(create){
  const players = cache.reduce((n,g) => n + (g.bId?1:0) + (g.pId?1:0), 0), now = Date.now(), c = code;
  if(!c) return;
  lobbyCh.setData(d => {
    for(const k of Object.keys(d)) if(!d[k] || now - (d[k].updatedAt||0) > ROOM_TTL) delete d[k];
    if(d[c]){ d[c].updatedAt = now; d[c].players = players; }
    else if(create) d[c] = {createdAt: now, updatedAt: now, players, owner: myId};
  });
}

// Người tạo phòng xoá được bất cứ lúc nào; phòng không còn ai khác ở trong thì ai cũng xoá được
// (ghế còn tên người đã thoát không tính, vì không ai ở đó để giải phóng ghế).
function canDelete(c){
  const r = connected ? (lobbyCh.getData()||{})[c] : null;
  if(!r) return false;
  if(r.owner === myId) return true;
  return ![...idsIn(c)].some(id => id !== myId);
}
function deleteRoom(c){
  if(!canDelete(c)) throw new Error("chỉ người tạo phòng mới xoá được phòng đang có người");
  // Xoá dữ liệu 4 bàn rồi gỡ phòng khỏi danh sách. Người đang ở trong phòng sẽ thấy phòng biến mất và về sảnh.
  for(let t=0; t<TABLES; t++){
    if(c === code){ cache[t] = Rules.newGame(); chans[t].setData(cache[t]); }
    else { const ch = PH.createPageData(`ott-${c}-t${t}`, Rules.newGame()); ch.setData(Rules.newGame()); ch.destroy(); }
  }
  lobbyCh.setData(d => { delete d[c]; });
}

// roomCode = null → tạo phòng mới.
async function start(roomCode, name){
  if(!connected) throw new Error("chưa kết nối được máy chủ playhtml");
  myName = name;
  const isNew = !roomCode;
  code = isNew ? makeCode() : roomCode;
  if(!isNew && !roomExists(code)) { code = null; throw new Error("không tìm thấy phòng " + roomCode); }
  for(let t=0; t<TABLES; t++){
    const ch = PH.createPageData(`ott-${code}-t${t}`, Rules.newGame());
    chans.push(ch); cache.push(ch.getData());
    ch.onUpdate(g => { cache[t] = g; emit(); });
  }
  if(isNew) touchRoom(true);
  history.replaceState(null, "", "#r=" + code);
  publish();
}

// Ghế của người đã rời phòng quá SEAT_GRACE thì giải phóng.
// Chỉ 1 người làm việc này (người có id nhỏ nhất đang trong phòng) để tránh ghi chồng.
function cleanupSeats(){
  const here = idsIn(code), now = Date.now();
  if([...here].sort()[0] !== myId) return;
  for(let t=0; t<TABLES; t++){
    const g = cache[t], upd = {};
    for(const side of ["b","p"]){
      const id = g[side+"Id"]; if(!id) continue;
      if(here.has(id)){ delete missingSince[id]; continue; }
      missingSince[id] = missingSince[id] || now;
      if(now - missingSince[id] > SEAT_GRACE){ upd[side+"Id"] = ""; upd[side+"Name"] = ""; }
    }
    if(Object.keys(upd).length) setTable(t, Object.assign({}, g, upd));
  }
}

function emit(){ listeners.forEach(f => f()); }
function getTable(t){ return cache[t] || Rules.newGame(); }
function setTable(t, g){ cache[t] = g; chans[t].setData(g); touchRoom(); }

window.Net = {
  TABLES,
  connect, listRooms, start, canDelete, deleteRoom,
  // Phòng mình đang ở đã bị ai đó xoá khỏi danh sách.
  roomGone: () => !!code && !roomExists(code),
  isStarted: () => !!code,
  isConnected: () => connected,
  myId: () => myId,
  roomCode: () => code,
  inRoom: () => code ? idsIn(code).size : 0,
  getTable, setTable,
  tables: () => cache.slice(),
  onChange(f){ listeners.push(f); },
  onRoomsChange(f){ roomListeners.push(f); },
  // Rời phòng: báo presence rồi tải lại trang về sảnh.
  leave(){ code = null; publish(); setTimeout(() => { location.href = location.pathname; }, 300); }
};
})();
