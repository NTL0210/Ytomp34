const path = require('path');
const fs = require('fs-extra');

const workspaceRoot = path.resolve(__dirname, '..');
const buildRoot = path.resolve(workspaceRoot, 'build');
const outputDirectory = path.resolve(buildRoot, 'installer');

if (path.dirname(outputDirectory) !== buildRoot) {
  throw new Error('Installer cleanup target must stay inside the build directory');
}

fs.emptyDirSync(outputDirectory);
console.log(`Cleaned installer output: ${outputDirectory}`);
