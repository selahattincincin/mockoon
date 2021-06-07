import axios from 'axios';
import { spawn } from 'child_process';
import { app, BrowserWindow, shell } from 'electron';
import { error as logError, info as logInfo } from 'electron-log';
import { createWriteStream, promises as fsPromises } from 'fs';
import { join as pathJoin } from 'path';
import { gt as semverGt } from 'semver';
import { pipeline } from 'stream';
import { promisify } from 'util';

declare const appVersion: string;
const userDataPath = app.getPath('userData');
let updateAvailableVersion: string;

export const checkForUpdate = async (mainWindow: BrowserWindow) => {
  const streamPipeline = promisify(pipeline);
  const githubLatestReleaseUrl =
    'https://api.github.com/repos/mockoon/mockoon/releases/latest';
  const githubBinaryDownloadUrl =
    'https://github.com/mockoon/mockoon/releases/download/';
  let releaseResponse;

  try {
    // try to remove existing old update
    await fsPromises.unlink(
      pathJoin(userDataPath, `mockoon.setup.${appVersion}.exe`)
    );
    logInfo('[MAIN][UPDATE]Removed old update file');
  } catch (error) {}

  try {
    releaseResponse = await axios.get(githubLatestReleaseUrl);
  } catch (error) {
    logError(`[MAIN][UPDATE]Error while checking for update: ${error.message}`);

    return;
  }

  const latestVersion = releaseResponse.data.tag_name.replace('v', '');

  if (semverGt(latestVersion, appVersion)) {
    logInfo(`[MAIN][UPDATE]Found a new version v${latestVersion}`);

    if (process.platform === 'win32') {
      const binaryFilename = `mockoon.setup.${latestVersion}.exe`;
      const updateFilePath = pathJoin(userDataPath, binaryFilename);

      try {
        await fsPromises.access(updateFilePath);
        logInfo('[MAIN][UPDATE]Binary file already downloaded');
        mainWindow.webContents.send('APP_UPDATE_AVAILABLE');
        updateAvailableVersion = latestVersion;

        return;
      } catch (error) {}

      logInfo('[MAIN][UPDATE]Downloading binary file');

      try {
        const response = await axios.get(
          `${githubBinaryDownloadUrl}v${latestVersion}/${binaryFilename}`,
          { responseType: 'stream' }
        );
        await streamPipeline(response.data, createWriteStream(updateFilePath));
        logInfo('[MAIN][UPDATE]Binary file ready');
        mainWindow.webContents.send('APP_UPDATE_AVAILABLE');
        updateAvailableVersion = latestVersion;
      } catch (error) {
        logError(
          `[MAIN][UPDATE]Error while downloading the binary: ${error.message}`
        );
      }
    } else {
      mainWindow.webContents.send('APP_UPDATE_AVAILABLE');
      updateAvailableVersion = latestVersion;
    }
  } else {
    logInfo('[MAIN][UPDATE]Application is up to date');
  }
};

export const applyUpdate = () => {
  if (updateAvailableVersion) {
    if (process.platform === 'win32') {
      spawn(
        pathJoin(userDataPath, `mockoon.setup.${updateAvailableVersion}.exe`),
        ['--updated'],
        {
          detached: true,
          stdio: 'ignore'
        }
      ).unref();

      app.quit();
    } else if (process.platform === 'darwin' || process.platform === 'linux') {
      shell.openExternal('https://mockoon.com/download');
    }
  }
};
