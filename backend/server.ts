import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import OpenAI service
import { OpenAIService } from './services/openaiService';
const openaiService = new OpenAIService();

const app = express();
const server = createServer(app);

// ✅ Allowed Frontend Domains
const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:3000",
  "https://ra-lilac.vercel.app" // Your Vercel frontend URL
];

// ✅ Apply CORS Middleware
app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Types for battle system
interface Battle {
  id: string;
  players: Player[];
  topic: {
    topic: string;
    option1: { text: string; difficulty: number };
    option2: { text: string; difficulty: number };
  };
  playerSides: { [playerId: string]: 'option1' | 'option2' };
  currentRound: number;
  maxRounds: number;
  roundStartTime: number;
  status: 'waiting' | 'active' | 'ended';
  messages: BattleMessage[];
  spectators: Spectator[];
  reactions: EmojiReaction[];
}

interface Player {
  id: string;
  username: string;
  socketId: string;
}

interface Spectator {
  id: string;
  username: string;
  socketId: string;
  joinedAt: number;
}

interface EmojiReaction {
  spectatorId: string;
  username: string;
  emoji: string;
  timestamp: number;
}

interface BattleMessage {
  playerId: string;
  username: string;
  message: string;
  timestamp: number;
  round: number;
}

// In-memory storage
const battles: Map<string, Battle> = new Map();
const waitingPlayers: Player[] = [];

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Find match
  socket.on('findMatch', (username: string) => {
    const player: Player = {
      id: socket.id,
      username: username || `Player${Date.now()}`,
      socketId: socket.id
    };

    waitingPlayers.push(player);
    socket.emit('searchingMatch');

    if (waitingPlayers.length >= 2) {
      const player1 = waitingPlayers.shift()!;
      const player2 = waitingPlayers.shift()!;
      
      createBattle(player1, player2).catch(console.error);
    }
  });

  // Send message in battle
  socket.on('sendMessage', async (data: { battleId: string; message: string; username: string }) => {
    const battle = battles.get(data.battleId);
    if (!battle || battle.status !== 'active') return;

    // 🔴 Moderation disabled
    /*
    const moderation = await openaiService.moderateMessage(data.message);
    if (!moderation.isAppropriate) {
      socket.emit('messageBlocked', { 
        reason: moderation.reason || 'Message was inappropriate' 
      });
      return;
    }
    */

    const battleMessage: BattleMessage = {
      playerId: socket.id,
      username: data.username,
      message: data.message,
      timestamp: Date.now(),
      round: battle.currentRound
    };

    battle.messages.push(battleMessage);
    
    io.to(data.battleId).emit('newMessage', battleMessage);
  });

  // Join as spectator
  socket.on('joinSpectator', (data: { battleId: string; username: string }) => {
    const battle = battles.get(data.battleId);
    if (!battle) {
      socket.emit('battleNotFound', { battleId: data.battleId });
      return;
    }

    if (battle.status === 'ended') {
      socket.emit('battleAlreadyEnded', { battleId: data.battleId });
      return;
    }

    if (battle.spectators.length >= 20) {
      socket.emit('spectatorLimitReached', { battleId: data.battleId });
      return;
    }

    const isAlreadySpectator = battle.spectators.some(s => s.socketId === socket.id);
    const isPlayer = battle.players.some(p => p.socketId === socket.id);
    
    if (isAlreadySpectator || isPlayer) {
      socket.emit('alreadyInBattle', { battleId: data.battleId });
      return;
    }

    const spectator: Spectator = {
      id: socket.id,
      username: data.username || `Spectator${Date.now()}`,
      socketId: socket.id,
      joinedAt: Date.now()
    };
    battle.spectators.push(spectator);
    socket.join(data.battleId);
    
    socket.emit('battleState', {
      battle: {
        id: battle.id,
        topic: battle.topic.topic,
        options: {
          option1: battle.topic.option1.text,
          option2: battle.topic.option2.text
        },
        playerAssignments: battle.playerSides,
        currentRound: battle.currentRound,
        maxRounds: battle.maxRounds,
        status: battle.status,
        players: battle.players.map(p => ({ id: p.id, username: p.username })),
        messages: battle.messages,
        reactions: battle.reactions || [],
        isSpectator: true,
        spectatorCount: battle.spectators.length,
        roundStartTime: battle.roundStartTime
      }
    });

    socket.to(data.battleId).emit('spectatorCountUpdated', { 
      spectatorCount: battle.spectators.length 
    });
  });

  // Send emoji reaction
  socket.on('sendReaction', (data: { battleId: string; emoji: string; username: string }) => {
    const battle = battles.get(data.battleId);
    if (!battle || battle.status !== 'active') return;

    const spectator = battle.spectators.find(s => s.socketId === socket.id);
    if (!spectator) return;

    const allowedEmojis = ['😂', '🔥', '💯', '👏', '😱', '🤯', '💀', '🎯', '⚡', '🙌'];
    if (!allowedEmojis.includes(data.emoji)) return;

    const reaction: EmojiReaction = {
      spectatorId: socket.id,
      username: spectator.username,
      emoji: data.emoji,
      timestamp: Date.now()
    };

    battle.reactions.push(reaction);
    if (battle.reactions.length > 50) {
      battle.reactions = battle.reactions.slice(-50);
    }

    io.to(data.battleId).emit('newReaction', reaction);

    setTimeout(() => {
      battle.reactions = battle.reactions.filter(r => r.timestamp !== reaction.timestamp);
      io.to(data.battleId).emit('reactionRemoved', { timestamp: reaction.timestamp });
    }, 3000);
  });

  // Leave battle
  socket.on('leaveBattle', (battleId: string) => {
    socket.leave(battleId);
    const battle = battles.get(battleId);
    if (battle) {
      battle.spectators = battle.spectators.filter(s => s.socketId !== socket.id);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    const waitingIndex = waitingPlayers.findIndex(p => p.socketId === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }

    battles.forEach((battle, battleId) => {
      const playerIndex = battle.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        battle.status = 'ended';
        io.to(battleId).emit('battleEnded', { reason: 'Player disconnected' });
        battles.delete(battleId);
      }
      battle.spectators = battle.spectators.filter(s => s.socketId !== socket.id);
    });
  });
});

// Create a new battle
async function createBattle(player1: Player, player2: Player) {
  const battleId = `battle_${Date.now()}`;

  const topic = await openaiService.generateRoastTopic();

  const playerSides: { [playerId: string]: 'option1' | 'option2' } = {
    [player1.id]: 'option1',
    [player2.id]: 'option2'
  };

  const battle: Battle = {
    id: battleId,
    players: [player1, player2],
    topic,
    playerSides,
    currentRound: 1,
    maxRounds: 3,
    roundStartTime: Date.now(),
    status: 'active',
    messages: [],
    spectators: [],
    reactions: []
  };

  battles.set(battleId, battle);

  const player1Socket = io.sockets.sockets.get(player1.socketId);
  const player2Socket = io.sockets.sockets.get(player2.socketId);
  
  if (player1Socket && player2Socket) {
    player1Socket.join(battleId);
    player2Socket.join(battleId);

    io.to(battleId).emit('battleStarted', {
      battleId,
      topic: battle.topic.topic,
      options: {
        option1: battle.topic.option1.text,
        option2: battle.topic.option2.text
      },
      playerAssignments: battle.playerSides,
      players: battle.players.map(p => ({ id: p.id, username: p.username })),
      currentRound: battle.currentRound,
      maxRounds: battle.maxRounds
    });

    setTimeout(() => nextRound(battleId), 60000);
  }
}

// Move to next round or end
function nextRound(battleId: string) {
  const battle = battles.get(battleId);
  if (!battle || battle.status === 'ended') return;

  if (battle.currentRound < battle.maxRounds) {
    battle.currentRound++;
    battle.roundStartTime = Date.now();
    
    io.to(battleId).emit('roundChanged', {
      currentRound: battle.currentRound,
      maxRounds: battle.maxRounds
    });

    setTimeout(() => nextRound(battleId), 60000);
  } else {
    endBattle(battleId);
  }
}

// End battle and judge
async function endBattle(battleId: string) {
  const battle = battles.get(battleId);
  if (!battle) return;

  battle.status = 'ended';

  const player1Messages = battle.messages.filter(msg => msg.playerId === battle.players[0].id);
  const player2Messages = battle.messages.filter(msg => msg.playerId === battle.players[1].id);
  
  try {
    const judgment = await openaiService.judgeBattle(
      battle.topic,
      player1Messages,
      player2Messages,
      battle.players[0].username,
      battle.players[1].username,
      battle.playerSides[battle.players[0].id],
      battle.playerSides[battle.players[1].id]
    );

    io.to(battleId).emit('battleEnded', {
      winner: {
        id: judgment.winner.playerId === 'player1' ? battle.players[0].id : battle.players[1].id,
        username: judgment.winner.username
      },
      scores: judgment.scores,
      reasoning: judgment.reasoning,
      reason: 'Battle completed'
    });
  } catch (error) {
    console.error('Error judging battle:', error);
    
    const winner = battle.players[Math.floor(Math.random() * battle.players.length)];
    io.to(battleId).emit('battleEnded', {
      winner: {
        id: winner.id,
        username: winner.username
      },
      reason: 'Battle completed'
    });
  }

  setTimeout(() => {
    battles.delete(battleId);
  }, 60000);
}

// API Routes
app.get('/api/battles', (req, res) => {
  const activeBattles = Array.from(battles.values())
    .filter(battle => battle.status === 'active')
    .map(battle => ({
      id: battle.id,
      topic: battle.topic.topic,
      players: battle.players.map(p => ({ username: p.username })),
      spectatorCount: battle.spectators.length,
      maxSpectators: 20,
      isFull: battle.spectators.length >= 20,
      currentRound: battle.currentRound,
      maxRounds: battle.maxRounds
    }));
  
  res.json(activeBattles);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`RoastArena server running on port ${PORT}`);
});

export { io, battles };
