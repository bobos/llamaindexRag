const KwhPer120PerKm = 17.2 * 0.01; //65%
const KwhPer80PerKm = 14 * 0.01; //80%
const Weight = 2.1;
const chargeEffe = 0.92;
const chargeSpeed = 70;
const J2KwhFactor = 3.6e6;
const maxBattery = 59.5;
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

function getGravityEnergyKwh(distance: number, weight: number, altitudeDiff: number, eta=0.25): number {
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
  const {stops, totalConsumption, totalDistance} = await collectStops(
  {location: await convLocation(startAddress), name: startAddress},
  {location: await convLocation(destAddres), name: destAddres});
  if (maxBattery * (1 - minSoc) >= totalConsumption) {
    alert(`enough soc left ${Math.floor((maxBattery - totalConsumption)/maxBattery * 100)}%, no need to plan charging`);
    return [];
  }
  const aiPlan: AiPlanStep[] = await plan(stops, startTime, startSoc, maxSoc, minSoc, presets, otherRequirement);
  alert('plan completed');
  return aiPlan;
}

async function collectStops(startStation: Station, endStation: Station): Promise<{stops: Stop[], totalConsumption: number, totalDistance: number}> {
  const stops: Stop[] = [];
  let prevStation = startStation;
  let totalConsumption = 0;
  let totalDistance = 0;
  const path = await getPath(startStation.location, endStation.location);

  for (const step of path.steps) {
    const distance = parseInt(step.step_distance);
    if (!step.cost.toll_road || distance < 500) continue;

    const polylines: string[] = step.polyline.split(';').splice(1);
    const incre = Math.floor(polylines.length / Math.floor(distance / 800)); // scan at every 800M 
    for (let index=0; index < polylines.length; index += incre) {
      const ret: Station|undefined = await getNearestStop(polylines[index], step.cities, prevStation);
      if (ret !== undefined && ret.name !== prevStation.name) {
        const nextStop = await getStopRecord(prevStation, ret);
        stops.push(nextStop);
        totalConsumption += nextStop.consumedBattery;
        totalDistance += nextStop.distance;
        prevStation = ret;
        console.log(nextStop, totalDistance);
      }
    }
  }

  if (prevStation.name !== endStation.name) {
    const nextStop = await getStopRecord(prevStation, endStation);
    stops.push(nextStop);
    totalConsumption += nextStop.consumedBattery;
    totalDistance += nextStop.distance;
    console.log(nextStop, totalDistance);
  }

  return {stops, totalConsumption, totalDistance};
}

async function getStopRecord(fromStop: Station, targetStop: Station): Promise<Stop> {
  const path: Path = await getPath(fromStop.location, targetStop.location); 
  let consumedBattery = 0;
  for(const step of path.steps) {
    consumedBattery += (parseInt(step.step_distance) / 1000) * (step.cost.toll_road ? KwhPer120PerKm : KwhPer80PerKm);
  }

  const distKm = parseFloat((parseInt(path.distance) / 1000).toFixed(1));
  const tags: string[] = [];

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
    consumedTime: Math.ceil((parseInt(path.cost.duration) * 0.9 - 90) / 60), // 90s, remove entering and leaving service stop time
    consumedBattery,
    tags
  }
}

async function getPath(originLoc: string, destLoc: string): Promise<Path> {
  const response = await request(`/v5/direction/driving?origin=${originLoc}&destination=${destLoc}&strategy=32&cartype=1&show_fields=cost,polyline,cities`);
  if (!response) {
    throw new Error(`failed to path from ${originLoc} to ${destLoc}`);
  }
  let path = response.route.paths[0];
  let duration = parseInt(path.cost.duration);
  for (const p of response.route.paths) {
    let d = parseInt(p.cost.duration);
    if (d < duration) {
      path = p;
    }
  }
  return path;
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
const chatModelGlm ='z-ai/glm-4.5';
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

async function getNearestStop(location: string, cities: City[], prevStation: Station): Promise<Station | undefined> {
  for (const city of cities) {
    const stops: DistrictArea | undefined = ServiceStops[city.city];
    if (!stops) throw new Error(`没有服务数据: ${city.city}`);

    let found: Station|undefined = undefined;
    for (const district of city.districts) {
      const sa: Station[] = stops[district.name];
      if (!sa) continue;
      for (const s of sa) {
        if (calculateDistance(location, s.location) <= 500) { //小于500米
          found = s;
        }
      }
    }

    if (found) {
      let distance = (await getPath(prevStation.location, found.location)).distance;
      const matchStr = found.name.split("(")[0];
      for (const district in stops) {
        for (const s of stops[district]) {
          if (s.name.startsWith(matchStr)) {
            let newDist = (await getPath(prevStation.location, s.location)).distance;
            if (newDist < distance) {
              found = s;
              distance = newDist;
            }
          }
        }
      }
      return found;
    }
  }
  return;
}

interface DistrictArea {[district: string]: Station[]};

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
    if (stop.start === from || from === stop.start.split('(')[0]) {
      found = true;
    }

    if (found) {
      time += stop.consumedTime;
      kwh += stop.consumedBattery;
    }

    if (stop.end === to || to === stop.end.split('(')[0]) {
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
- Reduce the recharging times as less as possible to save overall trip time

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
      content: promptForDsR1,
      role: 'user'
    }];
  }

  const answer: string = await askLlm(
    openrouterHost,
    openrouterKey,
    chatModelGlm,
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
    stream: false,
    reasoning: {
      enabled: true
    }
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

generateRoute(
  '广州市黄埔区中新知识城招商雍景湾',
  '广西壮族自治区柳州市三江侗族自治县浔江大道59',
  '6:30', 100, 90, 10,
  [Preset.conservative],
  '优先安排早餐时段充电,尽量避免11:00 - 13:00高电价区间充电,保证抵达终点时有至少15%的电').then(ret => console.log(ret));

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
    {name: '荔城服务区(珠三角环线高速外环方向)', location: '113.780255,23.240705', altitude: 19},
    {name: '荔城服务区(珠三角环线高速内环方向)', location: '113.778932,23.240016', altitude: 19},
    {name: '新安服务区(珠三角环线高速深圳方向)', location: '113.573162,23.378711', altitude: 92},
    {name: '新安服务区(珠三角环线高速非深圳方向)', location: '113.578309,23.378393', altitude: 92},
    {name: '仙村服务区(A)', location: '113.693023,23.161318', altitude: 5},
    {name: '仙村服务区(B)', location: '113.697785,23.159380', altitude: 5},
    {name: '河洞服务区(从莞深高速从化方向)', location: '113.808866,23.440458', altitude: 24},
    {name: '河洞服务区(从莞深高速东莞方向)', location: '113.808374,23.438718', altitude: 24},
  ],
  '花都区': [
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
    {name: '中新服务区(广河高速河源方向)', location: '113.602678,23.310739', altitude: 13},
    {name: '中新服务区(广河高速广州方向)', location: '113.602138,23.312123', altitude: 13},
    {name: '火村服务区(A)', location: '113.485659,23.155489', altitude: 23},
    {name: '火村服务区(B)', location: '113.484471,23.156617', altitude: 23},
    {name: '和龙服务区(京港澳高速北京方向)', location: '113.476931,23.219530', altitude: 68},
  ],
  '天河区': [
    {name: '黄村服务区(广州环城高速内环方向)', location: '113.397623,23.147122', altitude: 9},
    {name: '黄村服务区(广州环城高速外环方向)', location: '113.403912,23.145049', altitude: 9},
    {name: '广氮服务区(沈海高速广州支线沈阳方向)', location: '113.383248,23.150448', altitude: 15},
    {name: '广氮服务区(沈海高速广州支线海口方向)', location: '113.384020,23.151452', altitude: 15},
  ],
  '海珠区': [
    {name: '华洲加油站(A)', location: '113.338871,23.064378', altitude: 9},
    {name: '华洲加油站(B)', location: '113.345249,23.060799', altitude: 9},
  ]
}

const FoShanServiceStops: DistrictArea = 
{
  "三水区": [
    {name: '三水服务区(广佛肇高速广州方向)', location: '112.896063,23.244388', altitude: 15},
    {name: '三水服务区(广佛肇高速肇庆方向)', location: '112.897686,23.245972', altitude: 15},
    {name: '大塘服务区(珠三角环线高速内环方向)', location: '112.975045,23.432146', altitude: 11},
    {name: '大塘服务区(珠三角环线高速肇庆方向)', location: '112.973690,23.433296', altitude: 11},
    {name: '范湖服务区(佛清从高速从化方向)', location: '113.027106,23.338264', altitude: 7},
    {name: '范湖服务区(佛清从高速佛山方向)', location: '113.025242,23.338511', altitude: 7},
  ],
  "南海区": [
    {name: '丹灶服务区(沈海高速沈阳方向)', location: '112.900160,23.043781', altitude: 15},
    {name: '丹灶服务区(沈海高速海口方向)', location: '112.898841,23.044525', altitude: 15},
    {name: '狮山加油站(广三高速三水方向)', location: '112.996636,23.139294', altitude: 9},
    {name: '狮山加油站(广三高速广州方向)', location: '112.995906,23.138756', altitude: 9},
  ],
  "高明区": [
    {name: '明城停车区(珠三角环线高速珠海方向)', location: '112.691962,22.947305', altitude: 32},
    {name: '明城停车区(珠三角环线高速内环方向)', location: '112.690696,22.949309', altitude: 32},
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
    {name: '罗格服务区(A方向)', location: '113.007140,22.994094', altitude: 11},
    {name: '罗格服务区(B方向)', location: '113.011853,22.990689', altitude: 11},
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
    {name: '鼎湖服务区(珠三角环线9247高速四会方向)', location: '112.690704,23.217964', altitude: 9},
    {name: '鼎湖服务区(珠三角环线高速外环方向)', location: '112.689625,23.21', altitude: 9},
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
    {name: '平桂服务区(贺西高速贺州方向)', location: '111.469749,24.494844', altitude: 169},
    {name: '平桂服务区(贺西高速西林方向)', location: '111.471509,24.496373', altitude: 169},
  ],
  "钟山县": [
    {name: '清塘服务区(贺巴高速巴马方向)', location: '111.123752,24.352925', altitude: 190},
    {name: '清塘服务区(贺巴高速贺州方向)', location: '111.124922,24.351472', altitude: 190},
    {name: '钟山服务区(富钟高速富川方向)', location: '111.276905,24.605468', altitude: 142},
    {name: '钟山服务区(富钟高速钟山方向)', location: '111.274940,24.605118', altitude: 142},
    {name: '同古服务区(包茂高速茂名方向)', location: '111.186933,24.392126', altitude: 176},
    {name: '同古服务区(包茂高速包头方向)', location: '111.185664,24.394484', altitude: 176},
  ],
  "八步区": [
    {name: '大桂山停车区(汕昆高速昆明方向)', location: '111.695203,24.162302', altitude: 176},
    {name: '大桂山停车区(汕昆高速汕头方向)', location: '111.692313,24.164072', altitude: 176},
    {name: '信都服务区(信梧高速信都方向)', location: '111.708496,24.047655', altitude: 100},
    {name: '信都服务区(信梧高速梧州方向)', location: '111.706877,24.048501', altitude: 100},
    {name: '八步服务区(连贺高速贺州方向)', location: '111.715281,24.404130', altitude: 186},
    {name: '八步服务区(连贺高速连山方向)', location: '111.716109,24.402731', altitude: 186},
    {name: '白马服务区(汕昆高速昆明方向)', location: '111.767964,24.023205', altitude: 76},
    {name: '白马服务区(汕昆高速汕头方向)', location: '111.768104,24.020730', altitude: 76},
    {name: '贺州服务区(汕昆高速汕头方向)', location: '111.644819,24.347130', altitude: 141},
    {name: '贺州服务区(汕昆高速昆明方向)', location: '111.645908,24.350358', altitude: 141},
  ],
  "昭平县": [
    {name: '昭平服务区(贺西高速贺州方向)', location: '110.815686,24.192409', altitude: 78},
    {name: '昭平服务区(贺西高速西林方向)', location: '110.817550,24.194553', altitude: 78},
    {name: '黄姚停车区(包茂高速包头方向)', location: '111.221027,24.175432', altitude: 194},
    {name: '黄姚停车区(包茂高速茂名方向)', location: '111.219973,24.175408', altitude: 194},
    {name: '富罗服务区(包茂高速茂名方向)', location: '111.159073,24.035602', altitude: 80},
    {name: '富罗服务区(包茂高速包头方向)', location: '111.159730,24.034701', altitude: 80},
  ],
  "富川瑶族自治县": [
    {name: '富川服务区(富钟高速钟山方向)', location: '111.270323,24.998945', altitude: 325},
    {name: '富川服务区(富钟高速富川方向)', location: '111.272163,24.998497', altitude: 325},
  ]
}; 

