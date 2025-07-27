'use client';

import { useState, useEffect, useRef } from 'react';
import { Battle, BattleMessage, EmojiReaction } from '../hooks/useSocket';
import { FiSend, FiClock, FiUsers, FiEye } from 'react-icons/fi';

interface BattleRoomProps {
  battle: Battle;
  onSendMessage: (message: string, username: string) => void;
  onSendReaction?: (emoji: string, username: string) => void;
  onLeaveBattle: () => void;
  battleResult?: any;
  username: string;
  isSpectator?: boolean;
  battleHistoryLoaded?: boolean;
}

export default function BattleRoom({ 
  battle, 
  onSendMessage, 
  onSendReaction, 
  onLeaveBattle, 
  battleResult, 
  username, 
  isSpectator = false,
  battleHistoryLoaded = false
}: BattleRoomProps) {
  const [message, setMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Emoji reactions for spectators
  const allowedEmojis = ['😂', '🔥', '💯', '👏', '😱', '🤯', '💀', '🎯', '⚡', '🙌'];
  
  // Helper function to determine if message is historical (for spectators)
  const isHistoricalMessage = (msg: BattleMessage) => {
    if (!isSpectator || !battle.joinedAt) return false;
    return msg.timestamp < battle.joinedAt;
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [battle.messages]);

  // Timer countdown
  useEffect(() => {
    if (battle.status === 'active' && !battleResult) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            return 60; // Reset for next round
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [battle.currentRound, battle.status, battleResult]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && battle.status === 'active' && !battleResult && !isSpectator) {
      onSendMessage(message.trim(), username);
      setMessage('');
      inputRef.current?.focus();
    }
  };

  const handleSendReaction = (emoji: string) => {
    if (onSendReaction && isSpectator && battle.status === 'active' && !battleResult) {
      onSendReaction(emoji, username);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getMessageAlignment = (msg: BattleMessage) => {
    return msg.username === username ? 'justify-end' : 'justify-start';
  };

  const getMessageColor = (msg: BattleMessage) => {
    return msg.username === username 
      ? 'bg-orange-500 text-white' 
      : 'bg-gray-700 text-white';
  };

  if (battleResult) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-gray-800 rounded-lg p-8 text-center">
          <h2 className="text-3xl font-bold mb-6">Battle Complete!</h2>
          
          <div className="mb-6">
            <div className="text-6xl mb-4">
              {battleResult?.winner?.username === username ? '🏆' : '🥈'}
            </div>
            <h3 className="text-2xl font-bold mb-2">
              {battleResult?.winner?.username === username ? 'You Won!' : `${battleResult?.winner?.username} Won!`}
            </h3>
            {battleResult?.reasoning && (
              <p className="text-gray-300 mb-4">{battleResult.reasoning}</p>
            )}
          </div>

          {battleResult?.scores && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              {battle.players.map((player, index) => (
                <div key={player.id} className="bg-gray-700 rounded p-4">
                  <h4 className="font-bold mb-2">{player.username}</h4>
                  <div className="text-sm">
                    <div>Wit: {battleResult?.scores?.[`player${index + 1}`]?.wit || 0}/10</div>
                    <div>Humor: {battleResult?.scores?.[`player${index + 1}`]?.humor || 0}/10</div>
                    <div>Originality: {battleResult?.scores?.[`player${index + 1}`]?.originality || 0}/10</div>
                    <div className="font-bold mt-2">
                      Total: {battleResult?.scores?.[`player${index + 1}`]?.total || 0}/30
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={onLeaveBattle}
            className="bg-orange-500 hover:bg-orange-600 px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onLeaveBattle}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← Back
            </button>
            <h1 className="text-xl font-bold">Roast Battle</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <FiUsers className="text-orange-500" />
              <span className="text-sm">{battle.players.length} fighters</span>
            </div>
            {battle.spectatorCount !== undefined && (
              <div className="flex items-center space-x-2">
                <FiEye className="text-blue-500" />
                <span className="text-sm">{battle.spectatorCount || 0} watching</span>
              </div>
            )}
            {isSpectator && (
              <span className="text-xs bg-blue-600 px-2 py-1 rounded">SPECTATOR</span>
            )}
            <div className="flex items-center space-x-2">
              <FiClock className="text-orange-500" />
              <span className="text-sm font-mono">{formatTime(timeLeft)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Topic & Round Info */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-orange-500 mb-2">{battle.topic}</h2>
          <p className="text-gray-300">
            Round {battle.currentRound} of {battle.maxRounds}
          </p>
        </div>
      </div>

      {/* Players */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-4xl mx-auto flex justify-center space-x-8">
          {battle.players.map((player, index) => (
            <div 
              key={player.id} 
              className={`text-center ${player.username === username ? 'text-orange-500' : 'text-blue-400'}`}
            >
              <div className="text-2xl mb-1">
                {player.username === username ? '🔥' : '⚔️'}
              </div>
              <div className="font-semibold">{player.username}</div>
              {player.username === username && (
                <div className="text-xs text-gray-400">You</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Messages and Reactions */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-4xl mx-auto space-y-4">
            {battle.messages.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <div className="text-4xl mb-4">🎤</div>
                <p>{isSpectator ? 'Watch the battle unfold!' : 'The battle begins! Drop your best roasts...'}</p>
                {isSpectator && battleHistoryLoaded && (
                  <p className="text-xs text-gray-500 mt-2">
                    💡 You'll see full battle history including previous messages
                  </p>
                )}
              </div>
            ) : (
              (() => {
                const messages = battle.messages;
                const spectatorJoinTime = battle.joinedAt;
                let hasShownJoinIndicator = false;
                
                return messages.map((msg, index) => {
                  const isHistorical = isHistoricalMessage(msg);
                  const nextMsg = messages[index + 1];
                  const shouldShowJoinIndicator = 
                    isSpectator && 
                    spectatorJoinTime && 
                    !hasShownJoinIndicator && 
                    isHistorical && 
                    nextMsg && 
                    nextMsg.timestamp >= spectatorJoinTime;
                  
                  if (shouldShowJoinIndicator) {
                    hasShownJoinIndicator = true;
                  }
                  
                  return (
                    <div key={index}>
                      <div className={`flex ${getMessageAlignment(msg)} ${isHistorical ? 'opacity-70' : ''}`}>
                        <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${getMessageColor(msg)} relative`}>
                          <div className="text-xs opacity-75 mb-1 flex items-center space-x-2">
                            <span>{msg.username} • Round {msg.round}</span>
                            {isHistorical && (
                              <span className="bg-gray-600 px-1 py-0.5 rounded text-xs text-gray-300">
                                📜 History
                              </span>
                            )}
                          </div>
                          <div>{msg.message}</div>
                        </div>
                      </div>
                      
                      {shouldShowJoinIndicator && (
                        <div className="flex items-center justify-center my-4">
                          <div className="flex-1 border-t border-gray-600"></div>
                          <div className="px-4 text-sm text-gray-400 bg-gray-800">
                            👁️ You joined here
                          </div>
                          <div className="flex-1 border-t border-gray-600"></div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
        
        {/* Live Reactions Overlay */}
        {battle.reactions && battle.reactions?.length > 0 && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {battle.reactions?.map((reaction, index) => (
              <div
                key={reaction.timestamp}
                className="absolute animate-bounce text-2xl"
                style={{
                  left: `${Math.random() * 80 + 10}%`,
                  top: `${Math.random() * 60 + 20}%`,
                  animationDelay: `${index * 0.1}s`,
                  animationDuration: '2s'
                }}
              >
                {reaction.emoji}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message Input / Reactions */}
      <div className="bg-gray-800 p-4 border-t border-gray-700">
        <div className="max-w-4xl mx-auto">
          {isSpectator ? (
            /* Spectator Emoji Reactions */
            battle.status === 'active' && !battleResult ? (
              <div className="space-y-3">
                <div className="text-center text-sm text-gray-400">
                  React to the battle! 👇
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {allowedEmojis.map((emoji, index) => (
                    <button
                      key={index}
                      onClick={() => handleSendReaction(emoji)}
                      className="text-2xl p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors transform hover:scale-110"
                      title={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-gray-400 text-center">
                  Spectator reactions appear for 3 seconds
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-4">
                {battleResult ? 'Battle ended - Check out the results!' : 'Waiting for battle to start...'}
              </div>
            )
          ) : (
            /* Player Message Input */
            <>
              <form onSubmit={handleSendMessage} className="flex space-x-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={battle.status === 'active' ? "Drop your roast..." : "Battle ended"}
                  disabled={battle.status !== 'active'}
                  className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                  maxLength={280}
                />
                <button
                  type="submit"
                  disabled={!message.trim() || battle.status !== 'active'}
                  className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 px-4 py-2 rounded-lg transition-colors"
                >
                  <FiSend />
                </button>
              </form>
              <div className="text-xs text-gray-400 mt-2 text-center">
                {message.length}/280 characters
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
} 