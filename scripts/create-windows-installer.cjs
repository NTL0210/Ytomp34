const path = require('path');
const fs = require('fs-extra');
const { createWindowsInstaller } = require('electron-winstaller');
const appPackage = require('../package.json');

async function createInstaller() {
  const workspaceRoot = path.resolve(__dirname, '..');
  const buildRoot = path.join(workspaceRoot, 'build');
  const appDirectory = path.join(buildRoot, 'Ytomp34-win32-x64');
  const outputDirectory = path.join(buildRoot, 'installer');

  if (path.dirname(outputDirectory) !== buildRoot) {
    throw new Error('Installer output must stay inside the build directory');
  }

  if (!fs.existsSync(path.join(appDirectory, 'Ytomp34.exe'))) {
    throw new Error('Packaged Windows app not found. Run npm run build:win first.');
  }

  fs.emptyDirSync(outputDirectory);

  await createWindowsInstaller({
    appDirectory,
    outputDirectory,
    authors: appPackage.author,
    owners: appPackage.author,
    description: appPackage.description,
    version: appPackage.version,
    title: appPackage.productName,
    name: appPackage.name,
    exe: 'Ytomp34.exe',
    setupExe: `Ytomp34-${appPackage.version}-Setup.exe`,
    setupIcon: path.join(workspaceRoot, 'assets', 'icon.ico'),
    iconUrl: 'https://raw.githubusercontent.com/NTL0210/Ytomp34/main/assets/icon.ico',
    noMsi: true
  });

  console.log(`Windows installer created in: ${outputDirectory}`);
}

createInstaller().catch(error => {
  console.error('Windows installer creation failed:', error);
  process.exit(1);
});
