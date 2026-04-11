# Known Issues

## electron-builder Code Signing on Windows

### Issue
When running `npm run electron:build:dir` on Windows without administrator privileges, you may encounter:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

### Root Cause
electron-builder downloads winCodeSign tool which contains macOS symbolic links. Windows requires admin privileges or Developer Mode to create symbolic links.

### Solutions

#### Option 1: Enable Developer Mode (Recommended)
1. Open Windows Settings
2. Go to "Update & Security" → "For developers"
3. Enable "Developer Mode"
4. Restart your terminal
5. Run build command again

#### Option 2: Run as Administrator
1. Open PowerShell or CMD as Administrator
2. Navigate to project directory
3. Run `npm run electron:build:dir`

#### Option 3: Use CI/CD
Build on GitHub Actions or other CI/CD platforms which have proper permissions.

#### Option 4: Skip Code Signing (Development Only)
Code signing is already disabled for development builds via:
```json
"electron:build:dir": "cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --dir"
```

The issue persists because electron-builder still tries to download winCodeSign even when signing is disabled. This is a known electron-builder limitation.

### Workaround for Development
For development, you can:
1. Use `npm run electron:dev` to run the app without building
2. Build on a machine with Developer Mode enabled
3. Use the pre-built dist/ folder directly with Electron

### Production Builds
For production builds with proper code signing:
1. Obtain a code signing certificate
2. Configure certificate in electron-builder.yml
3. Build on a machine with proper permissions
4. Or use CI/CD with certificate secrets

## Status
This issue does not affect:
- Development workflow (`npm run electron:dev`)
- TypeScript compilation (`npm run build`)
- Application functionality
- Final production builds (when done with proper setup)

The electron-builder configuration is correct and will work when:
- Developer Mode is enabled, OR
- Running with administrator privileges, OR
- Building on CI/CD with proper permissions
