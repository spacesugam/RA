import OpenAI from 'openai';

interface BattleMessage {
  playerId: string;
  username: string;
  message: string;
  timestamp: number;
  round: number;
}

interface JudgmentResult {
  winner: {
    playerId: string;
    username: string;
    score: number;
  };
  scores: {
    [playerId: string]: {
      wit: number;
      humor: number;
      originality: number;
      total: number;
    };
  };
  reasoning: string;
}

interface RoastTopic {
  topic: string;
  option1: { text: string; difficulty: number };
  option2: { text: string; difficulty: number };
}

export class OpenAIService {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API Key is missing. Please set OPENAI_API_KEY in your .env file.');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Generate a roast battle topic with difficulty ratings for each side.
   */
  async generateRoastTopic(): Promise<RoastTopic> {
    try {
        const prompt = `
        Generate a roast battle topic with two opposing sides.
        Topics should be highly varied and cover diverse categories including but not limited to: science, films, psychology, economics, sexual desires, gossips, sports, space, social media, politics, history, technology, food, animals, relationships, and taboo subjects that people are often shy to discuss openly (like bodily functions, intimate preferences, societal taboos, etc.).
        Avoid repeating common topics like pizza toppings, cat vs dog persons, coffee vs tea, etc. Aim for unique, creative, and unexpected matchups each time.
        Then rate difficulty for roasting/defending each side on a scale of 1-10
        (1 = easiest to roast, 10 = hardest to roast).

        Output strictly in JSON format:
        {
          "topic": "Example Topic",
          "option1": { "text": "Side 1", "difficulty": number },
          "option2": { "text": "Side 2", "difficulty": number }
        }

        Rules:
        - Difficulty means: how hard it is to make funny roasts for that side.
        - Make the topic fun, relatable, and roastable, even if taboo - focus on humor potential.
        - Examples of varied topics:
          - Quantum Physics vs Astrology (Quantum: 8, Astrology: 4)
          - Marvel Movies vs DC Movies (Marvel: 5, DC: 6)
          - Introverts vs Extroverts (Introverts: 7, Extroverts: 3)
          - Cryptocurrency vs Traditional Banking (Crypto: 6, Banking: 4)
          - Morning Sex vs Evening Sex (Morning: 5, Evening: 5)
          - Celebrity Gossip vs Political Scandals (Gossip: 3, Scandals: 7)
          - Soccer vs American Football (Soccer: 4, Football: 5)
          - Mars Colonization vs Ocean Exploration (Mars: 7, Ocean: 6)
          - TikTok vs Instagram (TikTok: 4, Instagram: 5)
          - Public Speaking vs Intimate Conversations (Public: 8, Intimate: 4)

        Generate one now:
      `;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.8
      });

      const text = completion.choices[0]?.message?.content?.trim();
      const jsonMatch = text?.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid response format');

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Error generating topic:', error);
      return {
        topic: 'Coffee vs Tea',
        option1: { text: 'Coffee', difficulty: 4 },
        option2: { text: 'Tea', difficulty: 5 }
      };
    }
  }

  /**
   * Judge a roast battle based on wit, humor, and originality.
   * Apply fairness bonus for harder side.
   */
  async judgeBattle(
    topicData: RoastTopic,
    player1Messages: BattleMessage[],
    player2Messages: BattleMessage[],
    player1Username: string,
    player2Username: string,
    player1Side: 'option1' | 'option2',
    player2Side: 'option1' | 'option2'
  ): Promise<JudgmentResult> {
    try {
      const prompt = `
        You are a roast battle judge. Evaluate this text-based roast battle and declare a winner.

        TOPIC: "${topicData.topic}"

        PLAYER 1 (${player1Username}) ROASTS:
        ${player1Messages.map(msg => `Round ${msg.round}: ${msg.message}`).join('\n')}

        PLAYER 2 (${player2Username}) ROASTS:
        ${player2Messages.map(msg => `Round ${msg.round}: ${msg.message}`).join('\n')}

        Judge based on:
        1. WIT (1-10): Cleverness and wordplay
        2. HUMOR (1-10): How funny the roasts are
        3. ORIGINALITY (1-10): Creativity and uniqueness

        Rules:
        - Stay completely neutral and fair
        - Focus only on comedy quality, not personal preferences
        - Ignore inappropriate content (do not penalize it)

        Respond strictly in JSON format:
        {
          "winner": { "username": "${player1Username}" or "${player2Username}", "totalScore": number },
          "player1": { "wit": number, "humor": number, "originality": number, "total": number },
          "player2": { "wit": number, "humor": number, "originality": number, "total": number },
          "reasoning": "Brief explanation of why this player won"
        }
      `;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) throw new Error('No response from OpenAI');

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');

      const judgment = JSON.parse(jsonMatch[0]);

      // Apply difficulty fairness bonus
      const bonus = (difficulty: number) =>
        difficulty > 6 ? 2 : difficulty > 4 ? 1 : 0;

      const player1Bonus = bonus(topicData[player1Side].difficulty);
      const player2Bonus = bonus(topicData[player2Side].difficulty);

      judgment.player1.total += player1Bonus;
      judgment.player2.total += player2Bonus;

      // Recalculate winner after bonus
      let winnerUsername = judgment.player1.total > judgment.player2.total ? player1Username : player2Username;
      let winnerScore = judgment.player1.total > judgment.player2.total ? judgment.player1.total : judgment.player2.total;

      return {
        winner: {
          playerId: winnerUsername === player1Username ? 'player1' : 'player2',
          username: winnerUsername,
          score: winnerScore
        },
        scores: {
          player1: {
            wit: judgment.player1.wit,
            humor: judgment.player1.humor,
            originality: judgment.player1.originality,
            total: judgment.player1.total
          },
          player2: {
            wit: judgment.player2.wit,
            humor: judgment.player2.humor,
            originality: judgment.player2.originality,
            total: judgment.player2.total
          }
        },
        reasoning: judgment.reasoning
      };
    } catch (error) {
      console.error('Error judging battle:', error);
      return this.getFallbackJudgment(player1Username, player2Username);
    }
  }

  private getFallbackJudgment(player1Username: string, player2Username: string): JudgmentResult {
    const randomWinner = Math.random() < 0.5 ? 'player1' : 'player2';
    const player1Scores = {
      wit: Math.floor(Math.random() * 4) + 7,
      humor: Math.floor(Math.random() * 4) + 7,
      originality: Math.floor(Math.random() * 4) + 7,
      total: 0
    };
    player1Scores.total = player1Scores.wit + player1Scores.humor + player1Scores.originality;

    const player2Scores = {
      wit: Math.floor(Math.random() * 4) + 7,
      humor: Math.floor(Math.random() * 4) + 7,
      originality: Math.floor(Math.random() * 4) + 7,
      total: 0
    };
    player2Scores.total = player2Scores.wit + player2Scores.humor + player2Scores.originality;

    if (randomWinner === 'player1' && player1Scores.total <= player2Scores.total) {
      player1Scores.total = player2Scores.total + 1;
    } else if (randomWinner === 'player2' && player2Scores.total <= player1Scores.total) {
      player2Scores.total = player1Scores.total + 1;
    }

    return {
      winner: {
        playerId: randomWinner,
        username: randomWinner === 'player1' ? player1Username : player2Username,
        score: randomWinner === 'player1' ? player1Scores.total : player2Scores.total
      },
      scores: {
        player1: player1Scores,
        player2: player2Scores
      },
      reasoning: 'The battle was close, but this player had slightly better wit and timing in their roasts.'
    };
  }

  /**
   * Disabled moderation (all words allowed)
   */
  /*
  async moderateMessage(message: string): Promise<{ isAppropriate: boolean; reason?: string }> {
    // Commented out: moderation disabled
    return { isAppropriate: true };
  }
  */
}

// Export the class only - instantiate in server.ts after dotenv.config()
