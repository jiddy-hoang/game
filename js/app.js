(function startApp() {
  "use strict";

  const R = window.OttRules;
  const multiplayer = window.OttMultiplayer;
  const $ = id => document.getElementById(id);

  let myId;
  let mode = null;
  let roomCode = null;
  let game = null;
  let unsubscribeRoom = null;
  let selected = null;
  let justMovedTo = null;
  let pending = false;

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (error) { /* Storage may be disabled. */ }
  }

  let localId = storageGet("ott_id");
  if (!localId) {
    localId = `l${Math.random().toString(36).slice(2, 10)}`;
    storageSet("ott_id", localId);
  }
  myId = localId;
  $("nameIn").value = storageGet("ott_name") || "";
  $("nameIn").addEventListener("change", event => storageSet("ott_name", event.target.value.trim()));

  function myName() {
    return ($("nameIn").value.trim() || "Người chơi").slice(0, 20);
  }

  let toastTimer;
  function toast(message) {
    const element = $("toast");
    element.textContent = message;
    element.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.add("hidden"), 3200);
  }

  function writeError(error) {
    console.error(error);
    if (error && error.code === "not_granted") toast("Bạn chưa có quyền ghi. Nhờ chủ trang chia sẻ với quyền Contributor để chơi.");
    else toast("Không lưu được nước đi. Kiểm tra kết nối rồi thử lại.");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
  }

  function renderRooms(snapshot) {
    const list = $("roomList");
    list.innerHTML = "";
    const docs = snapshot.docs.filter(doc => doc.exists);
    if (!docs.length) {
      list.innerHTML = '<li class="note">Chưa có phòng nào. Tạo phòng đầu tiên nhé.</li>';
      return;
    }

    for (const doc of docs) {
      const roomGame = doc.data() || {};
      const seats = roomGame.seats || {};
      const tag = roomGame.winner
        ? '<span class="tag done">Đã xong</span>'
        : (!seats.b || !seats.p) ? '<span class="tag wait">Còn ghế</span>' : '<span class="tag">Đang chơi</span>';
      const item = document.createElement("li");
      item.innerHTML = `<span class="code">${escapeHtml(doc.id)}</span><span class="who">${escapeHtml(seats.b ? seats.b.name : "—")} vs ${escapeHtml(seats.p ? seats.p.name : "—")}</span>${tag}`;
      const button = document.createElement("button");
      button.className = "btn ghost compact-btn";
      button.textContent = "Vào";
      button.onclick = () => openRoom(doc.id);
      item.appendChild(button);
      list.appendChild(item);
    }
  }

  async function connect() {
    myId = await multiplayer.connect(myId, {
      onUnavailable() {
        $("netState").textContent = "Không kết nối được LAN server – vẫn chơi được 2 người trên 1 máy.";
        $("roomList").innerHTML = '<li class="note">Hãy mở game qua địa chỉ do lệnh node server.js cung cấp.</li>';
        $("createBtn").disabled = true;
        $("joinBtn").disabled = true;
      },
      onConnected() {
        $("netState").textContent = "Đã kết nối LAN server. Tạo phòng hoặc vào phòng của bạn bè.";
      },
      onRooms: renderRooms,
      onRoomsError() {
        $("roomList").innerHTML = '<li class="note">Không tải được danh sách phòng.</li>';
      }
    });
  }

  function makeCode() {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let index = 0; index < 5; index += 1) result += alphabet[Math.floor(Math.random() * alphabet.length)];
    return result;
  }

  $("createBtn").onclick = async () => {
    if (!multiplayer.isConnected()) return;
    storageSet("ott_name", myName());
    const code = makeCode();
    try {
      await multiplayer.createRoom(code, myId, myName());
      openRoom(code);
    } catch (error) { writeError(error); }
  };

  $("joinBtn").onclick = () => {
    const code = $("codeIn").value.trim().toUpperCase();
    if (code.length !== 5) {
      toast("Mã phòng gồm 5 ký tự.");
      return;
    }
    openRoom(code);
  };

  $("localBtn").onclick = () => {
    mode = "local";
    roomCode = null;
    game = R.newGame();
    selected = null;
    showGame();
    render();
  };

  $("backBtn").onclick = () => {
    if (unsubscribeRoom) unsubscribeRoom();
    unsubscribeRoom = null;
    game = null;
    mode = null;
    roomCode = null;
    selected = null;
    $("game").classList.add("hidden");
    $("lobby").classList.remove("hidden");
  };

  $("resetBtn").onclick = () => {
    if (!game) return;
    if (mode === "online" && !mySide()) {
      toast("Chỉ người đang ngồi ghế mới bắt đầu ván mới được.");
      return;
    }
    if (!game.winner && game.n > 0 && !confirm("Bắt đầu lại ván mới?")) return;
    if (mode === "local") {
      game = R.newGame({ seats: game.seats });
      render();
      return;
    }
    pending = true;
    render();
    multiplayer.resetRoom(roomCode, myId)
      .then(result => { game = result.game; pending = false; render(); })
      .catch(error => { pending = false; writeError(error); render(); });
  };

  function openRoom(code) {
    if (!multiplayer.isConnected()) return;
    storageSet("ott_name", myName());
    if (unsubscribeRoom) unsubscribeRoom();
    mode = "online";
    roomCode = code;
    game = null;
    selected = null;
    showGame();
    render();
    let firstSnapshot = true;

    unsubscribeRoom = multiplayer.subscribeRoom(code, snapshot => {
      if (!snapshot.exists) {
        if (firstSnapshot) {
          toast(`Không tìm thấy phòng ${code}.`);
          $("backBtn").onclick();
        }
        return;
      }
      firstSnapshot = false;
      const nextGame = snapshot.data();
      if (game && game.n !== nextGame.n) selected = null;
      if (game && nextGame.last && (!game.last || game.n !== nextGame.n)) justMovedTo = nextGame.last[1];
      game = nextGame;
      pending = false;
      render();
    }, () => toast("Mất kết nối với phòng."));
  }

  function showGame() {
    $("lobby").classList.add("hidden");
    $("game").classList.remove("hidden");
  }

  function mySide() {
    if (!game || mode !== "online") return null;
    const seats = game.seats || {};
    if (seats.b && seats.b.id === myId) return "b";
    if (seats.p && seats.p.id === myId) return "p";
    return null;
  }

  function canAct() {
    if (!game || game.winner || pending) return false;
    if (mode === "local") return true;
    const seats = game.seats || {};
    return mySide() === game.turn && seats.b && seats.p;
  }

  async function commitMove(from, to) {
    if (mode === "local") {
      game = R.doMove(game, from, to);
      render();
      return;
    }
    pending = true;
    render();
    try {
      const result = await multiplayer.move(roomCode, myId, from, to, game.n);
      game = result.game;
      pending = false;
      justMovedTo = to;
      render();
    } catch (error) {
      pending = false;
      toast(error.message || "Không thực hiện được nước đi.");
      render();
    }
  }

  async function takeSeat(side) {
    if (mySide()) return;
    try {
      const result = await multiplayer.takeSeat(roomCode, myId, myName(), side);
      game = result.game;
      render();
    } catch (error) { toast(error.message || "Không thể chọn ghế."); }
  }

  async function leaveSeat(side) {
    try {
      const result = await multiplayer.leaveSeat(roomCode, myId);
      game = result.game;
      render();
    } catch (error) { toast(error.message || "Không thể nhường ghế."); }
  }

  function render() {
    const boardElement = $("board");
    if (!game) {
      boardElement.innerHTML = "";
      $("status").innerHTML = '<span class="note">Đang tải phòng…</span>';
      return;
    }

    const flip = mySide() === "p";
    const possibleTargets = selected !== null ? R.targets(game.board, selected) : [];
    const fragment = document.createDocumentFragment();

    for (let visualRow = 0; visualRow < 9; visualRow += 1) {
      const row = flip ? visualRow : 8 - visualRow;
      const rowLabel = document.createElement("div");
      rowLabel.className = "lbl";
      rowLabel.textContent = row + 1;
      fragment.appendChild(rowLabel);

      for (let visualCol = 0; visualCol < 9; visualCol += 1) {
        const col = flip ? 8 - visualCol : visualCol;
        const index = row * 9 + col;
        const piece = game.board[index];
        const square = document.createElement("button");
        square.className = `sq${(row + col) % 2 === 0 ? " dark" : ""}`;
        square.setAttribute("aria-label", R.sqName(index) + (piece !== "." ? ` ${R.SIDE_NAME[R.sideOf(piece)]} ${R.NAME[R.typeOf(piece)]}` : ""));
        if (index === R.GOAL.b) square.classList.add("goalB");
        if (index === R.GOAL.p) square.classList.add("goalP");
        if (game.last && (index === game.last[0] || index === game.last[1])) square.classList.add("last");
        if (index === selected) square.classList.add("sel");
        if (possibleTargets.includes(index)) {
          square.classList.add("target");
          if (piece !== ".") square.classList.add("cap");
          if (game.turn === "p") square.classList.add("pinkTurn");
        }
        if (index === justMovedTo) square.classList.add("just");
        if (piece !== ".") {
          const token = document.createElement("span");
          token.className = `pc ${R.sideOf(piece)}`;
          token.textContent = R.EMO[R.typeOf(piece)];
          square.appendChild(token);
          if (canAct() && R.sideOf(piece) === game.turn) square.classList.add("movable");
        }
        square.onclick = () => clickSquare(index);
        fragment.appendChild(square);
      }
    }

    fragment.appendChild(document.createElement("div"));
    for (let visualCol = 0; visualCol < 9; visualCol += 1) {
      const label = document.createElement("div");
      label.className = "lbl";
      label.textContent = R.COLS[flip ? 8 - visualCol : visualCol];
      fragment.appendChild(label);
    }
    boardElement.replaceChildren(fragment);
    justMovedTo = null;

    $("roomLabel").textContent = mode === "local" ? "2 người trên 1 máy" : `Phòng ${roomCode}`;
    const status = $("status");
    if (game.winner) {
      status.innerHTML = `<div class="win" style="color:var(--${game.winner === "b" ? "blue" : "pink"})">${R.SIDE_NAME[game.winner]} thắng!</div><div class="note">${escapeHtml(game.reason)}</div>`;
    } else {
      const seats = game.seats || {};
      let message = "Chọn một quân để đi.";
      if (mode === "online") {
        if (!seats.b || !seats.p) message = "Đang chờ đủ 2 người. Gửi mã phòng cho bạn bè.";
        else if (mySide() === game.turn) message = "Tới lượt bạn. Chọn một quân để đi.";
        else if (mySide()) message = "Chờ đối thủ đi…";
        else message = "Bạn đang xem.";
      }
      status.innerHTML = `<div class="turn ${game.turn}">Lượt ${R.SIDE_NAME[game.turn]}</div><div class="note">${message}</div>`;
    }

    renderSeat("b");
    renderSeat("p");
    const log = $("log");
    log.innerHTML = (game.log || []).map(text => `<li>${escapeHtml(text)}</li>`).join("");
    log.scrollTop = log.scrollHeight;
    $("resetBtn").disabled = mode === "online" && !mySide();
  }

  function renderSeat(side) {
    const element = $(side === "b" ? "seatB" : "seatP");
    const seat = (game.seats || {})[side];
    element.classList.toggle("active", !game.winner && game.turn === side);
    const name = element.querySelector(".nm");
    const action = element.querySelector(".act");
    action.innerHTML = "";

    if (mode === "local") {
      name.textContent = `Bên ${R.SIDE_NAME[side]}`;
    } else if (seat) {
      name.textContent = `${R.SIDE_NAME[side]}: ${seat.name}${seat.id === myId ? " (bạn)" : ""}`;
      if (seat.id === myId) {
        const button = document.createElement("button");
        button.className = "btn ghost compact-btn";
        button.textContent = "Nhường ghế";
        button.onclick = () => leaveSeat(side);
        action.appendChild(button);
      }
    } else {
      name.textContent = `${R.SIDE_NAME[side]}: ghế trống`;
      if (!mySide()) {
        const button = document.createElement("button");
        button.className = `btn ${side === "b" ? "blue" : "pink"} compact-btn`;
        button.textContent = "Ngồi";
        button.onclick = () => takeSeat(side);
        action.appendChild(button);
      }
    }

    const pieceCounts = R.counts(game.board, side);
    $(side === "b" ? "cntB" : "cntP").innerHTML = ["R", "S", "P"]
      .map(type => `<span class="cnt${pieceCounts[type] ? "" : " zero"}" title="${R.NAME[type]}">${R.EMO[type]} ${pieceCounts[type]}</span>`)
      .join("");
  }

  function clickSquare(index) {
    if (!canAct()) {
      if (mode === "online" && game && !game.winner && mySide() && mySide() !== game.turn) toast("Chưa tới lượt bạn.");
      return;
    }
    const piece = game.board[index];
    if (selected !== null && R.targets(game.board, selected).includes(index)) {
      const from = selected;
      selected = null;
      justMovedTo = index;
      commitMove(from, index);
      return;
    }
    if (R.sideOf(piece) === game.turn) {
      selected = selected === index ? null : index;
      if (selected !== null && !R.targets(game.board, selected).length) toast("Quân này đang bị chặn, không đi được.");
    } else selected = null;
    render();
  }

  connect();
}());
