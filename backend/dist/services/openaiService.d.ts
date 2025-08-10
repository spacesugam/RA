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
    option1: {
        text: string;
        difficulty: number;
    };
    option2: {
        text: string;
        difficulty: number;
    };
}
export declare class OpenAIService {
    private openai;
    private recentTopics;
    private maxTopicHistory;
    private currentCategoryIndex;
    private topicCategories;
    private fallbackTopics;
    constructor();
    /**
     * Generate a single bot roast line given the current battle context.
     */
    generateBotRoast(topicData: RoastTopic, allMessages: BattleMessage[], botUsername: string, opponentUsername: string, botSide: 'option1' | 'option2', currentRound: number, lastOpponentMessage?: string): Promise<string>;
    private randomFallbackRoast;
    /**
     * Generate a roast battle topic with intelligent variety to avoid repetition
     */
    generateRoastTopic(): Promise<RoastTopic>;
    /**
     * Generate topic using AI with dynamic prompting
     */
    private generateAITopic;
    /**
     * Generate topic focused on specific category rotation
     */
    private generateCategoryBasedTopic;
    /**
     * Get random examples for prompt variation
     */
    private getRandomExamples;
    /**
     * Get random prompt style for variety
     */
    private getRandomPromptStyle;
    /**
     * Check if topic is unique enough compared to recent ones
     */
    private isTopicUnique;
    /**
     * Add topic to recent history
     */
    private addToRecentTopics;
    /**
     * Get a guaranteed unique topic from fallback pool
     */
    private getFallbackTopic;
    /**
     * Judge a roast battle based on wit, humor, and originality.
     * Apply fairness bonus for harder side.
     */
    judgeBattle(topicData: RoastTopic, player1Messages: BattleMessage[], player2Messages: BattleMessage[], player1Username: string, player2Username: string, player1Side: 'option1' | 'option2', player2Side: 'option1' | 'option2'): Promise<JudgmentResult>;
    private getFallbackJudgment;
}
export {};
//# sourceMappingURL=openaiService.d.ts.map