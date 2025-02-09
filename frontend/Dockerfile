# Use official Node.js image
FROM node:18

# Set working directory
WORKDIR /app

# Copy frontend files
COPY package.json ./
RUN npm install

# Copy all frontend code
COPY . .

# Expose frontend port
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
