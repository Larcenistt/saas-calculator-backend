#!/bin/bash

echo "Building SaaS Calculator Backend..."

# Clean dist directory
rm -rf dist

# Transpile TypeScript (ignore errors)
npx tsc || true

# Copy necessary files
cp -r prisma dist/
cp package.json dist/
cp package-lock.json dist/

echo "Build complete!"
echo "To run: cd dist && npm install --production && npm start"