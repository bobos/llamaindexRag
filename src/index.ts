import * as http from 'http';
import * as path from 'path';
import express from 'express'; 
import { ask, generateTickFile, shortConclusion } from './reasoner';
import { off } from 'process';
import { generateYesterdayFile } from './tickLoad';

console.log('start express server');

process.on('uncaughtException', (err: any) => {
  console.error('Exit on error', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('Gracefully shutdown');
  process.exit(0);
});

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.post('/ask', async (req: express.Request, res: express.Response) => {
  try {
    console.log('receive request', req.body);
    let response = await ask(req.body);
    res.status(200).json({result: response});
  } catch (e) {
    console.error('异常', e);
    res.status(200).json({result: JSON.stringify(e)})
  }
});

app.get('/shortList', async (req: express.Request, res: express.Response) => {
  try {
    console.log('receive request', req.body);
    res.status(200).json({result: '<p>' + Object.values(shortConclusion).map((c:any) => c.cache).join('<br>') + '</p>'});
  } catch (e) {
    console.error('异常', e);
    res.status(200).json({result: JSON.stringify(e)})
  }
});

app.post('/yesterdayFile', async (req: express.Request, res: express.Response) => {
  try {
    console.log('receive request', req.body);
    for (const tscode of req.body.tscodes) {
      await generateYesterdayFile(tscode);
    }
    res.status(200).json({});
  } catch (e) {
    console.error('异常', e);
    res.status(200).json({result: JSON.stringify(e)})
  }
});

app.get('doc/:id', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'example.doc'));
});

const httpServer = http.createServer(app);
httpServer.listen(8080, '0.0.0.0', (): void => {
  console.log('Starts up successfully, opened server on', httpServer.address());
}).on('error', (error: Error): void => {
  console.error('Fails to start', error);
  process.exit(1);
});