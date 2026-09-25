// Khởi tạo trang và nối luật chơi (Rules), mạng (Net), giao diện (UI).
(function(){
const R = Rules;
const $ = id => document.getElementById(id);

function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function myName(){ return ($("nameIn").value.trim() || "Người chơi").slice(0,20); }

// Trạng thái phía máy này. tables = các bàn đang hiển thị (online: 4 bàn, local: 1 bàn).
const A = {
  mode: null /* 'local' | 'online' */, tables: [], cur: 0, sel: null, justTo: null,

  myId(){ return A.mode==="online" ? Net.myId() : ""; },
  mySideAt(t){
    const g = A.tables[t]; if(!g || A.mode!=="online") return null;
    const id = A.myId();
    return g.bId===id ? "b" : g.pId===id ? "p" : null;
  },
  mySeat(){
    for(let t=0; t<A.tables.length; t++){ const side = A.mySideAt(t); if(side) return {t, side}; }
    return null;
  },
  canAct(){
    const g = A.tables[A.cur];
    if(!g || g.winner) return false;
    if(A.mode==="local") return true;
    return !!(A.mySideAt(A.cur)===g.turn && g.bId && g.pId);
  },
  pickTable(t){ A.cur = t; A.sel = null; draw(); },
  takeSeat(side){
    if(A.mySeat()){ UI.toast("Bạn đang ngồi ở một bàn khác. Nhường ghế đó trước đã."); return; }
    const g = Net.getTable(A.cur);
    if(g[side+"Id"]){ UI.toast("Ghế này vừa có người ngồi."); return; }
    write(A.cur, Object.assign({}, g, {[side+"Id"]: A.myId(), [side+"Name"]: myName()}));
  },
  leaveSeat(t, side){
    write(t, Object.assign({}, Net.getTable(t), {[side+"Id"]: "", [side+"Name"]: ""}));
  },
  clickSq(i){
    const game = A.tables[A.cur];
    if(!A.canAct()){
      const me = A.mySideAt(A.cur);
      if(A.mode==="online" && game && !game.winner && me && me!==game.turn) UI.toast("Chưa tới lượt bạn.");
      return;
    }
    if(A.sel!==null && R.targets(game.board, A.sel).includes(i)){
      const from = A.sel; A.sel = null; A.justTo = i;
      write(A.cur, R.doMove(game, from, i)); return;
    }
    if(R.sideOf(game.board[i])===game.turn){
      A.sel = (A.sel===i) ? null : i;
      if(A.sel!==null && !R.targets(game.board, A.sel).length) UI.toast("Quân này đang bị chặn, không đi được.");
    } else A.sel = null;
    draw();
  }
};

function write(t, g){
  A.tables[t] = g;
  if(A.mode==="online") Net.setTable(t, g);
  draw();
}
function draw(){ UI.render(A); }

// Đồng bộ từ server về: nếu bàn đang xem có nước đi mới thì bỏ chọn và làm hiệu ứng.
function syncFromNet(){
  const fresh = Net.tables(), old = A.tables[A.cur], now = fresh[A.cur];
  if(old && now && old.n !== now.n){ A.sel = null; A.justTo = now.lastTo; }
  A.tables = fresh;
  draw();
}

async function goOnline(roomCode){
  lsSet("ott_name", myName());
  try{
    await Net.start(roomCode, myName());
  }catch(e){
    console.error(e);
    UI.toast("Không vào được phòng: " + (e && e.message ? e.message : "lỗi kết nối") + ".");
    return;
  }
  A.mode = "online"; A.cur = 0; A.sel = null; A.tables = Net.tables();
  Net.onChange(syncFromNet);
  UI.showGame(); draw();
}

function esc(s){ return String(s||"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function renderRooms(){
  const ul = $("roomList"), list = Net.listRooms(); ul.innerHTML = "";
  if(!list.length){ ul.innerHTML = '<li class="note">Chưa có phòng nào. Tạo phòng đầu tiên nhé.</li>'; return; }
  for(const r of list){
    const tag = r.players >= Net.TABLES*2 ? '<span class="tag">Đủ 8 người</span>' : '<span class="tag wait">Còn ghế</span>';
    const li = document.createElement("li");
    li.innerHTML = `<span class="code">${esc(r.code)}</span><span class="who">${r.players}/8 người chơi · ${r.inRoom} người trong phòng</span>${tag}`;
    const btn = document.createElement("button"); btn.className="btn ghost"; btn.style.padding="5px 12px"; btn.textContent="Vào";
    btn.onclick = () => goOnline(r.code); li.appendChild(btn);
    if(r.canDelete){
      const del = document.createElement("button"); del.className="btn ghost"; del.style.padding="5px 10px";
      del.textContent="Xoá"; del.title="Xoá phòng " + r.code; del.setAttribute("aria-label", "Xoá phòng " + r.code);
      del.onclick = () => removeRoom(r.code); li.appendChild(del);
    }
    ul.appendChild(li);
  }
}

function removeRoom(c){
  const inside = Net.roomCode() === c;
  if(!confirm(`Xoá phòng ${c}? Các ván đang chơi trong phòng sẽ mất${inside ? " và mọi người sẽ bị đưa về sảnh" : ""}.`)) return;
  try{ Net.deleteRoom(c); }catch(e){ UI.toast("Không xoá được: " + e.message + "."); return; }
  UI.toast("Đã xoá phòng " + c + ".");
  if(inside) Net.leave(); else renderRooms();
}

/* ---------- nút bấm ---------- */
$("nameIn").value = lsGet("ott_name") || "";
$("nameIn").addEventListener("change", e => lsSet("ott_name", e.target.value.trim()));

$("createBtn").onclick = () => goOnline(null);
$("joinBtn").onclick = () => {
  const c = $("codeIn").value.trim().toUpperCase();
  if(c.length !== 5){ UI.toast("Mã phòng gồm 5 ký tự."); return; }
  goOnline(c);
};
$("localBtn").onclick = () => {
  if(Net.isStarted()){ UI.toast("Bạn đang ở trong phòng online. Rời phòng trước đã."); return; }
  A.mode = "local"; A.tables = [R.newGame()]; A.cur = 0; A.sel = null;
  UI.showGame(); draw();
};
$("backBtn").onclick = () => {
  if(A.mode==="online"){
    const s = A.mySeat(); if(s) A.leaveSeat(s.t, s.side);
    Net.leave();   // Net.leave chờ một chút cho lệnh nhường ghế gửi đi rồi mới tải lại trang
    return;
  }
  A.mode = null; A.tables = [];
  $("game").classList.add("hidden"); $("lobby").classList.remove("hidden");
};
$("delRoomBtn").onclick = () => removeRoom(Net.roomCode());
$("resetBtn").onclick = () => {
  const g = A.tables[A.cur]; if(!g) return;
  if(A.mode==="online" && !A.mySideAt(A.cur)){ UI.toast("Chỉ người đang ngồi ở bàn này mới bắt đầu ván mới được."); return; }
  if(!g.winner && g.n>0 && !confirm("Bắt đầu lại ván mới?")) return;
  write(A.cur, R.newGame(R.seatsOf(g)));
};
$("copyBtn").onclick = async () => {
  const v = $("shareLink").value;
  try{ await navigator.clipboard.writeText(v); UI.toast("Đã chép link phòng."); }
  catch(e){ $("shareLink").select(); UI.toast("Bấm Ctrl+C để chép link."); }
};

// Kết nối máy chủ ngay khi mở trang để hiện danh sách phòng.
// Mở link có mã phòng (#r=CODE) thì vào thẳng phòng đó.
let kicked = false;
Net.onRoomsChange(() => {
  if(!Net.isStarted()){ renderRooms(); return; }
  if(Net.roomGone() && !kicked){
    kicked = true;
    UI.toast("Phòng " + Net.roomCode() + " đã bị xoá. Đang về sảnh…");
    setTimeout(Net.leave, 1500);
    return;
  }
  draw();
});
Net.connect().then(() => {
  $("netState").textContent = "Đã kết nối máy chủ. Tạo phòng hoặc vào phòng của bạn bè.";
  $("createBtn").disabled = $("joinBtn").disabled = false;
  renderRooms();
  const m = location.hash.match(/[#&]r=([A-Z0-9]{5})/i);
  if(m) goOnline(m[1].toUpperCase());
}).catch(e => {
  console.error(e);
  $("netState").textContent = "Không kết nối được máy chủ playhtml (" + (e && e.message ? e.message : "lỗi mạng") + ") – vẫn chơi được 2 người trên 1 máy.";
  $("roomList").innerHTML = '<li class="note">Chế độ nhiều người cần kết nối Internet.</li>';
});
})();
