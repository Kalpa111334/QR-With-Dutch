#!/bin/bash

# Install dependencies
npm install

# Run TypeScript compilation
npm run build

# Verify dist directory exists
if [ -d "dist" ]; then
    echo "Build completed successfully!"
else
    echo "Build failed - dist directory not found"
    exit 1
fi 