const GuiLinServiceStops: DistrictArea = 
{
  "永福县": [
    {name: '百寿停车区(桂河高速桂林方向)', location: '109.724990,25.083270', altitude: 247},
    {name: '百寿停车区(桂河高速河池方向)', location: '109.724080,25.083774', altitude: 247},
    {name: '永福服务区(泉南高速泉州方向)', location: '110.010994,25.037666', altitude: 183},
    {name: '永福服务区(泉南高速南宁方向)', location: '110.009196,25.037559', altitude: 183},
  ],
  "临桂区": [
    {name: '五通服务区(包茂高速包头方向)', location: '110.096766,25.410706', altitude: 236},
    {name: '五通服务区(包茂高速茂名方向)', location: '110.095389,25.410433', altitude: 236},
    {name: '桂林服务区(包茂高速包头方向)', location: '110.120394,25.217437', altitude: 165},
    {name: '桂林服务区(包茂高速茂名方向)', location: '110.121915,25.216661', altitude: 165},
    {name: '宛田服务区(包茂高速包头方向)', location: '110.050332,25.624954', altitude: 363},
    {name: '宛田服务区(包茂高速茂名方向)', location: '110.049585,25.626338', altitude: 363},
    {name: '会仙服务区(包茂高速包头方向)', location: '110.256205,25.089430', altitude: 137},
    {name: '会仙服务区(包茂高速茂名方向)', location: '110.255057,25.089015', altitude: 137},
    {name: '桂林两江服务区(桂河高速桂林方向)', location: '109.981629,25.150523', altitude: 186},
    {name: '桂林两江服务区(桂河高速河池方向)', location: '109.981355,25.151762', altitude: 186},
    {name: '东山停车区(包茂高速茂名方向)', location: '110.326027,24.925142', altitude: 124},
    {name: '东山停车区(包茂高速包头方向)', location: '110.327517,24.925521', altitude: 124},
  ],
  "平乐县": [
    {name: '同安停车区(包茂高速茂名方向)', location: '110.981447,24.543884', altitude: 150},
    {name: '同安停车区(包茂高速包头方向)', location: '110.981947,24.544597', altitude: 150},
    {name: '平乐服务区(包茂高速茂名方向)', location: '110.715290,24.639071', altitude: 218},
    {name: '平乐服务区(包茂高速包头方向)', location: '110.720951,24.642464', altitude: 218},
    {name: '平乐停车区(呼北高速呼和浩特方向)', location: '110.660916,24.684125', altitude: 138},
    {name: '平乐停车区(呼北高速北海方向)', location: '110.660910,24.684984', altitude: 138},
  ],
  "资源县": [
    {name: '中峰服务区(呼北高速北海方向)', location: '110.610384,25.843576', altitude: 497},
    {name: '中峰服务区(呼北高速呼和浩特方向)', location: '110.612021,25.844408', altitude: 497},
    {name: '八角寨服务区(呼北高速北海方向)', location: '110.748699,26.226159', altitude: 432},
    {name: '八角寨服务区(呼北高速呼和浩特方向)', location: '110.749095,26.224661', altitude: 432},
  ],
  "灌阳县": [
    {name: '灌阳服务区(厦蓉高速成都方向)', location: '111.182004,25.659212', altitude: 245},
    {name: '灌阳服务区(厦蓉高速厦门方向)', location: '111.182647,25.657730', altitude: 245},
    {name: '新街停车区(呼北高速呼和浩特方向)', location: '111.103910,25.428395', altitude: 283},
    {name: '新街停车区(呼北高速北海方向)', location: '111.103883,25.429523', altitude: 283},
    {name: '黄关服务区(呼北高速呼和浩特方向)', location: '110.997555,25.315551', altitude: 315},
    {name: '黄关服务区(呼北高速北海方向)', location: '110.995157,25.314831', altitude: 315},
  ],
  "七星区": [
    {name: '尧山服务区(桂林绕城高速内环方向)', location: '110.351410,25.268096', altitude: 142},
    {name: '尧山服务区(桂林绕城高速外环方向)', location: '110.351102,25.271018', altitude: 142},
  ],
  "兴安县": [
    {name: '兴安停车区(呼北高速呼和浩特方向)', location: '110.652170,25.648818', altitude: 219},
    {name: '兴安停车区(呼北高速北海方向)', location: '110.652837,25.647829', altitude: 219},
    {name: '溶江服务区(泉南高速南宁方向)', location: '110.512468,25.584283', altitude: 237},
    {name: '溶江服务区(泉南高速泉州方向)', location: '110.513297,25.583128', altitude: 237},
  ],
  "灵川县": [
    {name: '灵川服务区(泉南高速泉州方向)', location: '110.298757,25.381080', altitude: 176},
    {name: '灵川服务区(泉南高速南宁方向)', location: '110.295530,25.378797', altitude: 176},
  ],
  "阳朔县": [
    {name: '高田服务区(包茂高速茂名方向)', location: '110.431986,24.749543', altitude: 133},
    {name: '高田服务区(包茂高速包头方向)', location: '110.433793,24.749762', altitude: 133},
  ],
  "全州县": [
    {name: '全州停车区(泉南高速泉州方向)', location: '110.991880,25.893511', altitude: 174},
    {name: '全州停车区(泉南高速南宁方向)', location: '110.990964,25.894157', altitude: 174},
    {name: '凤凰服务区(呼北高速北海方向)', location: '110.818185,25.726099', altitude: 203},
    {name: '凤凰服务区(呼北高速呼和浩特方向)', location: '110.816483,25.727184', altitude: 203},
    {name: '石塘停车区(呼北高速北海方向)', location: '111.014039,25.706926', altitude: 273},
    {name: '石塘停车区(呼北高速呼和浩特方向)', location: '111.014594,25.707724', altitude: 273},
    {name: '全州服务区(泉南高速南宁方向)', location: '111.101554,26.011030', altitude: 185},
    {name: '全州服务区(泉南高速泉州方向)', location: '111.102540,26.010079', altitude: 185},
  ],
  "荔浦市": [
    {name: '荔浦服务区(汕昆高速汕头方向)', location: '110.353750,24.531135', altitude: 177},
    {name: '荔浦服务区(汕昆高速昆明方向)', location: '110.353673,24.532750', altitude: 177},
    {name: '杜莫服务区(呼北高速呼和浩特方向)', location: '110.439902,24.349638', altitude: 287},
    {name: '杜莫服务区(呼北高速北海方向)', location: '110.438248,24.349797', altitude: 287},
  ],
  "恭城瑶族自治县": [
    {name: '恭城服务区(呼北高速呼和浩特方向)', location: '110.817405,24.886080', altitude: 166},
    {name: '恭城服务区(呼北高速北海方向)', location: '110.815611,24.886585', altitude: 166},
    {name: '栗木停车区(呼北高速呼和浩特方向)', location: '110.900364,25.090461', altitude: 188},
    {name: '栗木停车区(呼北高速北海方向)', location: '110.899529,25.091316', altitude: 188},
  ]
} 

const LiuZhouServiceStops: DistrictArea = 
{
  "融水苗族自治县": [
    {name: '融水服务区(从荔高速从江方向)', location: '109.288885,25.168551', altitude: 151},
    {name: '融水服务区(从荔高速荔浦方向)', location: '109.288116,25.165671', altitude: 151},
    {name: '和睦服务区(桂河高速桂林方向)', location: '109.203820,24.915379', altitude: 110},
    {name: '和睦服务区(桂河高速河池方向)', location: '109.202858,24.917416', altitude: 110},
  ],
  "柳南区": [
    {name: '柳北服务区(汕昆高速昆明方向)', location: '109.316069,24.409751', altitude: 105},
    {name: '柳北服务区(汕昆高速汕头方向)', location: '109.305336,24.409348', altitude: 105},
  ],
  "三江侗族自治县": [
    {name: '三江南服务区(三南高速三江方向)', location: '109.531378,25.719468', altitude: 206},
    {name: '三江南服务区(三南高速南宁方向)', location: '109.530449,25.720514', altitude: 206},
    {name: '三江北服务区(厦蓉高速厦门方向)', location: '109.634494,25.826220', altitude: 192},
    {name: '三江北服务区(厦蓉高速成都方向)', location: '109.634317,25.827524', altitude: 192},
  ],
  "融安县": [
    {name: '融安服务区(三南高速三江方向)', location: '109.380708,25.250808', altitude: 146},
    {name: '融安服务区(三南高速南宁方向)', location: '109.379178,25.251971', altitude: 146},
    {name: '沙子服务区(桂河高速桂林方向)', location: '109.457332,24.976185', altitude: 299},
    {name: '沙子服务区(桂河高速河池方向)', location: '109.455885,24.977038', altitude: 299},
  ],
  "鹿寨县": [
    {name: '鹿寨服务区(泉南高速泉州方向)', location: '109.735722,24.452405', altitude: 99},
    {name: '鹿寨服务区(泉南高速南宁方向)', location: '109.733880,24.454081', altitude: 99},
    {name: '寨沙服务区(汕昆高速昆明方向)', location: '110.018328,24.475256', altitude: 161},
    {name: '寨沙服务区(汕昆高速汕头方向)', location: '110.015745,24.474219', altitude: 161},
    {name: '波寨服务区(泉南高速泉州方向)', location: '109.889772,24.735192', altitude: 171},
    {name: '波寨服务区(泉南高速南宁方向)', location: '109.889133,24.744164', altitude: 171},
  ],
  "柳江区": [
    {name: '木团停车区(柳北高速柳州方向)', location: '109.430470,24.120566', altitude: 126},
    {name: '木团停车区(柳北高速北海方向)', location: '109.428959,24.121068', altitude: 126},
    {name: '新兴服务区(泉南高速南宁方向)', location: '109.401211,24.133533', altitude: 130},
    {name: '新兴服务区(泉南高速泉州方向)', location: '109.403856,24.133298', altitude: 130},
  ],
  "鱼峰区": [
    {name: '柳州服务区(梧柳高速柳州方向)', location: '109.595387,24.228676', altitude: 94},
    {name: '柳州服务区(梧柳高速梧州方向)', location: '109.590193,24.229755', altitude: 94}
  ],
  "柳城县": [
    {name: '柳城东服务区(三南高速三江方向)', location: '109.282548,24.618355', altitude: 147},
    {name: '柳城东服务区(三南高速南宁方向)', location: '109.280773,24.620737', altitude: 147},
    {name: '柳城服务区(汕昆高速汕头方向)', location: '109.075045,24.522678', altitude: 183},
    {name: '柳城服务区(汕昆高速昆明方向)', location: '109.075863,24.523673', altitude: 183},
  ]
}

