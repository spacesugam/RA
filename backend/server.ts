import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose, { Schema, model } from 'mongoose';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

// Import OpenAI service
import { OpenAIService } from './services/openaiService';
const openaiService = new OpenAIService();

const app = express();
const server = createServer(app);

// Trust reverse proxies (X-Forwarded-For) in production to get real client IP
app.set('trust proxy', true);

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
  result?: any;
  timerId?: NodeJS.Timeout; // Track active timer for cleanup
  // Bot battle support
  isBotBattle?: boolean;
  botPlayerId?: string;
  botTimerId?: NodeJS.Timeout;
}

interface Player {
  id: string;
  username: string;
  socketId: string;
  ipHash?: string;
  isBot?: boolean;
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

// In-memory storage for active battles only; ended battles go to DB
const battles: Map<string, Battle> = new Map();
const waitingPlayers: Player[] = [];
const waitingSet: Set<string> = new Set();
const botTimeouts: Map<string, NodeJS.Timeout> = new Map();

// Bot names pool
const BOT_NAMES = [
  'RoboRival',
  'ByteBrawler',
  'SnarkCircuit',
  'QuipQuasar',
  'NeuroNinja',
  'WitWidget',
  'PunProcessor',
  'JestEngine',
  'SavageScript',
  'LaughLoop'
];

function makeBotPlayer(): Player {
  const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  return {
    id: botId,
    username: name,
    socketId: botId,
    isBot: true
  };
}

// MongoDB models for persistence
const BattleMessageSchema = new Schema({
  playerId: String,
  username: String,
  message: String,
  timestamp: Number,
  round: Number,
}, { _id: false });

const BattleSchema = new Schema({
  battleId: { type: String, index: true, unique: true },
  topic: {
    topic: String,
    option1: { text: String, difficulty: Number },
    option2: { text: String, difficulty: Number },
  },
  players: [{ id: String, username: String }],
  playerSides: {},
  messages: [BattleMessageSchema],
  status: String,
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
  result: {},
});

const BattleModel = model('Battle', BattleSchema);

// User profile persistence
const UserProfileSchema = new Schema({
  ipHash: { type: String, index: true, unique: true },
  username: String,
  totals: {
    battles: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
  },
  recentMatches: [{
    battleId: String,
    timestamp: { type: Date, default: Date.now },
    result: { type: String, enum: ['win', 'loss'] },
    opponentUsername: String,
    topic: String,
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
});

UserProfileSchema.pre('save', function(next) {
  (this as any).updatedAt = new Date();
  next();
});

const UserProfileModel = model('UserProfile', UserProfileSchema);

// Connect to MongoDB if configured
const mongoUri = process.env.MONGODB_URI || '';
if (mongoUri) {
  mongoose.connect(mongoUri).then(() => {
    console.log('Connected to MongoDB');
  }).catch((err) => {
    console.error('MongoDB connection error:', err);
  });
} else {
  console.warn('MONGODB_URI not set; battle history will not persist.');
}

// Helpers for IP hashing
const IP_SALT = process.env.IP_HASH_SALT || 'roastarena_default_salt';
function hashIp(ip: string): string {
  return crypto.createHmac('sha256', IP_SALT).update(ip).digest('hex');
}

function getSocketIp(socket: any): string {
  const headers = socket.handshake?.headers || {};
  // Prefer common proxy headers
  const cf = (headers['cf-connecting-ip'] as string) || '';
  if (cf) return cf;
  const xreal = (headers['x-real-ip'] as string) || '';
  if (xreal) return xreal;
  const xfwd = (headers['x-forwarded-for'] as string) || '';
  if (xfwd) {
    const first = xfwd.split(',')[0].trim();
    if (first) return first;
  }
  // Fallback to socket IP
  return socket.handshake?.address || '0.0.0.0';
}

// Helper function to end battle early (forfeit/disconnect)
function endBattleEarly(battleId: string, reason: string, winnerPlayer: Player, loserPlayer: Player) {
  const battle = battles.get(battleId);
  if (!battle || battle.status === 'ended') return;

  // Clear any active timer
  if (battle.timerId) {
    clearTimeout(battle.timerId);
    battle.timerId = undefined;
  }

  battle.status = 'ended';

  // Determine which player index is the winner
  const winnerIndex = battle.players.findIndex(p => p.id === winnerPlayer.id);
  
  // Create winner result for early end
  const winnerResult = {
    winner: {
      id: winnerPlayer.id,
      username: winnerPlayer.username
    },
    scores: {
      player1: winnerIndex === 0 ? 
        { wit: 10, humor: 10, originality: 10, total: 30 } : 
        { wit: 0, humor: 0, originality: 0, total: 0 },
      player2: winnerIndex === 1 ? 
        { wit: 10, humor: 10, originality: 10, total: 30 } : 
        { wit: 0, humor: 0, originality: 0, total: 0 }
    },
    reasoning: reason,
    reason: 'Battle ended early'
  };

  // Emit to all players and spectators
  io.to(battleId).emit('battleEnded', winnerResult);

    battle.result = winnerResult;

    // Persist ended battle
    if (mongoUri) {
      BattleModel.updateOne(
        { battleId },
        {
          $set: {
            status: 'ended',
            endedAt: new Date(),
            result: winnerResult,
            messages: battle.messages,
          },
        },
        { upsert: true }
      ).catch(console.error);
    }

  // Clean up battle after delay
  setTimeout(() => {
    battles.delete(battleId);
  }, 60000);
}

// Assign a bot to a still-waiting player safely
function tryAssignBotToWaitingPlayer(socketId: string) {
  const timer = botTimeouts.get(socketId);
  if (timer) { clearTimeout(timer); botTimeouts.delete(socketId); }

  // Ensure the player is still queued
  if (!waitingSet.has(socketId)) return;

  const index = waitingPlayers.findIndex(p => p.socketId === socketId);
  if (index === -1) {
    waitingSet.delete(socketId);
    return;
  }

  const player = waitingPlayers.splice(index, 1)[0];
  waitingSet.delete(socketId);

  // Ensure the human is still connected
  const humanSocket = io.sockets.sockets.get(player.socketId);
  if (!humanSocket) return;

  const bot = makeBotPlayer();
  createBattle(player, bot).catch(console.error);
}

// Schedule bot to send one roast for the current round
async function scheduleBotMessage(battleId: string, overrideDelayMs?: number) {
  const battle = battles.get(battleId);
  if (!battle || battle.status !== 'active' || !battle.isBotBattle) return;

  if (battle.botTimerId) {
    clearTimeout(battle.botTimerId);
    battle.botTimerId = undefined;
  }

  const bot = battle.players.find(p => p.id === battle.botPlayerId);
  const human = battle.players.find(p => p.id !== battle.botPlayerId);
  if (!bot || !human) return;

  const delayMs = typeof overrideDelayMs === 'number' ? overrideDelayMs : (2000 + Math.floor(Math.random() * 2000)); // default 2-4s
  battle.botTimerId = setTimeout(async () => {
    const current = battles.get(battleId);
    if (!current || current.status !== 'active') return;

    // Ensure bot hasn't already spoken this round
    const alreadySpoke = current.messages.some(
      m => m.username === bot.username && m.round === current.currentRound
    );
    if (alreadySpoke) return;

    const botSide = current.playerSides[bot.id] || 'option2';
    const lastOpponentMessage = [...current.messages]
      .filter(m => m.username === human.username && m.round === current.currentRound)
      .slice(-1)[0]?.message;
    const text = await openaiService.generateBotRoast(
      current.topic,
      current.messages,
      bot.username,
      human.username,
      botSide,
      current.currentRound,
      lastOpponentMessage
    );

    const battleMessage: BattleMessage = {
      playerId: bot.id,
      username: bot.username,
      message: text,
      timestamp: Date.now(),
      round: current.currentRound
    };
    current.messages.push(battleMessage);
    io.to(battleId).emit('newMessage', battleMessage);

    // Persist message to DB
    if (mongoUri) {
      BattleModel.updateOne(
        { battleId },
        { $push: { messages: battleMessage } }
      ).catch(console.error);
    }
  }, delayMs);
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Map socket -> ipHash
  const clientIp = getSocketIp(socket);
  const ipHash = hashIp(clientIp);
  (socket.data as any).ipHash = ipHash;

  // Find match
  socket.on('findMatch', (username: string) => {
    // Reconnection support: if user has an active battle, rejoin it instead of queueing
    const existingIpHash = (socket.data as any).ipHash as string | undefined;
    if (existingIpHash) {
      for (const battle of battles.values()) {
        if (battle.status === 'active') {
          const playerIndex = battle.players.findIndex(p => p.ipHash && p.ipHash === existingIpHash);
          if (playerIndex !== -1) {
            // Update player's socket and rejoin room
            battle.players[playerIndex].socketId = socket.id;
            socket.join(battle.id);
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
                isSpectator: false,
                spectatorCount: battle.spectators.length,
                roundStartTime: battle.roundStartTime
              }
            });
            return; // Do not queue; already in battle
          }
        }
      }
    }

    const player: Player = {
      id: socket.id,
      username: username || `Player${Date.now()}`,
      socketId: socket.id,
      ipHash: (socket.data as any).ipHash
    };

    if (waitingSet.has(player.socketId)) {
      socket.emit('searchingMatch');
      return;
    }

    waitingPlayers.push(player);
    waitingSet.add(player.socketId);
    socket.emit('searchingMatch');

    // Human-human instant match loop
    while (waitingPlayers.length >= 2) {
      // Pop two distinct, connected players
      const p1 = waitingPlayers.shift()!;
      // Remove stale entries
      const p1Socket = io.sockets.sockets.get(p1.socketId);
      if (!p1Socket) {
        waitingSet.delete(p1.socketId);
        continue;
      }
      let p2: Player | undefined;
      while (waitingPlayers.length) {
        const candidate = waitingPlayers.shift()!;
        const candSocket = io.sockets.sockets.get(candidate.socketId);
        if (candSocket && candidate.socketId !== p1.socketId) {
          p2 = candidate;
          break;
        } else {
          waitingSet.delete(candidate.socketId);
        }
      }
      if (!p2) {
        // Put p1 back in front and break
        waitingPlayers.unshift(p1);
        break;
      }

      // Cancel any pending bot timers
      const t1 = botTimeouts.get(p1.socketId);
      if (t1) { clearTimeout(t1); botTimeouts.delete(p1.socketId); }
      const t2 = botTimeouts.get(p2.socketId);
      if (t2) { clearTimeout(t2); botTimeouts.delete(p2.socketId); }
      waitingSet.delete(p1.socketId);
      waitingSet.delete(p2.socketId);

      createBattle(p1, p2).catch(console.error);
    }

    // Schedule a bot assignment fallback after 60s if still unmatched
    if (waitingSet.has(player.socketId) && !botTimeouts.has(player.socketId)) {
      const timer = setTimeout(() => {
        tryAssignBotToWaitingPlayer(player.socketId);
      }, 60000);
      botTimeouts.set(player.socketId, timer);
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

    // Persist message to DB
    if (mongoUri) {
      BattleModel.updateOne(
        { battleId: data.battleId },
        { $push: { messages: battleMessage } }
      ).catch(console.error);
    }

    // If this is a bot battle and the sender is the human, trigger a quick clapback
    if (battle.isBotBattle) {
      const bot = battle.players.find(p => p.id === battle.botPlayerId);
      if (bot && battleMessage.username !== bot.username) {
        // respond faster (0.7–1.6s) to feel reactive
        scheduleBotMessage(battle.id, 700 + Math.floor(Math.random() * 900));
      }
    }
  });

  // Join as spectator
  socket.on('joinSpectator', async (data: { battleId: string; username: string }) => {
    const battle = battles.get(data.battleId);
    if (!battle) {
      // Try to load from persistence (ended battle)
      if (mongoUri) {
        const persisted = await BattleModel.findOne({ battleId: data.battleId }).lean();
        if (persisted) {
          socket.join(data.battleId);
          socket.emit('battleState', {
            battle: {
              id: data.battleId,
              topic: persisted.topic.topic,
              options: {
                option1: persisted.topic.option1.text,
                option2: persisted.topic.option2.text,
              },
              playerAssignments: persisted.playerSides || {},
              currentRound: 3,
              maxRounds: 3,
              status: 'ended',
              players: (persisted.players || []).map((p: any) => ({ id: p.id, username: p.username })),
              messages: persisted.messages || [],
              reactions: [],
              isSpectator: true,
              spectatorCount: 0,
              roundStartTime: Date.now(),
            },
          });
          if (persisted.result) {
            socket.emit('battleEnded', persisted.result);
          }
          return;
        }
      }
      socket.emit('battleNotFound', { battleId: data.battleId });
      return;
    }

    if (battle.status === 'ended') {
      // Allow viewers to see ended battle with full history and result
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
          reactions: [],
          isSpectator: true,
          spectatorCount: battle.spectators.length,
          roundStartTime: battle.roundStartTime
        }
      });

      if (battle.result) {
        socket.emit('battleEnded', battle.result);
      }
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
        roundStartTime: battle.roundStartTime,
        joinedAt: spectator.joinedAt
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
      // Check if leaving user is a player (not spectator)
      const playerIndex = battle.players.findIndex(p => p.socketId === socket.id);
      
      if (playerIndex !== -1 && battle.status === 'active') {
        // Player is leaving an active battle - declare opponent winner
        const remainingPlayer = battle.players.find(p => p.socketId !== socket.id);
        const leavingPlayer = battle.players[playerIndex];
        
        if (remainingPlayer && leavingPlayer) {
          endBattleEarly(
            battleId,
            `${leavingPlayer.username} forfeited the battle. Victory goes to ${remainingPlayer.username}!`,
            remainingPlayer,
            leavingPlayer
          );
        }
      } else {
        // Remove from spectators if not a player
        battle.spectators = battle.spectators.filter(s => s.socketId !== socket.id);
      }
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
        // Player disconnected during battle - declare opponent as winner
        const remainingPlayer = battle.players.find(p => p.socketId !== socket.id);
        const disconnectedPlayer = battle.players[playerIndex];
        
        if (remainingPlayer && disconnectedPlayer && battle.status === 'active') {
          console.log(`Player ${disconnectedPlayer.username} disconnected from battle ${battleId}. ${remainingPlayer.username} wins!`);
          endBattleEarly(
            battleId,
            `${disconnectedPlayer.username} left the battle early. Victory goes to ${remainingPlayer.username} by forfeit!`,
            remainingPlayer,
            disconnectedPlayer
          );
        } else {
          // Battle already ended or no remaining player - just clean up
          battle.status = 'ended';
          if (battle.timerId) {
            clearTimeout(battle.timerId);
            battle.timerId = undefined;
          }
          if (battle.botTimerId) {
            clearTimeout(battle.botTimerId);
            battle.botTimerId = undefined;
          }
          io.to(battleId).emit('battleEnded', { 
            reason: 'Player disconnected',
            winner: remainingPlayer || null
          });
          battles.delete(battleId);
        }
      }
      
