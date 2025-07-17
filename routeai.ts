const KwhPer120PerKm = 17.2 * 0.01; //65%
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
}

interface Path {
  distance: string;
  cost: {
    duration: string;
    tolls: string;
  };
  steps: Step[];
}

async function generateRoute(startAddress: string, destAddres: string): Promise<Stop[]> {
  return await collectStops(
  {location: await convLocation(startAddress), name: startAddress},
  {location: await convLocation(destAddres), name: destAddres});
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

async function getStopRecord(fromStop: Station, targetStop: Station): Promise<Stop> {
  const path: Path = await getPath(fromStop.location, targetStop.location); 
  const distKm = Math.ceil(parseInt(path.distance) / 1000);
  return {
    start: fromStop.name,
    end: targetStop.name,
    distance: distKm,
    consumedTime: Math.ceil(parseInt(path.cost.duration) * 0.9 / 60),
    consumedBattery: parseFloat((distKm * KwhPer120PerKm).toFixed(1))
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

const chatModel ='deepseek-ai/DeepSeek-R1';
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
  console.log(`LLM answer: ${response.choices[0].message.content}`);
  return response.choices[0].message.content;
}

generateRoute('广州市黄埔区中新知识城招商雍景湾', '棉洋服务区(汕湛高速汕头方向)').then(ret => console.log(ret));