const QianDongNanServiceStops: DistrictArea = {
  "三穗县": [
    {name: '三穗服务区(沪昆高速上海方向)', location: '108.668620,26.960713', altitude: 624},
    {name: '三穗服务区(沪昆高速昆明方向)', location: '108.667551,26.961251', altitude: 624},
    {name: '德明停车区(天镇高速天柱方向)', location: '108.566731,26.935052', altitude: 696},
    {name: '德明停车区(天镇高速镇远方向)', location: '108.567694,26.936325', altitude: 696},
    {name: '款场服务区(天镇高速镇远方向)', location: '108.976896,26.938627', altitude: 568},
    {name: '款场服务区(天镇高速天柱方向)', location: '108.976740,26.937260', altitude: 568},
    {name: '瓦寨停车区(天镇高速天柱方向)', location: '108.823515,26.929812', altitude: 586},
    {name: '瓦寨停车区(天镇高速镇远方向)', location: '108.820543,26.930304', altitude: 586},
  ],
  "丹寨县": [
    {name: '天星桥服务区(厦蓉高速成都方向)', location: '107.814352,26.131527', altitude: 725},
    {name: '天星桥服务区(厦蓉高速厦门方向)', location: '107.815214,26.129083', altitude: 725},
    {name: '兴仁服务区(余安高速余庆方向)', location: '107.826726,26.360944', altitude: 746},
    {name: '兴仁服务区(余安高速安龙方向)', location: '107.824010,26.358110', altitude: 746},
  ],
  "从江县": [
    {name: '新民服务区(厦蓉高速厦门方向)', location: '108.715944,25.889707', altitude: 716},
    {name: '新民服务区(厦蓉高速成都方向)', location: '108.703937,25.884559', altitude: 716},
    {name: '洛香服务区(厦蓉高速成都方向)', location: '109.073483,25.924860', altitude: 397},
    {name: '洛香服务区(厦蓉高速厦门方向)', location: '109.072374,25.923757', altitude: 397},
  ],
  "凯里市": [
    {name: '三棵树服务区(沪昆高速上海方向)', location: '108.054269,26.562132', altitude: 791},
    {name: '三棵树服务区(沪昆高速昆明方向)', location: '108.055320,26.563075', altitude: 791},
    {name: '毛家庄服务区(凯里环城高速外环方向)', location: '107.945940,26.616421',altitude: 752},
    {name: '毛家庄服务区(凯里环城高速内环方向)', location: '107.947433,26.614926',altitude: 752},
  ],
  "剑河县": [
    {name: '观么服务区(剑黎高速黎平方向)', location: '108.638320,26.697849', altitude: 701},
    {name: '观么服务区(剑黎高速剑河方向)', location: '108.638381,26.699284', altitude: 701},
    {name: '温泉服务区(沪昆高速上海方向)', location: '108.524708,26.753915', altitude: 507},
    {name: '温泉服务区(沪昆高速昆明方向)', location: '108.524492,26.755077', altitude: 507}, 
  ],
  "台江县": [
    {name: '台江加油站(沪昆高速昆明方向)', location: '108.317602,26.658085', altitude: 659},
    {name: '台江加油站(沪昆高速上海方向)', location: '108.321422,26.659134', altitude: 659},
  ],
  "天柱县": [
    {name: '地坝停车区(松从高速从江方向)', location: '109.171200,26.802130', altitude: 743},
    {name: '地坝停车区(松从高速松桃方向)', location: '109.172528,26.801372', altitude: 743},
  ],
  "岑巩县": [
    {name: '天马服务区(石新高速新晃方向)', location: '108.701189,27.384901', altitude: 799},
    {name: '天马服务区(石新高速石阡方向)', location: '108.701601,27.386473', altitude: 799},
  ],
  "施秉县": [
    {name: '施秉服务区(玉盘高速玉屏方向)', location: '108.139742,27.023857', altitude: 581},
    {name: '施秉服务区(玉盘高速盘州方向)', location: '108.138668,27.025326', altitude: 581},
  ],
  "榕江县": [
    {name: '月亮山服务区(榕麻高速独山方向)', location: '108.310467,25.793951', altitude: 583},
    {name: '月亮山服务区(榕麻高速榕江方向)', location: '108.317695,25.796772', altitude: 583},
    {name: '朗洞服务区(沿榕高速沿河方向)', location: '108.562956,26.358402', altitude: 607},
    {name: '朗洞服务区(沿榕高速榕江方向)', location: '108.555693,26.348345', altitude: 607},
    {name: '平永服务区(凯从高速凯里方向)', location: '108.330783,26.114513', altitude: 452},
    {name: '平永服务区(凯从高速从江方向)', location: '108.336912,26.113289', altitude: 452},
    {name: '笔架山服务区(沿榕高速沿河方向)', location: '108.563738,26.047998', altitude: 336},
    {name: '笔架山服务区(沿榕高速榕江方向)', location: '108.562886,26.050164', altitude: 336},
    {name: '忠诚停车区(凯从高速凯里方向)', location: '108.500508,26.049625', altitude: 421},
    {name: '忠诚停车区(凯从高速从江方向)', location: '108.503366,26.046747', altitude: 421},
  ],
  "锦屏县": [
    {name: '锦屏服务区(松从高速从江方向)', location: '109.226528,26.604463', altitude: 387},
    {name: '锦屏服务区(松从高速松桃方向)', location: '109.228176,26.604763', altitude: 387},
    {name: '新化服务区(松从高速从江方向)', location: '109.186760,26.440013', altitude: 496},
    {name: '新化服务区(松从高速松桃方向)', location: '109.189207,26.439610', altitude: 496},
  ],
  "镇远县": [
    {name: '白杨坪服务区(沿榕高速榕江方向)', location: '108.362392,27.042259', altitude: 632},
    {name: '白杨坪服务区(沿榕高速沿河方向)', location: '108.363926,27.043587', altitude: 632},
    {name: '羊场服务区(沿榕高速沿河方向)', location: '108.304259,27.202877', altitude: 913},
    {name: '羊场服务区(沿榕高速榕江方向)', location: '108.302605,27.202020', altitude: 913},
    {name: '报京服务区(沿榕高速沿河方向)', location: '108.499499,26.869767', altitude: 869},
    {name: '报京停车区(沿榕高速榕江方向)', location: '108.497559,26.869176', altitude: 869},
    {name: '镇远停车区(沪昆高速昆明方向)', location: '108.754486,27.112864', altitude: 469},
    {name: '镇远停车区(沪昆高速上海方向)', location: '108.755226,27.112725', altitude: 469},
  ],
  "麻江县": [
    {name: '麻江服务区(沪昆高速昆明方向)', location: '107.571041,26.502989', altitude: 880},
    {name: '麻江服务区(沪昆高速上海方向)', location: '107.571170,26.501880', altitude: 880},
  ],
  "黄平县": [
    {name: '旧州服务区(玉盘高速盘州方向)', location: '107.774695,26.928009', altitude: 886},
    {name: '旧州服务区(玉盘高速玉屏方向)', location: '107.776522,26.928048', altitude: 886},
    {name: '黄平服务区(余安高速安龙方向)', location: '107.898514,26.829061', altitude: 848},
    {name: '黄平服务区(余安高速余庆方向)', location: '107.899235,26.828192', altitude: 848},
    {name: '纸房停车区(江黔高速江口方向)', location: '107.726405,27.175579', altitude: 909},
    {name: '纸房停车区(江黔高速黔西方向)', location: '107.724895,27.176658', altitude: 909},
  ],
  "黎平县": [
    {name: '肇兴服务区(厦蓉高速成都方向)', location: '109.333142,25.905401', altitude: 331},
    {name: '肇兴服务区(厦蓉高速厦门方向)', location: '109.330964,25.904613', altitude: 331},
    {name: '黎平服务区(黎洛高速洛香方向)', location: '109.119060,26.221238', altitude: 605},
    {name: '黎平服务区(黎洛高速黎平方向)', location: '109.119816,26.220558', altitude: 605},
    {name: '敖市服务区(剑黎高速剑河方向)', location: '109.112672,26.351279', altitude: 517},
    {name: '敖市服务区(剑黎高速黎平方向)', location: '109.110829,26.350862', altitude: 517},
    {name: '贵迷停车区(厦蓉高速厦门方向)', location: '108.949826,25.938923', altitude: 331},
    {name: '贵迷停车区(厦蓉高速成都方向)', location: '108.948944,25.939599', altitude: 331},
    {name: '中潮停车区(黎洛高速洛香方向)', location: '109.155113,26.073024', altitude: 560},
    {name: '中潮停车区(黎洛高速黎平方向)', location: '109.155952,26.072702', altitude: 560},
    {name: '高屯服务区(剑黎高速剑河方向)', location: '109.163487,26.358219', altitude: 457},
    {name: '高屯服务区(剑黎高速黎平方向)', location: '109.165607,26.357483', altitude: 457},
  ]
}

const GuiYangServiceStops: DistrictArea ={
  "乌当区": [
    {name: '羊昌停车区(银百高速银川方向)', location: '106.934502,26.844799', altitude: 1291},
    {name: '羊昌停车区(银百高速百色方向)', location: '106.934240,26.845830', altitude: 1291},
    {name: '柿花寨停车区(渝筑高速贵阳方向)', location: '106.913271,26.871428', altitude: 1227},
    {name: '柿花寨停车区(渝筑高速重庆方向)', location: '106.914205,26.870669', altitude: 1227},
  ],
  "云岩区": [
    {name: '火石坡服务区(贵阳绕城高速外环方向)', location: '106.721290,26.679115', altitude: 1259},
    {name: '火石坡服务区(贵阳绕城高速内环方向)', location: '106.721384,26.676709', altitude: 1259},
  ],
  "修文县": [
    {name: '久长服务区(兰海高速海口方向)', location: '106.698987,26.895229', altitude: 1331},
    {name: '久长服务区(兰海高速兰州方向)', location: '106.700145,26.895148', altitude: 1331},
    {name: '双石服务区(筑蓉高速贵阳方向)', location: '106.485522,27.143492', altitude: 1107},
    {name: '双石服务区(筑蓉高速成都方向)', location: '106.486874,27.144803', altitude: 1107},
    {name: '修文南服务区(筑蓉高速成都方向)', location: '106.574595,26.804620', altitude: 1322},
    {name: '修文南服务区(筑蓉高速贵阳方向)', location: '106.573139,26.805578', altitude: 1322},
    {name: '六广河服务区(江黔高速江口方向)', location: '106.416426,27.079921', altitude: 1081},
  ],
  "南明区": [
    {name: '龙洞堡服务区(贵阳绕城高速内环方向)', location: '106.794464,26.513206', altitude: 1098},
    {name: '龙洞堡服务区(贵阳绕城高速外环方向)', location: '106.795095,26.511824', altitude: 1098},
    {name: '永乐服务区(贵阳绕城高速外环方向)', location: '106.884546,26.594782', altitude: 1163},
    {name: '永乐服务区(贵阳绕城高速环内方向)', location: '106.885444,26.591480', altitude: 1163},
  ],
  "开阳县": [
    {name: '龙岗服务区(银百高速银川方向)', location: '107.097446,26.911393', altitude: 1129},
    {name: '龙岗服务区(银百高速百色方向)', location: '107.096641,26.913443', altitude: 1129},
    {name: '开阳服务区(渝筑高速贵阳方向)', location: '106.925259,26.963437', altitude: 1099},
    {name: '开阳服务区(渝筑高速重庆方向)', location: '106.929865,26.964033', altitude: 1099},
    {name: '永温停车区(渝筑高速贵阳方向)', location: '106.905523,27.120344', altitude: 1190},
    {name: '永温停车区(渝筑高速重庆方向)', location: '106.907520,27.120720', altitude: 1190},
    {name: '开州湖服务区(江黔高速黔西方向)', location: '107.099582,27.198645', altitude: 821},
    {name: '开州湖服务区(江黔高速江口方向)', location: '107.099048,27.197288', altitude: 821},
  ],
  "息烽县": [
    {name: '温泉服务区(江黔高速江口方向)', location: '106.862923,27.190399', altitude: 949},
    {name: '温泉服务区(江黔高速黔西方向)', location: '106.863865,27.193969', altitude: 949},
    {name: '鹿窝服务区(江黔高速黔西方向)', location: '106.574409,27.130435', altitude: 994},
    {name: '鹿窝服务区(江黔高速江口方向)', location: '106.576430,27.133769', altitude: 994},
  ],
  "清镇市": [
    {name: '麦格服务区(筑大高速贵阳方向)', location: '106.407376,26.743971', altitude: 1300},
    {name: '麦格服务区(筑大高速大方方向)', location: '106.406622,26.745419', altitude: 1300},
    {name: '新店停车区(筑大高速大方方向)', location: '106.242932,26.792470', altitude: 1284},
    {name: '新店停车区(筑大高速贵阳方向)', location: '106.242755,26.791306', altitude: 1284},
    {name: '红枫服务区(厦蓉高速厦门方向)', location: '106.340660,26.528272', altitude: 1255},
    {name: '红枫服务区(厦蓉高速成都方向)', location: '106.342323,26.528159', altitude: 1255},
  ],
  "白云区": [
    {name: '白云服务区(贵阳绕城高速内环方向)', location: '106.668404,26.702622', altitude: 1279},
    {name: '白云服务区(外环方向)', location: '106.637524,26.704541', altitude: 1279},
  ],
  "花溪区": [
    {name: '青岩服务区(花安高速安顺方向)', location: '106.642781,26.345260', altitude: 1151},
    {name: '青岩服务区(花安高速花溪方向)', location: '106.642030,26.341648', altitude: 1151},
    {name: '花溪服务区(贵阳南环高速外环方向)', location: '106.591657,26.418803', altitude: 1194},
    {name: '花溪服务区(贵阳南环高速内环方向)', location: '106.592226,26.420665', altitude: 1194},
  ]
}

const BiJieServiceStops: DistrictArea = {
  "七星关区": [
    {name: '金银山服务区(厦蓉高速厦门方向)', location: '105.404885,27.445738', altitude: 1709},
    {name: '金银山服务区(厦蓉高速成都方向)', location: '105.406836,27.446014', altitude: 1709},
    {name: '汉屯服务区(毕节绕城高速外环方向)', location: '105.469224,27.346373', altitude: 1482},
    {name: '汉屯服务区(毕节绕城高速内环方向)', location: '105.468654,27.344979', altitude: 1482},
    {name: '龙昌坪服务区(毕威高速毕节方向)', location: '105.130444,27.208312', altitude: 1735},
    {name: '龙昌坪服务区(毕威高速威宁方向)', location: '105.130431,27.209408', altitude: 1735},
    {name: '水箐服务区(毕镇高速毕节方向)', location: '105.152629,27.346813', altitude: 1839},
    {name: '水箐服务区(毕镇高速镇雄方向)', location: '105.153567,27.347670', altitude: 1839},
    {name: '林口停车区(厦蓉高速成都方向)', location: '105.379013,27.608091', altitude: 1366},
    {name: '林口停车区(厦蓉高速厦门方向)', location: '105.377598,27.608132', altitude: 1366},
    {name: '茶亭停车区(毕节绕城高速威宁方向)', location: '105.258578,27.298348', altitude: 1538},
    {name: '茶亭停车区(毕节绕城高速内环方向)', location: '105.259882,27.298336', altitude: 1538},
    {name: '朱昌停车区(杭瑞高速杭州方向)', location: '105.296217,27.158936', altitude: 1607},
    {name: '朱昌停车区(杭瑞高速瑞丽方向)', location: '105.294920,27.159568', altitude: 1607},
    {name: '生机停车区(厦蓉高速厦门方向)', location: '105.471387,27.763961', altitude: 885},
    {name: '生机停车区(厦蓉高速成都方向)', location: '105.467810,27.766033', altitude: 885},
  ],
  "大方县": [
    {name: '响水服务区(杭瑞高速瑞丽方向)', location: '105.544512,27.223258', altitude: 1420},
    {name: '响水服务区(杭瑞高速杭州方向)', location: '105.542898,27.222729', altitude: 1420},
    {name: '百里杜鹃停车区(杭瑞高速瑞丽方向)', location: '105.945272,27.312167', altitude: 1670},
    {name: '百里杜鹃停车区(杭瑞高速杭州方向)', location: '105.946012,27.311450', altitude: 1670},
    {name: '联兴停车区(杭瑞高速杭州方向)', location: '105.803009,27.240386', altitude: 1581},
    {name: '联兴停车区(杭瑞高速瑞丽方向)', location: '105.803009,27.241497', altitude: 1581},
  ],
  "威宁彝族回族苗族自治县": [
    {name: '威宁服务区(都香高速都匀方向)', location: '104.328085,26.892964', altitude: 2400},
    {name: '威宁服务区(都香高速香格里拉方向)', location: '104.329854,26.894208', altitude: 2400},
    {name: '威宁南服务区(威围高速威宁方向)', location: '104.376022,26.767654', altitude: 2219},
    {name: '威宁南服务区(威围高速围仗方向)', location: '104.373210,26.766370', altitude: 2219},
    {name: '迤那服务区(都香高速香格里拉方向)', location: '103.836990,27.094029', altitude: 2110},
    {name: '迤那服务区(都香高速都匀方向)', location: '103.835402,27.092348', altitude: 2110},
    {name: '小海停车区(都香高速都匀方向)', location: '104.193762,26.945907', altitude: 2208},
    {name: '小海停车区(都香高速香格里拉方向)', location: '104.193330,26.947276', altitude: 2208},
    {name: '后寨停车区(毕威高速威宁方向)', location: '104.397512,26.976336', altitude: 2316},
    {name: '后寨停车区(毕威高速毕节方向)', location: '104.398338,26.975963', altitude: 2316},
    {name: '东风停车区(都香高速香格里拉方向)', location: '104.528901,26.789321', altitude: 1823},
    {name: '东风停车区(都香高速都匀方向)', location: '104.525876,26.791999', altitude: 1823},
    {name: '观风海停车区(都香高速香格里拉方向)', location: '103.992269,26.988683', altitude: 2257},
    {name: '观风海停车区(都香高速都匀方向)', location: '103.991460,26.990088', altitude: 2257},
  ],
  "纳雍县": [
    {name: '九洞天服务区(杭瑞高速杭州方向)', location: '105.238996,26.991637', altitude: 1530},
    {name: '九洞天服务区(杭瑞高速瑞丽方向)', location: '105.237730,26.991454', altitude: 1530},
    {name: '乐治服务区(厦蓉高速成都方向)', location: '105.482256,26.831546', altitude: 1473},
    {name: '乐治服务区(厦蓉高速厦门方向)', location: '105.480714,26.830220', altitude: 1473},
    {name: '黄家屯停车区(杭瑞高速瑞丽方向)', location: '105.218841,26.780615', altitude: 1793},
    {name: '黄家屯停车区(杭瑞高速杭州方向)', location: '105.215167,26.781814', altitude: 1793},
    {name: '寨乐停车区(厦蓉高速成都方向)', location: '105.318908,26.846434', altitude: 1548},
    {name: '寨乐停车区(厦蓉高速厦门方向)', location: '105.318214,26.845718', altitude: 1548},
  ],
  "织金县": [
    {name: '织金服务区(仁望高速望谟方向)', location: '105.802172,26.653593', altitude: 1465},
    {name: '织金服务区(仁望高速仁怀方向)', location: '105.804183,26.653486', altitude: 1465},
    {name: '织金洞服务区(厦蓉高速成都方向)', location: '105.907329,26.689805', altitude: 1258},
    {name: '织金洞服务区(厦蓉高速厦门方向)', location: '105.906858,26.688376', altitude: 1258},
    {name: '三岔河马场停车区(厦蓉高速成都方向)', location: '106.121894,26.625224', altitude: 1210},
    {name: '三岔河马场停车区(厦蓉高速厦门方向)', location: '106.121862,26.624480', altitude: 1210},
    {name: '板桥停车区(厦蓉高速厦门方向)', location: '105.771667,26.747445', altitude: 1314},
    {name: '板桥停车区(厦蓉高速成都方向)', location: '105.770584,26.747734', altitude: 1314},
  ],
  "赫章县": [
    {name: '旱莲花服务区(毕威高速毕节方向)', location: '104.554928,27.037687', altitude: 2016},
    {name: '旱莲花服务区(毕威高速威宁方向)', location: '104.555131,27.038952', altitude: 2016},
    {name: '古基服务区(赫六高速六盘水方向)', location: '104.771069,27.251720', altitude: 1553},
    {name: '古基服务区(赫六高速赫章方向)', location: '104.772745,27.252404', altitude: 1553},
    {name: '乌木铺停车区(毕威高速毕节方向)', location: '104.794932,27.143354', altitude: 1493},
    {name: '乌木铺停车区(毕威高速威宁方向)', location: '104.795323,27.143954', altitude: 1493},
    {name: '韭菜坪服务区(赫六高速六盘水方向)', location: '104.795421,26.972864', altitude: 2202},
    {name: '韭菜坪服务区(赫六高速赫章方向)', location: '104.796999,26.971964', altitude: 2202},
    {name: '七星河停车区(毕威高速威宁方向)', location: '104.926406,27.156509', altitude: 1522},
    {name: '七星河停车区(毕威高速毕节方向)', location: '104.926835,27.155941', altitude: 1522},
  ],
  "金沙县": [
    {name: '金沙南服务区(筑蓉高速成都方向)', location: '106.256522,27.404197', altitude: 1108},
    {name: '金沙南服务区(筑蓉高速贵阳方向)', location: '106.255543,27.402696', altitude: 1108},
    {name: '金沙服务区(杭瑞高速杭州方向)', location: '106.291716,27.495052', altitude: 885},
    {name: '金沙服务区(杭瑞高速瑞丽方向)', location: '106.292721,27.496310', altitude: 885},
    {name: '新化服务区(杭瑞高速杭州方向)', location: '106.087490,27.405260', altitude: 1484},
    {name: '新化服务区(杭瑞高速瑞丽方向)', location: '106.085849,27.405088', altitude: 1484},
    {name: '柳塘服务区(仁望高速仁怀方向)', location: '106.287726,27.371488', altitude: 1109},
    {name: '柳塘服务区(仁望高速望谟方向)', location: '106.287049,27.370454', altitude: 1109},
  ],
  "黔西市": [
    {name: '黔西服务区(筑大高速大方方向)', location: '106.005167,26.982574', altitude: 1270},
    {name: '黔西服务区(筑大高速贵阳方向)', location: '106.003557,26.981720', altitude: 1270},
    {name: '西溪服务区(筑大高速大方方向)', location: '105.844131,27.085238', altitude: 1426},
    {name: '西溪服务区(筑大高速广州方向)', location: '105.842882,27.084391', altitude: 1426},
    {name: '黔西服务区(仁望高速仁怀方向)', location: '105.974518,26.967245', altitude: 1274},
    {name: '黔西服务区(仁望高速望谟方向)', location: '105.973706,26.969714', altitude: 1274},
    {name: '六广河服务区(江黔高速黔西方向)', location: '106.398980,27.072426', altitude: 1072},
  ]
}

