// Vẽ giao diện: danh sách bàn, bàn cờ, ghế ngồi, trạng thái, nhật ký nước đi.
// Chỉ đọc trạng thái từ App (main.js) và gọi lại các hàm xử lý trong App khi người dùng bấm.
(function(){
const R = Rules;
const $ = id => document.getElementById(id);

function esc(s){ return String(s||"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

let toastT;
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.remove("hidden"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.add("hidden"),3200); }

function showGame(){ $("lobby").classList.add("hidden"); $("game").classList.remove("hidden"); }

function renderRoomInfo(A){
  const online = A.mode==="online";
  $("share").classList.toggle("hidden", !online);
  if(!online){ $("viewers").textContent = ""; return; }
  const players = A.tables.reduce((n,g) => n + (g.bId?1:0) + (g.pId?1:0), 0);
  $("viewers").textContent = `👀 ${Net.inRoom()} người trong phòng · ${players}/8 người chơi`;
  $("shareLink").value = location.origin + location.pathname + "#r=" + Net.roomCode();
}

function renderTables(A){
  const box = $("tables");
  box.classList.toggle("hidden", A.mode!=="online");
  if(A.mode!=="online") return;
  box.innerHTML = "";
  A.tables.forEach((g, t) => {
    const b = document.createElement("button");
    b.className = "tbl" + (t===A.cur ? " on" : "");
    const st = g.winner ? `${R.SIDE_NAME[g.winner]} thắng` : (!g.bId || !g.pId) ? "Còn ghế trống" : `Lượt ${R.SIDE_NAME[g.turn]} · nước ${g.n}`;
    const mine = A.mySideAt(t) ? ' <span class="me">(bạn)</span>' : "";
    b.innerHTML = `<b>Bàn ${t+1}</b>${mine}<span class="vs">${esc(g.bName||"—")} vs ${esc(g.pName||"—")}</span><span class="st">${st}</span>`;
    b.appendChild(miniBoard(g));
    b.setAttribute("aria-label", `Bàn ${t+1}: ${g.bName||"ghế trống"} đấu ${g.pName||"ghế trống"}, ${st}. Bấm để xem lớn.`);
    b.onclick = () => A.pickTable(t);
    box.appendChild(b);
  });
}

// Bàn cờ thu nhỏ để xem cùng lúc mọi trận trong phòng (luôn để hàng 9 ở trên).
function miniBoard(g){
  const m = document.createElement("div");
  m.className = "mini";
  m.setAttribute("aria-hidden", "true");
  for(let r=8; r>=0; r--) for(let c=0; c<9; c++){
    const i = r*9+c, ch = g.board[i], d = document.createElement("span");
    d.className = "m" + ((r+c)%2===0 ? " dark" : "") + (i===g.lastFrom || i===g.lastTo ? " last" : "");
    if(ch!=="."){ const p = document.createElement("i"); p.className = R.sideOf(ch); p.textContent = R.EMO[R.typeOf(ch)]; d.appendChild(p); }
    m.appendChild(d);
  }
  return m;
}

function renderBoard(A, game){
  const flip = A.mySideAt(A.cur)==="p";
  const tgt = A.sel!==null ? R.targets(game.board, A.sel) : [];
  const canAct = A.canAct();
  const frag = document.createDocumentFragment();
  for(let vr=0; vr<9; vr++){
    const r = flip ? vr : 8-vr;
    const l = document.createElement("div"); l.className="lbl"; l.textContent = r+1; frag.appendChild(l);
    for(let vc=0; vc<9; vc++){
      const c = flip ? 8-vc : vc, i = r*9+c, ch = game.board[i];
      const d = document.createElement("button");
      d.className = "sq" + ((r+c)%2===0 ? " dark" : "");
      d.setAttribute("aria-label", R.sqName(i) + (ch!=="." ? ` ${R.SIDE_NAME[R.sideOf(ch)]} ${R.NAME[R.typeOf(ch)]}` : ""));
      if(i===R.GOAL.b) d.classList.add("goalB");
      if(i===R.GOAL.p) d.classList.add("goalP");
      if(i===game.lastFrom || i===game.lastTo) d.classList.add("last");
      if(i===A.sel) d.classList.add("sel");
      if(tgt.includes(i)){ d.classList.add("target"); if(ch!==".") d.classList.add("cap"); if(game.turn==="p") d.classList.add("pinkTurn"); }
      if(i===A.justTo) d.classList.add("just");
      if(ch!=="."){
        const p = document.createElement("span"); p.className = "pc " + R.sideOf(ch); p.textContent = R.EMO[R.typeOf(ch)];
        d.appendChild(p);
        if(canAct && R.sideOf(ch)===game.turn) d.classList.add("movable");
      }
      d.onclick = () => A.clickSq(i);
      frag.appendChild(d);
    }
  }
  frag.appendChild(document.createElement("div"));
  for(let vc=0; vc<9; vc++){ const l=document.createElement("div"); l.className="lbl"; l.textContent = R.COLS[flip?8-vc:vc]; frag.appendChild(l); }
  $("board").replaceChildren(frag);
  A.justTo = null;
}

function renderStatus(A, game){
  $("roomLabel").textContent = A.mode==="local" ? "2 người trên 1 máy" : `Phòng ${Net.roomCode()} · Bàn ${A.cur+1}`;
  const st = $("status");
  if(game.winner){
    st.innerHTML = `<div class="win" style="color:var(--${game.winner==="b"?"blue":"pink"})">${R.SIDE_NAME[game.winner]} thắng!</div><div class="note">${esc(game.reason)}</div>`;
    return;
  }
  let sub = "";
  if(A.mode==="online"){
    const me = A.mySideAt(A.cur);
    if(!game.bId || !game.pId) sub = "Đang chờ đủ 2 người ở bàn này. Gửi mã phòng cho bạn bè.";
    else if(me===game.turn) sub = "Tới lượt bạn. Chọn một quân để đi.";
    else if(me) sub = "Chờ đối thủ đi…";
    else sub = "Bạn đang xem bàn này.";
  } else sub = "Chọn một quân để đi.";
  st.innerHTML = `<div class="turn ${game.turn}">Lượt ${R.SIDE_NAME[game.turn]}</div><div class="note">${sub}</div>`;
}

function renderSeat(A, game, side){
  const el = $(side==="b"?"seatB":"seatP");
  const id = game[side+"Id"], name = game[side+"Name"], myId = A.myId();
  el.classList.toggle("active", !game.winner && game.turn===side);
  const nm = el.querySelector(".nm"), act = el.querySelector(".act"); act.innerHTML="";
  if(A.mode==="local"){ nm.textContent = `Bên ${R.SIDE_NAME[side]}`; }
  else if(id){
    nm.textContent = `${R.SIDE_NAME[side]}: ${name}` + (id===myId ? " (bạn)" : "");
    if(id===myId){ const b=document.createElement("button"); b.className="btn ghost"; b.style.padding="3px 10px"; b.textContent="Nhường ghế"; b.onclick=()=>A.leaveSeat(A.cur, side); act.appendChild(b); }
  } else {
    nm.textContent = `${R.SIDE_NAME[side]}: ghế trống`;
    if(!A.mySeat()){ const b=document.createElement("button"); b.className="btn "+(side==="b"?"blue":"pink"); b.style.padding="3px 10px"; b.textContent="Ngồi"; b.onclick=()=>A.takeSeat(side); act.appendChild(b); }
  }
  const c = R.counts(game.board, side);
  $(side==="b"?"cntB":"cntP").innerHTML = ["R","S","P"].map(k=>`<span class="cnt${c[k]?"":" zero"}" title="${R.NAME[k]}">${R.EMO[k]} ${c[k]}</span>`).join("");
}

function render(A){
  renderTables(A); renderRoomInfo(A);
  const game = A.tables[A.cur];
  if(!game){ $("board").innerHTML=""; $("status").innerHTML='<span class="note">Đang tải phòng…</span>'; return; }
  renderBoard(A, game);
  renderStatus(A, game);
  renderSeat(A, game, "b"); renderSeat(A, game, "p");
  const log = $("log"); log.innerHTML = (game.log||[]).map(t=>`<li>${esc(t)}</li>`).join("");
  log.scrollTop = log.scrollHeight;
  $("resetBtn").disabled = A.mode==="online" && !A.mySideAt(A.cur);
}

window.UI = {render, toast, showGame};
})();