      // Remove from spectators
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
    reactions: [],
    isBotBattle: !!(player1.isBot || player2.isBot),
    botPlayerId: player1.isBot ? player1.id : (player2.isBot ? player2.id : undefined)
  };

  battles.set(battleId, battle);

  // Persist initial battle state (for history and late viewers)
  if (mongoUri) {
    BattleModel.updateOne(
      { battleId },
      {
        $setOnInsert: {
          battleId,
          topic,
          players: battle.players.map(p => ({ id: p.id, username: p.username })),
          playerSides,
          status: 'active',
          startedAt: new Date(),
          messages: [],
        },
      },
      { upsert: true }
    ).catch(console.error);
  }

  const player1Socket = io.sockets.sockets.get(player1.socketId);
  const player2Socket = io.sockets.sockets.get(player2.socketId);
  
  if (player1Socket) player1Socket.join(battleId);
  if (player2Socket) player2Socket.join(battleId);

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

  // Store timer ID for cleanup if battle ends early
  battle.timerId = setTimeout(() => nextRound(battleId), 60000);

  // If bot battle, schedule bot message for this round
  if (battle.isBotBattle) {
    scheduleBotMessage(battleId);
  }
}

// Move to next round or end
function nextRound(battleId: string) {
  const battle = battles.get(battleId);
  if (!battle || battle.status === 'ended') return;

  // Clear previous timer
  if (battle.timerId) {
    clearTimeout(battle.timerId);
    battle.timerId = undefined;
  }

  if (battle.currentRound < battle.maxRounds) {
    battle.currentRound++;
    battle.roundStartTime = Date.now();
    
    io.to(battleId).emit('roundChanged', {
      currentRound: battle.currentRound,
      maxRounds: battle.maxRounds
    });

    // Store new timer ID
    battle.timerId = setTimeout(() => nextRound(battleId), 60000);
    // Schedule next bot message if bot battle
    if (battle.isBotBattle) {
      scheduleBotMessage(battleId);
    }
  } else {
    endBattle(battleId);
  }
}

