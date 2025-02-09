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
  name: string;
  bankuai: string;
  vendor: Vendor;
  buy: boolean;
  systemPrompt: string;
  tscode: string;
}

export async function chat(request: ChatRequest): Promise<string> {
  console.log('send');
  const response = await fetch('/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', // Send as JSON
    },
    body: JSON.stringify(request)
  });
  let rsp = await response.json();

  try {
    return rsp.result;
  } catch (e) {
    throw e;
  }
}

export async function getAll(): Promise<string> {
  const response = await fetch('/shortList', {
    method: 'GET',
  });
  let rsp = await response.json();

  try {
    return rsp.result;
  } catch (e) {
    throw e;
  }
}