import * as fs from 'fs';
import * as cheerio from 'cheerio';
import axios from 'axios';

export function getFile(tsCode: string): string {
  return `/project/${tsCode}_tick.txt`;
}

export async function loadTick(tsCode: string, charLimit: number = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(getFile(tsCode), 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }

      const lines = data.split('\n').reverse(); // 从最后一行开始
      let totalChars = 0;
      const collectedLines: string[] = [];

      for (const line of lines) {
        totalChars += line.length + 1; // 包含换行符
        collectedLines.push(line);
        if (totalChars > charLimit) {
          break;
        }
      }

      resolve(collectedLines.join('\n'));
    });
  });
}

export async function loadAllTick(tsCode: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    fs.readFile(getFile(tsCode), 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }

      resolve(data.split('\n'));
    });
  });
}

export async function loadQuote(tsCode: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(`/project/${tsCode}_quote.txt`, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }
      resolve(data);
    });
  });
}

interface StatisticEntry {
  time: string;                // 分钟整点时间，如"09:30:00"
  price: number;               // 最后一笔成交价
  avg: string;                 // 分时均价
  totalAmount: number;         // 总成交手数
  totalVal: number;            // 总成交金额(元)
  totalAmountOfSell: number;   // 卖盘(S)总手数
  totalAmountOfBuy: number;    // 买盘(B)总手数
  totalAmountOfNeutral: number;// 中性盘(N)总手数
  accQian: number;
  accShou: number;
}

export async function aggregateTickData(tsCode: string): Promise<string> {
  const lines = await loadAllTick(tsCode);
  const statsMap: { [key: string]: StatisticEntry } = {};

  let accQian = 0; //累计成交金额
  let accShou = 0; //累计成交量

  // 处理时间转换（HH:MM:SS -> HH:MM:00）
  const toMinuteKey = (timeStr: string) => {
    const [h, m] = timeStr.split(':');
    return `${h}:${m}:00`;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const [timeStr, priceStr, volStr, direction] = line.split(',');
    const price = parseFloat(priceStr);
    const volume = parseInt(volStr, 10);
    const minuteKey = toMinuteKey(timeStr);

    // 初始化统计项
    if (!statsMap[minuteKey]) {
      statsMap[minuteKey] = {
        time: minuteKey,
        price: 0,
        avg: '',
        totalAmount: 0,
        totalVal: 0,
        totalAmountOfSell: 0,
        totalAmountOfBuy: 0,
        totalAmountOfNeutral: 0,
        accQian: 0,
        accShou: 0
      };
    }

    // 更新统计项
    const entry = statsMap[minuteKey];
    entry.totalAmount += volume;
    entry.totalVal += price * volume * 100; // 成交金额计算（基于1手=100股的假设）
    entry.price = price; // 始终记录最后出现的价格
    accShou += entry.totalAmount * 100;
    accQian +=  entry.totalVal;
    entry.accShou = accShou;
    entry.accQian = accQian;

    // 根据交易方向累计
    switch (direction) {
      case 'S':
        entry.totalAmountOfSell += volume;
        break;
      case 'B':
        entry.totalAmountOfBuy += volume;
        break;
      case 'N':
        entry.totalAmountOfNeutral += volume;
        break;
      default:
        console.warn(`Unknown transaction direction: ${direction}`);
    }
  }

  const statsArray = Object.values(statsMap).map((record: StatisticEntry) => { return {...record, avg: (record.accQian / record.accShou).toFixed(2)} });
  return '时间,现价(元),分时均价(元),一分钟内总成交数(手),一分钟内总成交金额(元),一分钟内买盘成交数(手),一分钟内卖盘成交数(手)\n' +
    statsArray.sort((a, b) => a.time.localeCompare(b.time)).map((record: StatisticEntry) => `${record.time},${record.price},${record.avg},${record.totalAmount},${Math.round(record.totalVal)},${record.totalAmountOfBuy},${record.totalAmountOfSell}`).join('\n');
}

export async function getMarginShort(tscode: string): Promise<string> {
  const html = (await axios.get(`https://stockpage.10jqka.com.cn/${tscode}`)).data;
  let node = '';
  let flag = false;
  for (var line of html.split('\n')) {
    if (line.includes('<!--融资融券-->')) flag = true;
    if (flag) {
      if (line.includes('<!--行业对比-->')) break;
      node = `${node}${line}`;
    }
  }

  if (node === '') {
    throw new Error('Tonghuashun empty page fetched!')
  }

  const $ = cheerio.load(node);
  const table = $('table.m_table.m_hl.mt10');

  const checker = ['交易日期', '融资余额(亿元)', '融资余额/流通市值', '融资买入额(亿元)', '融券卖出量(万股)', '融券余量(万股)', '融券余额(万元)', '融资融券余额(亿元)'];
  let allOk = true;
  table.find('thead tr').first().find('th').map((i, elem) => {
    if (allOk) {
      if ($(elem).text().trim() !== checker[i]) {
        console.error('检查失败', $(elem).text().trim(), checker[i]);
        allOk = false;
      }
    }
  });

  if (!allOk) {
    console.error('同花顺页面更改.');
    throw new Error('page parsing failed!')
  }

  return table.find('tbody tr').first().find('td').map((i, elem) => {
    return i > 0 ? `${checker[i]}:${$(elem).text().trim()}` : undefined;
  }).get().join(',');
}