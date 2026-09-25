(function exposeRules(global) {
  "use strict";

  const COLS = "ABCDEFGHI";
  const EMO = { R: "✊", S: "✌️", P: "✋" };
  const NAME = { R: "đấm", S: "kéo", P: "lá" };
  const BEATS = { R: "S", S: "P", P: "R" };
  const SIDE_NAME = { b: "Xanh", p: "Hồng" };

  function idx(square) {
    return (parseInt(square.slice(1), 10) - 1) * 9 + COLS.indexOf(square[0]);
  }

  const GOAL = { b: idx("I9"), p: idx("A1") };

  function sqName(index) {
    return COLS[index % 9] + (Math.floor(index / 9) + 1);
  }

  function sideOf(piece) {
    return piece === "." ? null : (piece === piece.toUpperCase() ? "b" : "p");
  }

  function typeOf(piece) {
    return piece.toUpperCase();
  }

  function initBoard() {
    const board = Array(81).fill(".");
    const put = (square, value) => { board[idx(square)] = value; };

    put("B5", "P"); put("C5", "S");
    put("B4", "R"); put("C4", "P"); put("D4", "S");
    put("C3", "R"); put("D3", "P"); put("E3", "S");
    put("D2", "R"); put("E2", "P");
    put("H5", "p"); put("G5", "s");
    put("H6", "r"); put("G6", "p"); put("F6", "s");
    put("G7", "r"); put("F7", "p"); put("E7", "s");
    put("F8", "r"); put("E8", "p");
    return board.join("");
  }

  function targets(board, from) {
    const piece = board[from];
    const side = sideOf(piece);
    if (!side) return [];

    const row = Math.floor(from / 9);
    const col = from % 9;
    const result = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (!dr && !dc) continue;
        const nextRow = row + dr;
        const nextCol = col + dc;
        if (nextRow < 0 || nextRow > 8 || nextCol < 0 || nextCol > 8) continue;
        const to = nextRow * 9 + nextCol;
        const target = board[to];
        if (target === "." || (sideOf(target) !== side && BEATS[typeOf(piece)] === typeOf(target))) result.push(to);
      }
    }
    return result;
  }

  function hasMove(board, side) {
    for (let index = 0; index < 81; index += 1) {
      if (sideOf(board[index]) === side && targets(board, index).length) return true;
    }
    return false;
  }

  function counts(board, side) {
    const result = { R: 0, P: 0, S: 0 };
    for (const piece of board) if (sideOf(piece) === side) result[typeOf(piece)] += 1;
    return result;
  }

  function newGame(extra) {
    return Object.assign({
      board: initBoard(), turn: "b", n: 0, last: null, log: [], winner: null,
      reason: "", seats: { b: null, p: null }, updatedAt: Date.now()
    }, extra || {});
  }

  function doMove(game, from, to) {
    const pieces = game.board.split("");
    const piece = pieces[from];
    const captured = pieces[to];
    pieces[to] = piece;
    pieces[from] = ".";

    const board = pieces.join("");
    const mover = game.turn;
    const opponent = mover === "b" ? "p" : "b";
    const text = `${SIDE_NAME[mover]} ${EMO[typeOf(piece)]} ${sqName(from)}→${sqName(to)}`
      + (captured !== "." ? ` ăn ${EMO[typeOf(captured)]}` : "");
    let winner = null;
    let reason = "";

    if (to === GOAL[mover]) {
      winner = mover;
      reason = `vào ô đích ${sqName(to)}`;
    } else {
      const opponentCounts = counts(board, opponent);
      const gone = Object.keys(opponentCounts).find(key => opponentCounts[key] === 0);
      if (gone) {
        winner = mover;
        reason = `ăn hết quân ${NAME[gone]} ${EMO[gone]} của bên ${SIDE_NAME[opponent]}`;
      } else if (!hasMove(board, opponent)) {
        winner = mover;
        reason = `bên ${SIDE_NAME[opponent]} hết nước đi`;
      }
    }

    return Object.assign({}, game, {
      board,
      turn: winner ? mover : opponent,
      n: game.n + 1,
      last: [from, to],
      log: (game.log || []).concat(text).slice(-80),
      winner,
      reason,
      updatedAt: Date.now()
    });
  }

  global.OttRules = { COLS, EMO, NAME, SIDE_NAME, GOAL, sqName, sideOf, typeOf, targets, counts, newGame, doMove };
}(typeof window !== "undefined" ? window : globalThis));
