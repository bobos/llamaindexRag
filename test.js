const cheerio = require('cheerio');
const axios = require('axios');

async function run() {
  const html = (await axios.get('https://stockpage.10jqka.com.cn/601288')).data;
  let node = '';
  let flag = false;
  for(var line of html.split('\n')) {
    if (line.includes('<!--融资融券-->')) {
	console.log('find', line);
      flag = true;
    }
    if (flag) {
      if(line.includes('<!--行业对比-->')) {
	console.log('done', line);
	break;
      }
      console.log('append line', line)
      node = `${node}${line}`;
    }
  }

  if (node === '') {
	console.error('doomed');
  }


  const $ = cheerio.load(node);
  const table = $('table.m_table.m_hl.mt10');
let firstRow = table.find('thead tr').first();

const checker = ['交易日期', '融资余额(亿元)', '融资余额/流通市值', '融资买入额(亿元)', '融券卖出量(万股)', '融券余量(万股)', '融券余额(万元)', '融资融券余额(亿元)'];
// 提取每个单元格（<th>）的文本内容
let allOk = true;
firstRow.find('th').map((i, elem) => {
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

run().then((cellContents) => {console.log(cellContents)});

