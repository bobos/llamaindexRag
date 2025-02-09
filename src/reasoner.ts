import OpenAI from "openai";
import axios from 'axios';
import { aggregateTickData, getFile, getMarginShort, loadAllTick, loadQuote, loadTick } from "./tickLoad";
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

function getModelInfo(vendorName: Vendor): { modelName: string, model: OpenAI } {
  if (vendorName === Vendor.baidu) {
    return { modelName: 'deepseek-r1', model: baidu }
  }

  if (vendorName === Vendor.siliconflow) {
    return { modelName: 'Pro/deepseek-ai/DeepSeek-R1', model: siliconflow }
  }
  return { modelName: 'deepseek-reasoner', model: deepseek }
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
  name: string;
  bankuai: string;
  vendor: Vendor;
  buy: boolean;
  systemPrompt: string;
  tscode: string;
}

interface BaseStockData {
  tscode: string;
  zuoshou: string;
  zhangfu: string;
  liangbi: string;
  shizhi: string;
  runzirunquan: string;
}

interface StockData extends BaseStockData {
  name: string;
  bankuai: string;
}

let conclusionCache: { [tscode: string]: { ongoing: boolean, cache1?: string, cache2?: string } } = {};
export let shortConclusion: { [tscode: string]: { cache: string } } = {};

async function fetchStockData(tscode: string): Promise<BaseStockData> {
  try {
    let [code, loc] = tscode.split('.');
    const response = await axios.get(`http://qt.gtimg.cn/q=${loc.toLowerCase()}${code}`);
    const ret = response.data.split('~');
    return {
      tscode,
      zuoshou: ret[4],
      zhangfu: `${ret[32]}%`,
      liangbi: ret[49],
      shizhi: `${ret[45]}亿`,
      runzirunquan: await getMarginShort(code)
    }
  } catch (error) {
    console.error('Error fetching stock data:', error);
    throw error;
  }
}

async function quoteDataAnalyze(vendor: Vendor, systemPrompt: string, sd: StockData): Promise<string> {
  //const quoteData = await loadQuote(req.tsCode);
  const quoteData = await aggregateTickData(sd.tscode);
  //await fs.writeFile('./theQuoteData.txt', quoteData);
  return await deepThink(vendor, [
    { role: Role.System, content: systemPrompt },
    { role: Role.User, content: `严格基于如下数据不要假设任何数据,帮激进的超短线投资客谨慎分析该股票明日上午表现从1到5颗星(1是不推荐买入,5是非常推荐买入),回答以"x颗星"开头并控制在500字内\n--------------------------------------\n1.概况:\n${initPrompt(sd)}\n--------------------------------------\n2.当日分时明细:\n${quoteData}` }
  ]);
}

function getResult(name: string, cache1: string, cache2?: string): string {
  let ret = `<p>${name}:<br>第一结论:<br>${cache1}`;
  if (cache2) {
    ret = ret + '<br>第二结论:<br>' + cache2;
  }
  return ret + '</p>';
}

function initPrompt(sd: StockData): string {
  //return `股票:${sd.name},市值:${sd.shizhi},昨收:${sd.zuoshou},涨幅:${sd.zhangfu},板块涨幅:${sd.bankuai}\n${sd.runzirunquan}`;
  return `股票:${sd.name},市值:${sd.shizhi},昨收:${sd.zuoshou},涨幅:${sd.zhangfu}\n${sd.runzirunquan}`;
}

export async function ask(chatRequest: ChatRequest): Promise<string> {
  const conclusion = conclusionCache[chatRequest.tscode];
  if (conclusion) {
    if (conclusion.ongoing) {
      return 'ongoing';
    }

    if (conclusion.cache1) {
      let ret = getResult(chatRequest.name, conclusion.cache1, conclusion.cache2);
      delete conclusionCache[chatRequest.tscode];
      return 'cacheHit_' + ret;
    }
  }

  let sd: StockData = {
    ...(await fetchStockData(chatRequest.tscode)),
    name: chatRequest.name,
    bankuai: chatRequest.bankuai
  }

  conclusionCache[sd.tscode] = { ongoing: true };
  try {
    await generateTickFile(sd.tscode);
    await fs.access(getFile(sd.tscode));
    const quoteAnalysisResult = await quoteDataAnalyze(chatRequest.vendor, chatRequest.systemPrompt, sd);
    conclusionCache[sd.tscode].cache1 = quoteAnalysisResult;
    shortConclusion[sd.tscode] = {cache: ''};
    shortConclusion[sd.tscode].cache = sd.name + ':' + quoteAnalysisResult.substring(0, quoteAnalysisResult.indexOf('星')+1);
    // fetch the latest tick
    await generateTickFile(sd.tscode);
    await fs.access(getFile(sd.tscode));
    const tickData = await loadTick(sd.tscode);
//    await fs.writeFile('./theData.txt', tickData);
    let finalRet = await deepThink(chatRequest.vendor, [
      { role: Role.System, content: chatRequest.systemPrompt },
      { role: Role.User, content: `严格基于如下数据不要假设任何数据,回答激进超短线投资者的问题:购买推荐从1到5颗星(1是不推荐,5是非常推荐),该股票盘尾买入明早卖出推荐值是几星,回答以"x颗星"开头.\n--------------------------------------\n1.概况:\n${initPrompt(sd)}\n--------------------------------------\n2.资深游资基于当日分时数据的分析结论:\n${quoteAnalysisResult}\n--------------------------------------\n3.最近的分笔成交明细:\n时间,价格,成交量,成交类型(B买盘/S卖盘/中性盘N)\n${tickData}` }
    ]);
    conclusionCache[sd.tscode].ongoing = false;
    conclusionCache[sd.tscode].cache2 = finalRet;
    shortConclusion[sd.tscode].cache = shortConclusion[sd.tscode].cache + '||' + finalRet.substring(0, finalRet.indexOf('星')+1);
    return getResult(sd.name, quoteAnalysisResult, finalRet);
  } catch (e) {
    conclusionCache[sd.tscode] = { ongoing: false, cache1: `处理异常，${JSON.stringify(e)}` };
    throw e;
  }
}

async function deepThink(vendor: Vendor, messages: Message[]): Promise<string> {
  const { modelName, model } = getModelInfo(vendor);
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
  return axios.post(`http://${host}:3000/tick`, { tscode });

  // 执行Python脚本
  return execAsync(`python /project/tickData.py ${tscode}`, {
    timeout: 5 * 60 * 1000
  });
}