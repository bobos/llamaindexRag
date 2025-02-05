import React, { useState } from 'react';
import './app.css';
import * as Apis from '../integration/apis';

const defaultPrompt = "你是一个经验丰富的A股资深游资, 帮助用户提供谨慎的A股投资建议";
let thinking = false;
const ChatBot: React.FC = () => {
  const [userInput, setUserInput] = useState('');
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
    const userMessage = { role: Apis.Role.User, content: `股票代码: ${userInput}` };
    const reqBody: Apis.ChatRequest = {
      buy: true,
      systemPrompt,
      tsCode: userInput,
    }

    setchatHistory((prev) => [...prev, userMessage]);
    // Clear the user input
    setUserInput('');
    thinking = true;
    Apis.chat(reqBody).then((botMessage: string) => {
      thinking = false;
      setchatHistory((prev) => [...prev, {role: Apis.Role.Assistant, content: botMessage}]);
    }, (e: any) => { alert(JSON.stringify(e)) })
  };

  const handlePrompt = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSystemPrompt(systemPrompt);
  };

  return (
    <div className="chatbot-container">
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

      <div className="chat-container">
        <div className='message-line'>
          {thinking ? <div className="text-center">Almighty LLM is thinking, puny human is instructed to wait..</div> : undefined}
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