const LiuPanShuiServiceStops: DistrictArea = {
  "六枝特区": [
    {name: '岩脚服务区(都香高速香格里拉方向)', location: '105.381192,26.327046', altitude: 1231},
    {name: '岩脚服务区(都香高速都匀方向)', location: '105.378654,26.330209', altitude: 1231},
    {name: '大用停车区(都香高速都匀方向)', location: '105.560900,26.164457', altitude: 1316},
    {name: '大用停车区(都香高速香格里拉方向)', location: '105.561541,26.165137', altitude: 1316},
  ],
  "水城区": [
    {name: '六盘水服务区(杭瑞高速瑞丽方向)', location: '104.933704,26.515238', altitude: 1843},
    {name: '六盘水服务区(杭瑞高速杭州方向)', location: '104.923359,26.517318', altitude: 1843},
    {name: '发耳服务区(水兴高速水城方向)', location: '104.776451,26.290314', altitude: 1296},
    {name: '发耳服务区(水兴高速兴义方向)', location: '104.775738,26.291326', altitude: 1296},
    {name: '马家营停车区(杭瑞高速瑞丽方向)', location: '105.051955,26.621511', altitude: 1892},
    {name: '马家营停车区(杭瑞高速杭州方向)', location: '105.050877,26.619208', altitude: 1892},
    {name: '陡箐停车区(都香高速都匀方向)', location: '105.138291,26.471699', altitude: 1781},
    {name: '陡箐停车区(都香高速香格里拉方向)', location: '105.135790,26.478995', altitude: 1781},
  ],
  "盘州市": [
    {name: '红果服务区(沪昆高速昆明方向)', location: '104.455745,25.736656', altitude: 1713},
    {name: '红果服务区(沪昆高速上海方向)', location: '104.455575,25.735413', altitude: 1713},
    {name: '刘官服务区(沪昆高速上海方向)', location: '104.766998,25.797648', altitude: 1650},
    {name: '刘官服务区(沪昆高速昆明方向)', location: '104.770095,25.797955', altitude: 1650},
    {name: '鸡场坪服务区(水兴高速兴义方向)', location: '104.621778,25.980901', altitude: 1740},
    {name: '鸡场坪服务区(水兴高速水城方向)', location: '104.621966,25.983625', altitude: 1740},
    {name: '保田服务区(水兴高速水城方向)', location: '104.744725,25.401510', altitude: 1614},
    {name: '保田服务区(水兴高速兴义方向)', location: '104.743974,25.400117', altitude: 1614},
    {name: '丹霞服务区(水兴高速水城方向)', location: '104.583366,25.674783', altitude: 1689},
    {name: '丹霞服务区(水兴高速兴义方向)', location: '104.582197,25.675086', altitude: 1689},
    {name: '胜境关停车区(沪昆高速昆明方向)', location: '104.321186,25.635372', altitude: 1910},
    {name: '胜境关停车区(沪昆高速上海方向)', location: '104.286881,25.638357', altitude: 1910},
  ],
  "钟山区": [
    {name: '德坞服务区(都香高速香格里拉方向)', location: '104.808443,26.649197', altitude: 1986},
    {name: '德坞服务区(都香高速都匀方向)', location: '104.807137,26.647672', altitude: 1986},
    {name: '木果服务区(赫六高速赫章方向)', location: '104.807311,26.824320', altitude: 1898},
    {name: '木果服务区(赫六高速六盘水方向)', location: '104.805422,26.820262', altitude: 1898},
  ]
}

const AnShunServiceStops: DistrictArea = {
  "关岭布依族苗族自治县": [
    {name: '关岭服务区(沪昆高速上海方向)', location: '105.566024,25.930243', altitude: 1158},
    {name: '关岭服务区(沪昆高速昆明方向)', location: '105.565021,25.931130', altitude: 1158},
    {name: '顶云服务区(六安高速安龙方向)', location: '105.526693,25.948410', altitude: 1302},
    {name: '顶云服务区(六安高速六枝方向)', location: '105.528255,25.948705', altitude: 1302},
  ],
  "平坝区": [
    {name: '夏云停车区(沪昆高速昆明方向)', location: '106.309537,26.466596', altitude: 1285},
    {name: '夏云停车区(沪昆高速上海方向)', location: '106.309848,26.465930', altitude: 1285},
  ],
  "普定县": [
    {name: '关大停车区(仁望高速望谟方向)', location: '105.802606,26.298325', altitude: 1371},
    {name: '关大停车区(仁望高速仁怀方向)', location: '105.802853,26.299131', altitude: 1371},
    {name: '普定停车区(仁望高速望谟方向)', location: '105.743109,26.372287', altitude: 1216},
    {name: '普定停车区(仁望高速仁怀方向)', location: '105.743893,26.371451', altitude: 1216},
  ],
  "紫云苗族布依族自治县": [
    {name: '紫云服务区(惠兴高速惠水方向)', location: '106.046051,25.732559', altitude: 1192},
    {name: '紫云服务区(惠兴高速兴仁方向)', location: '106.045594,25.733792', altitude: 1192},
    {name: '团坡停车区(惠兴高速兴仁方向)', location: '106.265547,25.884916', altitude: 1127},
    {name: '团坡停车区(惠兴高速惠水方向)', location: '106.266065,25.884149', altitude: 1127},
  ],
  "西秀区": [
    {name: '龙宫服务区(沪昆高速上海方向)', location: '105.859966,26.165448', altitude: 1342},
    {name: '龙宫服务区(沪昆高速昆明方向)', location: '105.860762,26.167722', altitude: 1342},
    {name: '云峰服务区(沪昆高速昆明方向)', location: '106.069105,26.317717', altitude: 1359},
    {name: '云峰服务区(沪昆高速上海方向)', location: '106.069719,26.316407', altitude: 1359},
    {name: '东屯服务区(花安高速花溪方向)', location: '106.202726,26.213935', altitude: 1310},
    {name: '东屯服务区(花安高速安顺方向)', location: '106.202136,26.215466', altitude: 1310},
    {name: '杨武南服务区(都香高速都匀方向)', location: '106.192401,26.031978', altitude: 1183},
    {name: '杨武南服务区(都香高速香格里拉方向)', location: '106.193372,26.033600', altitude: 1183},
    {name: '杨武服务区(仁望高速仁怀方向)', location: '106.155297,26.085672', altitude: 1254},
    {name: '杨武服务区(‌仁望高速望谟方向)', location: '106.153732,26.085501', altitude: 1254},
    {name: '宁谷停车区(花安高速花溪方向)', location: '105.983043,26.190862', altitude: 1327},
    {name: '宁谷停车区(花安高速安顺方向)', location: '105.982684,26.192574', altitude: 1327},
  ],
}

