import * as fs from 'fs';
import * as cheerio from 'cheerio';
import axios from 'axios';
import * as pfs from 'fs/promises';
import { generateTickFile } from './reasoner';

export function getFile(tsCode: string): string {
  return `/project/${tsCode}_tick.txt`;
}

export function getYesterdayFile(tsCode: string): string {
  return `/project/${tsCode}_yesterday_quote.txt`;
}

export function getYesterdayBeforeFile(tsCode: string): string {
  return `/project/${tsCode}_yesterday_b4_quote.txt`;
}

function getYesterdayMarginFile(tsCode: string): string {
  return `/project/${tsCode}_yesterday_margin.txt`;
}

function getYesterdayBeforeMarginFile(tsCode: string): string {
  return `/project/${tsCode}_yesterday_b4_margin.txt`;
}

export async function getTickString(lines: string[], charLimit: number = 15000): Promise<string> {
  let totalChars = 0;
  const collectedLines: string[] = [];

  for (const line of lines.reverse()) {
    totalChars += line.length + 1; // 包含换行符
    collectedLines.push(line);
    if (totalChars > charLimit) {
      break;
    }
  }

  const ret = collectedLines.reverse().join('\n');
  await pfs.writeFile('./theData.txt', ret);
  return ret;
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

export async function loadYesterdayData(tsCode: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(getYesterdayFile(tsCode), 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }

      resolve(data);
    });
  });
}

export async function loadYesterdayB4Data(tsCode: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(getYesterdayBeforeFile(tsCode), 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }

      resolve(data);
    });
  });
}

export async function loadYesterdayMargin(tsCode: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(getYesterdayMarginFile(tsCode), 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }

      resolve(data);
    });
  });
}

export async function loadYesterdayB4Margin(tsCode: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(getYesterdayBeforeMarginFile(tsCode), 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }

      resolve(data);
    });
  });
}

export async function generateYesterdayFile(tscode: string): Promise<void> {
  await pfs.copyFile(getYesterdayFile(tscode), getYesterdayBeforeFile(tscode));
  await pfs.copyFile(getYesterdayMarginFile(tscode), getYesterdayBeforeMarginFile(tscode));
  await generateTickFile(tscode);
  await pfs.access(getFile(tscode));
  const [data, _na] = aggregateTickData(await loadAllTick(tscode), true);
  await pfs.writeFile(getYesterdayFile(tscode), data);
  let [code, _] = tscode.split('.');
  await pfs.writeFile(getYesterdayMarginFile(tscode), await getMarginShort(code));
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
  under100Sell: number;
  under100Buy: number;
  from100To500Sell: number;
  from100To500Buy: number;
  from500To1000Sell: number;
  from500To1000Buy: number;
  from1000To5000Sell: number;
  from1000To5000Buy: number;
  over5000Sell: number;
  over5000Buy: number;
}

export function aggregateTickData(lines: string[], downsample?: boolean): string[] {
  const statsMap: { [key: string]: StatisticEntry } = {};

  let accQian = 0; //累计成交金额
  let accShou = 0; //累计成交量

  // 处理时间转换（HH:MM:SS -> HH:MM:00）
  const toMinuteKey = (timeStr: string) => {
    let [h, m] = timeStr.split(':');
    if (!downsample) {
      let min = parseInt(`${(parseInt(m)/5)}`)*5 + 5;
      m = `${min}`;
      if (min < 10) {
        m = `0${min}`;
      }
      if (min === 60) {
        m = '00';
        let hour = parseInt(h) + 1; 
        h = (hour < 10 ? '0' : '') + hour;
      }
    } else {
      let min = parseInt(`${(parseInt(m)/15)}`)*15 + 15;
      m = `${min}`;
      if (min < 10) {
        m = `0${min}`;
      }
      if (min === 60) {
        m = '00';
        let hour = parseInt(h) + 1; 
        h = (hour < 10 ? '0' : '') + hour;
      }
    }
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
        accShou: 0,
        under100Sell: 0,
        under100Buy: 0,
        from100To500Sell: 0,
        from100To500Buy: 0,
        from500To1000Sell: 0,
        from500To1000Buy: 0,
        from1000To5000Sell: 0,
        from1000To5000Buy: 0,
        over5000Sell: 0,
        over5000Buy: 0,
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

    if (direction === 'N') {
      continue;
    }

    if (volume < 100) {
      direction === 'S' ? entry.under100Sell++ : entry.under100Buy++;
    } else if (volume < 500) {
      direction === 'S' ? entry.from100To500Sell++ : entry.from100To500Buy++;
    } else if (volume < 1000) {
      direction === 'S' ? entry.from500To1000Sell++ : entry.from500To1000Buy++;
    } else if (volume < 5000) {
      direction === 'S' ? entry.from1000To5000Sell++ : entry.from1000To5000Buy++;
    } else {
      direction === 'S' ? entry.over5000Sell++ : entry.over5000Buy++;
    }
  }

  const statsArray = Object.values(statsMap).map((record: StatisticEntry) => { return {...record, avg: (record.accQian / record.accShou).toFixed(2)} });
  let interval = downsample ? 15 : 5;
  return [ 
  `时间,现价(元),分时均价(元),${interval}分钟内总成交数(手),${interval}分钟内总成交金额(元),${interval}分钟内买盘成交数(手),${interval}分钟内卖盘成交数(手)\n` +
    statsArray.sort((a, b) => a.time.localeCompare(b.time)).map((record: StatisticEntry) => `${record.time},${record.price},${record.avg},${record.totalAmount},${Math.round(record.totalVal)},${record.totalAmountOfBuy},${record.totalAmountOfSell}`).join('\n'),
  `时间,${interval}分钟内100手以下买盘成交次数,${interval}分钟内100手以下卖盘成交次数,${interval}分钟内100至500手买盘成交次数,${interval}分钟内100至500手卖盘成交次数,${interval}分钟内500手至1000手买盘成交次数,${interval}分钟内500手至1000手卖盘成交次数,${interval}分钟内1000手至5000手买盘成交次数,${interval}分钟内1000手至5000手卖盘成交次数,${interval}分钟内5000手以上买盘成交次数,${interval}分钟内5000手以上卖盘成交次数\n` +
    statsArray.sort((a, b) => a.time.localeCompare(b.time)).map((record: StatisticEntry) => `${record.time},${record.under100Buy},${record.under100Sell},${record.from100To500Buy},${record.from100To500Sell},${record.from500To1000Buy},${record.from500To1000Sell},${record.from1000To5000Buy},${record.from1000To5000Sell},${record.over5000Buy},${record.over5000Sell}`).join('\n'),
  ]
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