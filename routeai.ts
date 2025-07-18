const KwhPer120PerKm = 17.2 * 0.01; //65%
const gravityOverhead = 1.4;
const gravityGain = 0.9;
const chargeEffe = 0.92;
const chargeSpeed = 70;

interface Step {
  step_distance: string;
  road_name: string;
  cost: {
    duration: string;
    toll_distance: string;
    toll_road: string;
  };
  polyline: string;
}

interface Station {
  location: string;
  name: string;
}

interface Stop {
  start: string;
  end: string;
  distance: number; //KM
  consumedTime: number; //mins
  consumedBattery: number; //kwh
  tags?: string[];
}

interface Path {
  distance: string;
  cost: {
    duration: string;
    tolls: string;
  };
  steps: Step[];
}

async function generateRoute(startAddress: string, destAddres: string, startTime: string, maxSoc: string, minSoc: string, maxBattery: string, presets: Preset[], otherRequirement: string): Promise<Stop[]> {
  const stops = await collectStops(
  {location: await convLocation(startAddress), name: startAddress},
  {location: await convLocation(destAddres), name: destAddres});
  return await plan(stops, startTime, maxSoc, minSoc, maxBattery, presets, otherRequirement);
}

async function collectStops(startStation: Station, endStation: Station): Promise<Stop[]> {
  const stops: Stop[] = [];
  let prevStation = startStation;
  const path = await getPath(startStation.location, endStation.location);

  for (const step of path.steps) {
    const distance = parseInt(step.step_distance);
    if (!step.cost.toll_road || distance < 1000) continue;

    const polylines: string[] = step.polyline.split(';').splice(1);
    const incre = Math.floor(polylines.length / Math.floor(distance / 4000)); // 4KM
    for (let index=0; index < polylines.length; index += incre) {
      const ret = await getNearestStop(polylines[index], startStation.name, endStation.name);
      if (ret && ret.name !== prevStation.name) {
        stops.push(await getStopRecord(prevStation, ret));
        prevStation = ret;
      }
    }
  }

  if (prevStation.name !== endStation.name) {
    stops.push(await getStopRecord(prevStation, endStation));
  }

  return stops;
}

enum Grav {
  ascent = 'ascent',
  descent = 'descent',
  no = 'no'
}
async function getStopRecord(fromStop: Station, targetStop: Station): Promise<Stop> {
  const path: Path = await getPath(fromStop.location, targetStop.location); 
  const distKm = Math.ceil(parseInt(path.distance) / 1000);

  const gravityLoss: Grav = await askLlm(
    chatModel,
    [{
      content: `分析下从"${fromStop.name}"到"${targetStop.name}"的海拔高度变化,如果海拔爬升超过400米回答"${Grav.ascent}",如果海拔下降超过400米回答"${Grav.descent}",其他情况回答"${Grav.no}"`,
      role: 'user'
      }]) as Grav;
  const tags = [];

  let consumedBattery = distKm * KwhPer120PerKm;
  if (gravityLoss !== Grav.no) {
    tags.push(gravityLoss);
    if (gravityLoss === Grav.ascent) consumedBattery *= gravityOverhead;
    else consumedBattery *= gravityGain;
  }

  consumedBattery = parseFloat(consumedBattery.toFixed(1));
  return {
    start: fromStop.name,
    end: targetStop.name,
    distance: distKm,
    consumedTime: Math.ceil(parseInt(path.cost.duration) * 0.9 / 60),
    consumedBattery,
    tags
  }
}

async function getPath(originLoc: string, destLoc: string): Promise<Path> {
  const response = await request(`/v5/direction/driving?origin=${originLoc}&destination=${destLoc}&strategy=32&cartype=1&show_fields=cost,polyline`);
  if (!response) {
    throw new Error(`failed to path from ${originLoc} to ${destLoc}`);
  }
  return response.route.paths[0];
}

async function convLocation(address: string): Promise<string> {
  const response = await request(`/v3/geocode/geo?address=${address}`);
  if (!response) {
    throw new Error(`failed to convert ${address}`);
  }
  return response.geocodes[0].location;
}

const chatModel ='Pro/deepseek-ai/DeepSeek-R1';
async function getNearestStop(location: string, from: string, to: string): Promise<Station | false> {
  const response = await request(`/v5/place/around?types=180300&location=${location}&radius=2000&sortrule=distance`);
  if (response && response.pois.length > 1) {
    const n: string = await askLlm(
    chatModel,
    [{
      content: `下列哪个服务区是在从"${from}"到"${to}"的路线方向上,只用答我服务区名字不要有任何多余字符:
      ${response.pois.map((poi: any) => poi.name).join(',')}`,
      role: 'user'
      }]);
    return response.pois.find((poi: any) => poi.name === n);
  }

  if (response) {
  const answer: string = await askLlm(
    chatModel,
    [{
      content: `服务区"${response.pois[0].name}"是在从"${from}"到"${to}"的路线方向上吗?只用答我Yes或者No.`,
      role: 'user'
      }]);
  return answer === 'Yes' && response.pois[0];
  }
  return false;
}

