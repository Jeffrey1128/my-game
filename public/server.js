const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;
const DATA_PATH = './users.json';

app.use(bodyParser.json());
app.use(express.static('public'));

// 유저 DB 불러오기
let users = {};
if (fs.existsSync(DATA_PATH)) {
  users = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}

// 닉네임 확인
app.post('/login', (req, res) => {
  const { nickname } = req.body;
  if (users[nickname]) {
    res.json({ status: 'exists', user: users[nickname] });
  } else {
    res.json({ status: 'new' });
  }
});

// 새 유저 생성
app.post('/create', (req, res) => {
  const { nickname, role } = req.body;
  users[nickname] = {
    nickname,
    role,
    hp: 100,
    attack: 10,
    skills: {},
    position: { x: 0, y: 0 }
  };
  fs.writeFileSync(DATA_PATH, JSON.stringify(users, null, 2));
  res.json({ status: 'created' });
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
