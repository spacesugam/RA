# 🔥 RoastArena - Web-Based Roast Battle Platform

A real-time web application where users can engage in witty roast battles judged by AI. Built with Next.js, Socket.io, and Google's Gemini AI.

## ✨ Features

### Core Features (MVP)
- **Real-time Roast Battles**: 3 rounds, 1 minute each
- **AI Judging**: Gemini AI judges battles based on wit, humor, and originality
- **Live Spectating**: Watch ongoing battles with real-time updates
- **Content Moderation**: AI-powered content filtering
- **Matchmaking**: Automatic pairing of users for battles

### Battle System
- Timed rounds with visual countdown
- Real-time chat with message history
- Automatic round progression
- Detailed scoring breakdown (Wit, Humor, Originality)

## 🛠 Tech Stack

### Frontend
- **Next.js 15** - React framework with TypeScript
- **Tailwind CSS 4** - Utility-first styling
- **Socket.io Client** - Real-time communication
- **React Icons** - Icon library

### Backend
- **Node.js + Express** - Server runtime and framework
- **Socket.io** - Real-time WebSocket communication
- **TypeScript** - Type safety
- **Google Gemini AI** - AI judging and content moderation

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Google Gemini API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd RoastArena
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   
   # Create environment file
   cp .env.example .env
   # Add your GEMINI_API_KEY to .env
   ```

3. **Frontend Setup**
   ```bash
   cd ../frontend/roast-arena
   npm install
   ```

### Environment Variables

Create a `.env` file in the `backend` directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3001
NODE_ENV=development
```

**Get your Gemini API key:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy it to your `.env` file

### Running the Application

1. **Start the backend server**
   ```bash
   cd backend
   npm run dev
   ```
   Server will run on http://localhost:3001

2. **Start the frontend** (in a new terminal)
   ```bash
   cd frontend/roast-arena
   npm run dev
   ```
   Frontend will run on http://localhost:3000

3. **Open your browser**
   Navigate to http://localhost:3000

## 🎮 How to Use

### Starting a Battle
1. Enter a username when prompted
2. Click "Find Roast Battle" 
3. Wait for matchmaking (usually 10-30 seconds)
4. Get matched with another player

### During Battle
- **3 rounds, 1 minute each**
- Type your roasts in the chat
- Messages are moderated by AI
- Timer shows remaining time for each round

### After Battle
- AI judges based on wit, humor, and originality
- View detailed scores for each category
- See winner announcement with reasoning

### Spectating
- View live battles from the home page
- Join as spectator to watch ongoing battles
- See real-time messages without participating

## 🏗 Project Structure

```
RoastArena/
├── backend/
│   ├── services/
│   │   └── geminiService.ts    # AI integration
│   ├── server.ts               # Main server file
│   ├── package.json
│   └── tsconfig.json
└── frontend/roast-arena/
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx        # Main home page
    │   │   ├── layout.tsx      # App layout
    │   │   └── globals.css     # Global styles
    │   ├── components/
    │   │   └── BattleRoom.tsx  # Battle interface
    │   └── hooks/
    │       └── useSocket.ts    # Socket.io hook
    ├── package.json
    └── tailwind.config.ts
```

## 🎯 Battle Rules

### Format
- **3 rounds** of 1 minute each
- **Text-based** roasts only
- **AI-judged** winner selection

### Scoring Criteria
- **Wit (1-10)**: Cleverness and wordplay
- **Humor (1-10)**: How funny the roasts are  
- **Originality (1-10)**: Creativity and uniqueness

### Guidelines
- Keep it fun and witty
- No personal attacks or harassment
- Stick to neutral, light-hearted topics
- Content is AI-moderated in real-time

## 🔧 Development

### Adding New Features
1. Backend changes go in `backend/`
2. Frontend components in `frontend/roast-arena/src/components/`
3. Socket events defined in both `server.ts` and `useSocket.ts`

### Testing
- Backend: `cd backend && npm test`
- Frontend: `cd frontend/roast-arena && npm test`

## 🚀 Deployment

### Backend (Server)
1. Build: `npm run build`
2. Start: `npm start`
3. Environment: Set `GEMINI_API_KEY` and `PORT`

### Frontend (Vercel)
1. Connect GitHub repo to Vercel
2. Auto-deploys on push to main
3. Update Socket.io URL to production backend

## 🛡 Content Moderation

The app uses Gemini AI to moderate messages in real-time:
- Blocks inappropriate content
- Prevents personal attacks
- Filters hate speech and harassment
- Maintains fun, light-hearted atmosphere

## 📝 TODO / Future Features

- [ ] User authentication and profiles
- [ ] Battle history and statistics  
- [ ] Tournament system
- [ ] Emoji reactions for spectators
- [ ] Mobile app version
- [ ] Voice battle mode
- [ ] Leaderboards and rankings

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🎉 Credits

Built with ❤️ using:
- [Next.js](https://nextjs.org/)
- [Socket.io](https://socket.io/)
- [Google Gemini AI](https://ai.google.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

---

**Ready to battle? Let the roasts begin! 🔥** 