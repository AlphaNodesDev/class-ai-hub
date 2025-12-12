import { useState, useCallback } from 'react';

interface GeneratedQuestion {
  id: string;
  text: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timestamp?: number;
}

// Simple question generation using text patterns - no external AI needed
const generateQuestionsFromText = (transcript: string, topics: string[]): GeneratedQuestion[] => {
  const questions: GeneratedQuestion[] = [];
  const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  // Question templates based on content type
  const templates = {
    definition: [
      "What is the definition of {topic}?",
      "Explain the concept of {topic} in your own words.",
      "Define {topic} and give an example."
    ],
    process: [
      "Describe the process of {topic}.",
      "What are the steps involved in {topic}?",
      "Explain how {topic} works."
    ],
    comparison: [
      "Compare and contrast {topic1} and {topic2}.",
      "What are the differences between {topic1} and {topic2}?",
      "How does {topic} differ from other concepts?"
    ],
    application: [
      "Give a real-world example of {topic}.",
      "How would you apply {topic} in practice?",
      "What are the practical applications of {topic}?"
    ],
    analysis: [
      "Why is {topic} important?",
      "What are the advantages and disadvantages of {topic}?",
      "Analyze the significance of {topic}."
    ]
  };

  // Generate questions from topics
  topics.forEach((topic, index) => {
    const cleanTopic = topic.trim();
    if (!cleanTopic) return;

    // Pick different template types for variety
    const templateTypes = Object.keys(templates) as (keyof typeof templates)[];
    const typeIndex = index % templateTypes.length;
    const type = templateTypes[typeIndex];
    const templateList = templates[type];
    const template = templateList[index % templateList.length];
    
    questions.push({
      id: `q_${Date.now()}_${index}`,
      text: template.replace('{topic}', cleanTopic).replace('{topic1}', cleanTopic).replace('{topic2}', topics[(index + 1) % topics.length] || 'related concepts'),
      topic: cleanTopic,
      difficulty: index % 3 === 0 ? 'easy' : index % 3 === 1 ? 'medium' : 'hard',
      timestamp: Math.floor((index / topics.length) * 2700) // Spread across video
    });
  });

  // Generate questions from key sentences
  const keyPhrases = ['important', 'key', 'main', 'primary', 'fundamental', 'essential', 'significant'];
  sentences.forEach((sentence, index) => {
    const lower = sentence.toLowerCase();
    const hasKeyPhrase = keyPhrases.some(phrase => lower.includes(phrase));
    
    if (hasKeyPhrase && questions.length < 10) {
      // Extract the main subject of the sentence
      const words = sentence.trim().split(' ').slice(0, 10).join(' ');
      questions.push({
        id: `q_sent_${index}`,
        text: `Explain the following concept: "${words}..."`,
        topic: 'Lecture Content',
        difficulty: 'medium',
        timestamp: Math.floor((index / sentences.length) * 2700)
      });
    }
  });

  return questions.slice(0, 10); // Limit to 10 questions
};

export const useQuestionGenerator = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generateQuestions = useCallback(async (transcript: string, topics: string[] = []) => {
    setIsGenerating(true);
    setError(null);

    try {
      // Use simple pattern-based generation (works offline, no API needed)
      const generatedQuestions = generateQuestionsFromText(transcript, topics);
      setQuestions(generatedQuestions);
      return generatedQuestions;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate questions');
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    questions,
    isGenerating,
    error,
    generateQuestions,
    setQuestions
  };
};

export type { GeneratedQuestion };
