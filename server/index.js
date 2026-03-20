const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

let waitingUser = null;
const dmHistory = {};
const privateRooms = {}; // { code: { creator: socketId, room: roomId } }

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("find-match", () => {
    if (waitingUser && waitingUser !== socket.id) {
      const partner = waitingUser;
      waitingUser = null;
      const room = socket.id + "#" + partner;
      socket.join(room);
      io.sockets.sockets.get(partner)?.join(room);
      dmHistory[room] = [];
      io.to(partner).emit("matched", { room, initiator: true });
      socket.emit("matched", { room, initiator: false });
    } else {
      waitingUser = socket.id;
      socket.emit("waiting");
    }
  });

  // Create a private room
  socket.on("create-private-room", () => {
    const code = generateCode();
    const room = "private#" + code;
    privateRooms[code] = { creator: socket.id, room };
    socket.join(room);
    socket.emit("private-room-created", { code, room });
  });

  // Join a private room by code
  socket.on("join-private-room", ({ code }) => {
    const upper = code.toUpperCase();
    const entry = privateRooms[upper];
    if (!entry) {
      socket.emit("private-room-error", { message: "Room not found. Check the code and try again." });
      return;
    }
    if (entry.creator === socket.id) {
      socket.emit("private-room-error", { message: "You can't join your own room!" });
      return;
    }
    const { room } = entry;
    socket.join(room);
    dmHistory[room] = [];
    delete privateRooms[upper]; // room is now full, remove it
    io.to(entry.creator).emit("matched", { room, initiator: true });
    socket.emit("matched", { room, initiator: false });
  });

  // Cancel waiting for private room
  socket.on("cancel-private-room", ({ code }) => {
    if (code && privateRooms[code]) {
      delete privateRooms[code];
    }
  });

  socket.on("signal", ({ room, data }) => socket.to(room).emit("signal", { data }));

  socket.on("chat-message", ({ room, message, time, username, lang }) => {
    if (dmHistory[room]) dmHistory[room].push({ from: socket.id, text: message, time, username, lang });
    socket.to(room).emit("chat-message", { message, time, username, lang });
  });

  socket.on("dm-message", ({ room, message, time, username, lang }) => {
    if (dmHistory[room]) dmHistory[room].push({ from: socket.id, text: message, time, username, lang });
    socket.to(room).emit("dm-message", { message, time, room, username, lang });
  });

  socket.on("typing", ({ room }) => socket.to(room).emit("partner-typing"));

  socket.on("next", ({ room }) => {
    socket.to(room).emit("partner-left");
    socket.leave(room);
    waitingUser = socket.id;
  });

  socket.on("disconnect", () => {
    if (waitingUser === socket.id) waitingUser = null;
    // Clean up any private rooms this user created
    for (const code in privateRooms) {
      if (privateRooms[code].creator === socket.id) {
        delete privateRooms[code];
      }
    }
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));