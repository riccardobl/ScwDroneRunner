FROM node:10

COPY package*.json ./
RUN npm ci --only=production
COPY *.js ./

# Configure this
ENV DRONE_URL ci.example.com
ENV DRONE_RPC_SECRET xxxx
ENV DRONE_TOKEN xxx

ENV SCW_ACCESS_KEY xxx
ENV SCW_SECRET_KEY xxx
ENV SCW_ORG xxx
ENV SCW_REGION fr-par-1
#####

# Defaults are ok
ENV BOOTSCRIPT 15fbd2f7-a0f9-412b-8502-6a44da8d98b8
ENV MAGE Ubuntu 20.04 Focal Fossa
ENV IMAGE_ARCH x86_64
ENV INSTANCE_TYPE DEV1-M
ENV TIMEOUT_MINS 480
ENV CONCURRENCY 1

CMD [ "node", "main.js" ]