import axios from 'axios';

// Tushare Pro Token
const TOKEN: string = '4cfb90ffe6898811af052248024d625e039ebf11124f689adaa5dbf9';

// Tushare API URL
const API_URL: string = 'https://api.tushare.pro';

// 定义请求参数的接口
interface TushareRequest {
  api_name: string;
  token: string;
  params: {
    ts_code: string;
    start_time: string;
    end_time: string;
    freq: string;
  };
  fields: string;
}

// 定义响应数据的接口
interface TushareResponse {
  code: number;
  msg: string;
  data: {
    fields: string[];
    items: (string | number)[][];
  };
}

// 请求参数
const params: TushareRequest = {
  api_name: 'stock_minute',  // API接口名称
  token: TOKEN,
  params: {
    ts_code: '600000.SH',               // 股票代码：浦发银行
    start_time: '20250127 09:30:00',    // 开始时间
    end_time: '20250127 15:00:00',      // 结束时间
    freq: '1min'                        // 分钟级别：1min、5min、15min 等
  },
  fields: 'ts_code,trade_time,open,high,low,close,vol,amount'  // 返回字段
};

// 异步请求数据
async function fetchMinuteData(tsCode: string): Promise<void> {
  try {
    const response = await axios.post<TushareResponse>(API_URL, params);
    const data = response.data;

    if (data.code === 0) {  // 请求成功
      console.log('分时数据：');

      // 格式化输出数据
      const formattedData = data.data.items.map(item => {
        return {
          ts_code: item[0],
          trade_time: item[1],
          open: item[2],
          high: item[3],
          low: item[4],
          close: item[5],
          vol: item[6],
          amount: item[7]
        };
      });

      console.table(formattedData);
    } else {
      console.error('请求失败：', data.msg);
    }
  } catch (error) {
    console.error('API请求错误：', error);
  }
}
