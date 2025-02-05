import OpenAI from "openai";
import axios from 'axios';
import { loadQuote, loadTick } from "./tickLoad";
import * as fs from 'fs/promises';

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: 'isk-42ddf29b6b3c4df3a2df6ba089f9eb58'
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
  systemPrompt: string;
  tsCode: string;
}

let quoteAnalysisCache: any = {};

async function fetchStockData(tsCode: string): Promise<string[]> {
  try {
    let [code, loc] = tsCode.split('.');
    const response = await axios.get(`http://qt.gtimg.cn/q=${loc.toLowerCase()}${code}`);
    return response.data.split('~');
  } catch (error) {
    console.error('Error fetching stock data:', error);
    throw error;
  }
}

async function quoteDataAnalyze(req: {buy: boolean, systemPrompt: string, tsCode: string, totalVal: string, yesterdayVal: string, liangbi: string}): Promise<string> {
  const quoteData = await loadQuote(req.tsCode);
  const result = await deepThink([
    {role: Role.System, content: req.systemPrompt},
    {role: Role.User, content: `基于如下数据帮超短线投资客谨慎分析该股票明日上午涨跌,回答控制在500字内\n--------------------------------------\n概况:\n昨收:${req.yesterdayVal}, 市值:${req.totalVal}, 当前量比:${req.liangbi}\n--------------------------------------\n当日分时明细:\n${quoteData}`}
  ]);
  quoteAnalysisCache[req.tsCode] = result;
  return result;
}

export async function ask(chatRequest: ChatRequest): Promise<string> {
  let stockData = await fetchStockData(chatRequest.tsCode);
  let totalVal = `${stockData[45]}亿`;
  let liangbi = stockData[49];
  let yesterdayVal = stockData[4];
  console.log(`昨收:${yesterdayVal}, 市值:${totalVal}, 当前量比:${liangbi}`);
  const quoteAnalysisResult = quoteAnalysisCache[chatRequest.tsCode] || await quoteDataAnalyze({buy: chatRequest.buy, tsCode: chatRequest.tsCode, systemPrompt: chatRequest.systemPrompt, totalVal, liangbi, yesterdayVal});
  const tickData = await loadTick(chatRequest.tsCode);
  await fs.writeFile('./theData.txt', tickData);
  return await deepThink([
    {role: Role.System, content: chatRequest.systemPrompt},
    {role: Role.User, content: `基于如下数据帮超短线投资客谨慎分析该股票是否可以盘尾买入明早卖出\n--------------------------------------\n概况:\n昨收:${yesterdayVal}, 市值:${totalVal}, 当前量比:${liangbi}\n--------------------------------------\nAI助手基于当日分时数据的分析结论:\n${quoteAnalysisResult}\n--------------------------------------\n下午分笔成交明细:\n时间,价格(元),成交量,成交金额(元),成交类型(B买盘/S卖盘/中性盘N)\n${tickData}`}
  ]);
}

async function deepThink(messages: Message[]): Promise<string> {
  const stream = await openai.chat.completions.create({
    max_tokens: 1024 * 8,
    messages,
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
  }

  if (!content || !reasoningContent) {
    console.error('empty response');
    throw new Error('empty content');
  }

  console.log('\n\nmodel thinking: ', reasoningContent);
  console.log('\n\nmodel response: ', content);
  
  return content;
}