'use strict';

// quick preview
window.qp = {
  srcList: [],
  nameList: []
};

const ipcRenderer = require('electron').ipcRenderer;
const Path = require('fire-path');

// init window
window.onbeforeunload = function (e) {
  // const electron = require('electron');
  // electron.ipcRenderer.sendSync('before-unload');
};

window.CC_DEV = true;


// reload
let reloadTimeoutId;
function reload () {
  if (!reloadTimeoutId) {
    reloadTimeoutId = setTimeout(() => {
      window.reloadScene();
      reloadTimeoutId = null;
    }, 100);
  }
}

function unregisterPathClass (path) {
  let name = Path.basenameNoExt(path);
  let cls = cc.js.getClassByName( name );
  if (cls) {
    cc.js.unregisterClass( cls );
  }

  delete require.cache[path];

  cc.js.array.remove(qp.srcList, path);
  cc.js.array.remove(qp.nameList, name);
}

function registerPathClass (path) {
  require(path);

  qp.srcList.push(path);
  qp.nameList.push(Path.basenameNoExt(path));
}

// ipc messages
ipcRenderer.on('generate-src-file-complete', (event, src, dst) => {
  unregisterPathClass(dst);
  registerPathClass(dst);

  reload();
});

ipcRenderer.on('reload-scene', () => {
  reload();
});

// watch asset path
let watcher;
function watch () {
  if (watcher) return;

  const Chokidar = require('chokidar');

  watcher = Chokidar.watch(Path.join(_CCSettings.assetPath, '**/*.js'), {
    ignoreInitial: true
  });
  
  watcher.on('all', (event, path) => {
    let src = path;
    let dst = Path.join(_CCSettings.projectPath, 'temp/scripts/assets', Path.relative(_CCSettings.assetPath, path));

    if (event === 'change') {
      ipcRenderer.send('generate-src-file', src, dst);
    }
    else if (event === 'add') {
      ipcRenderer.send('generate-src-file', src, dst);
    }
    else if (event === 'unlink') {
      unregisterPathClass(dst);
    }
  });
}

qp.initSrcList = function (list) {
  qp.srcList = list;
  qp.nameList = qp.srcList.map(path => {
    return Path.basenameNoExt(path);
  });

  watch();

  qp.srcList.forEach(path => {
    try {
      require(path);
    }
    catch (err) {
      console.error(err.stack);
    }
  });
};
