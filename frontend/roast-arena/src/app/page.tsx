'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import BattleRoom from '../components/BattleRoom';
import { FiZap, FiUsers, FiTrendingUp } from 'react-icons/fi';
import axios from 'axios';

interface LiveBattle {
  id: string;
  topic: string;
  players: { username: string }[];
  spectatorCount: number;
  maxSpectators: number;
  isFull: boolean;
  currentRound: number;
  maxRounds: number;
}

export default function Home() {
  const [username, setUsername] = useState('');
  const [showUsernameModal, setShowUsernameModal] = useState(true);
  const [liveBattles, setLiveBattles] = useState<LiveBattle[]>([]);
  const { 
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
  } = useSocket();

  // Fetch live battles
  useEffect(() => {
    const fetchLiveBattles = async () => {
      try {
        const response = await axios.get('http://localhost:3001/api/battles');
        setLiveBattles(response.data);
      } catch (error) {
        console.error('Error fetching live battles:', error);
      }
    };

    fetchLiveBattles();
    const interval = setInterval(fetchLiveBattles, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const handleStartBattle = () => {
    if (username.trim()) {
      findMatch(username.trim());
    }
  };

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setShowUsernameModal(false);
    }
  };

  // Show battle room if in a battle
  if (currentBattle) {
    return (
      <BattleRoom
        battle={currentBattle}
        onSendMessage={sendMessage}
        onSendReaction={sendReaction}
        onLeaveBattle={leaveBattle}
        battleResult={battleResult}
        username={username}
        isSpectator={isSpectator}
        battleHistoryLoaded={battleHistoryLoaded}
      />
    );
  }

  // Username modal
  if (showUsernameModal) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="bg-gray-800 p-8 rounded-lg max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-4xl mb-4">🔥</div>
            <h1 className="text-3xl font-bold text-orange-500 mb-2">RoastArena</h1>
            <p className="text-gray-300">Enter the battle zone</p>
          </div>

          <form onSubmit={handleUsernameSubmit}>
            <div className="mb-6">
              <label htmlFor="username" className="block text-sm font-medium mb-2">
                Choose your battle name
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username..."
                className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                maxLength={20}
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Enter Arena
            </button>
          </form>

          <div className="mt-4 text-xs text-gray-400 text-center">
            Connection: {connected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
        </div>
      </div>
    );
  }

  // Searching for match
  if (searchingMatch) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">⚔️</div>
          <h2 className="text-2xl font-bold mb-2">Finding Your Opponent...</h2>
          <p className="text-gray-300 mb-6">Matching you with another warrior</p>
          
          <div className="flex justify-center space-x-2 mb-6">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce delay-75"></div>
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce delay-150"></div>
          </div>

          <button
            onClick={leaveBattle}
            className="text-gray-400 hover:text-white transition-colors"
          >
            Cancel Search
          </button>
        </div>
      </div>
    );
  }

  // Main home page
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-3xl">🔥</div>
              <h1 className="text-2xl font-bold text-orange-500">RoastArena</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-300">Welcome, {username}!</span>
              <div className="text-xs">
                {connected ? '🟢 Online' : '🔴 Offline'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Ready to Battle?</h2>
          <p className="text-gray-300 text-lg mb-8">
            Face off against strangers in witty roast battles. Let AI judge your humor!
          </p>
          
          <button
            onClick={handleStartBattle}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors transform hover:scale-105"
          >
            <FiZap className="inline mr-2" />
            Find Roast Battle
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gray-800 p-6 rounded-lg text-center">
            <FiUsers className="text-3xl text-orange-500 mx-auto mb-2" />
            <h3 className="text-xl font-semibold mb-1">Live Battles</h3>
            <p className="text-2xl font-bold text-orange-500">{liveBattles.length}</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg text-center">
            <FiTrendingUp className="text-3xl text-blue-500 mx-auto mb-2" />
            <h3 className="text-xl font-semibold mb-1">Total Fighters</h3>
            <p className="text-2xl font-bold text-blue-500">
              {liveBattles.reduce((acc, battle) => acc + (battle.spectatorCount || 0) + 2, 0)}
            </p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg text-center">
            <div className="text-3xl text-green-500 mx-auto mb-2">🏆</div>
            <h3 className="text-xl font-semibold mb-1">AI Judged</h3>
            <p className="text-2xl font-bold text-green-500">100%</p>
          </div>
        </div>

        {/* Spectator Error */}
        {spectatorError && (
          <div className="mb-6 p-4 bg-red-600 rounded-lg">
            <div className="flex items-center justify-between">
              <span>{spectatorError}</span>
              <button
                onClick={() => window.location.reload()}
                className="text-sm underline hover:no-underline"
              >
                Refresh
              </button>
            </div>
          </div>
        )}

        {/* Live Battles */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold mb-6">Live Battles 🔴</h3>
          
          {liveBattles.length === 0 ? (
            <div className="bg-gray-800 p-8 rounded-lg text-center">
              <div className="text-4xl mb-4">💤</div>
              <p className="text-gray-300">No active battles right now. Start one!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveBattles.map((battle) => (
                <div key={battle.id} className={`bg-gray-800 p-4 rounded-lg transition-colors ${
                  battle.isFull ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700 cursor-pointer'
                }`}
                     onClick={() => !battle.isFull && joinSpectator(battle.id, username)}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-gray-400">LIVE</span>
                      {battle.isFull && (
                        <span className="text-xs bg-red-600 px-2 py-1 rounded">FULL</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-400">
                      Round {battle.currentRound}/{battle.maxRounds}
                    </span>
                  </div>
                  
                  <h4 className="font-semibold mb-2 text-orange-500 line-clamp-2">
                    {battle.topic}
                  </h4>
                  
                  <div className="flex items-center justify-between text-sm text-gray-300">
                    <div className="flex items-center space-x-2">
                      <span>{battle.players[0]?.username}</span>
                      <span className="text-orange-500">VS</span>
                      <span>{battle.players[1]?.username}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <FiUsers className="text-xs" />
                      <span className={battle.isFull ? 'text-red-400 font-bold' : ''}>
                        {battle.spectatorCount}/{battle.maxSpectators}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rules */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-bold mb-4">Battle Rules 📋</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div>
              <h4 className="font-semibold text-white mb-2">Format</h4>
              <ul className="space-y-1">
                <li>• 3 rounds, 1 minute each</li>
                <li>• Text-based roasts only</li>
                <li>• AI judges the winner</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-2">Guidelines</h4>
              <ul className="space-y-1">
                <li>• Keep it fun and witty</li>
                <li>• No personal attacks</li>
                <li>• Stick to the topic</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
