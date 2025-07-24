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
  verifyPlan(aiPlan, stops, startTime);
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

const GuangZhouServiceStops: DistrictArea = 
{
  '南沙区': [
    {name: '潭洲服务区', location: '113.401198,22.759078', altitude: 8},
    {name: '万顷沙服务区', location: '113.636476,22.580879', altitude: 0},
    {name: '南沙停车区', location: '113.587856,22.769409', altitude: 9},
  ],
  '从化区': [
    {name: '瓦窑岗服务区', location: '113.463673,23.613520', altitude: 42},
    {name: '从化服务区', location: '113.646944,23.610815', altitude: 76},
    {name: '鳌头停车区', location: '113.364255,23.638190', altitude: 58},
    {name: '上塘服务区', location: '113.505864,23.527526', altitude: 68},
    {name: '吕田服务区', location: '113.895347,23.817703', altitude: 232},
    {name: '木棉服务区', location: '113.505955,23.498445', altitude: 33},
    {name: '从化南服务区', location: '113.524327,23.449385', altitude: 66},
  ],
  '白云区': [
    {name: '白云服务区', location: '113.268137,23.267584', altitude: 17},
    {name: '沙贝服务区', location: '113.195275,23.154726', altitude: 23},
  ],
  '增城区': [
    {name: '正果停车区', location: '113.904996,23.458983', altitude: 50},
    {name: '南香山服务区', location: '113.643626,23.225485', altitude: 17},
    {name: '朱村服务区', location: '113.712358,23.239584', altitude: 24},
    {name: '沙埔服务区', location: '113.676422,23.189259', altitude: 22},
    {name: '沙岗驿站', location: '113.736632,23.382122', altitude: 50},
    {name: '荔城服务区', location: '113.785421,23.238048', altitude: 19},
    {name: '新安服务区', location: '113.578183,23.376050', altitude: 92},
    {name: '仙村服务区', location: '113.697883,23.159462', altitude: 5},
    {name: '河洞服务区', location: '113.808374,23.438718', altitude: 24},
  ],
  '花都区': [
    {name: '花城服务区', location: '113.313125,23.503162', altitude: 67},
    {name: '炭步服务区', location: '113.067509,23.311997', altitude: 10},
  ],
  '番禺区': [
    {name: '官桥服务区', location: '113.457426,22.987955', altitude: 6},
    {name: '金山服务区', location: '113.265947,22.970051', altitude: 10},
  ],
  '黄埔区': [
    {name: '仓头服务区', location: '113.551412,23.124518', altitude: 8},
    {name: '中新服务区', location: '113.602678,23.310739', altitude: 13},
    {name: '火村服务区', location: '113.489894,23.153703', altitude: 23},
    {name: '和龙服务区', location: '113.419987,23.257411', altitude: 108},
  ],
  '天河区': [
    {name: '黄村服务区', location: '113.403143,23.144632', altitude: 9},
    {name: '广氮服务区', location: '113.384020,23.151452', altitude: 15},
  ],
  '海珠区': [
    {name: '赤沙加油站', location: '113.350397,23.086840', altitude: 9},
    {name: '华洲加油站', location: '113.344331,23.062008', altitude: 9},
  ]
}

