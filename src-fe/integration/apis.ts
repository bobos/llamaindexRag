export enum Role {
  System = 'system',
  User = 'user',
  Assistant = 'assistant'
}

export interface Message {
  role: Role;
  content: string;
}

export enum Vendor {
  deepseek = 'deepseek',
  siliconflow = 'siliconflow'
}

export interface ChatRequest {
  vendor: Vendor,
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