import React, { useState } from 'react';
import './app.css';
import * as Apis from '../integration/apis';

const tscodes: any = {
  '宝信软件': '600845.SH',
  '岱美股份': '603730.SH',
  '海尔智家': '600690.SH',
  '华电国际': '600027.SH',
  '平高电气': '600312.SH',
  '三峡能源': '600905.SH',
  '中国船舶': '600150.SH',
  '中国海油': '600938.SH',
  '特变电工': '600089.SH',
  '大华股份': '002236.SZ',
  '比音勒芬': '002832.SZ',
  '桐昆股份': '601233.SH',
  '华阳股份': '600348.SH',
  '山西焦煤': '000983.SZ',
  '中文传媒': '600373.SH',
  '凤凰传媒': '601928.SH',
  '新天然气': '603393.SH',
  '鹏鼎控股': '002938.SZ',
  '燕京啤酒': '000729.SZ',
  '海信家电': '000921.SZ',
  '圆通速递': '600233.SH',
  '国投电力': '600886.SH',
  '招商轮船': '601872.SH',
  '中远海能': '600026.SH',
  '钱江摩托': '000913.SZ',
  '宁波华翔': '002048.SZ',
  '中航西飞': '000768.SZ',
  '葵花药业': '002737.SZ',
  '白云山': '600332.SH',
  '中国重工': '601989.SH',
  '环旭电子': '601231.SH',
  '农业银行': '601288.SH',
  '新希望': '000876.SZ',
  '千禾味业': '603027.SH',
  '中金黄金': '600489.SH',
  '洛阳钼业': '603993.SH',
  '创新新材': '600361.SH'
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
    let tsCode = tscodes[userInput];
    if (!tsCode) {
      alert('股票找球不倒!');
      return;
    }
    const userMessage = { role: Apis.Role.User, content: `${userInput}` };
    const reqBody: Apis.ChatRequest = {
      buy: true,
      systemPrompt,
      tsCode
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
      setchatHistory((prev) => [...prev, {role: Apis.Role.Assistant, content: botMessage}]);
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
              return undefined;}
          })()}
        </div>

        <div className="display-area">
          {chatHistory.map((message: Apis.Message, index) => (
            <div className="pop-wrapper">
              {message.role === Apis.Role.Assistant ?
                <div className="message-line">
                  <div className="icon-background" />
                  <div className="assistant-text-area" style={{ textAlign: 'left' }}>
                    {message.content}
                  </div>
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

        {/* Component 4: Input Box */}
        <form onSubmit={handleSubmit} className="input-form">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            className="input-box"
            placeholder="Your query..."
          />

          {/* Component 5: Submit Button */}
          <button type="submit" className="submit-button">
            Query
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatBot;