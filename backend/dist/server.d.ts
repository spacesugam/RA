import { Server } from 'socket.io';
declare const io: Server<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
interface Battle {
    id: string;
    players: Player[];
    topic: {
        topic: string;
        option1: {
            text: string;
            difficulty: number;
        };
        option2: {
            text: string;
            difficulty: number;
        };
    };
    playerSides: {
        [playerId: string]: 'option1' | 'option2';
    };
    currentRound: number;
    maxRounds: number;
    roundStartTime: number;
    status: 'waiting' | 'active' | 'ended';
    messages: BattleMessage[];
    spectators: Spectator[];
    reactions: EmojiReaction[];
    result?: any;
    timerId?: NodeJS.Timeout;
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
declare const battles: Map<string, Battle>;
export { io, battles };
//# sourceMappingURL=server.d.ts.map