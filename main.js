const Drone = require('drone-node')
const Crypto = require('crypto');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const RUNNER_TAG="cirunner";
const PRUNE_INTERVAL=1000*10*60 ;
const PROVISION_INTERVAL=60*1000;

function newSettings(){
    const sett= {
        DRONE_URL:"",
        DRONE_RPC_SECRET:"",
        DRONE_TOKEN:"",
        SCW_REGION:"fr-par-1",
        SCW_ACCESS_KEY:"",
        SCW_SECRET_KEY:"",
        SCW_ORG:"",
        TAGS:[],
        TIMEOUT_MINS:480,
        CONCURRENCY:1,
        INSTANCE_TYPE:"DEV1-M",
        BOOTSCRIPT:"15fbd2f7-a0f9-412b-8502-6a44da8d98b8",
        IMAGE:"Ubuntu 20.04 Focal Fossa",
        IMAGE_ARCH:"x86_64",
        CLOUD_INIT:`#!/bin/bash
export DEBIAN_FRONTEND=noninteractive
echo {INSTANCE_TYPE}
apt-get update -y 
apt-get install -y  apt-transport-https ca-certificates   curl   gnupg-agent   software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu   $(lsb_release -cs) stable"
apt-get update -y 
apt-get install -y docker-ce docker-ce-cli containerd.io
docker pull drone/drone-runner-docker:1
docker run -d \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e DRONE_RPC_PROTO=https \
  -e DRONE_RPC_HOST={DRONE_URL} \
  -e DRONE_RPC_SECRET={DRONE_RPC_SECRET}\
  -e DRONE_RUNNER_CAPACITY={CONCURRENCY} \
  -e DRONE_RUNNER_NAME=runner{HASH} \
  -p 3000:3000 \
  --restart always \
  --name runner \
  drone/drone-runner-docker:1
shutdown -h {TIMEOUT_MINS} 
( while [ true ]; do sleep 30m; if [ "$(docker ps -q | wc -l)" = "1" ]; then shutdown -h 0 ; fi;  done )&
    `,
        COMPILED_CLOUD_INIT:"",
        COMPILED_TAGS:[],
        HASH:"nohash"
    };
    for(let k in sett){
        if(process.env[k]){
            console.log("Get",k,"from env vars");
            sett[k]=process.env[k];
        }
    }
    return sett;

}


function compileSettings(settings){

    if( settings.COMPILED_CLOUD_INIT==""){
        let init=settings.CLOUD_INIT;
        settings.HASH="{HASH}";
        for(let k in settings){
            if(k.startsWith("SCW_"))continue;
            init=init.replace(new RegExp("\{"+k+"\}","g"),settings[k]);
        }
        settings.HASH=Crypto.createHash('sha1').update(init).digest("hex");
        init=init.replace(/\{HASH\}/g,settings.HASH);
        settings.COMPILED_CLOUD_INIT=init;
    }

    settings.COMPILED_TAGS=[];
    for(let i in settings.TAGS){
        settings.COMPILED_TAGS.push(settings.TAGS[i]);
    }
    settings.COMPILED_TAGS.push(settings.HASH);
    settings.COMPILED_TAGS.push(RUNNER_TAG);        


}


function getTags(settings){
    compileSettings(settings);
    return settings.COMPILED_TAGS;
}

function getCloudInit(settings){
    compileSettings(settings);
    return settings.COMPILED_CLOUD_INIT;
}

// function getHash(settings){
//     compileSettings(settings);
//     return settings.HASH;
// }


async function scwAction(token,region,action,reqType,body,contentType){
    if(!contentType)contentType= 'application/json';
    const url="https://api.scaleway.com/instance/v1/zones/"+region+"/"+action;
    console.log("Fetch",url,"\nmethod",reqType);
    return await fetch(url,{
        method: reqType,
        headers:{
            "X-Auth-Token":token,
            'Accept': 'application/json',
            'Content-Type': contentType
        },
        body: body?(contentType=='application/json' ? JSON.stringify(body):body):undefined
    }).then(res =>{
        if(contentType=='application/json')return       res.json()
        else return res.text();
    });
}

