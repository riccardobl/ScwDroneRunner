#!/bin/bash
source run.config.sh

if [ "$DOCKER_SERVER" = "" ];
then
    npm i
    node main.js
else
    if [ "$DOCKER_SERVER" != "local" ];
    then
        echo "Connect to $DOCKER_SERVER"
        eval "`docker-machine env $DOCKER_SERVER`"
    fi
    docker build . --tag scwdroneprov 
    docker run -it --rm \
    -e DRONE_URL="${DRONE_URL}" \
    -e DRONE_RPC_SECRET="${DRONE_RPC_SECRET}" \
    -e DRONE_TOKEN="${DRONE_TOKEN}" \
    -e SCW_ACCESS_KEY="${SCW_ACCESS_KEY}" \
    -e SCW_SECRET_KEY="${SCW_SECRET_KEY}" \
    -e SCW_ORG="${SCW_ORG}" \
    -e SCW_REGION="${SCW_REGION}" \
    scwdroneprov
fi

