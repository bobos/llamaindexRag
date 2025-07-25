const KwhPer120PerKm = 17.2 * 0.01; //65%
const Weight = 2.1;
const chargeEffe = 0.92;
const chargeSpeed = 70;
const J2KwhFactor = 3.6e6;
const maxBattery = 61;
const hardMinSoc = 5;

interface Step {
  step_distance: string;
  road_name: string;
  cost: {
    duration: string;
    toll_distance: string;
    toll_road: string;
  };
  cities: City[];
  polyline: string;
}

interface City {
  city: string;
  districts: District[]
}

interface District {
  name: string;
}

interface Station {
  location: string;
  name: string;
  altitude?: number;
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

function getGravityEnergyKwh(distance: number, weight: number, altitudeDiff: number, eta=0.4): number {
  const massKg = weight * 1000;
  const g = 9.8;
  const d = distance *  1000;
  const slope = altitudeDiff / d;
  const slopeRad = Math.atan(slope);

  const slopeForce = massKg * g * Math.sin(slopeRad);
  const slopeEnergy = 1.5 * (slopeForce * d) / J2KwhFactor; // 1.2为精准系数，考虑到路途中起伏难测，加到1.5
  return altitudeDiff >=0 ? slopeEnergy : slopeEnergy * eta;
}

async function generateRoute(startAddress: string, destAddres: string, startTime: string, startSoc: number, maxSoc: number, minSoc: number, presets: Preset[], otherRequirement: string): Promise<AiPlanStep[]> {
  const stops = await collectStops(
  {location: await convLocation(startAddress), name: startAddress},
  {location: await convLocation(destAddres), name: destAddres});
  console.log(stops);
  const aiPlan: AiPlanStep[] = await plan(stops, startTime, startSoc, maxSoc, minSoc, presets, otherRequirement);
  return aiPlan;
}

async function collectStops(startStation: Station, endStation: Station): Promise<Stop[]> {
  const stops: Stop[] = [];
  let prevStation = startStation;
  const path = await getPath(startStation.location, endStation.location);

  for (const step of path.steps) {
    const distance = parseInt(step.step_distance);
    if (!step.cost.toll_road || distance < 500) continue;

    const polylines: string[] = step.polyline.split(';').splice(1);
    const incre = Math.floor(polylines.length / Math.floor(distance / 2000)); // scan at every 2KM
    for (let index=0; index < polylines.length; index += incre) {
      const ret: Station|undefined = getNearestStop(polylines[index], step.cities);
      if (ret !== undefined && ret.name !== prevStation.name) {
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

async function getStopRecord(fromStop: Station, targetStop: Station): Promise<Stop> {
  const path: Path = await getPath(fromStop.location, targetStop.location); 
  const distKm = Math.ceil(parseInt(path.distance) / 1000);
  const tags: string[] = [];

  let consumedBattery = distKm * KwhPer120PerKm;
  if (fromStop.altitude !== undefined && targetStop.altitude !== undefined) {
    const altDiff = targetStop.altitude - fromStop.altitude;
    consumedBattery += getGravityEnergyKwh(distKm, Weight, altDiff);
    if (altDiff > 300) {
      tags.push('海拔超300米爬坡');
    }
    if (altDiff < -300) {
      tags.push('海拔超300米下坡');
    }
  }

  consumedBattery = parseFloat(consumedBattery.toFixed(2));
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
  const response = await request(`/v5/direction/driving?origin=${originLoc}&destination=${destLoc}&strategy=32&cartype=1&show_fields=cost,polyline,cities`);
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

//const chatModelDsR1 ='Pro/deepseek-ai/DeepSeek-R1';
const chatModelDsR1 ='deepseek/deepseek-r1-0528';
const chatModelDsV3 = 'deepseek-ai/DeepSeek-V3';
const chatModelO4Mini ='openai/o4-mini';
const chatModelO4MiniHigh ='openai/o4-mini-high';
const chatModelGrok4 ='x-ai/grok-4';
const openrouterKey = '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';
const openrouterHost = 'https://openrouter.ai/api/v1/chat/completions'; 
const siliconflowKey = 'sk-ldrpfdlimnrwcrgmkdemwqkphisowucfzpvqbmakltjmgnsb';
const siliconflowHost = 'https://api.siliconflow.cn/v1/chat/completions';

const tools = [{
  type: 'function',
  function: {
    name: 'simpleCalculator',
    description: 'Use this tool to perform simple calculation, it only supports add(+), substract(-), multiply(*), divide(/) and reminder(%) operators',
    parameters: {
      type: 'object',
      properties: {
        arithmeticExpression: {
          type: 'string',
          description: 'The arithmeticExpression to be performed, for example: 0.9 / (8 + 3) * 6'
        }
      },
      required: ['arithmeticExpression']
    }
  }
}]

function simpleCalculator(arithmeticExpression: string): string {
  const regex = /^[\d+\-*/%. ]+$/;
  if (!regex.test(arithmeticExpression)) {
    return 'Input arithmeticExpression is invalid.';
  }
  return eval(arithmeticExpression).toFixed(2);
}

function getNearestStop(location: string, cities: City[]): Station | undefined {
  for (const city of cities) {
    const stops: DistrictArea | undefined = ServiceStops[city.city];
    if (!stops) throw new Error(`没有服务数据: ${city.city}`);

    for (const district of city.districts) {
      const sa: Station[] = stops[district.name];
      if (!sa) continue;
      for (const s of sa) {
        if (calculateDistance(location, s.location) <= 500) { //小于500米
          return s;
        }
      }
    }
  }
  return;
}

interface DistrictArea {[district: string]: Station[]};

async function request(path: string): Promise<any> {
  await sleep(1);
  const reqUrl = `https://restapi.amap.com${path}&key=d0e0aab6356af92b0cd0763cae27ba35&output=json`;
  console.log(reqUrl);
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
  conservative = `**conservative**:make sure there is always a backup service stop to recharge in case driver arrives at the planned service stop and finds out it is out of service, make sure soc is above ${hardMinSoc}% when car arrives the backup service stop.**tag**:None`,
  aggressive = '**aggressive**:make sure car arrives at planned service stop with soc above minimal allowed soc.**tag**:请注意该点充电桩情况'
}

interface AiPlanStep {
  fromStop: string;
  arrivalStop: string;
  backupStop: string;
  arrivalTime: string;
  departureTime: string;
  socBeforeRecharge: number;
  socAfterRecharge: number;
  rechargeTime: number;
  tags: string[];
}

function toMinutes(time: string): number {
  let [hour, min] = time.split(':');
  return parseInt(hour) * 60 + parseInt(min);
}

function calculateConsumptionAndTime(from: string, to: string, stops: Stop[]): number[] {
  let time = 0;
  let kwh = 0;
  let found = false;
  for (const stop of stops) {
    if (stop.start === from) {
      found = true;
    }

    if (found) {
      time += stop.consumedTime;
      kwh += stop.consumedBattery;
    }

    if (stop.end === to) {
      if (!found) break;
      else return [kwh, time];
    }
  }

  const err = `从${from}到${to}的旅程没找到`;
  alert(err);
  throw new Error(err);
}

function verifyPlan(plan: AiPlanStep[], stops: Stop[], startTime: string): string {
  let totalTime = toMinutes(startTime);
  let leftKwh = maxBattery;
  const minKwh = Math.floor(hardMinSoc * 0.01 * maxBattery);
  let deviation = 0;

  for (const step of plan) {
    const [kwh, time] = calculateConsumptionAndTime(step.fromStop, step.arrivalStop, stops);
    totalTime += time;
    let tempLeftKwh = leftKwh;
    leftKwh -= kwh;

    if (leftKwh < minKwh) {
      const err = `The hard minimal allowed Soc is ${hardMinSoc}%, but according to your plan, the remaining Soc from ${step.fromStop} to ${step.arrivalStop} will be under ${hardMinSoc}%`;
      console.log(err);
      return err;
    }

    if (step.backupStop) {
      let arrivalFound = false;
      for (const stop of stops) {
        if (stop.start === step.arrivalStop) {
          arrivalFound = true;
        }

        if (step.backupStop === stop.start) {
          if (arrivalFound) break;
          const err = `The backup service stop should be after the arrival stop, but according to your plan, backup stop ${step.backupStop} is before arrival stop ${step.arrivalStop}`;
          console.log(err);
          return err;
        }
      }

      const [kwh, _time] = calculateConsumptionAndTime(step.fromStop, step.backupStop, stops);
      tempLeftKwh -= kwh;

      if (tempLeftKwh < minKwh) {
        const err = `The hard minimal allowed Soc is ${hardMinSoc}%, but according to your plan, the remaining Soc from ${step.fromStop} to backup stop ${step.backupStop} will be under ${hardMinSoc}%`;
        console.log(err);
        return err;
      }
    }

    let aiGuessArrival = toMinutes(step.arrivalTime);
    deviation = Math.abs(aiGuessArrival - totalTime); 
    if (deviation > 2) {
      const err = `Comparing to the actually calculated result, there is ${deviation} minutes deviation on arrival time from ${step.fromStop} to ${step.arrivalStop} according to your plan`;
      console.log(err);
      return err;
    }

    let aiGuessKwh: number = Math.floor(step.socBeforeRecharge * 0.01 * maxBattery);
    deviation = Math.abs(aiGuessKwh - Math.floor(leftKwh));
    if (deviation > 1) {
      const err = `Comparing to the actually calculated result, there is ${deviation} Kwh deviation on left battery when arrival at ${step.arrivalStop} according to your plan`;
      console.log(err);
      return err;
    }

    let chargeKwh = (step.socAfterRecharge - step.socBeforeRecharge) * 0.01 * maxBattery / chargeEffe;
    let chargeTime = Math.ceil(chargeKwh / chargeSpeed * 60);
    
    deviation = Math.abs(step.rechargeTime - chargeTime);
    if (deviation > 2) {
      const err = `Comparing to the actually calculated result, there is ${deviation} minutes deviation on recharging time when recharging at ${step.arrivalStop} according to your plan`;
      console.log(err);
      return err;
    }

    totalTime += step.rechargeTime;
    let aiGuessTime = toMinutes(step.departureTime);
    deviation = Math.abs(aiGuessTime - totalTime);
    if (deviation > 2) {
      const err = `Comparing to the actually calculated result, there is ${deviation} minutes deviation on departure time when departing ${step.arrivalStop} according to your plan`;
      console.log(err);
      return err;
    }
    totalTime = aiGuessTime;
    leftKwh = parseFloat((step.socAfterRecharge * 0.01 * maxBattery).toFixed(2));
  }

  const lastPlannedStop = plan[plan.length -1].arrivalStop;
  const lastStop = stops[stops.length -1].end;
  if (lastStop !== lastPlannedStop) {
    const [kwh, _time] = calculateConsumptionAndTime(lastPlannedStop, lastStop, stops);
    leftKwh -= kwh;
    if (leftKwh < minKwh) {
      const err = `The hard minimal allowed Soc is ${hardMinSoc}%, but according to your plan, the remaining Soc from ${lastPlannedStop} to ${lastStop} will be under ${hardMinSoc}%`;
      console.log(err);
      return err;
    }
  }

  return '';
}

async function plan(stops: Stop[], startTime: string, startSoc: number, maxSoc: number, minSoc: number, presets: Preset[], otherRequirement: string, retry = 3, messages: any[] = []): Promise<AiPlanStep[]> {
  const prompt = `
please assist the EV driver to make a recharging plan based on below info:
**basic info**:
- Journey start time: ${startTime}
- EV full battery: ${maxBattery}Kwh
- Start Soc: ${startSoc}%
- Max recharge to Soc: ${maxSoc}%
- Minimal allowed Soc: ${minSoc}%, minimal allowed soc before arriving at a recharging stop, set by user, should never be under ${hardMinSoc}%, if asked minimal allowed soc is under ${hardMinSoc}%, use hard setting: ${hardMinSoc}%
- Charging rate: ${chargeSpeed}Kwh per hour
- Charging overhead: ${chargeEffe}, meaning per 1kwh from the charger only ${chargeEffe}kwh can be converted into car's battery

**route data structure info**:
- the route provided to you consists of a list of steps, each step follows below JSON structure: {start: <name of the start service stop>, end: <name of the end service stop>, consumedTime: <driving time from start to end in mins>, consumedBattery: <consumed battery from start to end in Kwh>}
- car can be recharged at any of these service stops
**route data**:
${JSON.stringify(stops.map(({start, end, consumedTime, consumedBattery}: Stop) => {return {start, end, consumedTime, consumedBattery}}))}

**driver's selected requirements(the options provided by App, selected requirement includes both requirement and related tags, tags can be put on the matching service stops)**:
- ${presets.join('\n- ')}
**driver's freely input requirements**:
- freely input requirement takes prioritiy over the selected requirements
- understand and try best to fulfill the input requirement, and create tags for them if applicable, each tag should be in Chinese and shoud not exceed 12 words 
- freely input requirements are following: ${otherRequirement}
  `;
//- generate the recharging plan by strictly follow below format:
//[{fromStop: <>, arrivalStop: <current recharging service stop>, arrivalTime: <arrival time>, departureTime: <departure time>, chargeDetail: <planned recharging details>, tags:[<tags matching current service stop>]}]
  const response_format: any =
  {
    type: 'json_schema',
    json_schema: {
      name: "rechargePlan",
      strict: true,
      schema: {
      type: 'object',
      required: ['reason', 'rechargingPlan'],
      additionalProperties: false,
      properties: {
        reason: {
          type: 'string',
          description: 'When it is not possible to make a plan, this field explains why, when a plan can be made return "" for this field.'
        },
        rechargingPlan: {
          type: 'array',
          description: 'When a plan can not be made, return empty array for this field. The "fromStop" field of the first item must be the start service stop of the journey',
          items: {
            type: 'object',
            properties: {
              fromStop: {
                type: 'string',
                description: 'Journey start point or previous recharging service stop name'
              },
              arrivalStop: {
                type: 'string',
                description: 'Current planned recharging service stop name'
              },
              backupStop: {
                type: 'string',
                description: 'The backup service stop name for recharging in case the arrivalStop is out of service. Set this field to "" if no backupStop is needed.'
              },
              arrivalTime: {
                type: 'string',
                description: 'The estimated time of arriving arrivalStop, format as: HH:MM, HH is from 00 to 23'
              },
              departureTime: {
                type: 'string',
                description: 'The estimated time of departing arrivalStop, format as: HH:MM, HH is from 00 to 23'
              },
              socBeforeRecharge: {
                type: 'integer',
                description: 'The percentage of soc before recharging,  from 1 to 99, means 1% - 99%',
                minimum: 1,
                maximum: 99
              },
              socAfterRecharge: {
                type: 'integer',
                description: 'The percentage of soc after recharging,  from 2 to 100, means 2% - 100%',
                minimum: 2,
                maximum: 100
              },
              rechargeTime: {
                type: 'integer',
                description: 'Estimated time to complete recharging in minutes',
                minimum: 1
              },
              tags: {
                type: 'array',
                description: 'The tags that matching current service stop',
                items: {
                  type: 'string',
                  description: 'The tag name'
                }
              }
            },
            required: ['fromStop', 'arrivalStop', 'backupStop', 'arrivalTime', 'departureTime', 'socBeforeRecharge', 'socAfterRecharge', 'rechargeTime', 'tags'],
            additionalProperties: false
          }
        }
      }}
    }
  }

  const promptForDsR1 = prompt + `\n**output requirement**:
  generate output which strictly follows below JSON schema:
  ${JSON.stringify(response_format)}`;

  if (messages.length === 0) {
    messages = [
    {
      role: 'system',
      content: 'You are a helpful assistant for to help user make all kinds of accurate and efficient plans, when you are crunching numbers, double check the correctness of your calculation.'
    },
    {
      content: prompt,
      role: 'user'
    }];
  }

  const answer: string = await askLlm(
    openrouterHost,
    openrouterKey,
    chatModelO4Mini,
    messages,
    response_format);

  const ret: any = JSON.parse(answer);
  if (ret.reason) {
    alert(ret.reason);
  }
  if (!ret.rechargingPlan || ret.rechargingPlan.length === 0) {
    throw new Error('no plan provided');
  }

  const aiPlan = ret.rechargingPlan as AiPlanStep[];
  let result = verifyPlan(aiPlan, stops, startTime);

  if (result === '') return aiPlan;
  if (--retry === 0) throw new Error('max retry reached.'); 
  return await plan(stops, startTime, startSoc, maxSoc, minSoc, presets, otherRequirement, retry,
    messages.concat([
    {
      role: 'assistant',
      content: answer
    },
    {
      role: 'user',
      content: `${result}, review your plan and plan again.`
    }
  ]));
}

let callCnt = 0;
async function askLlm(host: string, key: string, model: string, messages: any[], response_format?: any): Promise<string> {
  console.log('LLM call', messages);
  const body: any = {
    model,
    messages,
    //tools,
    stream: false
  }
  if (response_format !== undefined) {
    body.response_format = response_format;
  }

  let response: any = await fetch(
    host,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(body)
    }
  );
  response = (await response.json()).choices[0].message;
  if (response.tool_calls) {
    if (callCnt > 20) {
      throw new Error('too many function calls');
    }
    callCnt++;
    return await askLlm(host, key, model, messages.concat(functionCalls(response.tool_calls)), response_format);
  }
  console.log('LLM answer', response.content);
  return response.content.trim();
}

function functionCalls(tool_calls: {function: {arguments: string, name: string}, id: string, type: string}[]): any[] {
  let messages: any[] = [{role: 'assistant', tool_calls}];
  for (const toolCall of tool_calls) {
    if (toolCall.function.name !== 'simpleCalculator') {
      throw new Error(`no such function: ${toolCall.function.name}`);
    }

    const val: string = simpleCalculator(JSON.parse(toolCall.function.arguments).arithmeticExpression);
    messages.push({role: 'tool', tool_call_id: toolCall.id, content: val});
  }
  return messages;
}

//generateRoute(
//  '广州市黄埔区中新知识城招商雍景湾',
//  '桂林西站',
//  '6:30', 100, 85, 8,
//  [Preset.conservative],
//  '在早餐和午餐时段各安排一次充电,午餐时段充电充满到95%,尽量避免11:00 - 13:00高电价区间充电,保抵达终点时有至少15%的电').then(ret => console.log(ret));

async function r(city: string, pageNum: number): Promise<any> {
  const reqUrl = `https://restapi.amap.com/v5/place/text?types=180300&key=d0e0aab6356af92b0cd0763cae27ba35&output=json&region=${city}&page_size=25&page_num=${pageNum}`;
  let response: any = await fetch(reqUrl);
  console.log(reqUrl);

  if (!response.ok) throw new Error(`network response was not ok ${response.statusText}`);

  try {
    response = await response.json();
    if (response && response.count > 0) {
      return response.pois;
    }
    return false;
  } catch(e) {
    throw e;
  }
}

function shuffleMap(array: any[]) {
  return array
    .map(v => ({ v, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(item => item.v);
}

function calculateDistance(loc1: string, loc2: string): number {
  const [long1, lati1] = loc1.split(',');
  const [long2, lati2] = loc2.split(',');
  const lon1: number = parseFloat(long1);
  const lon2: number = parseFloat(long2);
  const lat1: number = parseFloat(lati1);
  const lat2: number = parseFloat(lati2);

  // 地球平均半径（单位：米）
  const R = 6371000; 

  // 将十进制度数转换为弧度
  const rad = (angle: number): number => angle * Math.PI / 180;
  const φ1 = rad(lat1);
  const φ2 = rad(lat2);
  const Δφ = rad(lat2 - lat1);
  const Δλ = rad(lon2 - lon1);

  // 应用 Haversine 公式
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  // 计算距离（单位：米）
  return Math.floor(R * c);
}

async function collectService(city: string, pageNum: number = 1, allService: any[] = []): Promise<void> {
  let ret = await r(city, pageNum);
  if (!ret) {
    let all: string[] = [];
    let stops: any = {};
    allService.forEach(poi => {
      const name = poi.name;
      if (!all.includes(name)) {
        all.push(name);
        let sub = stops[poi.adname];
        const item = `{name: '${name}', location: '${poi.location}', altitude: }`;
        if (!sub) stops[poi.adname] = [item]; else sub.push(item);
      }
    });
    console.log(stops);
    return;
  }
  await collectService(city, pageNum+1, allService.concat(ret));
}

const GuangZhouServiceStops: DistrictArea = 
{
  '南沙区': [
    {name: '潭洲服务区(东新高速东沙方向)', location: '113.401198,22.759078', altitude: 8}, 
    {name: '潭洲服务区(东新高速新联方向)', location: '113.401042,22.757614', altitude: 8},
    {name: '万顷沙服务区', location: '113.636476,22.580879', altitude: 0},
    {name: '南沙停车区(莞佛高速佛山方向)', location: '113.587856,22.769409', altitude: 9},
    {name: '南沙停车区(莞佛高速东莞方向)', location: '113.587666,22.767619', altitude: 9},
  ],
  '从化区': [
    {name: '从化服务区(大广高速大庆方向)', location: '113.647661,23.609664', altitude: 76},
    {name: '从化服务区(大广高速广州方向)', location: '113.646944,23.610815', altitude: 76},
    {name: '鳌头停车区(广连高速连州方向)', location: '113.364255,23.638190', altitude: 58},
    {name: '鳌头停车区(广连高速广州方向)', location: '113.363179,23.637761', altitude: 58},
    {name: '上塘服务区(佛清从高速佛山方向)', location: '113.505864,23.527526', altitude: 68}, 
    {name: '上塘服务区(佛清从高速从化方向)', location: '113.505225,23.526373', altitude: 68},
    {name: '吕田服务区(大广高速广州方向)', location: '113.895669,23.819124', altitude: 232},
    {name: '吕田服务区(大广高速大庆方向)', location: '113.895347,23.817703', altitude: 232},
    {name: '木棉服务区(大广高速大庆方向)', location: '113.505955,23.498445', altitude: 33},
    {name: '木棉服务区(大广高速广州方向)', location: '113.504990,23.499368', altitude: 33},
    {name: '从化南服务区(从埔高速从化方向)', location: '113.524327,23.449385', altitude: 66},
    {name: '从化南服务区(从埔高速黄埔方向)', location: '113.522569,23.450287', altitude: 66},
  ],
  '白云区': [
    {name: '白云服务区(机场高速白云机场方向)', location: '113.269386,23.267017', altitude: 17},
    {name: '白云服务区(机场高速广州方向)', location: '113.268137,23.267584', altitude: 17},
    {name: '沙贝服务区(广佛高速佛山方向)', location: '113.195275,23.154726', altitude: 23}, 
    {name: '沙贝服务区(广佛高速广州方向)', location: '113.194968,23.153367', altitude: 23},
    {name: '和龙服务区(京港澳高速深圳方向)', location: '113.419987,23.257411', altitude: 108},
  ],
  '增城区': [
    {name: '正果停车区(广河高速广州方向)', location: '113.903870,23.458933', altitude: 50},
    {name: '正果停车区(广河高速河源方向)', location: '113.904996,23.458983', altitude: 50},
    {name: '南香山服务区(花莞高速东莞方向)', location: '113.641978,23.223890', altitude: 17},
    {name: '南香山服务区(花莞高速花都方向)', location: '113.643626,23.225485', altitude: 17},
    {name: '沙埔服务区(济广高速济南方向)', location: '113.675231,23.187070', altitude: 22},
    {name: '沙埔服务区(济广高速广州方向)', location: '113.676422,23.189259', altitude: 22},
    {name: '沙岗驿站', location: '113.736632,23.382122', altitude: 50},
    {name: '荔城服务区', location: '113.785421,23.238048', altitude: 19},
    {name: '新安服务区', location: '113.578183,23.376050', altitude: 92},
    {name: '仙村服务区', location: '113.697883,23.159462', altitude: 5},
    {name: '河洞服务区(从莞深高速从化方向)', location: '113.808866,23.440458', altitude: 24},
    {name: '河洞服务区(从莞深高速东莞方向)', location: '113.808374,23.438718', altitude: 24},
  ],
  '花都区': [
    {name: '花城服务区(乐广高速广州方向)', location: '113.313125,23.503162', altitude: 67},
    {name: '炭步服务区(沈海高速海口方向)', location: '113.068275,23.314411', altitude: 10},
    {name: '炭步服务区(沈海高速沈阳方向)', location: '113.067509,23.311997', altitude: 10},
  ],
  '番禺区': [
    {name: '金山服务区(广台高速台山方向)', location: '113.266747,22.971264', altitude: 10},
    {name: '金山服务区(广台高速广州方向)', location: '113.265947,22.970051', altitude: 10},
    {name: '官桥服务区(广澳高速广州方向)', location: '113.458891,22.988612', altitude: 6},
    {name: '官桥服务区(广澳高速澳门方向)', location: '113.457426,22.987955', altitude: 6},
  ],
  '黄埔区': [
    {name: '仓头服务区', location: '113.551412,23.124518', altitude: 8},
    {name: '中新服务区(广河高速河源方向)', location: '113.602678,23.310739', altitude: 13},
    {name: '中新服务区(广河高速广州方向)', location: '113.602138,23.312123', altitude: 13},
    {name: '火村服务区', location: '113.489894,23.153703', altitude: 23},
    {name: '和龙服务区(京港澳高速北京方向)', location: '113.476931,23.219530', altitude: 68},
  ],
  '天河区': [
    {name: '黄村服务区', location: '113.403143,23.144632', altitude: 9},
    {name: '广氮服务区(沈海高速广州支线沈阳方向)', location: '113.383248,23.150448', altitude: 15},
    {name: '广氮服务区(沈海高速广州支线海口方向)', location: '113.384020,23.151452', altitude: 15},
  ],
  '海珠区': [
    {name: '赤沙加油站', location: '113.350397,23.086840', altitude: 9},
    {name: '华洲加油站', location: '113.344331,23.062008', altitude: 9},
  ]
}

const FoShanServiceStops: DistrictArea = 
{
  "三水区": [
    {name: '三水服务区(广佛肇高速广州方向)', location: '112.896063,23.244388', altitude: 15},
    {name: '三水服务区(广佛肇高速肇庆方向)', location: '112.897686,23.245972', altitude: 15},
    {name: '大塘服务区', location: '112.980172,23.429447', altitude: 11},
    {name: '范湖服务区(佛清从高速从化方向)', location: '113.027106,23.338264', altitude: 7},
    {name: '范湖服务区(佛清从高速佛山方向)', location: '113.025242,23.338511', altitude: 7},
  ],
  "南海区": [
    {name: '沙涌加油站(广佛高速广州方向)', location: '113.163602,23.137643', altitude: 6},
    {name: '丹灶服务区(沈海高速沈阳方向)', location: '112.900160,23.043781', altitude: 15},
    {name: '丹灶服务区(沈海高速海口方向)', location: '112.898841,23.044525', altitude: 15},
    {name: '狮山加油站(广三高速三水方向)', location: '112.996636,23.139294', altitude: 9},
    {name: '狮山加油站(广三高速广州方向)', location: '112.995906,23.138756', altitude: 9},
  ],
  "高明区": [
    {name: '明城停车区', location: '112.695781,22.946388', altitude: 32},
    {name: '更合停车区(广台高速台山方向)', location: '112.499981,22.757366', altitude: 43},
    {name: '更合停车区(广台高速广州方向)', location: '112.499487,22.755973', altitude: 43},
    {name: '松岗服务区(莞佛高速佛山方向)', location: '112.824118,22.950590', altitude: 14},
    {name: '松岗服务区(莞佛高速东莞方向)', location: '112.825981,22.949787', altitude: 14},
  ],
  "顺德区": [
    {name: '顺德服务区(广珠西线高速广州方向)', location: '113.270005,22.917469', altitude: 10},
    {name: '顺德服务区(广珠西线高速珠海方向)', location: '113.268773,22.915640', altitude: 10},
    {name: '冲鹤服务区(广佛江珠高速珠海方向)', location: '113.198528,22.779938', altitude: 13},
    {name: '冲鹤服务区(广佛江珠高速广州方向)', location: '113.198885,22.781098', altitude: 13},
  ],
  "禅城区": [
    {name: '罗格服务区(广台高速台山方向)', location: '113.012194,22.991461', altitude: 11}
  ]
}

const ZhaoQingServiceStops: DistrictArea =
{
  "广宁县": [
    {name: '广宁服务区(二广高速二连浩特方向)', location: '112.439315,23.521410', altitude: 34},
    {name: '广宁服务区(二广高速广州方向)', location: '112.437496,23.520699', altitude: 34},
  ],
  "鼎湖区": [
    {name: '鼎湖山服务区(广佛肇高速广州方向)', location: '112.629117,23.245658', altitude: 24},
    {name: '鼎湖山服务区(广佛肇高速肇庆方向)', location: '112.627663,23.247110', altitude: 24},
    {name: '鼎湖服务区', location: '112.695005,23.216631', altitude: 9}
  ],
  "封开县": [
    {name: '金装服务区(怀郁高速郁南方向)', location: '111.874010,23.775097', altitude: 74},
    {name: '金装服务区(怀郁高速怀集方向)', location: '111.874599,23.773154', altitude: 74},
    {name: '封开服务区 (广佛肇高速广州方向)', location: '111.556291,23.348916', altitude: 47},
    {name: '封开服务区(广佛肇高速肇庆方向)', location: '111.555619,23.351069', altitude: 47},
    {name: '南丰停车区(怀郁高速怀集方向)', location: '111.809082,23.636730', altitude: 110},
    {name: '南丰停车区(怀郁高速郁南方向)', location: '111.807659,23.635221', altitude: 110},
    {name: '罗董服务区(怀郁高速怀集方向)', location: '111.649806,23.360055', altitude: 88},
    {name: '罗董服务区(怀郁高速郁南方向)', location: '111.646208,23.355565', altitude: 88},
  ],
  "高要区": [
    {name: '水南服务区(汕湛高速汕头方向)', location: '112.392459,23.291416', altitude: 59},
    {name: '水南服务区(汕湛高速湛江方向)', location: '112.390939,23.292235', altitude: 59},
    {name: '蚬岗服务区(广昆高速广州方向)', location: '112.633920,23.048405', altitude: 26},
    {name: '蚬岗服务区(广昆高速昆明方向)', location: '112.633448,23.049731', altitude: 26},
    {name: '笋围停车区(广佛肇高速肇庆方向)', location: '112.342382,23.183696', altitude: 20},
    {name: '笋围停车区(广佛肇高速广州方向)', location: '112.342785,23.182716', altitude: 20},
  ],
  "德庆县": [
    {name: '宾村停车区(广佛肇高速肇庆方向)', location: '111.719266,23.228341', altitude: 135},
    {name: '宾村停车区(广佛肇高速广州方向)', location: '111.719530,23.226553', altitude: 135},
    {name: '高良停车区(广佛肇高速广州方向)', location: '111.909494,23.236876', altitude: 75},
    {name: '高良停车区(广佛肇高速肇庆方向)', location: '111.909077,23.237593', altitude: 75},
    {name: '播植服务区(广佛肇高速广州方向)', location: '112.091312,23.260490', altitude: 99},
    {name: '播植服务区(广佛肇高速肇庆方向)', location: '112.088516,23.262082', altitude: 99},
  ],
  "怀集县": [
    {name: '怀集服务区(汕昆高速昆明方向)', location: '112.230956,23.978423', altitude: 119},
    {name: '怀集服务区(汕昆高速汕头方向)', location: '112.230754,23.976639', altitude: 119},
    {name: '怀城服务区(二广高速广州方向)', location: '112.221792,23.812410', altitude: 52},
    {name: '怀城服务区(二广高速二连浩特方向)', location: '112.221578,23.814402', altitude: 52},
    {name: '连麦停车区(二广高速二连浩特方向)', location: '112.117659,24.021481', altitude: 81},
    {name: '连麦停车区(二广高速广州方向)', location: '112.116338,24.022175', altitude: 81},
    {name: '梁村停车区(汕昆高速昆明方向)', location: '111.997930,23.968522', altitude: 86},
    {name: '梁村停车区(汕昆高速汕头方向)', location: '111.997250,23.967929', altitude: 86},
  ],
  "四会市": [
    {name: '四会服务区(二广高速广州方向)', location: '112.539873,23.429049', altitude: 14},
    {name: '四会服务区(二广高速二连浩特方向)', location: '112.540032,23.431859', altitude: 14},
    {name: '地豆服务区(汕湛高速汕头方向)', location: '112.688932,23.565161', altitude: 43},
    {name: '地豆服务区(汕湛高速湛江方向)', location: '112.688066,23.566828', altitude: 43},
    {name: '龙甫服务区(二广高速二连浩特方向)', location: '112.714164,23.377671', altitude: 15},
    {name: '龙甫服务区(二广高速广州方向)', location: '112.712646,23.375830', altitude: 15},
    {name: '江谷停车区(汕湛高速汕头方向)', location: '112.611892,23.447889', altitude: 72},
    {name: '江谷停车区(汕湛高速湛江方向)', location: '112.610916,23.448342', altitude: 72},
  ]
};
const HeZhouServiceStops: DistrictArea =
{
  "平桂区": [
    {name: '平桂服务区', location: '111.469749,24.494844', altitude: 169},
  ],
  "钟山县": [
    {name: '清塘服务区', location: '111.123752,24.352925', altitude: 190},
    {name: '钟山服务区', location: '111.276905,24.605468', altitude: 142},
    {name: '同古服务区', location: '111.185664,24.394484', altitude: 176}
  ],
  "八步区": [
    {name: '大桂山停车区', location: '111.695203,24.162302', altitude: 176},
    {name: '信都服务区', location: '111.708496,24.047655', altitude: 100},
    {name: '八步服务区', location: '111.715281,24.404130', altitude: 186},
    {name: '白马服务区', location: '111.768104,24.020730', altitude: 76},
    {name: '贺州服务区', location: '111.644819,24.347130', altitude: 141}
  ],
  "昭平县": [
    {name: '昭平服务区', location: '110.815686,24.192409', altitude: 78},
    {name: '黄姚停车区', location: '111.219973,24.175408', altitude: 194},
    {name: '富罗服务区', location: '111.159073,24.035602', altitude: 80}
  ],
  "富川瑶族自治县": [
    {name: '富川服务区', location: '111.272163,24.998497', altitude: 325}
  ]
}; 
const GuiLinServiceStops: DistrictArea = 
{
  "永福县": [
    {name: '百寿停车区', location: '109.724990,25.083270', altitude: 247},
    {name: '永福服务区', location: '110.010994,25.037666', altitude: 183},
  ],
  "临桂区": [
    {name: '五通服务区', location: '110.096766,25.410706', altitude: 236},
    {name: '桂林服务区', location: '110.120394,25.217437', altitude: 165},
    {name: '宛田服务区', location: '110.049585,25.626338', altitude: 363},
    {name: '会仙服务区', location: '110.255057,25.089015', altitude: 137},
    {name: '桂林两江服务区', location: '109.981355,25.151762', altitude: 186},
    {name: '东山停车区', location: '110.327517,24.925521', altitude: 124},
  ],
  "平乐县": [
    {name: '同安停车区', location: '110.981447,24.543884', altitude: 150},
    {name: '平乐服务区', location: '110.720951,24.642464', altitude: 218},
    {name: '平乐停车区', location: '110.660916,24.684125', altitude: 138}
  ],
  "资源县": [
    {name: '中峰服务区', location: '110.610384,25.843576', altitude: 497},
    {name: '八角寨服务区', location: '110.748699,26.226159', altitude: 432}
  ],
  "灌阳县": [
    {name: '新圩服务区', location: '111.115495,25.611985', altitude: 435},
    {name: '灌阳服务区', location: '111.182004,25.659212', altitude: 245},
    {name: '新街停车区', location: '111.103910,25.428395', altitude: 283},
    {name: '黄关服务区', location: '110.995157,25.314831', altitude: 315}
  ],
  "七星区": [
    {name: '尧山服务区', location: '110.356147,25.265402', altitude: 142}
  ],
  "兴安县": [
    {name: '兴安停车区', location: '110.652837,25.647829', altitude: 219},
    {name: '溶江服务区', location: '110.512468,25.584283', altitude: 237}
  ],
  "灵川县": [
    {name: '灵川服务区', location: '110.298757,25.381080', altitude: 176},
  ],
  "阳朔县": [
    {name: '高田服务区', location: '110.431986,24.749543', altitude: 133},
  ],
  "全州县": [
    {name: '全州停车区', location: '110.991880,25.893511', altitude: 174},
    {name: '凤凰服务区', location: '110.818185,25.726099', altitude: 203},
    {name: '石塘停车区', location: '111.014039,25.706926', altitude: 273},
    {name: '全州服务区', location: '111.102540,26.010079', altitude: 185}
  ],
  "龙胜各族自治县": [
    {name: '龙胜服务区', location: '109.946363,25.787543', altitude: 242},
  ],
  "荔浦市": [
    {name: '荔浦服务区', location: '110.353673,24.532750', altitude: 177},
    {name: '杜莫服务区', location: '110.439902,24.349638', altitude: 287}
  ],
  "恭城瑶族自治县": [
    {name: '恭城服务区', location: '110.815611,24.886585', altitude: 166},
    {name: '栗木停车区', location: '110.900364,25.090461', altitude: 188}
  ]
} 

const LiuZhouServiceStops: DistrictArea = 
{
  "融水苗族自治县": [
    {name: '融水服务区', location: '109.288116,25.165671', altitude: 151},
    {name: '和睦服务区', location: '109.203820,24.915379', altitude: 110}
  ],
  "柳南区": [
    {name: '柳北服务区', location: '109.305336,24.409348', altitude: 105}
  ],
  "三江侗族自治县": [
    {name: '三江南服务区', location: '109.531378,25.719468', altitude: 206},
    {name: '三江北服务区', location: '109.634494,25.826220', altitude: 192}
  ],
  "融安县": [
    {name: '融安服务区', location: '109.380708,25.250808', altitude: 146},
    {name: '沙子服务区', location: '109.455885,24.977038', altitude: 299}
  ],
  "鹿寨县": [
    {name: '鹿寨服务区', location: '109.733880,24.454081', altitude: 99},
    {name: '寨沙服务区', location: '110.018328,24.475256', altitude: 161},
    {name: '波寨服务区', location: '109.889772,24.735192', altitude: 171}
  ],
  "柳江区": [
    {name: '木团停车区', location: '109.430470,24.120566', altitude: 126},
    {name: '新兴服务区', location: '109.401211,24.133533', altitude: 130},
  ],
  "鱼峰区": [
    {name: '柳州服务区', location: '109.590193,24.229755', altitude: 94}
  ],
  "柳城县": [
    {name: '柳城东服务区', location: '109.282548,24.618355', altitude: 147},
    {name: '柳城服务区', location: '109.075045,24.522678', altitude: 183}
  ]
}

const ServiceStops: {[city: string]: DistrictArea} = {
  "广州市": GuangZhouServiceStops,
  "佛山市": FoShanServiceStops,
  "肇庆市": ZhaoQingServiceStops,
  "贺州市": HeZhouServiceStops,
  "桂林市": GuiLinServiceStops,
  "柳州市": LiuZhouServiceStops
}
