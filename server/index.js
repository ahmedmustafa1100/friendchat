const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

let waitingUser = null;
const dmHistory = {};

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

  socket.on("signal", ({ room, data }) => {
    socket.to(room).emit("signal", { data });
  });

  socket.on("chat-message", ({ room, message, time, username }) => {
    if (dmHistory[room]) dmHistory[room].push({ from: socket.id, text: message, time, username });
    socket.to(room).emit("chat-message", { message, time, username });
  });

  socket.on("dm-message", ({ room, message, time, username }) => {
    if (dmHistory[room]) dmHistory[room].push({ from: socket.id, text: message, time, username });
    socket.to(room).emit("dm-message", { message, time, room, username });
  });

  socket.on("typing", ({ room }) => {
    socket.to(room).emit("partner-typing");
  });

  socket.on("next", ({ room }) => {
    socket.to(room).emit("partner-left");
    socket.leave(room);
    waitingUser = socket.id;
  });

  socket.on("disconnect", () => {
    if (waitingUser === socket.id) waitingUser = null;
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));