// End battle and judge
async function endBattle(battleId: string) {
  const battle = battles.get(battleId);
  if (!battle) return;

  // Clear any active timer
  if (battle.timerId) {
    clearTimeout(battle.timerId);
    battle.timerId = undefined;
  }
  if ((battle as any).botTimerId) {
    clearTimeout((battle as any).botTimerId);
    (battle as any).botTimerId = undefined;
  }

  battle.status = 'ended';

  // Ensure we have both players
  if (battle.players.length < 2) {
    console.error('Battle ended with insufficient players');
    battles.delete(battleId);
    return;
  }

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

    // Ensure winner data is properly set
    const winnerPlayerId = judgment.winner.playerId === 'player1' ? battle.players[0].id : battle.players[1].id;
    const winnerUsername = judgment.winner.playerId === 'player1' ? battle.players[0].username : battle.players[1].username;

    const resultPayload = {
      winner: {
        id: winnerPlayerId,
        username: winnerUsername
      },
      scores: judgment.scores,
      reasoning: judgment.reasoning || 'AI has judged the battle based on wit, humor, and originality.',
      reason: 'Battle completed'
    };

    battle.result = resultPayload;

    io.to(battleId).emit('battleEnded', resultPayload);

    // Persist ended battle
    if (mongoUri) {
      await BattleModel.updateOne(
        { battleId },
        {
          $set: {
            status: 'ended',
            endedAt: new Date(),
            result: resultPayload,
            messages: battle.messages,
          }
        },
        { upsert: true }
      );

      // Update user profiles (winner/loser by ipHash)
      try {
        const p1 = battle.players[0];
        const p2 = battle.players[1];
        const winner = winnerPlayerId === p1.id ? p1 : p2;
        const loser = winnerPlayerId === p1.id ? p2 : p1;

        if (winner.ipHash) {
          await UserProfileModel.updateOne(
            { ipHash: winner.ipHash },
            {
              $set: { username: winner.username, lastSeen: new Date() },
              $inc: { 'totals.battles': 1, 'totals.wins': 1 },
              $push: {
                recentMatches: {
                  $each: [
                    { battleId, timestamp: new Date(), result: 'win', opponentUsername: loser.username, topic: battle.topic.topic }
                  ]
                }
              }
            },
            { upsert: true }
          );
        }
        if (loser.ipHash) {
          await UserProfileModel.updateOne(
            { ipHash: loser.ipHash },
            {
              $set: { username: loser.username, lastSeen: new Date() },
              $inc: { 'totals.battles': 1, 'totals.losses': 1 },
              $push: {
                recentMatches: {
                  $each: [
                    { battleId, timestamp: new Date(), result: 'loss', opponentUsername: winner.username, topic: battle.topic.topic }
                  ]
                }
              }
            },
            { upsert: true }
          );
        }
      } catch (e) {
        console.error('Failed to update user profiles:', e);
      }
    }
  } catch (error) {
    console.error('Error judging battle:', error);
    
    // Enhanced fallback with guaranteed data
    const randomWinnerIndex = Math.floor(Math.random() * battle.players.length);
    const winner = battle.players[randomWinnerIndex];
    const loser = battle.players[1 - randomWinnerIndex];
    
    // Create fallback scores
    const fallbackScores = {
      player1: randomWinnerIndex === 0 ? 
        { wit: 8, humor: 8, originality: 7, total: 23 } : 
        { wit: 6, humor: 7, originality: 6, total: 19 },
      player2: randomWinnerIndex === 1 ? 
        { wit: 8, humor: 8, originality: 7, total: 23 } : 
        { wit: 6, humor: 7, originality: 6, total: 19 }
    };

    const resultPayload = {
      winner: {
        id: winner.id,
        username: winner.username
      },
      scores: fallbackScores,
      reasoning: `Both fighters brought great energy! ${winner.username} edged out with slightly better timing and wordplay.`,
      reason: 'Battle completed'
    };

    battle.result = resultPayload;

    io.to(battleId).emit('battleEnded', resultPayload);

    if (mongoUri) {
      await BattleModel.updateOne(
        { battleId },
        {
          $set: {
            status: 'ended',
            endedAt: new Date(),
            result: resultPayload,
            messages: battle.messages,
          }
        },
        { upsert: true }
      );

      // Update user profiles with fallback result
      try {
        const p1 = battle.players[0];
        const p2 = battle.players[1];
        const winnerIsP1 = winner.id === p1.id;
        const winnerPlayer = winnerIsP1 ? p1 : p2;
        const loserPlayer = winnerIsP1 ? p2 : p1;

        if (winnerPlayer.ipHash) {
          await UserProfileModel.updateOne(
            { ipHash: winnerPlayer.ipHash },
            {
              $set: { username: winnerPlayer.username, lastSeen: new Date() },
              $inc: { 'totals.battles': 1, 'totals.wins': 1 },
              $push: {
                recentMatches: {
                  $each: [{ battleId, timestamp: new Date(), result: 'win', opponentUsername: loserPlayer.username, topic: battle.topic.topic }],
                  $slice: -100
                }
              }
            },
            { upsert: true }
          );
        }
        if (loserPlayer.ipHash) {
          await UserProfileModel.updateOne(
            { ipHash: loserPlayer.ipHash },
            {
              $set: { username: loserPlayer.username, lastSeen: new Date() },
              $inc: { 'totals.battles': 1, 'totals.losses': 1 },
              $push: {
                recentMatches: {
                  $each: [{ battleId, timestamp: new Date(), result: 'loss', opponentUsername: winnerPlayer.username, topic: battle.topic.topic }],
                  $slice: -100
                }
              }
            },
            { upsert: true }
          );
        }
      } catch (e) {
        console.error('Failed to update user profiles (fallback):', e);
      }
    }
  }

  // Clean up battle after delay
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

