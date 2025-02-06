
const child_process = require('child_process');
const util = require('util');
const express = require('express');

const execAsync = util.promisify(child_process.exec);
// 创建 Express 应用实例
const app = express();

// 使用中间件解析 JSON 格式的请求体（如果需要处理 JSON 数据）
app.use(express.json());

// 定义 POST 接口 /tick
app.post('/tick', async (req, res) => {
  console.log('receive request:', req.body);
  await generateTickFile(req.body.tscode);
  res.sendStatus(200);
});

app.get('/healthCheck', (req, res) => {
  console.log('health check!');
  res.sendStatus(200);
});

// 设置监听端口，这里默认为 3000
const port = 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});

async function generateTickFile(tscode) {
  console.log('generating file for', tscode);
  // 执行Python脚本
  let ret = await execAsync(`python tickData.py ${tscode}`, { 
    timeout: 5 * 60 * 1000 
  });
  console.log('result', ret);
  return;
}