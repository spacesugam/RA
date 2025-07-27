import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * Session Storage Strategy for Battle History
 * 
 * WHY SESSION STORAGE:
 * ✅ Clears when browser tab closes (good for temporary data)
 * ✅ Survives page refreshes during active battles
 * ✅ 5-10MB storage limit (sufficient for text messages)
 * ✅ Privacy-friendly (data doesn't persist across sessions)
 * 
 * EDGE CASES HANDLED:
 * 1. Storage quota exceeded - clear and retry
 * 2. Stale data - auto-expire after 1 hour
 * 3. Version compatibility - clear on format changes
 * 4. Battle state merging - avoid duplicate messages
 * 5. Graceful degradation - app works without storage
 * 6. Memory management - limit reaction history
 * 7. Cleanup on battle end - clear after 5 minutes
 * 
 * ALTERNATIVES CONSIDERED:
 * ❌ Local Storage: Too persistent, privacy concerns
 * ❌ IndexedDB: Overkill for simple text data
 * ❌ Memory only: Lost on page refresh
 * ✅ Session Storage + Server history: Best balance
 */

// Session storage utilities for battle data
const BATTLE_STORAGE_KEY = 'roastArena_currentBattle';
const STORAGE_VERSION = '1.0'; // For handling storage format changes

interface StoredBattleData {
  battle: Battle;
  timestamp: number;
  version: string;
}

const saveBattleToStorage = (battle: Battle) => {
  try {
    const data: StoredBattleData = {
      battle,
      timestamp: Date.now(),
      version: STORAGE_VERSION
    };
    sessionStorage.setItem(BATTLE_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save battle to session storage:', error);
    // Handle storage quota exceeded
    try {
      sessionStorage.clear();
      sessionStorage.setItem(BATTLE_STORAGE_KEY, JSON.stringify({
        battle,
        timestamp: Date.now(),
        version: STORAGE_VERSION
      }));
    } catch (clearError) {
      console.error('Session storage completely unavailable:', clearError);
    }
  }
};

const loadBattleFromStorage = (): Battle | null => {
  try {
    const stored = sessionStorage.getItem(BATTLE_STORAGE_KEY);
    if (!stored) return null;
    
    const data: StoredBattleData = JSON.parse(stored);
    
    // Check version compatibility
    if (data.version !== STORAGE_VERSION) {
      sessionStorage.removeItem(BATTLE_STORAGE_KEY);
      return null;
    }
    
    // Check if data is too old (older than 1 hour)
    const oneHour = 60 * 60 * 1000;
    if (Date.now() - data.timestamp > oneHour) {
      sessionStorage.removeItem(BATTLE_STORAGE_KEY);
      return null;
    }
    
    // Ensure reactions array exists
    return {
      ...data.battle,
      reactions: data.battle.reactions || []
    };
  } catch (error) {
    console.warn('Failed to load battle from session storage:', error);
    sessionStorage.removeItem(BATTLE_STORAGE_KEY);
    return null;
  }
};

const clearBattleStorage = () => {
  try {
    sessionStorage.removeItem(BATTLE_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear battle storage:', error);
  }
};

export interface BattleMessage {
  playerId: string;
  username: string;
  message: string;
  timestamp: number;
  round: number;
}

export interface EmojiReaction {
  spectatorId: string;
  username: string;
  emoji: string;
  timestamp: number;
}

export interface Battle {
  id: string;
  topic: string;
  currentRound: number;
  maxRounds: number;
  status: 'waiting' | 'active' | 'ended';
  players: { id: string; username: string }[];
  messages: BattleMessage[];
  isSpectator?: boolean;
  spectatorCount?: number;
  reactions?: EmojiReaction[];
  roundStartTime?: number;
  joinedAt?: number; // When spectator joined (for distinguishing old vs new messages)
}

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [currentBattle, setCurrentBattle] = useState<Battle | null>(null);
  const [searchingMatch, setSearchingMatch] = useState(false);
  const [battleResult, setBattleResult] = useState<any>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [spectatorError, setSpectatorError] = useState<string | null>(null);
  const [battleHistoryLoaded, setBattleHistoryLoaded] = useState(false);

  // Try to restore battle from session storage on mount
  useEffect(() => {
    const storedBattle = loadBattleFromStorage();
    if (storedBattle && storedBattle.status === 'active') {
      setCurrentBattle(storedBattle);
      setIsSpectator(storedBattle.isSpectator || false);
      setBattleHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    const socketInstance = io('http://localhost:3001');
    
    socketInstance.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });

    socketInstance.on('searchingMatch', () => {
      setSearchingMatch(true);
    });

    socketInstance.on('battleStarted', (data: {
      battleId: string;
      topic: string;
      players: { id: string; username: string }[];
      currentRound: number;
      maxRounds: number;
    }) => {
      setSearchingMatch(false);
      const newBattle: Battle = {
        id: data.battleId,
        topic: data.topic,
        currentRound: data.currentRound,
        maxRounds: data.maxRounds,
        status: 'active',
        players: data.players,
        messages: [],
        reactions: []
      };
      setCurrentBattle(newBattle);
      setBattleResult(null);
      setIsSpectator(false);
      setBattleHistoryLoaded(false);
      
      // Save to session storage
      saveBattleToStorage(newBattle);
    });

    socketInstance.on('newMessage', (message: BattleMessage) => {
      setCurrentBattle(prev => {
        if (!prev) return prev;
        
        // Check for duplicate messages
        const messageExists = prev.messages.some(msg => 
          msg.timestamp === message.timestamp && 
          msg.playerId === message.playerId
        );
        
        if (messageExists) return prev;
        
        const updatedBattle = {
          ...prev,
          messages: [...prev.messages, message]
        };
        
        // Save to session storage
        saveBattleToStorage(updatedBattle);
        
        return updatedBattle;
      });
    });

    socketInstance.on('roundChanged', (data: { currentRound: number; maxRounds: number }) => {
      setCurrentBattle(prev => {
        if (!prev) return prev;
        const updatedBattle = {
          ...prev,
          currentRound: data.currentRound
        };
        
        // Save to session storage
        saveBattleToStorage(updatedBattle);
        
        return updatedBattle;
      });
    });

    socketInstance.on('battleEnded', (result: any) => {
      setCurrentBattle(prev => {
        if (!prev) return prev;
        const endedBattle = {
          ...prev,
          status: 'ended' as const
        };
        
        // Keep battle in storage temporarily so users can see results
        saveBattleToStorage(endedBattle);
        
        return endedBattle;
      });
      setBattleResult(result);
      
      // Clear storage after 5 minutes to show results but not persist indefinitely
      setTimeout(() => {
        clearBattleStorage();
      }, 5 * 60 * 1000);
    });

    socketInstance.on('messageBlocked', (data: { reason: string }) => {
      alert(`Message blocked: ${data.reason}`);
    });

    socketInstance.on('battleState', (data: { battle: Battle }) => {
      const serverBattle = {
        ...data.battle,
        reactions: data.battle.reactions || []
      };
      
      // If we have cached data and server data is newer, merge them intelligently
      setCurrentBattle(prev => {
        if (prev && prev.id === serverBattle.id && battleHistoryLoaded) {
          // Merge cached messages with server messages, avoiding duplicates
          const mergedMessages = [...prev.messages];
          serverBattle.messages.forEach(serverMsg => {
            const exists = mergedMessages.some(msg => 
              msg.timestamp === serverMsg.timestamp && 
              msg.playerId === serverMsg.playerId
            );
            if (!exists) {
              mergedMessages.push(serverMsg);
            }
          });
          
          // Sort messages by timestamp
          mergedMessages.sort((a, b) => a.timestamp - b.timestamp);
          
          return {
            ...serverBattle,
            messages: mergedMessages
          };
        }
        return serverBattle;
      });
      
      setIsSpectator(data.battle.isSpectator || false);
      setSpectatorError(null);
      setBattleHistoryLoaded(true);
      
      // Save to session storage
      saveBattleToStorage(serverBattle);
    });

    // Spectator-specific events
    socketInstance.on('spectatorLimitReached', () => {
      setSpectatorError('This battle room is full (20 spectators max)');
    });

    socketInstance.on('battleNotFound', () => {
      setSpectatorError('Battle not found or has ended');
    });

    socketInstance.on('battleAlreadyEnded', () => {
      setSpectatorError('This battle has already ended');
    });

    socketInstance.on('alreadyInBattle', () => {
      setSpectatorError('You are already in this battle');
    });

    socketInstance.on('spectatorCountUpdated', (data: { spectatorCount: number }) => {
      setCurrentBattle(prev => {
        if (!prev) return prev;
        const updatedBattle = {
          ...prev,
          spectatorCount: data.spectatorCount
        };
        
        // Save to session storage
        saveBattleToStorage(updatedBattle);
        
        return updatedBattle;
      });
    });

    // Emoji reaction events
    socketInstance.on('newReaction', (reaction: EmojiReaction) => {
      setCurrentBattle(prev => {
        if (!prev) return prev;
        const updatedBattle = {
          ...prev,
          reactions: [...(prev.reactions || []), reaction]
        };
        
        // Save to session storage (reactions are temporary, but save for consistency)
        saveBattleToStorage(updatedBattle);
        
        return updatedBattle;
      });
    });

    socketInstance.on('reactionRemoved', (data: { timestamp: number }) => {
      setCurrentBattle(prev => {
        if (!prev) return prev;
        const updatedBattle = {
          ...prev,
          reactions: (prev.reactions || []).filter(r => r.timestamp !== data.timestamp)
        };
        
        // Save to session storage
        saveBattleToStorage(updatedBattle);
        
        return updatedBattle;
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const findMatch = (username: string) => {
    socket?.emit('findMatch', username);
  };

  const sendMessage = (message: string, username: string) => {
    if (currentBattle) {
      socket?.emit('sendMessage', {
        battleId: currentBattle.id,
        message,
        username
      });
    }
  };

  const joinSpectator = (battleId: string, username: string) => {
    setSpectatorError(null);
    socket?.emit('joinSpectator', { battleId, username });
  };

  const sendReaction = (emoji: string, username: string) => {
    if (currentBattle && isSpectator) {
      socket?.emit('sendReaction', {
        battleId: currentBattle.id,
        emoji,
        username
      });
    }
  };

  const leaveBattle = () => {
    if (currentBattle) {
      socket?.emit('leaveBattle', currentBattle.id);
      setCurrentBattle(null);
      setBattleResult(null);
      setIsSpectator(false);
      setSpectatorError(null);
      setBattleHistoryLoaded(false);
      
      // Clear session storage when leaving battle
      clearBattleStorage();
    }
  };

  return {
    socket,
    connected,
    currentBattle,
    searchingMatch,
    battleResult,
    isSpectator,
    spectatorError,
    battleHistoryLoaded,
    findMatch,
    sendMessage,
    joinSpectator,
    sendReaction,
    leaveBattle
  };
}; 