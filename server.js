"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

require("./js/rules.js");
const R = globalThis.OttRules;

const HOST = process.env.GAME_HOST || "0.0.0.0";
const PORT = Number(process.env.GAME_PORT || 4173);
const ROOT = __dirname;
const rooms = new Map();
const MAX_BODY_BYTES = 32 * 1024;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function fail(response, status, message) {
  sendJson(response, status, { error: message });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Dữ liệu gửi lên quá lớn."), { status: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (error) { reject(Object.assign(new Error("Dữ liệu JSON không hợp lệ."), { status: 400 })); }
    });
    request.on("error", reject);
  });
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function validPlayerId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{4,80}$/.test(value);
}

function validCode(value) {
  return typeof value === "string" && /^[A-HJ-NP-Z2-9]{5}$/.test(value);
}

function publicRoom(code, game) {
  return { id: code, game };
}

function playerSide(game, playerId) {
  if (game.seats.b && game.seats.b.id === playerId) return "b";
  if (game.seats.p && game.seats.p.id === playerId) return "p";
  return null;
}

function touch(game) {
  game.updatedAt = Date.now();
  return game;
}

function cleanOldRooms() {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [code, game] of rooms) if (game.updatedAt < cutoff) rooms.delete(code);
}

async function handleApi(request, response, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, { ok: true, rooms: rooms.size });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/rooms") {
    cleanOldRooms();
    const list = [...rooms.entries()]
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .slice(0, 20)
      .map(([code, game]) => publicRoom(code, game));
    sendJson(response, 200, { rooms: list });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(request);
    const code = cleanText(body.code, 5).toUpperCase();
    const name = cleanText(body.name, 20) || "Người chơi";
    if (!validCode(code) || !validPlayerId(body.playerId)) return fail(response, 400, "Mã phòng hoặc người chơi không hợp lệ.");
    if (rooms.has(code)) return fail(response, 409, "Mã phòng đã tồn tại, hãy thử lại.");
    const game = R.newGame({ seats: { b: { id: body.playerId, name }, p: null } });
    rooms.set(code, game);
    sendJson(response, 201, publicRoom(code, game));
    return;
  }

  if (parts[0] !== "api" || parts[1] !== "rooms" || !validCode(parts[2])) return fail(response, 404, "Không tìm thấy API.");
  const code = parts[2];
  const game = rooms.get(code);
  if (!game) return fail(response, 404, `Không tìm thấy phòng ${code}.`);

  if (request.method === "GET" && parts.length === 3) {
    sendJson(response, 200, publicRoom(code, game));
    return;
  }

  if (request.method !== "POST" || parts.length !== 4) return fail(response, 405, "Phương thức không được hỗ trợ.");
  const action = parts[3];
  const body = await readJson(request);
  if (!validPlayerId(body.playerId)) return fail(response, 400, "Người chơi không hợp lệ.");

  if (action === "seat") {
    if (body.side !== "b" && body.side !== "p") return fail(response, 400, "Ghế không hợp lệ.");
    const currentSide = playerSide(game, body.playerId);
    if (currentSide) return fail(response, 409, "Bạn đã ngồi một ghế khác.");
    if (game.seats[body.side]) return fail(response, 409, "Ghế vừa được người khác chọn.");
    game.seats[body.side] = { id: body.playerId, name: cleanText(body.name, 20) || "Người chơi" };
    touch(game);
    sendJson(response, 200, publicRoom(code, game));
    return;
  }

  if (action === "leave") {
    const side = playerSide(game, body.playerId);
    if (!side) return fail(response, 403, "Bạn không ngồi trong phòng này.");
    game.seats[side] = null;
    touch(game);
    sendJson(response, 200, publicRoom(code, game));
    return;
  }

  if (action === "move") {
    const side = playerSide(game, body.playerId);
    if (!side) return fail(response, 403, "Bạn chỉ có thể đi khi đang ngồi ghế.");
    if (!game.seats.b || !game.seats.p) return fail(response, 409, "Phòng chưa đủ hai người.");
    if (game.winner) return fail(response, 409, "Ván đấu đã kết thúc.");
    if (side !== game.turn) return fail(response, 409, "Chưa tới lượt bạn.");
    if (!Number.isInteger(body.from) || !Number.isInteger(body.to)) return fail(response, 400, "Nước đi không hợp lệ.");
    if (body.expectedN !== game.n) return fail(response, 409, "Bàn cờ đã thay đổi, vui lòng thử lại.");
    if (R.sideOf(game.board[body.from]) !== side || !R.targets(game.board, body.from).includes(body.to)) {
      return fail(response, 400, "Nước đi không hợp lệ.");
    }
    const nextGame = R.doMove(game, body.from, body.to);
    rooms.set(code, nextGame);
    sendJson(response, 200, publicRoom(code, nextGame));
    return;
  }

  if (action === "reset") {
    const side = playerSide(game, body.playerId);
    if (!side) return fail(response, 403, "Chỉ người đang ngồi ghế mới được tạo ván mới.");
    const nextGame = R.newGame({ seats: game.seats });
    rooms.set(code, nextGame);
    sendJson(response, 200, publicRoom(code, nextGame));
    return;
  }

  fail(response, 404, "Không tìm thấy thao tác.");
}

function serveStatic(request, response, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const requestedPath = path.resolve(ROOT, `.${pathname}`);
  const relative = path.relative(ROOT, requestedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return fail(response, 403, "Đường dẫn không hợp lệ.");

  fs.stat(requestedPath, (statError, stats) => {
    if (statError || !stats.isFile()) return fail(response, 404, "Không tìm thấy tệp.");
    const type = STATIC_TYPES[path.extname(requestedPath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    fs.createReadStream(requestedPath).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(request, response, url);
    else if (request.method === "GET" || request.method === "HEAD") serveStatic(request, response, url);
    else fail(response, 405, "Phương thức không được hỗ trợ.");
  } catch (error) {
    if (!response.headersSent) fail(response, error.status || 500, error.status ? error.message : "Lỗi máy chủ.");
    if (!error.status) console.error(error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Oẳn tù tì server đang chạy tại http://localhost:${PORT}`);
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter(info => info && info.family === "IPv4" && !info.internal)
    .map(info => info.address);
  for (const address of addresses) console.log(`Máy khác trong cùng mạng mở: http://${address}:${PORT}`);
  if (!addresses.length) console.log("Không tìm thấy IPv4 LAN. Hãy chạy ipconfig để xem địa chỉ máy này.");
});