const FoShanServiceStops: DistrictArea = 
{
  "三水区": [
    {name: '三水服务区', location: '112.896063,23.244388', altitude: 15},
    {name: '大塘服务区', location: '112.980172,23.429447', altitude: 11},
    {name: '范湖服务区', location: '113.027106,23.338264', altitude: 7}
  ],
  "南海区": [
    {name: '沙涌加油站', location: '113.163602,23.137643', altitude: 6},
    {name: '丹灶服务区', location: '112.900160,23.043781', altitude: 15},
    {name: '狮山加油站', location: '112.995906,23.138756', altitude: 9}
  ],
  "高明区": [
    {name: '明城停车区', location: '112.695781,22.946388', altitude: 32},
    {name: '更合停车区', location: '112.499981,22.757366', altitude: 43},
    {name: '松岗服务区', location: '112.824118,22.950590', altitude: 14}
  ],
  "顺德区": [
    {name: '勒流服务区', location: '113.164969,22.840974', altitude: 10},
    {name: '顺德服务区', location: '113.270005,22.917469', altitude: 10},
    {name: '冲鹤服务区', location: '113.198885,22.781098', altitude: 13}
  ],
  "禅城区": [
    {name: '罗格服务区', location: '113.011565,22.990880', altitude: 11}
  ]
}
const ZhaoQingServiceStops: DistrictArea =
{
  "广宁县": [
    {name: '广宁服务区', location: '112.437496,23.520699', altitude: 34},
  ],
  "鼎湖区": [
    {name: '鼎湖山服务区', location: '112.627663,23.247110', altitude: 24},
    {name: '鼎湖服务区', location: '112.695005,23.216631', altitude: 9}
  ],
  "封开县": [
    {name: '金装服务区', location: '111.874010,23.775097', altitude: 74},
    {name: '封开服务区', location: '111.555619,23.351069', altitude: 47},
    {name: '南丰停车区', location: '111.807659,23.635221', altitude: 110},
    {name: '罗董服务区', location: '111.646208,23.355565', altitude: 88}
  ],
  "高要区": [
    {name: '水南服务区', location: '112.392459,23.291416', altitude: 59},
    {name: '大湾服务区', location: '112.352400,23.044584', altitude: 20},
    {name: '蚬岗服务区', location: '112.633448,23.049731', altitude: 26},
    {name: '笋围停车区', location: '112.342382,23.183696', altitude: 20}
  ],
  "德庆县": [
    {name: '宾村停车区', location: '111.719530,23.226553', altitude: 135},
    {name: '高良停车区', location: '111.909494,23.236876', altitude: 75},
    {name: '播植服务区', location: '112.088516,23.262082', altitude: 99},
  ],
  "怀集县": [
    {name: '怀集服务区', location: '112.230754,23.976639', altitude: 119},
    {name: '怀城服务区', location: '112.221792,23.812410', altitude: 52},
    {name: '连麦停车区', location: '112.116338,24.022175', altitude: 81},
    {name: '梁村停车区', location: '111.997930,23.968522', altitude: 86},
  ],
  "四会市": [
    {name: '四会服务区', location: '112.539873,23.429049', altitude: 14},
    {name: '地豆服务区', location: '112.688066,23.566828', altitude: 43},
    {name: '龙甫服务区', location: '112.714164,23.377671', altitude: 15},
    {name: '江谷停车区', location: '112.611892,23.447889', altitude: 72}
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
  conservative = '**conservative**:make sure there is always a backup service stop to recharge in case driver arrives at the planned service stop and finds out it is out of service, make sure soc is above the minimal allowed soc when car arrives the backup service stop.**tag**:<backup service stop name, remaining soc when arrival at backup service stop>',
  aggressive = '**aggressive**:make sure car arrives at planned service stop with soc above minimal allowed soc.**tag**:无',
  breakfastCharge = '**recharging at breakfast time**:prioritize recharging during breakfast time.**tag**:用早餐充电',
  lunchCharge = '**recharging at lunch time**:prioritize recharging during lunch time.**tag**:用午餐充电',
  dinnerCharge = '**recharging at dinner time**:prioritize recharging during dinner time.**tag**:用晚餐充电',
  avoidExpensiveWindow = '**avoid expensive charging window**:try to avoid recharging at 11:00 - 13:00, 17:00 - 23:00. **tag**:峰时电价,谷时电价',
}

interface AiPlanStep {
  fromStop: string;
  arrivalStop: string;
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

function verifyPlan(plan: AiPlanStep[], stops: Stop[], startTime: string): void {
  let totalTime = toMinutes(startTime);
  let leftKwh = maxBattery;
  const minKwh = Math.floor(hardMinSoc * 0.01 * maxBattery);

  for (const step of plan) {
    const [kwh, time] = calculateConsumptionAndTime(step.fromStop, step.arrivalStop, stops);
    totalTime += time;
    leftKwh -= kwh;

    if (leftKwh < minKwh) {
      const err = `${step.fromStop} to ${step.arrivalStop}: 最低soc ${hardMinSoc}%偏差, 实际剩余${leftKwh}度, 需要剩余${minKwh}度`;
      alert(err);
      throw new Error(err);
    }

    let aiGuessArrival = toMinutes(step.arrivalTime);
    if (Math.abs(aiGuessArrival - totalTime) > 2) {
      const err = `${step.fromStop} to ${step.arrivalStop}: 预估到达时间偏差, 实际${totalTime}分钟, ai预估${aiGuessArrival}分钟`;
      alert(err);
      throw new Error(err);
    }

    let aiGuessKwh: number = Math.floor(step.socBeforeRecharge * 0.01 * maxBattery);
    if (Math.abs(aiGuessKwh - Math.floor(leftKwh)) > 1) {
      const err = `${step.fromStop} to ${step.arrivalStop}: 预估电量偏差, 实际${Math.floor(leftKwh)}kwh, ai预估${Math.floor(aiGuessKwh)}kwh`;
      alert(err);
      throw new Error(err);
    }

    let chargeKwh = (step.socAfterRecharge - step.socBeforeRecharge) * 0.01 * maxBattery / chargeEffe;
    let chargeTime = Math.ceil(chargeKwh / chargeSpeed * 60);
    if (Math.abs(step.rechargeTime - chargeTime) > 2) {
      const err = `${step.fromStop} to ${step.arrivalStop}: 预估充电时间偏差, 实际${chargeTime}分钟, ai预估${step.rechargeTime}分钟`;
      alert(err);
      throw new Error(err);
    }
    totalTime += step.rechargeTime;
    let aiGuessTime = toMinutes(step.departureTime);
    if (Math.abs(aiGuessTime - totalTime) > 2) {
      const err = `${step.fromStop} to ${step.arrivalStop}: 预估离去时间偏差, 实际${totalTime}分钟, ai预估${aiGuessTime}分钟`;
      alert(err);
      throw new Error(err);
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
      const err = `${lastPlannedStop} to ${lastStop}: 最低soc ${hardMinSoc}%偏差, 实际剩余${leftKwh}度,小于${minKwh}度`;
      alert(err);
      throw new Error(err);
    }
  }
}

async function plan(stops: Stop[], startTime: string, startSoc: number, maxSoc: number, minSoc: number, presets: Preset[], otherRequirement: string): Promise<AiPlanStep[]> {
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
- understand and try best to fulfill the input requirement, and create tags for them if applicable, each tag should be in Chinese and shoud not exceed 10 words 
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
            required: ['fromStop', 'arrivalStop', 'arrivalTime', 'departureTime', 'socBeforeRecharge', 'socAfterRecharge', 'rechargeTime', 'tags'],
            additionalProperties: false
          }
        }
      }}
    }
  }

  const promptForDsR1 = prompt + `\n**output requirement**:
  generate output which strictly follows below JSON schema:
  ${JSON.stringify(response_format)}`;

  const answer: string = await askLlm(
    openrouterHost,
    openrouterKey,
    chatModelO4Mini,
    [
      {
        role: 'system',
        content: [
          {
            type: "text",
            text: 'You are a helpful assistant for to help user make all kinds of accurate and efficient plans, and always use a tool to perform calculations.'
          }]
      },
      {
        content: [{type: 'text', text: prompt}],
        role: 'user'
      }],
    response_format);

  const ret: any = JSON.parse(answer);
  if (ret.reason) {
    alert(ret.reason);
  }
  if (!ret.rechargingPlan || ret.rechargingPlan.length === 0) {
    throw new Error('no plan provided');
  }
  return ret.rechargingPlan as AiPlanStep[];
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
    console.log('perform function calls');
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
  '桂林西站',
  '6:30', 100, 85, 8,
  [Preset.conservative, Preset.lunchCharge],
  '午餐时段可以充满至100%, 确保抵达终点时有至少15%的电').then(ret => console.log(ret));

async function r(city: string, pageNum: number): Promise<any> {
  const reqUrl = `https://restapi.amap.com/v5/place/text?types=180300&key=d0e0aab6356af92b0cd0763cae27ba35&output=json&region=${city}&page_size=25&page_num=${pageNum}`;
  let response: any = await fetch(reqUrl);

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

async function collectService(city: string, pageNum: number, allService: string[]): Promise<void> {
  let ret = await r(city, pageNum);
  if (!ret) {
    let all: string[] = [];
    let stops: any = {};
    const pois: any[] = shuffleMap(allService);
    pois.forEach(poi => {
      const name = poi.name.split('(')[0];
      if (!all.includes(name)) {
        all.push(name);
        let sub = stops[poi.adname];
        const item = `{name: '${name}', location: '${poi.location}', altitude: }`;
        if (!sub) stops[poi.adname] = [item]; else sub.push(item);
      }
    });
    console.log(stops);
  }
  await collectService(city, pageNum+1, allService.concat(ret));
}
