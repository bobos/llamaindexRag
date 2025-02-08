import * as fs from 'fs';

export function getFile(tsCode: string): string {
  return `/project/${tsCode}_tick.txt`;
}

export async function loadTick(tsCode: string, charLimit: number = 7000): Promise<string> {
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
  totalAmount: number;         // 总成交手数
  totalVal: number;            // 总成交金额(元)
  totalAmountOfSell: number;   // 卖盘(S)总手数
  totalAmountOfBuy: number;    // 买盘(B)总手数
  totalAmountOfNeutral: number;// 中性盘(N)总手数
}

export async function aggregateTickData(tsCode: string): Promise<string> {
  const lines = await loadAllTick(tsCode);
  const statsMap: { [key: string]: StatisticEntry } = {};

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
        totalAmount: 0,
        totalVal: 0,
        totalAmountOfSell: 0,
        totalAmountOfBuy: 0,
        totalAmountOfNeutral: 0
      };
    }

    // 更新统计项
    const entry = statsMap[minuteKey];
    entry.totalAmount += volume;
    entry.totalVal += price * volume * 100; // 成交金额计算（基于1手=100股的假设）
    entry.price = price; // 始终记录最后出现的价格

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

  const statsArray = Object.values(statsMap);
  return '时间,现价(元),一分钟内总成交数(手),一分钟内总成交金额(元),一分钟内买盘成交数(手),一分钟内卖盘成交数(手)\n' +
  statsArray.sort((a, b) => a.time.localeCompare(b.time)).map((record: StatisticEntry) => `${record.time},${record.price},${record.totalAmount},${Math.round(record.totalVal)},${record.totalAmountOfBuy},${record.totalAmountOfSell}`).join('\n');
}