async function request(path: string): Promise<any> {
  await sleep(1);
  const reqUrl = `https://restapi.amap.com${path}&key=d0e0aab6356af92b0cd0763cae27ba35&output=json`;
  let response: any = await fetch(reqUrl);

  if (!response.ok) throw new Error(`network response was not ok ${response.statusText}`);

  try {
    response = await response.json();
    if (response && response.count > 0) {
      return response;
    }
    return false;
  } catch(e) {
    throw e;
  }
}

async function sleep(sec: number): Promise<void> {
  return new Promise((rsv, _rej) => {
    setTimeout(rsv, sec * 1000);
  });
}

enum Preset {
  conservative = '**保守策略**:保证即使在当前规划的补能点服务不可用时,仍能保证设定的最低电量到达备用补能点.**标签**:<备用补能点名称和距离,以及到达备用补能点的预计剩余soc>',
  aggressive = '**激进策略**:仅保证按照设定最低电量能到达规划补能点以达到效率最大化.**标签**:无',
  dinnerTimeCharge = '**优先用餐时充电**:优先规划在用餐时间(早餐,午餐,晚餐)进行充电.**标签**:早餐,午餐,晚餐',
  avoidExpensiveWindow = '**避开尖峰电价充电**:优先避免在尖峰时段11:00 - 13:00, 17:00 - 23:00安排充电. **标签**:电价峰时,电价谷时',
}

async function plan(stops: Stop[], startTime: string, maxSoc: string, minSoc: string, maxBattery: string, presets: Preset[], otherRequirement: string): Promise<any> {
  const prompt = `
你是路径规划专家,基于下面数据帮助电车车主规划长途旅行的沿途充电路线:
**基础信息**:
- 出发时间: ${startTime}
- 电池最大电量: ${maxBattery}
- 最大充满电量: ${maxSoc}, 车辆最多充满至此soc
- 最小允许电量: ${minSoc}, 车辆在到达下一补能点前需保证剩余soc大于此最小允许电量
- 充电功率: ${chargeSpeed}度/小时
- 充电效率: ${chargeEffe}, 意味着每充1度电只有${chargeEffe}度能充进车里

**沿途区间数据说明**:
- 行车路线的沿途区间数据会以JSON数组格式提供给你
- 每个区间信息数据格式为{start: <区间起点补能点名称>; end: <区间终点补能点名称>; distance: <区间距离单位为KM>; consumedTime: <区间行驶时长单位为分钟>; consumedBattery: <区间预计消耗电量单位为度>;}
- 每个补能点都能充电
**沿途区间数据**:
${JSON.stringify(stops)}

**用户预选需求(预选需求包含需求本身以及与该需求相关的标签,标签可以打在与之匹配的补能点上)**:
- ${presets.join('\n- ')}
**用户自由需求**:
- 用户自由输入的需求,该需求优先级应大于预选需求
- 请分析拆解用户自由需求为子需求,保证子需求能得到满足,并且给每个子需求总结对应的标签,每个标签字数控制在10个汉字以内
- 用户自由需求如下: ${otherRequirement}

**输出结果要求**:
- 基于上面前提和需求生成补能线路,格式为:[{start: <旅程起始点或者上一个补能点名称>; end: <补能点名称>; distance: <行驶距离单位为KM>; consumedTime: <行驶时长单位为分钟>; consumedBattery: <预计消耗电量单位为度>, chargeDetail: <预计充电时长和充电度数>, tags:[<与该补能点匹配的所有标签>]}]
- 严格按照格式返回JSON格式的补能线路不返回任何其他东西
  `;
  const answer: string = await askLlm(
    chatModel,
    [{
      content: prompt,
      role: 'user'
      }]);

  return JSON.parse(answer);
}

async function askLlm(model: string, messages: any[]): Promise<string> {
  console.log('LLM call', messages);
  let response: any = await fetch(
    'https://api.siliconflow.cn/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-ldrpfdlimnrwcrgmkdemwqkphisowucfzpvqbmakltjmgnsb'
      },
      body: JSON.stringify(
        {
          model,
          messages,
          stream: false,
        }
      )
    }
  );
  response = await response.json();
  console.log('LLM answer', response.choices[0].message.content);
  return response.choices[0].message.content.trim();
}

generateRoute(
  '广州市黄埔区中新知识城招商雍景湾',
  '棉洋服务区(汕湛高速汕头方向)',
  '6:30AM', '85%', '8%', '61度',
  [Preset.aggressive, Preset.dinnerTimeCharge],
  '在午餐充电时可以充到100%').then(ret => console.log(ret));