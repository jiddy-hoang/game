// Luật chơi OTTv2: bàn cờ, nước đi, ăn quân, điều kiện thắng.
// Không phụ thuộc giao diện hay mạng.
(function(){
const COLS = "ABCDEFGHI";
const EMO = {R:"✊", S:"✌️", P:"✋"};
const NAME = {R:"đấm", S:"kéo", P:"lá"};
const BEATS = {R:"S", S:"P", P:"R"};
const SIDE_NAME = {b:"Xanh", p:"Hồng"};
const GOAL = {b: idx("I9"), p: idx("A1")};

function idx(sq){ return (parseInt(sq.slice(1),10)-1)*9 + COLS.indexOf(sq[0]); }
function sqName(i){ return COLS[i%9] + (Math.floor(i/9)+1); }
function sideOf(ch){ return ch === "." ? null : (ch === ch.toUpperCase() ? "b" : "p"); }
function typeOf(ch){ return ch.toUpperCase(); }

function initBoard(){
  const b = Array(81).fill(".");
  const put = (s, v) => { b[idx(s)] = v; };
  // Xanh (chữ hoa) – góc dưới trái
  put("B5","P"); put("C5","S");
  put("B4","R"); put("C4","P"); put("D4","S");
  put("C3","R"); put("D3","P"); put("E3","S");
  put("D2","R"); put("E2","P");
  // Hồng (chữ thường) – đối xứng qua tâm
  put("H5","p"); put("G5","s");
  put("H6","r"); put("G6","p"); put("F6","s");
  put("G7","r"); put("F7","p"); put("E7","s");
  put("F8","r"); put("E8","p");
  return b.join("");
}

function targets(board, from){
  const me = board[from], side = sideOf(me); if(!side) return [];
  const r = Math.floor(from/9), c = from%9, out = [];
  for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++){
    if(!dr && !dc) continue;
    const nr=r+dr, nc=c+dc; if(nr<0||nr>8||nc<0||nc>8) continue;
    const to = nr*9+nc, t = board[to];
    if(t === ".") out.push(to);
    else if(sideOf(t) !== side && BEATS[typeOf(me)] === typeOf(t)) out.push(to);
  }
  return out;
}
function hasMove(board, side){
  for(let i=0;i<81;i++) if(sideOf(board[i])===side && targets(board,i).length) return true;
  return false;
}
function counts(board, side){
  const c = {R:0,P:0,S:0};
  for(const ch of board) if(sideOf(ch)===side) c[typeOf(ch)]++;
  return c;
}
// Trạng thái 1 bàn. Ghế trống = id rỗng; lastFrom/lastTo = -1 khi chưa có nước đi.
function newGame(seats){
  return Object.assign({board:initBoard(), turn:"b", n:0, lastFrom:-1, lastTo:-1, log:[], winner:"", reason:"",
    bId:"", bName:"", pId:"", pName:""}, seats||{});
}
function seatsOf(g){ return {bId:g.bId, bName:g.bName, pId:g.pId, pName:g.pName}; }
function doMove(g, from, to){
  const b = g.board.split(""), piece = b[from], cap = b[to];
  b[to] = piece; b[from] = ".";
  const board = b.join(""), mover = g.turn, opp = mover==="b" ? "p" : "b";
  const text = `${SIDE_NAME[mover]} ${EMO[typeOf(piece)]} ${sqName(from)}→${sqName(to)}` + (cap!=="." ? ` ăn ${EMO[typeOf(cap)]}` : "");
  let winner = "", reason = "";
  if(to === GOAL[mover]){ winner = mover; reason = `vào ô đích ${sqName(to)}`; }
  else {
    const oc = counts(board, opp), gone = Object.keys(oc).find(k => oc[k]===0);
    if(gone){ winner = mover; reason = `ăn hết quân ${NAME[gone]} ${EMO[gone]} của bên ${SIDE_NAME[opp]}`; }
    else if(!hasMove(board, opp)){ winner = mover; reason = `bên ${SIDE_NAME[opp]} hết nước đi`; }
  }
  return Object.assign({}, g, {board, turn: winner ? mover : opp, n:g.n+1, lastFrom:from, lastTo:to,
    log:(g.log||[]).concat(text).slice(-60), winner, reason});
}

window.Rules = {COLS, EMO, NAME, SIDE_NAME, GOAL, sqName, sideOf, typeOf,
  initBoard, targets, hasMove, counts, newGame, seatsOf, doMove};
})();
