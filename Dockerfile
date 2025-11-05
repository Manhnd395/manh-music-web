# Sử dụng image Node.js
FROM node:18

# Tạo thư mục làm việc
WORKDIR /app

# Sao chép package.json và package-lock.json trước để cache deps
COPY package*.json ./

# Cài đặt dependencies (bao gồm vite)
RUN npm install

# Sao chép toàn bộ mã nguồn vào container
COPY . .

# Mở cổng 8080
EXPOSE 8080

# CHẠY VITE TRỰC TIẾP VỚI --host và --force
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "8080", "--force"]