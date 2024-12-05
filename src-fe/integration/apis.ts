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
  systemPrompt: string;
  historyMessages: Message[];
  message: Message;
}

export async function chat(request: ChatRequest): Promise<Message> {
  const response = await fetch('/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', // Send as JSON
    },
    body: JSON.stringify(request)
  });

  if (!response.ok)
    throw new Error(`Network response was not ok: ${response.statusText}`);

  try {
    return await response.json();
  } catch (e) {
    throw e;
  }
}