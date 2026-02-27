FROM node:18-slim

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Cloud Run default port
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]