const QianXiNanServiceStops: DistrictArea = {
  "兴义市": [
    {name: '乌沙服务区(汕昆高速汕头方向)', location: '104.755241,25.135730', altitude: 1455},
    {name: '乌沙服务区(汕昆高速昆明方向)', location: '104.755677,25.137188', altitude: 1455},
    {name: '楼纳服务区(兴义绕城高速外环方向)', location: '105.011629,25.078056', altitude: 1253},
    {name: '楼纳服务区(兴义绕城高速内环方向)', location: '105.009457,25.078154', altitude: 1253},
    {name: '马岭停车区(水兴高速兴义方向)', location: '104.887349,25.198010', altitude: 1117},
    {name: '马岭停车区(水兴高速水城方向)', location: '104.887346,25.200406', altitude: 1117},
    {name: '田坝停车区(汕昆高速汕头方向)', location: '104.707591,25.068211', altitude: 1218},
    {name: '田坝停车区(汕昆高速昆明方向)', location: '104.713641,25.071191', altitude: 1218},
    {name: '鲁屯停车区(汕昆高速昆明方向)', location: '105.126975,25.155292', altitude: 1363},
    {name: '鲁屯停车区(汕昆高速汕头方向)', location: '105.126463,25.154705', altitude: 1363},
    {name: '万峰林停车区(兴义绕城高速外环方向)', location: '104.899524,24.957803', altitude: 1299},
    {name: '万峰林停车区(兴义绕城高速内环方向)', location: '104.900745,24.958486', altitude: 1299},
  ],
  "兴仁市": [
    {name: '长耳营服务区(纳兴高速纳雍方向)', location: '105.136629,25.429653', altitude: 1382},
    {name: '格沙屯停车区(纳兴高速兴义方向)', location: '105.059203,25.307846', altitude: 1474},
    {name: '格沙屯停车区(纳兴高速纳雍方向)', location: '105.059974,25.307017', altitude: 1474},
    {name: '巴铃停车区(惠兴高速兴仁方向)', location: '105.440819,25.466041', altitude: 1368},
    {name: '巴铃停车区(惠兴高速惠水方向)', location: '105.440333,25.465560', altitude: 1368},
  ],
  "册亨县": [
    {name: '丫他服务区(余册高速余庆方向)', location: '105.672904,24.932328', altitude: 839},
    {name: '丫他服务区(余册高速册亨方向)', location: '105.674064,24.933233', altitude: 839},
  ],
  "安龙县": [
    {name: '安龙服务区(汕昆高速昆明方向)', location: '105.338643,25.072162', altitude: 1298},
    {name: '安龙服务区(汕昆高速汕头方向)', location: '105.338550,25.070707', altitude: 1298},
    {name: '坡脚停车区(汕昆高速昆明方向)', location: '105.449463,24.978364', altitude: 1051},
    {name: '坡脚停车区(汕昆高速汕头方向)', location: '105.448951,24.977654', altitude: 1051},
    {name: '笃山服务区(六安高速六枝方向)', location: '105.441340,25.227851', altitude: 1100},
    {name: '笃山服务区(六安高速安龙方向)', location: '105.445199,25.229865', altitude: 1100},
  ],
  "普安县": [
    {name: '普安茶场停车区(沪昆高速昆明方向)', location: '105.082715,25.748476', altitude: 1230},
    {name: '普安茶场停车区(沪昆高速上海方向)', location: '105.081990,25.748089', altitude: 1230},
    {name: '江西坡停车区(纳兴高速兴义方向)', location: '105.069565,25.779459', altitude: 1195},
    {name: '江西坡停车区(纳兴高速纳雍方向)', location: '105.071124,25.778298', altitude: 1195},
  ],
  "晴隆县": [
    {name: '晴隆服务区(沪昆高速昆明方向)', location: '105.174573,25.801353', altitude: 1361},
    {name: '晴隆服务区(沪昆高速上海方向)', location: '105.175340,25.800617', altitude: 1361},
    {name: '地久停车区(纳兴高速兴义方向)', location: '105.096456,25.630974', altitude: 1377},
    {name: '地久停车区(纳兴高速纳雍方向)', location: '105.097801,25.630666', altitude: 1377},
    {name: '花贡服务区(纳兴高速兴义方向)', location: '105.043615,26.000873', altitude: 1198},
    {name: '花贡服务区(纳兴高速纳雍方向)', location: '105.045621,26.002387', altitude: 1198},
  ],
  "望谟县": [
    {name: '边饶服务区(仁望高速望谟方向)', location: '106.044777,25.508873', altitude: 590},
    {name: '边饶服务区(仁望高速仁怀方向)', location: '106.045780,25.505930', altitude: 590},
    {name: '大观停车区(余册高速册亨方向)', location: '106.221482,25.142286', altitude: 642},
    {name: '大观停车区(余册高速余庆方向)', location: '106.221926,25.141404', altitude: 642},
  ],
  "贞丰县": [
    {name: '贞丰服务区(惠兴高速兴仁方向)', location: '105.658236,25.401698', altitude: 977},
    {name: '贞丰服务区(惠兴高速惠水方向)', location: '105.657925,25.400399', altitude: 977},
    {name: '珉谷服务区(六安高速六枝方向)', location: '105.610071,25.449080', altitude: 1143},
    {name: '珉谷服务区(六安高速安龙方向)', location: '105.608555,25.449341', altitude: 1143},
  ]
}

const ZunYiServiceStops: DistrictArea = {
  "习水县": [
    {name: '习水服务区(江习古高速古蔺方向)', location: '106.232411,28.301771', altitude: 1243},
    {name: '习水服务区(江习古高速江津方向)', location: '106.231512,28.299381', altitude: 1243},
    {name: '向阳服务区(蓉遵高速成都方向)', location: '106.212073,28.227427', altitude: 1074},
    {name: '向阳服务区(蓉遵高速遵义方向)', location: '106.211797,28.226268', altitude: 1074},
    {name: '飞鸽子服务区(江习古高速江津方向)', location: '106.549543,28.560660', altitude: 1047},
    {name: '飞鸽子服务区(江习古高速古蔺方向)', location: '106.547395,28.560947', altitude: 1047},
    {name: '土城停车区(蓉遵高速成都方向)', location: '105.980001,28.286460', altitude: 318},
    {name: '土城停车区(蓉遵高速遵义方向)', location: '105.973609,28.291289', altitude: 318},
    {name: '良村服务区(江习古高速江津方向)', location: '106.426918,28.402322', altitude: 1054},
    {name: '良村服务区(江习古高速古蔺方向)', location: '106.422548,28.406463', altitude: 1054},
  ],
  "仁怀市": [
    {name: '团结服务区(蓉遵高速遵义方向)', location: '106.413016,28.144624', altitude: 724},
    {name: '团结服务区(蓉遵高速成都方向)', location: '106.415290,28.143110', altitude: 724},
    {name: '千年国·仁怀服务区(仁望高速望谟方向)', location: '106.381963,27.764000', altitude: 781},
    {name: '千年国·仁怀服务区(仁望高速仁怀方向)', location: '106.382869,27.764360', altitude: 781},
    {name: '亭子台停车区(蓉遵高速遵义方向)', location: '106.438317,27.902752', altitude: 1099},
    {name: '亭子台停车区(蓉遵高速成都方向)', location: '106.439716,27.903772', altitude: 1099},
  ],
  "余庆县": [
    {name: '余庆服务区(江黔高速江口方向)', location: '107.918224,27.254485', altitude: 607},
    {name: '余庆服务区(江黔高速黔西方向)', location: '107.917552,27.255935', altitude: 607},
    {name: '飞龙湖服务区(银百高速百色方向)', location: '107.518067,27.399849', altitude: 733},
    {name: '飞龙湖服务区(银百高速银川方向)', location: '107.519246,27.398953', altitude: 733},
    {name: '沙堆停车区(玉新高速新蒲新区方向)', location: '107.705772,27.598332', altitude: 873},
    {name: '沙堆停车区(玉新高速玉屏方向)', location: '107.704622,27.597296', altitude: 873},
    {name: '龙家停车区(银百高速百色方向)', location: '107.534880,27.538087', altitude: 742},
    {name: '龙家停车区(银百高速银川方向)', location: '107.536092,27.538530', altitude: 742},
    {name: '小腮服务区(施播高速播州方向)', location: '107.798215,27.254937', altitude: 666},
    {name: '小腮服务区(遵余高速余庆方向)', location: '107.793031,27.257482', altitude: 666},
  ],
  "凤冈县": [
    {name: '凤冈停车区(杭瑞高速瑞丽方向)', location: '107.643219,27.884271', altitude: 811},
    {name: '凤冈停车区(杭瑞高速杭州方向)', location: '107.644030,27.883275', altitude: 811},
  ],
  "务川仡佬族苗族自治县": [
    {name: '涪洋服务区(德习高速德江方向)', location: '107.720529,28.490299', altitude: 669},
    {name: '涪洋服务区(德习高速习水方向)', location: '107.720720,28.491917', altitude: 669},
    {name: '楠杆服务区(德习高速德江方向)', location: '107.880041,28.368467', altitude: 724},
    {name: '楠杆服务区(德习高速习水方向)', location: '107.877144,28.371349', altitude: 724},
  ],
  "播州区": [
    {name: '乌江服务区(兰海高速兰州方向)', location: '106.767114,27.270323', altitude: 814},
    {name: '乌江服务区(兰海高速海口方向)', location: '106.765731,27.266931', altitude: 814},
    {name: '尚嵇乌江服务区(渝筑高速重庆方向)', location: '107.008787,27.360021', altitude: 778},
    {name: '尚嵇乌江服务区(渝筑高速贵阳方向)', location: '107.007200,27.362193', altitude: 778},
    {name: '遵义停车区(杭瑞高速瑞丽方向)', location: '106.906048,27.597444', altitude: 881},
    {name: '遵义停车区(杭瑞高速杭州方向)', location: '106.906383,27.595634', altitude: 881},
    {name: '水洋湾服务区(杭瑞高速瑞丽方向)', location: '106.653754,27.586979', altitude: 894},
    {name: '水洋湾服务区(杭瑞高速杭州方向)', location: '106.631022,27.582417', altitude: 894},
    {name: '龙山加油站(兰海高速兰州方向)', location: '106.847950,27.548650', altitude: 921},
    {name: '龙山加油站(兰海高速海口方向)', location: '106.847107,27.547736', altitude: 921},
    {name: '白腊坎服务区(仁望高速仁怀方向)', location: '106.574585,27.586849', altitude: 943},
    {name: '白腊坎服务区(仁望高速望谟方向)', location: '106.570359,27.589783', altitude: 943},
    {name: '乐意坝停车区(遵义绕城高速外环方向)', location: '106.711461,27.532983', altitude: 882},
    {name: '乐意坝停车区(遵义绕城高速内环方向)', location: '106.711345,27.535041', altitude: 882},
    {name: '泮水服务区(新金高速红花岗方向)', location: '106.339949,27.560106', altitude: 1004},
    {name: '泮水服务区(新金高速金沙方向)', location: '106.338682,27.558214', altitude: 1004},
    {name: '肇新场服务区(遵义绕城高速内环方向)', location: '106.974863,27.505563', altitude: 988},
    {name: '肇新场服务区(遵义绕城高速外环方向)', location: '106.975287,27.503875', altitude: 988},
    {name: '石壁加油站(杭瑞高速杭州方向)', location: '106.477637,27.528971', altitude: 892},
    {name: '石壁加油站(杭瑞高速瑞丽方向)', location: '106.478128,27.529608', altitude: 892},
    {name: '团溪服务区(施播高速施秉方向)', location: '107.169623,27.480988', altitude: 905},
    {name: '团溪服务区(施播高速播州方向)', location: '107.164251,27.485700', altitude: 905},
    {name: '大发渠停车区(仁遵高速遵义方向)', location: '106.558225,27.799923', altitude: 903},
    {name: '大发渠停车区(仁遵高速仁怀方向)', location: '106.558598,27.802598', altitude: 903},
  ],
  "桐梓县": [
    {name: '大娄山服务区(渝筑高速贵阳方向)', location: '106.873783,28.372186', altitude: 743},
    {name: '大娄山服务区(渝筑高速重庆方向)', location: '106.875293,28.371595', altitude: 743},
    {name: '桐梓服务区(兰海高速海口方向)', location: '106.831239,28.101942', altitude: 929},
    {name: '桐梓服务区(兰海高速兰州方向)', location: '106.832299,28.102501', altitude: 929},
    {name: '松坎服务区(兰海高速海口方向)', location: '106.842127,28.423831', altitude: 466},
    {name: '松坎服务区(兰海高速兰州方向)', location: '106.836236,28.494875', altitude: 466},
    {name: '茅石停车区(渝筑高速重庆方向)', location: '106.931939,28.233091', altitude: 1092},
    {name: '茅石停车区(渝筑高速遵义方向)', location: '106.927014,28.236266', altitude: 1092},
    {name: '凉风垭停车区(兰海高速兰州方向)', location: '106.840051,28.235497', altitude: 1053},
    {name: '凉风垭停车区(兰海高速海口方向)', location: '106.838899,28.236158', altitude: 1053},
    {name: '花秋服务区(新金高速新浦方向)', location: '106.555026,28.043406', altitude: 889},
    {name: '花秋服务区(新金高速金沙方向)', location: '106.553756,28.045205', altitude: 889},
    {name: '水银河停车区(印习高速习水方向)', location: '106.908510,28.616893', altitude: 472},
    {name: '水银河停车区(印习高速印江方向)', location: '106.904561,28.621723', altitude: 472},
  ],
  "正安县": [
    {name: '正安服务区(银百高速百色方向)', location: '107.450567,28.490188', altitude: 611},
    {name: '正安服务区(银百高速银川方向)', location: '107.451387,28.488906', altitude: 611},
    {name: '米粮停车区(银百高速银川方向)', location: '107.438254,28.389502', altitude: 646},
    {name: '米粮停车区(银百高速百色方向)', location: '107.432200,28.394929', altitude: 646},
  ],
  "汇川区": [
    {name: '团泽服务区(渝筑高速重庆方向)', location: '107.123613,27.776019', altitude: 903},
    {name: '团泽服务区(渝筑高速贵阳方向)', location: '107.121592,27.776204', altitude: 903},
    {name: '高坪停车区(兰海高速兰州方向)', location: '106.920022,27.805824', altitude: 900},
    {name: '高坪停车区(兰海高速海口方向)', location: '106.919395,27.805395', altitude: 900},
  ],
  "湄潭县": [
    {name: '湄潭南服务区(玉新高速玉屏方向)', location: '107.512239,27.651399', altitude: 882},
    {name: '湄潭南服务区(玉新高速新蒲新区方向)', location: '107.512694,27.652677', altitude: 882},
    {name: '西河服务区(银百高速百色方向)', location: '107.493892,28.111267', altitude: 997},
    {name: '西河服务区(银百高速银川方向)', location: '107.495673,28.111143', altitude: 997},
    {name: '湄潭服务区(杭瑞高速杭州方向)', location: '107.450178,27.762122', altitude: 790},
    {name: '湄潭服务区(杭瑞高速瑞丽方向)', location: '107.450095,27.764532', altitude: 790},
    {name: '湄潭东服务区(银百高速银川方向)', location: '107.520344,27.770349', altitude: 787},
    {name: '湄潭东服务区(银百高速百色方向)', location: '107.518303,27.770502', altitude: 787},
    {name: '乌江服务区(施播高速播州方向)', location: '107.417315,27.412260', altitude: 767},
    {name: '乌江服务区(施播高速施秉方向)', location: '107.417000,27.410381', altitude: 767},
  ],
  "红花岗区": [
    {name: '虾子服务区(杭瑞高速瑞丽方向)', location: '107.153179,27.660968', altitude: 786},
    {name: '虾子服务区(杭瑞高速杭州方向)', location: '107.152668,27.659487', altitude: 786},
    {name: '遵义服务区(兰海高速海口方向)', location: '106.881061,27.652210', altitude: 853},
    {name: '遵义服务区(兰海高速兰州方向)', location: '106.882349,27.652419', altitude: 853},
    {name: '金鼎山服务区(仁遵高速遵义方向)', location: '106.762491,27.732409', altitude: 944},
    {name: '金鼎山服务区(仁遵高速仁怀方向)', location: '106.766879,27.733578', altitude: 944},
    {name: '海龙服务区(遵义绕城高速内环方向)', location: '106.846842,27.758561', altitude: 902},
    {name: '海龙服务区(遵义绕城高速外环方向)', location: '106.845079,27.758721', altitude: 902},
  ],
  "绥阳县": [
    {name: '绥阳南服务区(新金高速金沙方向)', location: '107.235797,27.950107', altitude: 948},
    {name: '绥阳南服务区(新金高速红花岗方向)', location: '107.233858,27.949501', altitude: 948},
    {name: '蒲场服务区(渝筑高速贵阳方向)', location: '107.066302,27.902534', altitude: 886},
    {name: '蒲场服务区(渝筑高速重庆方向)', location: '107.068091,27.903316', altitude: 886},
    {name: '旺草服务区(务遵高速遵义方向)', location: '107.284452,28.118314', altitude: 714},
    {name: '旺草服务区(务遵高速务川方向)', location: '107.281776,28.121701', altitude: 714},
    {name: '绥阳停车区(绥遵高速绥阳方向)', location: '107.141678,27.944354', altitude: 868},
    {name: '绥阳停车区(绥遵高速遵义方向)', location: '107.140308,27.943430', altitude: 868},
  ],
  "赤水市": [
    {name: '旺隆服务区(蓉遵高速成都方向)', location: '105.877444,28.523197', altitude: 377},
    {name: '旺隆服务区(蓉遵高速遵义方向)', location: '105.873800,28.524998', altitude: 377},
    {name: '天台停车区(蓉遵高速遵义方向)', location: '105.766214,28.559046', altitude: 307},
    {name: '天台停车区(蓉遵高速成都方向)', location: '105.763291,28.563150', altitude: 307},
  ],
  "道真仡佬族苗族自治县": [
    {name: '道真服务区(银百高速银川方向)', location: '107.512847,28.858782', altitude: 851},
    {name: '道真服务区(银百高速百色方向)', location: '107.513021,28.857318', altitude: 851},
  ]
}

