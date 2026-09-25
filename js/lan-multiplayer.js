(function exposeLanMultiplayer(global) {
  "use strict";

  const ROOM_POLL_MS = 500;
  const LIST_POLL_MS = 1500;
  let connected = false;
  let listTimer = null;

  async function request(path, options) {
    const response = await fetch(path, Object.assign({
      headers: { "Content-Type": "application/json" },
      cache: "no-store"
    }, options || {}));
    let data = {};
    try { data = await response.json(); } catch (error) { /* Error handled below. */ }
    if (!response.ok) {
      const requestError = new Error(data.error || `Lỗi máy chủ (${response.status}).`);
      requestError.status = response.status;
      throw requestError;
    }
    return data;
  }

  function snapshotFrom(room) {
    return {
      exists: Boolean(room),
      id: room ? room.id : null,
      data: () => room ? room.game : null
    };
  }

  function roomsSnapshot(rooms) {
    return {
      docs: rooms.map(room => ({ exists: true, id: room.id, data: () => room.game }))
    };
  }

  async function connect(defaultPlayerId, handlers) {
    try {
      await request("/api/status");
      connected = true;
      handlers.onConnected();
    } catch (error) {
      connected = false;
      handlers.onUnavailable(error);
      return defaultPlayerId;
    }

    const updateRooms = async () => {
      try {
        const result = await request("/api/rooms");
        handlers.onRooms(roomsSnapshot(result.rooms));
      } catch (error) { handlers.onRoomsError(error); }
    };
    await updateRooms();
    listTimer = setInterval(updateRooms, LIST_POLL_MS);
    return defaultPlayerId;
  }

  function isConnected() {
    return connected;
  }

  async function createRoom(code, playerId, name) {
    return request("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ code, playerId, name })
    });
  }

  function subscribeRoom(code, onChange, onError) {
    let stopped = false;
    let timer = null;
    let lastSerialized = null;

    const update = async () => {
      try {
        const room = await request(`/api/rooms/${encodeURIComponent(code)}`);
        const serialized = JSON.stringify(room.game);
        if (!stopped && serialized !== lastSerialized) {
          lastSerialized = serialized;
          onChange(snapshotFrom(room));
        }
      } catch (error) {
        if (!stopped) {
          if (error.status === 404) onChange(snapshotFrom(null));
          else onError(error);
        }
      }
      if (!stopped) timer = setTimeout(update, ROOM_POLL_MS);
    };

    update();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }

  function move(code, playerId, from, to, expectedN) {
    return request(`/api/rooms/${encodeURIComponent(code)}/move`, {
      method: "POST",
      body: JSON.stringify({ playerId, from, to, expectedN })
    });
  }

  function takeSeat(code, playerId, name, side) {
    return request(`/api/rooms/${encodeURIComponent(code)}/seat`, {
      method: "POST",
      body: JSON.stringify({ playerId, name, side })
    });
  }

  function leaveSeat(code, playerId) {
    return request(`/api/rooms/${encodeURIComponent(code)}/leave`, {
      method: "POST",
      body: JSON.stringify({ playerId })
    });
  }

  function resetRoom(code, playerId) {
    return request(`/api/rooms/${encodeURIComponent(code)}/reset`, {
      method: "POST",
      body: JSON.stringify({ playerId })
    });
  }

  function disconnectRoomsList() {
    if (listTimer) clearInterval(listTimer);
    listTimer = null;
  }

  global.OttMultiplayer = {
    connect,
    isConnected,
    createRoom,
    subscribeRoom,
    move,
    takeSeat,
    leaveSeat,
    resetRoom,
    disconnectRoomsList
  };
}(window));
