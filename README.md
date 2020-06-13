# Ondemand Drone Runner provisioner for Scaleway

This script spawns a drone runner instance on scaleway when needed and destroys it when all the builds are complete or after a fixed timeout.


**WARNING** this is a proof of concept yada yada, don't use it in production, you know the drill. Actually this is what i use on my CI configuration, but i didn't put the effort to test it properly, so if you use this and it bills you extra resources/doesn't clean after itself, don't complain to me.

## Usage: Prebuilt image from dockerhub
The script is configured using env variables
```bash
docker run -d 
--read-only \
--name=droneprov \
--restart=always \
-e DRONE_URL="DRONE_CI_URL (without scheme - eg. ci.example.org , not https://ci.example.org (https is always implied))" \
-e DRONE_RPC_SECRET="DRONE_RPC_SECRET" \
-e DRONE_TOKEN="DRONE_PERSONAL_TOKEN" \
-e SCW_ACCESS_KEY="SCALEWAY_ACCESS_KEY" \
-e SCW_SECRET_KEY="SCALEWAY_SECRET_KEY" \
-e SCW_ORG="SCALEWAY_ORGANIZATION_TOKEN" \
-e SCW_REGION="fr-par-1"
riccardoblb/scwdronerunner
```
for the full list, see [Dockerfile](Dockerfile)

## Manual: Build and run (needs bash and nodejs or docker)
1. Rename `run.config.template`  in `run.config.sh`
2. Configure `run.config.sh` with your access tokens
3. Run `./run.sh`
4. ????
5. Profit