const QianNanServiceStops: DistrictArea = {
  "三都水族自治县": [
    {name: '排洞停车区(厦蓉高速厦门方向)', location: '108.101048,26.025331', altitude: 640},
    {name: '排洞停车区(厦蓉高速成都方向)', location: '108.025452,26.051068', altitude: 640},
    {name: '三都服务区(余安高速余庆方向)', location: '107.816333,26.021803', altitude: 526},
    {name: '三都服务区(余安高速安龙方向)', location: '107.814758,26.022636', altitude: 526},
    {name: '三洞服务区(三荔高速荔波方向)', location: '107.893227,25.761189', altitude: 746},
    {name: '三洞服务区(三荔高速三都方向)', location: '107.894800,25.761289', altitude: 746},
    {name: '九阡服务区(荔榕高速榕江方向)', location: '107.990560,25.622721', altitude: 662},
    {name: '九阡服务区(荔榕高速荔波方向)', location: '107.989260,25.623749', altitude: 662},
  ],
  "平塘县": [
    {name: '平塘服务区(余安高速安龙方向)', location: '107.348504,25.841695', altitude: 786},
    {name: '平塘服务区(余安高速余庆方向)', location: '107.351422,25.839337', altitude: 786},
    {name: '通州停车区(余安高速余庆方向)', location: '107.042359,25.771531', altitude: 877},
    {name: '通州停车区(余安高速安龙方向)', location: '107.040137,25.772393', altitude: 877},
  ],
  "惠水县": [
    {name: '惠水服务区(银百高速百色方向)', location: '106.687556,26.152861', altitude: 1022},
    {name: '惠水服务区(银百高速银川方向)', location: '106.688375,26.151476', altitude: 1022},
    {name: '好花红服务区(银百高速银川方向)', location: '106.575498,25.947922', altitude: 994},
    {name: '好花红服务区(银百高速百色方向)', location: '106.574070,25.950104', altitude: 994},
    {name: '摆金停车区(都香高速都匀方向)', location: '106.841244,26.103327', altitude: 1114},
    {name: '摆金停车区(都香高速香格里拉方向)', location: '106.840464,26.104065', altitude: 1114},
    {name: '断杉停车区(银百高速百色方向)', location: '106.579026,25.770848', altitude: 989},
    {name: '断杉停车区(银百高速银川方向)', location: '106.579963,25.770889', altitude: 989},
  ],
  "独山县": [
    {name: '新寨服务区(兰海高速兰州方向)', location: '107.433546,25.315671', altitude: 882},
    {name: '新寨服务区(兰海高速海口方向)', location: '107.429110,25.312141', altitude: 882},
    {name: '姚家寨停车区(兰海高速兰州方向)', location: '107.541316,25.848886', altitude: 985},
    {name: '姚家寨停车区(兰海高速海口方向)', location: '107.540381,25.849351', altitude: 985},
    {name: '子为停车区(兰海高速海口方向)', location: '107.457787,25.519655', altitude: 1002},
    {name: '子为停车区(兰海高速兰州方向)', location: '107.458058,25.518974', altitude: 1002},
    {name: '紫林山停车区(余安高速安龙方向)', location: '107.580932,25.896702', altitude: 1019},
    {name: '紫林山停车区(余安高速余庆方向)', location: '107.582480,25.894997', altitude: 1019},
  ],
  "瓮安县": [
    {name: '瓮安西服务区(银百高速百色方向)', location: '107.353117,27.071400', altitude: 1280},
    {name: '瓮安西服务区(银百高速银川方向)', location: '107.355202,27.071569', altitude: 1280},
    {name: '瓮安南服务区(安福高速福泉方向)', location: '107.432427,26.944085', altitude: 1216},
    {name: '瓮安东服务区(江黔高速黔西方向)', location: '107.553677,27.128605', altitude: 1138},
    {name: '瓮安东服务区(江黔高速江口方向)', location: '107.554772,27.127540', altitude: 1138},
    {name: '瓮安北服务区(银百高速百色方向)', location: '107.470881,27.197422', altitude: 933},
    {name: '瓮安北服务区(银百高速银川方向)', location: '107.472090,27.199016', altitude: 933},
  ],
  "福泉市": [
    {name: '福泉服务区(安福高速福泉方向)', location: '107.563779,26.654010', altitude: 910},
    {name: '福泉服务区(安福高速瓮安方向)', location: '107.565574,26.654496', altitude: 910},
    {name: '福泉北服务区(玉盘高速玉屏方向)', location: '107.547682,26.785198', altitude: 982},
    {name: '福泉北服务区(玉盘高速盘州方向)', location: '107.545224,26.786566', altitude: 982},
    {name: '瓮安南服务区(安福高速瓮安方向)', location: '107.433039,26.945466', altitude: 1211},
    {name: '洛邦停车区(凯里环城高速内环方向)', location: '107.714705,26.635318', altitude: 986},
    {name: '洛邦停车区(凯里环城高速外环方向)', location: '107.715869,26.636817', altitude: 986},
  ],
  "罗甸县": [
    {name: '红水河停车区(银百高速银川方向)', location: '106.679001,25.201437', altitude: 451},
    {name: '红水河停车区(银百高速百色方向)', location: '106.677705,25.201833', altitude: 451},
    {name: '边阳服务区(银百高速银川方向)', location: '106.613920,25.667806', altitude: 865},
    {name: '边阳服务区(银百高速百色方向)', location: '106.611583,25.668271', altitude: 865},
    {name: '大小井服务区(余安高速安龙方向)', location: '106.808579,25.499910', altitude: 564},
    {name: '大小井服务区(余安高速余庆方向)', location: '106.809873,25.499328', altitude: 564},
    {name: '板庚停车区(银百高速百色方向)', location: '106.672682,25.498851', altitude: 518},
    {name: '板庚停车区(银百高速银川方向)', location: '106.674712,25.493097', altitude: 518},
    {name: '罗甸停车区(银百高速银川方向)', location: '106.702510,25.413920', altitude: 414},
    {name: '罗甸停车区(银百高速百色方向)', location: '106.702178,25.414822', altitude: 414},
  ],
  "荔波县": [
    {name: '荔波服务区(三荔高速三都方向)', location: '107.957301,25.465866', altitude: 599},
    {name: '荔波服务区(三荔高速荔波方向)', location: '107.955203,25.467873', altitude: 599},
    {name: '联山湾停车区(驾荔高速荔波方向)', location: '107.721738,25.349927', altitude: 750},
    {name: '联山湾停车区(驾荔高速小七孔方向)', location: '107.721215,25.350757', altitude: 750},
  ],
  "贵定县": [
    {name: '贵定天福服务区(厦蓉高速成都方向)', location: '107.164999,26.349105', altitude: 1028},
    {name: '贵定天福服务区(厦蓉高速厦门方向)', location: '107.163866,26.348313', altitude: 1028},
    {name: '牟珠洞服务区(沪昆高速昆明方向)', location: '107.195168,26.522300', altitude: 1093},
    {name: '牟珠洞服务区(沪昆高速上海方向)', location: '107.194316,26.519372', altitude: 1093},
    {name: '云雾服务区(都香高速都匀方向)', location: '107.031641,26.193425', altitude: 1270},
    {name: '云雾服务区(都香高速香格里拉方向)', location: '107.033464,26.193380', altitude: 1270},
  ],
  "都匀市": [
    {name: '上堡服务区(兰海高速兰州方向)', location: '107.468807,26.126728', altitude: 890},
    {name: '上堡服务区(兰海高速海口方向)', location: '107.467745,26.127380', altitude: 890},
    {name: '都匀加油站(兰海高速兰州方向)', location: '107.505661,26.306539', altitude: 800},
    {name: '都匀加油站(兰海高速海口方向)', location: '107.504584,26.308471', altitude: 800},
    {name: '羊列服务区(都匀绕城高速内环方向)', location: '107.695274,26.302642', altitude: 922},
    {name: '羊列服务区(都匀绕城高速外环方向)', location: '107.694923,26.304344', altitude: 922},
    {name: '毛尖服务区(都香高速都匀方向)', location: '107.313172,26.167557', altitude: 1094},
    {name: '毛尖服务区(都香高速香格里拉方向)', location: '107.309955,26.167401', altitude: 1094},
    {name: '清水江服务区(厦蓉高速厦门方向)', location: '107.685918,26.162478', altitude: 792},
    {name: '清水江服务区(厦蓉高速成都方向)', location: '107.681963,26.165596', altitude: 792},
    {name: '摆梭停车区(厦蓉高速厦门方向)', location: '107.319512,26.282114', altitude: 1102},
    {name: '摆梭停车区(厦蓉高速成都方向)', location: '107.317136,26.284316', altitude: 1102},
    {name: '河阳停车区(都香高速都匀方向)', location: '107.492132,26.096443', altitude: 938},
    {name: '河阳停车区(都香高速香格里拉方向)', location: '107.493538,26.097634', altitude: 938},
  ],
  "长顺县": [
    {name: '摆塘服务区(都香高速都匀方向)', location: '106.483778,26.078714', altitude: 1163},
    {name: '摆塘服务区(都香高速香格里拉方向)', location: '106.482850,26.080649', altitude: 1163},
    {name: '长顺服务区(惠兴高速惠水方向)', location: '106.507086,26.027561', altitude: 1006},
    {name: '长顺服务区(惠兴高速兴仁方向)', location: '106.505699,26.027681', altitude: 1006},
    {name: '广顺服务区(贵阳外环外环方向)', location: '106.401455,26.220145', altitude: 1262},
    {name: '广顺服务区(贵阳外环内环方向)', location: '106.404446,26.221430', altitude: 1262},
    {name: '广顺停车区(花安高速安顺方向)', location: '106.426213,26.255951', altitude: 1286},
    {name: '广顺停车区(花安高速花溪方向)', location: '106.427113,26.254989', altitude: 1286},
  ],
  "龙里县": [
    {name: '龙里洗马停车区(玉盘高速玉屏方向)', location: '107.127185,26.701956', altitude: 1308},
    {name: '龙里洗马停车区(玉盘高速盘州方向)', location: '107.127484,26.702908', altitude: 1308},
    {name: '龙里服务区(沪昆高速昆明方向)', location: '106.988359,26.462831', altitude: 1078},
    {name: '龙里服务区(沪昆高速上海方向)', location: '106.987428,26.462667', altitude: 1078},
    {name: '龙里停车区(厦蓉高速成都方向)', location: '107.026383,26.426754', altitude: 1358},
    {name: '龙里停车区(厦蓉高速厦门方向)', location: '107.026040,26.426110', altitude: 1358},
  ]
}

