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
  systemPrompt: string;
  tsCode: string;
}

export async function chat(request: ChatRequest): Promise<string> {
  const response = await fetch('/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', // Send as JSON
    },
    body: JSON.stringify(request)
  });
  let rsp = await response.json();
  console.log(rsp);

  try {
    return rsp.result;
  } catch (e) {
    throw e;
  }
}