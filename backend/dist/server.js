"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.battles = exports.io = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importStar(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
// Load environment variables
dotenv_1.default.config();
// Import OpenAI service
const openaiService_1 = require("./services/openaiService");
const openaiService = new openaiService_1.OpenAIService();
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
// ✅ Allowed Frontend Domains
const allowedOrigins = [
    process.env.CLIENT_URL || "http://localhost:3000",
    "https://ra-lilac.vercel.app" // Your Vercel frontend URL
];
// ✅ Apply CORS Middleware
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
}));
app.use(express_1.default.json());
const io = new socket_io_1.Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    }
});
exports.io = io;
// In-memory storage for active battles only; ended battles go to DB
const battles = new Map();
exports.battles = battles;
const waitingPlayers = [];
const waitingSet = new Set();
const botTimeouts = new Map();
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
function makeBotPlayer() {
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
const BattleMessageSchema = new mongoose_1.Schema({
    playerId: String,
    username: String,
    message: String,
    timestamp: Number,
    round: Number,
}, { _id: false });
const BattleSchema = new mongoose_1.Schema({
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
const BattleModel = (0, mongoose_1.model)('Battle', BattleSchema);
// User profile persistence
const UserProfileSchema = new mongoose_1.Schema({
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
UserProfileSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});
const UserProfileModel = (0, mongoose_1.model)('UserProfile', UserProfileSchema);
// Connect to MongoDB if configured
const mongoUri = process.env.MONGODB_URI || '';
if (mongoUri) {
    mongoose_1.default.connect(mongoUri).then(() => {
        console.log('Connected to MongoDB');
    }).catch((err) => {
        console.error('MongoDB connection error:', err);
    });
}
else {
    console.warn('MONGODB_URI not set; battle history will not persist.');
}
// Helpers for IP hashing
const IP_SALT = process.env.IP_HASH_SALT || 'roastarena_default_salt';
function hashIp(ip) {
    return crypto_1.default.createHmac('sha256', IP_SALT).update(ip).digest('hex');
}
function getSocketIp(socket) {
    // Prefer x-forwarded-for
    const xfwd = socket.handshake?.headers?.['x-forwarded-for'];
    if (xfwd) {
        // Could be comma-separated list; take first
        const first = xfwd.split(',')[0].trim();
        if (first)
            return first;
    }
    // Fallback to socket IP
    return socket.handshake?.address || '0.0.0.0';
}
// Helper function to end battle early (forfeit/disconnect)
function endBattleEarly(battleId, reason, winnerPlayer, loserPlayer) {
    const battle = battles.get(battleId);
    if (!battle || battle.status === 'ended')
        return;
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
        BattleModel.updateOne({ battleId }, {
            $set: {
                status: 'ended',
                endedAt: new Date(),
                result: winnerResult,
                messages: battle.messages,
            },
        }, { upsert: true }).catch(console.error);
    }
    // Clean up battle after delay
    setTimeout(() => {
        battles.delete(battleId);
    }, 60000);
}
// Assign a bot to a still-waiting player safely
function tryAssignBotToWaitingPlayer(socketId) {
    const timer = botTimeouts.get(socketId);
    if (timer) {
        clearTimeout(timer);
        botTimeouts.delete(socketId);
    }
    // Ensure the player is still queued
    if (!waitingSet.has(socketId))
        return;
    const index = waitingPlayers.findIndex(p => p.socketId === socketId);
    if (index === -1) {
        waitingSet.delete(socketId);
        return;
    }
    const player = waitingPlayers.splice(index, 1)[0];
    waitingSet.delete(socketId);
    // Ensure the human is still connected
    const humanSocket = io.sockets.sockets.get(player.socketId);
    if (!humanSocket)
        return;
    const bot = makeBotPlayer();
    createBattle(player, bot).catch(console.error);
}
// Schedule bot to send one roast for the current round
async function scheduleBotMessage(battleId, overrideDelayMs) {
    const battle = battles.get(battleId);
    if (!battle || battle.status !== 'active' || !battle.isBotBattle)
        return;
    if (battle.botTimerId) {
        clearTimeout(battle.botTimerId);
        battle.botTimerId = undefined;
    }
    const bot = battle.players.find(p => p.id === battle.botPlayerId);
    const human = battle.players.find(p => p.id !== battle.botPlayerId);
    if (!bot || !human)
        return;
    const delayMs = typeof overrideDelayMs === 'number' ? overrideDelayMs : (2000 + Math.floor(Math.random() * 2000)); // default 2-4s
    battle.botTimerId = setTimeout(async () => {
        const current = battles.get(battleId);
        if (!current || current.status !== 'active')
            return;
        // Ensure bot hasn't already spoken this round
        const alreadySpoke = current.messages.some(m => m.username === bot.username && m.round === current.currentRound);
        if (alreadySpoke)
            return;
        const botSide = current.playerSides[bot.id] || 'option2';
        const lastOpponentMessage = [...current.messages]
            .filter(m => m.username === human.username && m.round === current.currentRound)
            .slice(-1)[0]?.message;
        const text = await openaiService.generateBotRoast(current.topic, current.messages, bot.username, human.username, botSide, current.currentRound, lastOpponentMessage);
        const battleMessage = {
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
            BattleModel.updateOne({ battleId }, { $push: { messages: battleMessage } }).catch(console.error);
        }
    }, delayMs);
}
// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    // Map socket -> ipHash
    const clientIp = getSocketIp(socket);
    const ipHash = hashIp(clientIp);
    socket.data.ipHash = ipHash;
    // Find match
    socket.on('findMatch', (username) => {
        // Reconnection support: if user has an active battle, rejoin it instead of queueing
        const existingIpHash = socket.data.ipHash;
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
        const player = {
            id: socket.id,
            username: username || `Player${Date.now()}`,
            socketId: socket.id,
            ipHash: socket.data.ipHash
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
            const p1 = waitingPlayers.shift();
            // Remove stale entries
            const p1Socket = io.sockets.sockets.get(p1.socketId);
            if (!p1Socket) {
                waitingSet.delete(p1.socketId);
                continue;
            }
            let p2;
            while (waitingPlayers.length) {
                const candidate = waitingPlayers.shift();
                const candSocket = io.sockets.sockets.get(candidate.socketId);
                if (candSocket && candidate.socketId !== p1.socketId) {
                    p2 = candidate;
                    break;
                }
                else {
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
            if (t1) {
                clearTimeout(t1);
                botTimeouts.delete(p1.socketId);
            }
            const t2 = botTimeouts.get(p2.socketId);
            if (t2) {
                clearTimeout(t2);
                botTimeouts.delete(p2.socketId);
            }
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
    socket.on('sendMessage', async (data) => {
        const battle = battles.get(data.battleId);
        if (!battle || battle.status !== 'active')
            return;
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
        const battleMessage = {
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
            BattleModel.updateOne({ battleId: data.battleId }, { $push: { messages: battleMessage } }).catch(console.error);
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
    socket.on('joinSpectator', async (data) => {
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
                            players: (persisted.players || []).map((p) => ({ id: p.id, username: p.username })),
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
        const spectator = {
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
    socket.on('sendReaction', (data) => {
        const battle = battles.get(data.battleId);
        if (!battle || battle.status !== 'active')
            return;
        const spectator = battle.spectators.find(s => s.socketId === socket.id);
        if (!spectator)
            return;
        const allowedEmojis = ['😂', '🔥', '💯', '👏', '😱', '🤯', '💀', '🎯', '⚡', '🙌'];
        if (!allowedEmojis.includes(data.emoji))
            return;
        const reaction = {
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
    socket.on('leaveBattle', (battleId) => {
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
                    endBattleEarly(battleId, `${leavingPlayer.username} forfeited the battle. Victory goes to ${remainingPlayer.username}!`, remainingPlayer, leavingPlayer);
                }
            }
            else {
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
                    endBattleEarly(battleId, `${disconnectedPlayer.username} left the battle early. Victory goes to ${remainingPlayer.username} by forfeit!`, remainingPlayer, disconnectedPlayer);
                }
                else {
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
async function createBattle(player1, player2) {
    const battleId = `battle_${Date.now()}`;
    const topic = await openaiService.generateRoastTopic();
    const playerSides = {
        [player1.id]: 'option1',
        [player2.id]: 'option2'
    };
    const battle = {
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
        BattleModel.updateOne({ battleId }, {
            $setOnInsert: {
                battleId,
                topic,
                players: battle.players.map(p => ({ id: p.id, username: p.username })),
                playerSides,
                status: 'active',
                startedAt: new Date(),
                messages: [],
            },
        }, { upsert: true }).catch(console.error);
    }
    const player1Socket = io.sockets.sockets.get(player1.socketId);
    const player2Socket = io.sockets.sockets.get(player2.socketId);
    if (player1Socket)
        player1Socket.join(battleId);
    if (player2Socket)
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
    // Store timer ID for cleanup if battle ends early
    battle.timerId = setTimeout(() => nextRound(battleId), 60000);
    // If bot battle, schedule bot message for this round
    if (battle.isBotBattle) {
        scheduleBotMessage(battleId);
    }
}
// Move to next round or end
function nextRound(battleId) {
    const battle = battles.get(battleId);
    if (!battle || battle.status === 'ended')
        return;
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
    }
    else {
        endBattle(battleId);
    }
}
// End battle and judge
async function endBattle(battleId) {
    const battle = battles.get(battleId);
    if (!battle)
        return;
    // Clear any active timer
    if (battle.timerId) {
        clearTimeout(battle.timerId);
        battle.timerId = undefined;
    }
    if (battle.botTimerId) {
        clearTimeout(battle.botTimerId);
        battle.botTimerId = undefined;
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
        const judgment = await openaiService.judgeBattle(battle.topic, player1Messages, player2Messages, battle.players[0].username, battle.players[1].username, battle.playerSides[battle.players[0].id], battle.playerSides[battle.players[1].id]);
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
            await BattleModel.updateOne({ battleId }, {
                $set: {
                    status: 'ended',
                    endedAt: new Date(),
                    result: resultPayload,
                    messages: battle.messages,
                }
            }, { upsert: true });
            // Update user profiles (winner/loser by ipHash)
            try {
                const p1 = battle.players[0];
                const p2 = battle.players[1];
                const winner = winnerPlayerId === p1.id ? p1 : p2;
                const loser = winnerPlayerId === p1.id ? p2 : p1;
                if (winner.ipHash) {
                    await UserProfileModel.updateOne({ ipHash: winner.ipHash }, {
                        $set: { username: winner.username, lastSeen: new Date() },
                        $inc: { 'totals.battles': 1, 'totals.wins': 1 },
                        $push: {
                            recentMatches: {
                                $each: [
                                    { battleId, timestamp: new Date(), result: 'win', opponentUsername: loser.username, topic: battle.topic.topic }
                                ]
                            }
                        }
                    }, { upsert: true });
                }
                if (loser.ipHash) {
                    await UserProfileModel.updateOne({ ipHash: loser.ipHash }, {
                        $set: { username: loser.username, lastSeen: new Date() },
                        $inc: { 'totals.battles': 1, 'totals.losses': 1 },
                        $push: {
                            recentMatches: {
                                $each: [
                                    { battleId, timestamp: new Date(), result: 'loss', opponentUsername: winner.username, topic: battle.topic.topic }
                                ]
                            }
                        }
                    }, { upsert: true });
                }
            }
            catch (e) {
                console.error('Failed to update user profiles:', e);
            }
        }
    }
    catch (error) {
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
            await BattleModel.updateOne({ battleId }, {
                $set: {
                    status: 'ended',
                    endedAt: new Date(),
                    result: resultPayload,
                    messages: battle.messages,
                }
            }, { upsert: true });
            // Update user profiles with fallback result
            try {
                const p1 = battle.players[0];
                const p2 = battle.players[1];
                const winnerIsP1 = winner.id === p1.id;
                const winnerPlayer = winnerIsP1 ? p1 : p2;
                const loserPlayer = winnerIsP1 ? p2 : p1;
                if (winnerPlayer.ipHash) {
                    await UserProfileModel.updateOne({ ipHash: winnerPlayer.ipHash }, {
                        $set: { username: winnerPlayer.username, lastSeen: new Date() },
                        $inc: { 'totals.battles': 1, 'totals.wins': 1 },
                        $push: {
                            recentMatches: {
                                $each: [{ battleId, timestamp: new Date(), result: 'win', opponentUsername: loserPlayer.username, topic: battle.topic.topic }],
                                $slice: -100
                            }
                        }
                    }, { upsert: true });
                }
                if (loserPlayer.ipHash) {
                    await UserProfileModel.updateOne({ ipHash: loserPlayer.ipHash }, {
                        $set: { username: loserPlayer.username, lastSeen: new Date() },
                        $inc: { 'totals.battles': 1, 'totals.losses': 1 },
                        $push: {
                            recentMatches: {
                                $each: [{ battleId, timestamp: new Date(), result: 'loss', opponentUsername: winnerPlayer.username, topic: battle.topic.topic }],
                                $slice: -100
                            }
                        }
                    }, { upsert: true });
                }
            }
            catch (e) {
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
        if (!persisted)
            return res.status(404).json({ error: 'Battle not found' });
        return res.json({
            id,
            topic: persisted.topic?.topic,
            players: (persisted.players || []).map((p) => ({ id: p.id, username: p.username })),
            messages: persisted.messages || [],
            status: persisted.status,
            result: persisted.result || null,
            endedAt: persisted.endedAt,
            startedAt: persisted.startedAt,
        });
    }
    catch (e) {
        return res.status(500).json({ error: 'Failed to fetch battle' });
    }
});
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
// Helper to get request IP
function getRequestIp(req) {
    const xfwd = req.headers['x-forwarded-for'] || '';
    if (xfwd) {
        const first = xfwd.split(',')[0].trim();
        if (first)
            return first;
    }
    return req.ip || req.socket?.remoteAddress || '0.0.0.0';
}
// Return the current user's profile based on IP
app.get('/api/me/profile', async (req, res) => {
    if (!mongoUri)
        return res.status(200).json({ enabled: false });
    try {
        const ip = getRequestIp(req);
        const ipHash = hashIp(ip);
        const profile = await UserProfileModel.findOne({ ipHash }).lean();
        if (!profile)
            return res.json({ enabled: true, totals: { battles: 0, wins: 0, losses: 0 }, recentMatches: [] });
        // Build simple last-14-days chart buckets
        const days = 14;
        const buckets = [];
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            buckets.push({ date: key, wins: 0, losses: 0 });
        }
        (profile.recentMatches || []).forEach((m) => {
            const key = new Date(m.timestamp).toISOString().slice(0, 10);
            const bucket = buckets.find(b => b.date === key);
            if (bucket) {
                if (m.result === 'win')
                    bucket.wins += 1;
                else
                    bucket.losses += 1;
            }
        });
        // Build all-time daily buckets from first recorded match
        let chartAll = [];
        const matches = (profile.recentMatches || []).slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
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
                    if (m.result === 'win')
                        row.wins += 1;
                    else
                        row.losses += 1;
                }
            }
            // Totals and cumulative
            let cw = 0, cl = 0;
            chartAll = chartAll.map(d => {
                cw += d.wins;
                cl += d.losses;
                return { ...d, total: d.wins + d.losses, cw, cl };
            });
        }
        res.json({
            enabled: true,
            totals: profile.totals,
            recentMatches: profile.recentMatches || [],
            chart: buckets,
            chartAll
        });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to load profile' });
    }
});
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`RoastArena server running on port ${PORT}`);
});
//# sourceMappingURL=server.js.map