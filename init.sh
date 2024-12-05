#!/bin/bash

set -e

echo Installing packages....
npm config set registry https://registry.npmjs.org
npm install --force
exec "$@"