// Get a battle by id (active from memory, ended from DB)
app.get('/api/battles/:id', async (req, res) => {
  const { id } = req.params;
  const active = battles.get(id);
  if (active) {
    return res.json({
      id: active.id,
      topic: active.topic.topic,
      players: active.players.map(p => ({ id: p.id, username: p.username })),
      messages: active.messages,
      status: active.status,
      result: active.result || null,
    });
  }

  if (!mongoUri) {
    return res.status(404).json({ error: 'Battle not found' });
  }

  try {
    const persisted = await BattleModel.findOne({ battleId: id }).lean();
    if (!persisted) return res.status(404).json({ error: 'Battle not found' });
    return res.json({
      id,
      topic: persisted.topic?.topic,
      players: (persisted.players || []).map((p: any) => ({ id: p.id, username: p.username })),
      messages: persisted.messages || [],
      status: persisted.status,
      result: persisted.result || null,
      endedAt: persisted.endedAt,
      startedAt: persisted.startedAt,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch battle' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Helper to get request IP
function getRequestIp(req: express.Request): string {
  // Cloudflare
  const cf = (req.headers['cf-connecting-ip'] as string) || '';
  if (cf) return cf;
  // Nginx / reverse proxies
  const xreal = (req.headers['x-real-ip'] as string) || '';
  if (xreal) return xreal;
  const xfwd = (req.headers['x-forwarded-for'] as string) || '';
  if (xfwd) {
    const first = xfwd.split(',')[0].trim();
    if (first) return first;
  }
  // Express-provided (honors trust proxy)
  return (req.ip as string) || (req.socket?.remoteAddress as string) || '0.0.0.0';
}

// Return the current user's profile based on IP
app.get('/api/me/profile', async (req, res) => {
  if (!mongoUri) return res.status(200).json({ enabled: false });
  try {
    const ip = getRequestIp(req);
    const ipHash = hashIp(ip);
    const profile = await UserProfileModel.findOne({ ipHash }).lean();
    if (!profile) return res.json({ enabled: true, username: '', totals: { battles: 0, wins: 0, losses: 0 }, recentMatches: [] });

    // Build simple last-14-days chart buckets
    const days = 14;
    const buckets: { date: string; wins: number; losses: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.push({ date: key, wins: 0, losses: 0 });
    }
    (profile.recentMatches || []).forEach((m: any) => {
      const key = new Date(m.timestamp).toISOString().slice(0, 10);
      const bucket = buckets.find(b => b.date === key);
      if (bucket) {
        if (m.result === 'win') bucket.wins += 1; else bucket.losses += 1;
      }
    });

    // Build all-time daily buckets from first recorded match
    let chartAll: { date: string; wins: number; losses: number; total: number; cw: number; cl: number }[] = [];
    const matches = (profile.recentMatches || []).slice().sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (matches.length > 0) {
      const firstDate = new Date(matches[0].timestamp);
      const start = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
      const end = new Date();
      // Generate continuous days
      const day = new Date(start);
      while (day <= end) {
        const key = day.toISOString().slice(0, 10);
        chartAll.push({ date: key, wins: 0, losses: 0, total: 0, cw: 0, cl: 0 });
        day.setDate(day.getDate() + 1);
      }
      // Aggregate
      for (const m of matches) {
        const key = new Date(m.timestamp).toISOString().slice(0, 10);
        const row = chartAll.find(d => d.date === key);
        if (row) {
          if (m.result === 'win') row.wins += 1; else row.losses += 1;
        }
      }
      // Totals and cumulative
      let cw = 0, cl = 0;
      chartAll = chartAll.map(d => {
        cw += d.wins; cl += d.losses;
        return { ...d, total: d.wins + d.losses, cw, cl };
      });
    }

    res.json({
      enabled: true,
      username: profile.username || '',
      totals: profile.totals,
      recentMatches: profile.recentMatches || [],
      chart: buckets,
      chartAll
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Update current user's username by IP (upsert profile)
app.post('/api/me/username', express.json(), async (req, res) => {
  if (!mongoUri) return res.status(400).json({ error: 'Profiles disabled' });
  try {
    const { username } = req.body || {};
    const clean = (username || '').toString().trim().slice(0, 20);
    if (!clean) return res.status(400).json({ error: 'Username required' });

    const ip = getRequestIp(req);
    const ipHash = hashIp(ip);

    await UserProfileModel.updateOne(
      { ipHash },
      {
        $set: {
          ipHash,
          username: clean,
          updatedAt: new Date(),
          lastSeen: new Date(),
        },
        $setOnInsert: {
          totals: { battles: 0, wins: 0, losses: 0 },
          recentMatches: [],
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    const doc = await UserProfileModel.findOne({ ipHash }).lean();
    res.json({ ok: true, username: doc?.username || clean });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update username' });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`RoastArena server running on port ${PORT}`);
});

export { io, battles };
