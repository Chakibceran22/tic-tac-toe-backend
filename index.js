const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust for production
    methods: ["GET", "POST"],
  },
});

// Object to store rooms.
// Each room will have an array of players where each player is an object: { id, role }
const rooms = {};

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  socket.on("resetGame", ({ roomId, startingPlayer }) => {
    console.log(`Reset requested in ${roomId} by ${socket.id} with startingPlayer ${startingPlayer}`);
    const resetBoard = Array(9).fill(null);
    // Broadcast reset to everyone in the room
    io.to(roomId).emit("resetGame", { boardState: resetBoard, currentPlayer: startingPlayer });
  });
  socket.on("joinGame", (playerRole) => {
    // Prevent the same socket from joining twice.
    for (const roomId in rooms) {
      if (rooms[roomId].players.some(player => player.id === socket.id)) {
        console.log(`Player ${socket.id} is already in room ${roomId}`);
        return;
      }
    }
  
    let assignedRoom = null;
    console.log("Available rooms:", rooms);
  
    // Look for an existing room with less than 2 players 
    // and no player in that room has the same role as the joining player.
    for (const roomId in rooms) {
      if (rooms[roomId].players.length < 2) {
        const conflict = rooms[roomId].players.some(player => player.role === playerRole);
        if (!conflict) {
          assignedRoom = roomId;
          break;
        }
      }
    }
  
    // If no appropriate room is found, create a new one.
    if (!assignedRoom) {
      assignedRoom = `room-${Object.keys(rooms).length + 1}`;
      rooms[assignedRoom] = { players: [] };
      console.log("Created new room:", assignedRoom);
    }
  
    // Add the player to the room.
    rooms[assignedRoom].players.push({ id: socket.id, role: playerRole });
    socket.join(assignedRoom);
    console.log(`Player ${socket.id} with role ${playerRole} joined room ${assignedRoom}`);
    socket.emit("roomAssigned", assignedRoom);
  
    // When the room reaches 2 players, start the game.
    if (rooms[assignedRoom].players.length === 2) {
      io.to(assignedRoom).emit("startGame", {
        message: "Game starts now!",
        players: rooms[assignedRoom].players,
      });
    }
  });
  

  // Handle moves from a client.
  socket.on("makeMove", ({ roomId, boardState, currentPlayer }) => {
    // Broadcast the updated board and turn to everyone in the room.
    io.to(roomId).emit("updateBoard", { boardState, currentPlayer });
  });

  // Clean up on disconnect.
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    for (const roomId in rooms) {
      // Remove the disconnected player from the room.
      rooms[roomId].players = rooms[roomId].players.filter(
        (player) => player.id !== socket.id
      );
      // If the room is empty, delete it.
      if (rooms[roomId].players.length === 0) {
        console.log(`Room ${roomId} is now empty. Deleting it.`);
        delete rooms[roomId];
      }
    }
  });
});

server.listen(5000, () => {
  console.log("Server running on port 5000");
});
