const packager = require('electron-packager');
const path = require('path');
const fs = require('fs-extra');
const rootPackage = require('./package.json');
const electronPackage = require('electron/package.json');

async function packageApp() {
  try {
    // Prepare app directory
    const appDir = path.join(__dirname, 'app-temp');
    
    // Clean and create temp directory
    if (fs.existsSync(appDir)) {
      fs.removeSync(appDir);
    }
    fs.mkdirSync(appDir);
    
    // Copy necessary files
    console.log('Copying files...');
    
    // Copy only electron and renderer builds, not previous packages
    const distElectron = path.join('dist', 'electron');
    const distRenderer = path.join('dist', 'renderer');
    
    if (fs.existsSync(distElectron)) {
      fs.copySync(distElectron, path.join(appDir, 'dist', 'electron'));
    }
    
    if (fs.existsSync(distRenderer)) {
      fs.copySync(distRenderer, path.join(appDir, 'dist', 'renderer'));
    }
    
    fs.copySync('assets', path.join(appDir, 'assets'));
    
    // Create minimal package.json for the app
    const appPackageJson = {
      name: rootPackage.name,
      productName: rootPackage.productName,
      version: rootPackage.version,
      description: rootPackage.description,
      main: 'dist/electron/main/index.js',
      author: rootPackage.author,
      license: rootPackage.license
    };
    fs.writeFileSync(
      path.join(appDir, 'package.json'),
      JSON.stringify(appPackageJson, null, 2)
    );
    
    console.log('Packaging app...');
    const appPaths = await packager({
      dir: appDir,
      name: 'Ytomp34',
      platform: 'win32',
      arch: 'x64',
      out: 'build',
      overwrite: true,
      icon: path.join(__dirname, 'assets', 'icon.ico'),
      asar: false,  // Disable asar to avoid file lock issues
      appVersion: rootPackage.version,
      buildVersion: rootPackage.version,
      electronVersion: electronPackage.version,
      appBundleId: 'com.ytomp34.app',
      win32metadata: {
        CompanyName: rootPackage.author,
        FileDescription: rootPackage.description,
        ProductName: 'Ytomp34',
        InternalName: 'Ytomp34'
      },
      tmpdir: path.join(__dirname, 'tmp-build')  // Use local temp dir
    });
    
    // Clean up temp directory
    fs.removeSync(appDir);
    
    console.log(`\nApp packaged successfully to: ${appPaths[0]}`);
  } catch (err) {
    console.error('Packaging failed:', err);
    process.exit(1);
  }
}

packageApp();
