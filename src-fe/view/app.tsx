import React, { useState } from 'react';
import './app.css';
import * as Apis from '../integration/apis';

const tscodes: any = {
  '宝信软件': ['600845.SH', '3.12'],
  '岱美股份': ['603730.SH', '2.31'],
  '海尔智家': ['600690.SH', '1.4'],
  '华电国际': ['600027.SH', '0.22'],
  '三峡能源': ['600905.SH', '0.22'],
  '中国船舶': ['600150.SH', '-0.33'],
  '中国海油': ['600938.SH', '0.62'],
  '平高电气': ['600312.SH', '2.75'],
  '特变电工': ['600089.SH', '2.75'],
  '大华股份': ['002236.SZ', '2.61'],
  '比音勒芬': ['002832.SZ', '1.06'],
  '桐昆股份': ['601233.SH', '1.54'],
  '华阳股份': ['600348.SH', '0.66'],
  '山西焦煤': ['000983.SZ', '0.66'],
  '中文传媒': ['600373.SH', '0.71'],
  '凤凰传媒': ['601928.SH', '0.71'],
  '新天然气': ['603393.SH', '0.44'],
  '鹏鼎控股': ['002938.SZ', '1.49'],
  '燕京啤酒': ['000729.SZ', '1.45'],
  '海信家电': ['000921.SZ', '1.4'],
  '圆通速递': ['600233.SH', '1.11'],
  '国投电力': ['600886.SH', '0.22'],
  '招商轮船': ['601872.SH', '1.23'],
  '中远海能': ['600026.SH', '1.23'],
  '钱江摩托': ['000913.SZ', '2.31'],
  '宁波华翔': ['002048.SZ', '2.31'],
  '中航西飞': ['000768.SZ', '0.46'],
  '葵花药业': ['002737.SZ', '0.9'],
  '白云山': ['600332.SH', '0.9'],
  '中国重工': ['601989.SH', '0.33'],
  '环旭电子': ['601231.SH', '1.49'],
  '农业银行': ['601288.SH', '0.29'],
  '新希望': ['000876.SZ', '0.36'],
  '千禾味业': ['603027.SH', '1.02'],
  '中金黄金': ['600489.SH', '1.17'],
  '洛阳钼业': ['603993.SH', '1.17'],
  '创新新材': ['600361.SH', '1.17'],
  '南宁百货': ['600712.SH', '']
}

enum Status {
  idle,
  initSend,
  ongoing,
  cacheHit,
  error
}

