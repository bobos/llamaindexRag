const axios = require('axios');

let config = {
  method: 'get',
maxBodyLength: Infinity,
  url: 'https://api.deepseek.com/user/balance',
  headers: { 
    'Accept': 'application/json', 
    'Authorization': 'Bearer sk-42ddf29b6b3c4df3a2df6ba089f9eb58'
  }
};

axios(config)
.then((response) => {
  console.log(JSON.stringify(response.data));
})
.catch((error) => {
  console.log(error);
})
