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
  private recentTopics: string[] = []; // Track recent topics
  private maxTopicHistory = 20; // Remember last 20 topics
  private currentCategoryIndex = 0;

  // Diverse topic categories for rotation
  private topicCategories = [
    'Technology & Innovation',
    'Pop Culture & Entertainment', 
    'Science & Nature',
    'Psychology & Human Behavior',
    'Food & Lifestyle',
    'Sports & Competition',
    'Social Media & Digital Life',
    'Relationships & Romance',
    'Work & Career',
    'Philosophy & Ethics',
    'Health & Wellness',
    'Travel & Adventure',
    'Art & Creativity',
    'Finance & Economics',
    'Gaming & Hobbies',
    'Fashion & Style',
    'Politics & Society',
    'Education & Learning',
    'Environment & Future',
    'Taboo & Controversial'
  ];

  // Fallback topics pool for guaranteed variety
  private fallbackTopics: RoastTopic[] = [
    { topic: "People who put pineapple on pizza vs People who think it's a crime", option1: { text: "Pineapple Pizza Lovers", difficulty: 6 }, option2: { text: "Pizza Purists", difficulty: 4 } },
    { topic: "Morning shower people vs Night shower people", option1: { text: "Morning Shower Gang", difficulty: 5 }, option2: { text: "Night Shower Crew", difficulty: 5 } },
    { topic: "People who walk up escalators vs People who stand still", option1: { text: "Escalator Climbers", difficulty: 7 }, option2: { text: "Escalator Riders", difficulty: 3 } },
    { topic: "Hot sauce addicts vs People who think ketchup is spicy", option1: { text: "Spice Warriors", difficulty: 4 }, option2: { text: "Mild Food Lovers", difficulty: 6 } },
    { topic: "People who reply immediately vs People who leave you on read", option1: { text: "Instant Responders", difficulty: 5 }, option2: { text: "Message Ghosters", difficulty: 7 } },
    { topic: "Cryptocurrency believers vs Traditional banking supporters", option1: { text: "Crypto Enthusiasts", difficulty: 6 }, option2: { text: "Banking Traditionalists", difficulty: 4 } },
    { topic: "Remote work advocates vs Office environment defenders", option1: { text: "Work From Home Gang", difficulty: 4 }, option2: { text: "Office Life Champions", difficulty: 6 } },
    { topic: "People who use dark mode vs People who use light mode", option1: { text: "Dark Mode Users", difficulty: 3 }, option2: { text: "Light Mode Users", difficulty: 7 } },
    { topic: "Serial bingers vs One episode per week watchers", option1: { text: "Binge Watchers", difficulty: 4 }, option2: { text: "Patient Viewers", difficulty: 6 } },
    { topic: "People who read books vs People who only watch movie adaptations", option1: { text: "Book Readers", difficulty: 5 }, option2: { text: "Movie Watchers", difficulty: 5 } }
  ];

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API Key is missing. Please set OPENAI_API_KEY in your .env file.');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Generate a single bot roast line given the current battle context.
   */
  async generateBotRoast(
    topicData: RoastTopic,
    allMessages: BattleMessage[],
    botUsername: string,
    opponentUsername: string,
    botSide: 'option1' | 'option2',
    currentRound: number,
    lastOpponentMessage?: string
  ): Promise<string> {
    const historyLines = allMessages
      .slice(-10)
      .map(m => `${m.username}: ${m.message}`)
      .join('\n');

    const sideDescriptor = botSide === 'option1' ? topicData.option1.text : topicData.option2.text;

    const prompt = `
TOPIC: "${topicData.topic}"
Your side: ${sideDescriptor}
Opponent: ${opponentUsername}
Round: ${currentRound} of 3

Recent chat transcript (most recent last):
${historyLines || '(no prior messages)'}

Opponent's latest line this round (if any): ${lastOpponentMessage || '(none)'}

Write exactly ONE savage, Gen-Z style roast (1–2 sentences max) that:
- Directly claps back to the opponent's latest line if provided; otherwise set the tone for the round.
- Sounds human, punchy, and confident; use modern slang when it amplifies the burn.
- Stays strictly in character arguing from your side: ${sideDescriptor}.
- Keeps light profanity allowed, but absolutely no slurs, hate speech, or targeting protected classes.
- No sexual content involving minors, no threats, no doxxing.
- No hashtags, no emojis, no markdown, no stage directions.
- Do not mention being an AI/bot.

Output ONLY the roast line.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              `You are ${botUsername}, an elite roast battler in pure roast mode. Be clever, concise, and brutally honest. Hit hard, keep rhythm tight, but strictly avoid hate speech, slurs, or real-world harm. One-liner preferred; two sentences only if it heightens the burn.`
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 120,
        temperature: 1.1,
        presence_penalty: 0.6,
        frequency_penalty: 0.5
      });

      let text = completion.choices[0]?.message?.content?.trim();
      if (!text) return this.randomFallbackRoast();
      // Normalize whitespace and strip surrounding quotes
      text = text.replace(/^["'\s]+|["'\s]+$/g, '');
      // Ensure single line
      text = text.replace(/[\r\n]+/g, ' ').trim();
      // Avoid accidental emojis/hashtags
      text = text.replace(/[#\p{Extended_Pictographic}]/gu, '').trim();
      return text;
    } catch (e) {
      console.error('Error generating bot roast:', e);
      return this.randomFallbackRoast();
    }
  }

  private randomFallbackRoast(): string {
    const fallbacks = [
      'You’re swinging like Wi‑Fi at your grandma’s house—weak and randomly disconnected.',
      'That take was so dry I almost heard it crack—hydrate your brain and try again.',
      'You brought elevator music to a mosh pit—no wonder nobody’s moving.',
      'You’re all setup, no punchline—like a loading screen stuck at 99%.',
      'That bar tripped over its own laces—tighten up before you try to run with me.'
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  /**
   * Generate a roast battle topic with intelligent variety to avoid repetition
   */
  async generateRoastTopic(): Promise<RoastTopic> {
    try {
      // Try AI generation with dynamic prompting
      const aiTopic = await this.generateAITopic();
      
      // Check if topic is too similar to recent ones
      if (this.isTopicUnique(aiTopic.topic)) {
        this.addToRecentTopics(aiTopic.topic);
        return aiTopic;
      }
      
      // If AI topic is repetitive, try with different category
      const categoryTopic = await this.generateCategoryBasedTopic();
      if (this.isTopicUnique(categoryTopic.topic)) {
        this.addToRecentTopics(categoryTopic.topic);
        return categoryTopic;
      }
      
      // Fall back to curated topic pool
      return this.getFallbackTopic();
      
    } catch (error) {
      console.error('Error generating topic:', error);
      return this.getFallbackTopic();
    }
  }

  /**
   * Generate topic using AI with dynamic prompting
   */
  private async generateAITopic(): Promise<RoastTopic> {
    const avoidList = this.recentTopics.length > 0 
      ? `\n\nIMPORTANT: Avoid these recently used topics: ${this.recentTopics.join(', ')}`
      : '';

    const randomExamples = this.getRandomExamples();
    const randomStyle = this.getRandomPromptStyle();
    
    const prompt = `${randomStyle}

    Generate a roast battle topic with two opposing sides that is:
    - Completely unique and creative
    - Fun and roastable 
    - Relatable to modern audiences
    - Either hilarious, controversial, or thought-provoking

    Categories to explore: technology, lifestyle, personality types, social behaviors, pop culture, controversial opinions, daily habits, relationship styles, work culture, social media, food preferences, entertainment, hobbies, fashion, or taboo subjects.

    Rate difficulty for roasting each side (1=easy to roast, 10=hard to roast).

    Output in JSON:
    {
      "topic": "Specific vs topic description",
      "option1": { "text": "Side 1 name", "difficulty": number },
      "option2": { "text": "Side 2 name", "difficulty": number }
    }

    Examples for inspiration:
    ${randomExamples}${avoidList}
    
    Generate a fresh, unique topic now:`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.9, // Higher creativity
      presence_penalty: 0.6, // Avoid repetition
      frequency_penalty: 0.8 // Encourage novelty
    });

    const text = completion.choices[0]?.message?.content?.trim();
    const jsonMatch = text?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Generate topic focused on specific category rotation
   */
  private async generateCategoryBasedTopic(): Promise<RoastTopic> {
    const category = this.topicCategories[this.currentCategoryIndex];
    this.currentCategoryIndex = (this.currentCategoryIndex + 1) % this.topicCategories.length;

    const prompt = `Generate a roast battle topic specifically from the "${category}" category.

    Make it unique, funny, and roastable. Focus on contrasting viewpoints or behaviors within this category.
    
    Output in JSON:
    {
      "topic": "Specific topic description",
      "option1": { "text": "Side 1", "difficulty": number },
      "option2": { "text": "Side 2", "difficulty": number }
    }
    
    Create a ${category} topic now that's perfect for roasting:`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 250,
      temperature: 0.85
    });

    const text = completion.choices[0]?.message?.content?.trim();
    const jsonMatch = text?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid category response format');

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Get random examples for prompt variation
   */
  private getRandomExamples(): string {
    const examples = [
      '- People who eat cereal with water vs People who eat cereal with milk',
      '- Netflix subtitles users vs People who turn off subtitles',
      '- People who sleep with socks on vs People who sleep barefoot',
      '- Vertical video creators vs Horizontal video purists',
      '- People who prefer texting vs People who prefer voice messages',
      '- Early bird gym goers vs Late night workout warriors',
      '- People who eat pizza with fork and knife vs Hand eaters',
      '- Spotify playlist makers vs People who just hit shuffle',
      '- iPhone users vs Android users',
      '- People who make their bed vs People who leave it messy'
    ];
    
    const shuffled = examples.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3).join('\n');
  }

  /**
   * Get random prompt style for variety
   */
  private getRandomPromptStyle(): string {
    const styles = [
      'You are a creative roast battle topic generator.',
      'Create an entertaining debate topic for a comedy roast battle.',
      'Generate a hilarious "this vs that" topic for roasting.',
      'Think of a funny controversial topic perfect for roast battles.'
    ];
    
    return styles[Math.floor(Math.random() * styles.length)];
  }

  /**
   * Check if topic is unique enough compared to recent ones
   */
  private isTopicUnique(newTopic: string): boolean {
    if (this.recentTopics.length === 0) return true;
    
    const newTopicLower = newTopic.toLowerCase();
    
    // Check for similar keywords or concepts
    for (const recentTopic of this.recentTopics) {
      const recentLower = recentTopic.toLowerCase();
      
      // Calculate similarity (simple word overlap check)
      const newWords = newTopicLower.split(/\s+/);
      const recentWords = recentLower.split(/\s+/);
      
      let commonWords = 0;
      for (const word of newWords) {
        if (word.length > 3 && recentWords.includes(word)) {
          commonWords++;
        }
      }
      
      // If more than 2 significant words overlap, consider it similar
      if (commonWords >= 2) {
        return false;
      }
      
      // Check for exact substring matches
      if (newTopicLower.includes(recentLower.substring(0, 15)) || 
          recentLower.includes(newTopicLower.substring(0, 15))) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Add topic to recent history
   */
  private addToRecentTopics(topic: string): void {
    this.recentTopics.push(topic);
    if (this.recentTopics.length > this.maxTopicHistory) {
      this.recentTopics.shift(); // Remove oldest
    }
  }

  /**
   * Get a guaranteed unique topic from fallback pool
   */
  private getFallbackTopic(): RoastTopic {
    // Filter out recently used fallback topics
    const availableTopics = this.fallbackTopics.filter(topic => 
      this.isTopicUnique(topic.topic)
    );
    
    const selectedTopic = availableTopics.length > 0 
      ? availableTopics[Math.floor(Math.random() * availableTopics.length)]
      : this.fallbackTopics[Math.floor(Math.random() * this.fallbackTopics.length)];
    
    this.addToRecentTopics(selectedTopic.topic);
    return selectedTopic;
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
    // Ensure usernames are never undefined
    const safePlayer1Name = player1Username || 'Player 1';
    const safePlayer2Name = player2Username || 'Player 2';
    
    try {
      const prompt = `
        You are a roast battle judge. Evaluate this text-based roast battle and declare a winner.

        TOPIC: "${topicData.topic}"

        PLAYER 1 (${safePlayer1Name}) ROASTS:
        ${player1Messages.map(msg => `Round ${msg.round}: ${msg.message}`).join('\n')}

        PLAYER 2 (${safePlayer2Name}) ROASTS:
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
          "winner": { "username": "${safePlayer1Name}" or "${safePlayer2Name}", "totalScore": number },
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

      // Recalculate winner after bonus using safe names
      let winnerUsername = judgment.player1.total > judgment.player2.total ? safePlayer1Name : safePlayer2Name;
      let winnerScore = judgment.player1.total > judgment.player2.total ? judgment.player1.total : judgment.player2.total;

      return {
        winner: {
          playerId: winnerUsername === safePlayer1Name ? 'player1' : 'player2',
          username: winnerUsername,
          score: winnerScore
        },
        scores: {
          player1: {
            wit: judgment.player1?.wit || 7,
            humor: judgment.player1?.humor || 7,
            originality: judgment.player1?.originality || 7,
            total: judgment.player1?.total || 21
          },
          player2: {
            wit: judgment.player2?.wit || 7,
            humor: judgment.player2?.humor || 7,
            originality: judgment.player2?.originality || 7,
            total: judgment.player2?.total || 21
          }
        },
        reasoning: judgment.reasoning || `${winnerUsername} delivered better roasts with superior wit and timing!`
      };
    } catch (error) {
      console.error('Error judging battle:', error);
      return this.getFallbackJudgment(safePlayer1Name, safePlayer2Name);
    }
  }

  private getFallbackJudgment(player1Username: string, player2Username: string): JudgmentResult {
    // Ensure usernames are never undefined or empty
    const safePlayer1Name = player1Username || 'Player 1';
    const safePlayer2Name = player2Username || 'Player 2';
    
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

    // Ensure winner has higher score
    if (randomWinner === 'player1' && player1Scores.total <= player2Scores.total) {
      player1Scores.total = player2Scores.total + 1;
    } else if (randomWinner === 'player2' && player2Scores.total <= player1Scores.total) {
      player2Scores.total = player1Scores.total + 1;
    }

    const winnerUsername = randomWinner === 'player1' ? safePlayer1Name : safePlayer2Name;
    const winnerScore = randomWinner === 'player1' ? player1Scores.total : player2Scores.total;

    return {
      winner: {
        playerId: randomWinner,
        username: winnerUsername,
        score: winnerScore
      },
      scores: {
        player1: player1Scores,
        player2: player2Scores
      },
      reasoning: `Both players brought great energy! ${winnerUsername} edged out with slightly better wit and timing in their roasts.`
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
