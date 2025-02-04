import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: 'sk-42ddf29b6b3c4df3a2df6ba089f9eb58'
});

export enum Role {
  System = 'system',
  User = 'user',
  Assistant = 'assistant'
}

export interface Message {
  role: Role;
  content: string;
}

export interface ChatRequest {
  buy: boolean;
  messages: Message[];
}

export async function ask(chatRequest: ChatRequest): Promise<Message> {
  const stream = await openai.chat.completions.create({
    max_tokens: 1024 * 8,
    messages: chatRequest.messages,
    model: "deepseek-reasoner",
    stream: true
  });

  let content = '';
  let reasoningContent = '';

  for await (const chunk of stream) {
    const chunkContent = chunk.choices[0]?.delta?.content || '';
    const chunkReasoning = chunk.choices[0]?.delta?.reasoning_content || '';
    
    content += chunkContent;
    reasoningContent += chunkReasoning;
    
    // Optional: process partial results here if needed
  }

  if (!content || !reasoningContent) {
    console.error('empty response');
    throw new Error('empty content');
  }

  console.log('\n\nmodel thinking: ', reasoningContent);
  console.log('\n\nmodel response: ', content);
  
  return { role: Role.Assistant, content: content };
}