async function listServers(token,region,tags,statusCheck){
    const out=[];
    try{
        let servers = await scwAction(token,region,"servers","GET");
        if(!servers||!servers.servers){
            console.error("Can't get server");
            return;
        }
        servers=servers.servers;

        for(let i in servers){
            const server=servers[i];

            if(!statusCheck(server.state))continue
            
            const serverTags=server.tags;
            if(!serverTags.includes(RUNNER_TAG))continue;
            if(tags.length>0&&!tags.every(v=>serverTags.includes(v) ))continue;
            out.push(server);

        }
    }catch(e){
        console.error(e);
    }
    return out;

}


async function pruneServers(){
    try{
        const settings=newSettings();
        let servers= await listServers(settings.SCW_SECRET_KEY,"fr-par-1",[],(e)=>e=="stopped in place"||e=="stopped");
        servers=servers.concat( await listServers(settings.SCW_SECRET_KEY,"nl-ams-1",[],(e)=>e=="stopped in place"||e=="stopped"));
        for(let i in servers){
            const server=servers[i];
            console.log("Delete",server.id);
            console.log(await scwAction(settings.SCW_SECRET_KEY,server.zone,"servers/"+server.id+"/action","POST",{action:"terminate"}));
        }
    }catch(e){
        console.error("Error ",e);
    }
}


async function provisionServers(){
    try{
        const settings=newSettings();
        const client = new Drone.Client({
            url: "https://"+settings.DRONE_URL,
            token: settings.DRONE_TOKEN
        });


        const repos=(await client.getRepos()).data;
        
        let pendingBuilds=0;
        for(let i in repos){
            const repo=repos[i];
            if(!repo.active)continue;
            const builds=(await   client.getBuilds(repo.namespace,repo.name)).data;
            for(let j in builds){
                const build=builds[j];
                if(build.status=="pending")pendingBuilds++;
            }
        }

        console.log(pendingBuilds,"pending builds");

        if(pendingBuilds > 0){
            compileSettings(settings);
            const serverTags=getTags(settings);
            console.log(serverTags);
            const matchingServers=await listServers(settings.SCW_SECRET_KEY,settings.SCW_REGION,serverTags,(e)=>e!="stopped in place");
            if(matchingServers.length==0){
                console.log("Find image");
                const images=(await scwAction(settings.SCW_SECRET_KEY,settings.SCW_REGION,
                    "images"
                    +"?name="+settings.IMAGE
                    +"&arch="+settings.IMAGE_ARCH
                    +"&public=true"
                    ,"GET"
                ));
       
                console.log("Use image",images.images[0].id)
                console.log("Provision");
                const resp=(await scwAction(settings.SCW_SECRET_KEY,settings.SCW_REGION,"servers/","POST",{
                    name:"runner-ci-"+uuidv4(),
                    dynamic_ip_required: true,
                    image:images.images[0].id,
                    bootscript: settings.BOOTSCRIPT,
                    boot_type:"bootscript",
                    tags:serverTags,
                    organization:settings.SCW_ORG,
                    commercial_type: settings.INSTANCE_TYPE
                }));
                console.log(resp);
                const serverId=resp.server.id;
                console.log(await scwAction(settings.SCW_SECRET_KEY,settings.SCW_REGION,"servers/"+serverId+"/user_data/cloud-init","PATCH",getCloudInit(settings)  ,"text/plain"   ) );
                console.log(await scwAction(settings.SCW_SECRET_KEY,settings.SCW_REGION,"servers/"+serverId+"/action","POST",{action:"poweron"}));

            }        
        }
    }catch(e){
        console.error("Error ",e);
    }
}

setInterval(function(){
    provisionServers();    
},PROVISION_INTERVAL);

setInterval(function(){
    pruneServers();
},PRUNE_INTERVAL);


process.once('SIGINT', function (code) {
    console.log('SIGINT received...');
    process.exit();
});
