FROM node:16-alpine

WORKDIR /opt/application

COPY package*.json ./
RUN npm install --registry=https://registry.npmmirror.com

COPY tsconfig.json ./
COPY src ./src
COPY run.sh ./

RUN npm run build

EXPOSE 8000

CMD ["npm", "run", "serve"]