FROM node:20-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

COPY . .

# Diretório de dados (banco SQLite) precisa existir e pertencer ao usuário não-root.
# O volume nomeado herda esta propriedade quando criado vazio.
RUN mkdir -p /app/server/data && chown -R node:node /app

ENV NODE_ENV=production
EXPOSE 3000

# Não rodar como root dentro do container (defesa em profundidade)
USER node

CMD ["node", "server/server.js"]