const defaultPrompt = "以A股资深游资视角, 帮助用户提供谨慎的A股投资建议";
let thinking = Status.idle;
const ChatBot: React.FC = () => {
  const [userInput, setUserInput] = useState(() => {
    // Initialize state with cached value or empty string
    const cachedValue = localStorage.getItem('userInputCache');
    return cachedValue ? cachedValue : '';
  });

  const [bankuai, setBankuai] = useState(() => {
    const cachedValue = localStorage.getItem('bankuai');
    return cachedValue ? cachedValue : 'N/A';
  });

  const [selectedService, setSelectedService] = useState(Apis.Vendor.siliconflow);
  const [systemPrompt, setSystemPrompt] = useState(defaultPrompt);
  const [parameters, setParameters] = useState({ temperature: 0, top_p: 1, max_tokens: 1024 }); // Initial parameters
  const [chatHistory, setchatHistory] = useState<Apis.Message[]>(
    []
  );

  // Event handler for form submission
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!userInput.trim()) return; // Do nothing if input is empty
    // build chat request
    localStorage.setItem('userInputCache', userInput);
    localStorage.setItem('bankuai', bankuai);

    if (userInput.indexOf(',') > 0) {
      // batch mode
      let all = userInput.split(',')

      let time = 0;
      let delay: number = parseInt(all.splice(all.length -1)[0]);
      all.forEach((name: string) => {
        const reqBody: Apis.ChatRequest = {
          name,
          tscode: tscodes[name][0],
          vendor: selectedService,
          buy: true,
          systemPrompt,
          bankuai: `${tscodes[name][1]}%`
        };
        setTimeout(() => {Apis.chat(reqBody)}, time);
        time += delay * 1000;
      });
      thinking = Status.ongoing;
      setchatHistory((prev) => [...prev, { role: Apis.Role.Assistant, content: '拼命处理中...' }]);
      setUserInput('');
      return;
    }

    if (userInput === '666') {
      // get batch result
      Apis.getAll().then((botMessage: string) => {
        thinking = Status.idle;
        setchatHistory((prev) => [...prev, { role: Apis.Role.Assistant, content: botMessage }]);
      }, (e: any) => { thinking = Status.error, alert(JSON.stringify(e)) })
      return;
    }

    let [tscode, _] = tscodes[userInput];
    if (!tscode) {
      alert('股票找球不倒!');
      return;
    }
    const userMessage = { role: Apis.Role.User, content: `${userInput}` };
    const reqBody: Apis.ChatRequest = {
      name: userInput,
      tscode,
      vendor: selectedService,
      buy: true,
      systemPrompt,
      bankuai: `${bankuai}%`
    }

    setchatHistory((prev) => [...prev, userMessage]);
    // Clear the user input
    setUserInput('');
    thinking = Status.initSend;
    Apis.chat(reqBody).then((botMessage: string) => {
      if (botMessage === 'ongoing') {
        thinking = Status.ongoing;
        botMessage = '...';
      }
      else if (botMessage.startsWith('cacheHit_')) {
        thinking = Status.cacheHit;
        botMessage = botMessage.slice('cacheHit_'.length, botMessage.length);
      } else {
        thinking = Status.idle;
      }
      setchatHistory((prev) => [...prev, { role: Apis.Role.Assistant, content: botMessage }]);
    }, (e: any) => { thinking = Status.error, alert(JSON.stringify(e)) })
  };

  const handlePrompt = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSystemPrompt(systemPrompt);
  };

  return (
    <div className="chatbot-container">
      {/*
      <div className="sidebar">
        <div className="system-prompt" style={{ textAlign: 'left' }}>
          System prompt:
        </div>

        <form onSubmit={handlePrompt} className="input-form">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={defaultPrompt}
            rows={10}
            cols={150} />
        </form>
      </div>
      */}

      <div className="chat-container">
        <div className='message-line'>
          {(() => {
            switch (thinking) {
              case Status.ongoing:
                return <div className="text-center">正在处理..</div>;
              case Status.initSend:
                return <div className="text-center">努力思考中..</div>;
              case Status.cacheHit:
                return <div className="text-center">缓存命中!</div>;
              case Status.error:
                return <div className="text-center">处理出错!</div>;
              default:
                return undefined;
            }
          })()}
        </div>

        <div className="display-area">
          {chatHistory.map((message: Apis.Message, index) => (
            <div className="pop-wrapper">
              {message.role === Apis.Role.Assistant ?
                <div className="message-line">
                  <div className="icon-background" />
                  <div className="assistant-text-area" style={{ textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: message.content }} />
                </div> :
                <div className="message-line text-right">
                  <div className="text-area">
                    {message.content}
                  </div>
                </div>
              }
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="input-form">
          {/* New financing inputs */}
          <div>
            <input
              type="string"
              value={bankuai}
              onChange={(e) => setBankuai(e.target.value)}
              className="input-box"
              placeholder="板块涨幅"
            />
          </div>

          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            className="input-box"
            placeholder="股票名字"
          />
          { /*
          太占地方
          <select 
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value as Apis.Vendor)}
            className="service-select"
          >
            <option value="siliconflow">SiliconFlow</option>
            <option value="deepseek">DeepSeek</option>
          </select>
          */}
          <button type="submit" className="submit-button">
            Query
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatBot;