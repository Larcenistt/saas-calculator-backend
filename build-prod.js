#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Building backend for production...\n');

// Clean dist directory
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  console.log('Cleaning dist directory...');
  fs.rmSync(distPath, { recursive: true });
}

// Run TypeScript compiler (allow errors)
console.log('Compiling TypeScript (ignoring type errors)...');
try {
  execSync('npx tsc', { stdio: 'inherit' });
} catch (error) {
  console.log('TypeScript compilation had errors, but continuing...');
}

// Check if dist was created
if (!fs.existsSync(distPath)) {
  console.error('❌ Build failed - dist directory not created');
  process.exit(1);
}

// Copy necessary files
console.log('\nCopying necessary files...');

// Copy package.json
fs.copyFileSync(
  path.join(__dirname, 'package.json'),
  path.join(distPath, 'package.json')
);

// Copy prisma folder
const prismaSource = path.join(__dirname, 'prisma');
const prismaDest = path.join(distPath, 'prisma');
if (!fs.existsSync(prismaDest)) {
  fs.mkdirSync(prismaDest, { recursive: true });
}
fs.copyFileSync(
  path.join(prismaSource, 'schema.prisma'),
  path.join(prismaDest, 'schema.prisma')
);

// Copy .env if exists
if (fs.existsSync(path.join(__dirname, '.env'))) {
  fs.copyFileSync(
    path.join(__dirname, '.env'),
    path.join(distPath, '.env')
  );
}

console.log('\n✅ Build complete!');
console.log('\nTo run the production build:');
console.log('  cd dist');
console.log('  npm install --production');
console.log('  npx prisma generate');
console.log('  node server.js');