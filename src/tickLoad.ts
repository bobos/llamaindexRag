import * as fs from 'fs';

export function getFile(tsCode:string): string {
  return `/project/${tsCode}_tick.txt`;
}

export async function loadTick(tsCode: string, charLimit: number = 7500): Promise<string> {
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
