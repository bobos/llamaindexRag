#!/bin/bash

set -e

# Always execute on exit, even if failure
trap 'docker-compose down' EXIT

docker-compose pull
docker-compose run --service-ports --rm --name example target