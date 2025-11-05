const express = require('express');
const path = require('path');
const app = express();

// ---- 1. Định tuyến cho các trang HTML cụ thể (Ưu tiên cao) ----
// Các route này PHẢI nằm trên express.static để được ưu tiên xử lý,
// ngăn việc express.static tự động phục vụ index.html.

app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  console.log('Hit / route, serving:', filePath);
  res.sendFile(filePath, (err) => {
    if (err) console.error('Error serving /:', err.message);
  });
});

app.get('/index', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  console.log('Hit /index route, serving:', filePath);
  res.sendFile(filePath, (err) => {
    if (err) console.error('Error serving /index:', err.message);
  });
});

app.get('/signup', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'signup.html');
  console.log('Hit /signup route, serving:', filePath);
  res.sendFile(filePath, (err) => {
    if (err) console.error('Error serving /signup:', err.message);
  });
});

app.get('/player', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'player.html');
  console.log('Hit /player route, serving:', filePath);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error serving /player:', err.message);
      res.status(404).send('404 File Not Found');  // Không fallback index
    }
  });
});

// ---- 2. Phục vụ các thư mục tĩnh (Đặt sau HTML routes) ----
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ---- 3. Route Fallback: Trả về 404 Not Found (Luôn nằm cuối cùng) ----
app.use((req, res) => {
  console.log('Fallback hit for path:', req.path);
  res.status(404).send('404 Not Found');  // Không send index
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
  console.log(`Các route có sẵn: /, /index, /signup, /player`);
});