const WuZhouServiceStops: DistrictArea = {
  万秀区:[
    {name: '夏郢服务区(梧州绕城高速外环方向)', location: '111.299986,23.564502', altitude: 39},
    {name: '夏郢服务区(梧州绕城高速内环方向)', location: '111.300114,23.563003', altitude: 39},
  ],
  岑溪市: [
    {name: '筋竹服务区(深岑高速深圳方向)', location: '111.229024,22.895104', altitude: 167},
    {name: '筋竹服务区(深岑高速岑溪方向)', location: '111.234551,22.895704', altitude: 167},
    {name: '岑溪东服务区(深岑高速岑溪方向)', location: '111.054616,22.886235', altitude: 141},
    {name: '岑溪东服务区(深岑高速深圳方向)', location: '111.068731,22.887360', altitude: 141},
    {name: '中林停车区(广昆高速广州方向)', location: '110.864788,22.904746', altitude: 102},
    {name: '中林停车区(广昆高速昆明方向)', location: '110.865233,22.905307', altitude: 102},
    {name: '大隆服务区(包茂高速茂名方向)', location: '111.011956,22.759163', altitude: 270},
    {name: '大隆服务区(包茂高速包头方向)', location: '111.010949,22.757002', altitude: 270},
    {name: '岑溪服务区(包茂高速包头方向)', location: '111.042896,23.007335', altitude: 138},
    {name: '岑溪服务区(包茂高速茂名方向)', location: '111.041976,23.008244', altitude: 138},
    {name: '三堡服务区(平岑高速平南方向)', location: '110.962600,23.037400', altitude: 116},
    {name: '三堡服务区(平岑高速岑溪方向)', location: '110.962931,23.035250', altitude: 116},
  ],
  苍梧县: [
    {name: '岭脚服务区(梧柳高速柳州方向)', location: '111.020077,23.552382', altitude: 86},
    {name: '岭脚服务区(梧柳高速梧州方向)', location: '111.018731,23.551360', altitude: 86},
    {name: '苍梧服务区(信梧高速信都方向)', location: '111.518444,23.757871', altitude: 73},
    {name: '苍梧服务区(信梧高速梧州方向)', location: '111.518967,23.759513', altitude: 73},
    {name: '狮寨停车区(包茂高速茂名方向)', location: '111.127296,23.779487', altitude: 67},
    {name: '狮寨停车区(包茂高速包头方向)', location: '111.129402,23.783659', altitude: 67},
  ],
  蒙山县: [
    {name: '新圩服务区(贺西高速西林方向)', location: '110.411040,24.305982', altitude: 279},
    {name: '新圩服务区(贺西高速贺州方向)', location: '110.407716,24.304482', altitude: 279},
  ],
  藤县: [
    {name: '藤县服务区(梧硕高速硕龙方向)', location: '110.949221,23.317129', altitude: 57},
    {name: '藤县服务区(梧硕高速苍梧方向)', location: '110.953229,23.317185', altitude: 57},
    {name: '和平服务区(梧柳高速梧州方向)', location: '110.677682,23.590213', altitude: 92},
    {name: '和平服务区(梧柳高速柳州方向)', location: '110.678795,23.591699', altitude: 92},
    {name: '宁康服务区(呼北高速北海方向)', location: '110.408315,23.891465', altitude: 142},
    {name: '宁康服务区(呼北高速呼和浩特方向)', location: '110.410198,23.889141', altitude: 142},
    {name: '新庆服务区(梧硕高速硕龙方向)', location: '110.687827,23.289392', altitude: 96},
    {name: '新庆服务区(梧硕高速梧州方向)', location: '110.686868,23.288998', altitude: 96},
    {name: '藤县西服务区(平岑高速平南方向)', location: '110.827854,23.333558', altitude: 140},
    {name: '藤县西服务区(平岑高速岑溪方向)', location: '110.825828,23.332932', altitude: 140},
  ],
  长洲区: [
    {name: '倒水服务区(包茂高速茂名方向)', location: '111.136787,23.585381', altitude: 32},
    {name: '倒水服务区(包茂高速包头方向)', location: '111.138188,23.584943', altitude: 32},
  ],
  龙圩区: [
    {name: '大坡服务区(广昆高速昆明方向)', location: '111.311046,23.321217', altitude: 43},
    {name: '大坡服务区(广昆高速广州方向)', location: '111.310045,23.320686', altitude: 43},
    {name: '新地服务区(包茂高速茂名方向)', location: '111.173406,23.204952', altitude: 109},
    {name: '新地服务区(包茂高速包头方向)', location: '111.174553,23.203179', altitude: 109},
    {name: '白沙停车区(包茂高速茂名方向)', location: '111.185456,23.409642', altitude: 23},
    {name: '白沙停车区(包茂高速包头方向)', location: '111.186723,23.408933', altitude: 23},
  ]
}

const ServiceStops: {[city: string]: DistrictArea} = {
  "广州市": GuangZhouServiceStops,
  "佛山市": FoShanServiceStops,
  "肇庆市": ZhaoQingServiceStops,
  "贺州市": HeZhouServiceStops,
  "梧州市": WuZhouServiceStops,
  "桂林市": GuiLinServiceStops,
  "柳州市": LiuZhouServiceStops,
  "黔东南苗族侗族自治州":QianDongNanServiceStops,
  "贵阳市": GuiYangServiceStops,
  "毕节市": BiJieServiceStops,
  "六盘水市": LiuPanShuiServiceStops,
  "安顺市": AnShunServiceStops,
  "黔西南布依族苗族自治州": QianXiNanServiceStops,
  "遵义市": ZunYiServiceStops,
  "黔南布依族苗族自治州": QianNanServiceStops,
}
