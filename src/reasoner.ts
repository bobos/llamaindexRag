import OpenAI from "openai";
import axios from 'axios';
import { aggregateTickData, getFile, loadAllTick, loadQuote, loadTick } from "./tickLoad";
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: 'sk-42ddf29b6b3c4df3a2df6ba089f9eb58'
});
const siliconflow = new OpenAI({
  baseURL: 'https://api.siliconflow.cn/v1',
  apiKey: 'sk-bvwufaakubbvvzfrulsqeqtoklqtvdttxlpkhtahhwwompvs'
});
const baidu = new OpenAI({
  baseURL: 'https://qianfan.baidubce.com/v2',
  apiKey: 'bce-v3/ALTAK-oQZCuAGVoaFC16sCniSm7/5d8d26ff7c8daf8dde8b938eb62a080313d49d42'
});

enum Vendor {
  baidu = 'baidu',
  siliconflow = 'siliconflow',
  deepseek = 'deepseek'
}

function getModelInfo(vendorName: Vendor): {modelName: string, model: OpenAI} {
  if (vendorName === Vendor.baidu) {
    return {modelName: 'deepseek-r1', model: baidu}
  }

  if (vendorName === Vendor.siliconflow) {
    return {modelName: 'Pro/deepseek-ai/DeepSeek-R1', model: siliconflow}
  }
  return {modelName: 'deepseek-reasoner', model: deepseek}
}

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
  vendor: Vendor,
  buy: boolean;
  systemPrompt: string;
  tsCode: string;
}

let conclusionCache: {[tsCode: string]: {ongoing: boolean, cache1?: string, cache2?: string}} = {};

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

async function quoteDataAnalyze(vendor: Vendor, req: {buy: boolean, systemPrompt: string, tsCode: string, totalVal: string, yesterdayVal: string, liangbi: string}): Promise<string> {
  //const quoteData = await loadQuote(req.tsCode);
  const quoteData = await aggregateTickData(req.tsCode);
  await fs.writeFile('./theQuoteData.txt', quoteData);
  return await deepThink(vendor, [
    {role: Role.System, content: req.systemPrompt},
    {role: Role.User, content: `严格基于如下数据不要假设任何数据,帮激进的超短线投资客谨慎分析该股票明日上午表现从1到5颗星(1是不推荐买入,5是非常推荐买入),回答控制在500字内\n--------------------------------------\n1.概况:\n昨收:${req.yesterdayVal}, 市值:${req.totalVal}\n--------------------------------------\n2.当日分时明细:\n${quoteData}`}
  ]);
}

function getResult(cache1: string, cache2?: string): string {
  let ret = '<p>第一结论:<br>' + cache1;
  if (cache2) {
    ret = ret+'<br>第二结论:<br>'+cache2;
  }
  return ret+'</p>';
}

export async function ask(chatRequest: ChatRequest): Promise<string> {
  const conclusion = conclusionCache[chatRequest.tsCode];
  if (conclusion) {
    if (conclusion.ongoing) {
      return 'ongoing';
    }

    if (conclusion.cache1) {
      let ret = getResult(conclusion.cache1, conclusion.cache2);
      delete conclusionCache[chatRequest.tsCode];
      return 'cacheHit_' + ret;
    }
  }

  let stockData = await fetchStockData(chatRequest.tsCode);
  let totalVal = `${stockData[45]}亿`;
  let liangbi = stockData[49];
  let yesterdayVal = stockData[4];
  console.log(`昨收:${yesterdayVal}, 市值:${totalVal}`);
  conclusionCache[chatRequest.tsCode] = {ongoing: true};
  try {
    await generateTickFile(chatRequest.tsCode);
    await fs.access(getFile(chatRequest.tsCode));
    const quoteAnalysisResult = await quoteDataAnalyze(chatRequest.vendor, {buy: chatRequest.buy, tsCode: chatRequest.tsCode, systemPrompt: chatRequest.systemPrompt, totalVal, liangbi, yesterdayVal});
    conclusionCache[chatRequest.tsCode].cache1 = quoteAnalysisResult;
    const tickData = await loadTick(chatRequest.tsCode);
    await fs.writeFile('./theData.txt', tickData);
    let finalRet = `代码: ${chatRequest.tsCode}, 昨收: ${yesterdayVal}\n` + await deepThink(chatRequest.vendor, [
      {role: Role.System, content: chatRequest.systemPrompt},
      {role: Role.User, content: `严格基于如下数据不要假设任何数据,回答激进超短线投资者的问题:购买推荐从1到5颗星(1是不推荐,5是非常推荐),该股票盘尾买入明早卖出推荐值是几星?\n--------------------------------------\n1.概况:\n昨收:${yesterdayVal}, 市值:${totalVal}\n--------------------------------------\n2.资深游资基于当日分时数据的分析结论:\n${quoteAnalysisResult}\n--------------------------------------\n3.最新分笔成交明细:\n时间,价格,成交量,成交类型(B买盘/S卖盘/中性盘N)\n${tickData}`}
    ]);
    conclusionCache[chatRequest.tsCode].ongoing = false;
    conclusionCache[chatRequest.tsCode].cache2 = finalRet;
    return getResult(quoteAnalysisResult, finalRet);
  } catch(e) {
    conclusionCache[chatRequest.tsCode] = {ongoing: false, cache1: `处理异常，${JSON.stringify(e)}`};
    throw e;
  }
}

async function deepThink(vendor: Vendor, messages: Message[]): Promise<string> {
  const {modelName, model} = getModelInfo(vendor);
  const stream = await model.chat.completions.create({
    max_tokens: 1024 * 8,
    messages,
    model: modelName,
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

export async function generateTickFile(
  tscode: string
): Promise<any> {
  const tickFile = getFile(tscode);
  // 检查并删除旧文件
  try {
    await fs.access(tickFile);
    await fs.rm(tickFile);
    console.log(`Deleted existing file: ${tickFile}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  let host = '192.168.0.131';
  return axios.post(`http://${host}:3000/tick`, {tscode});

  // 执行Python脚本
  return execAsync(`python /project/tickData.py ${tscode}`, { 
    timeout: 5 * 60 * 1000 
  });
}