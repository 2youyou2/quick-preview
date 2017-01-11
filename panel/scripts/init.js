'use strict';

const ipcRenderer = require('electron').ipcRenderer;
const Path = require('fire-path');
const Globby = require('globby');

// reload
let errorList = [];
let reloadTimeoutId;
function reload () {
  if (!reloadTimeoutId) {
    reloadTimeoutId = setTimeout(() => {
      if (errorList.length === 0) {
        window.reloadScene();
      }
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
  delete qp.modules[name];
}

function registerPathClass (path) {
  let module = qp._addModule(path);

  try {
    module.module = require(path);
    cc.js.array.remove(errorList, path);
  }
  catch(err) {
    errorList.push(path);
    unregisterPathClass(path);
    console.error(err);
  } 
}

function reregisterParentModules (module) {
  if (!module) return;

  for (let i = 0; i < module.parents.length; i++) {
    let parentModule = module.parents[i];
    let parentPath = parentModule.path;
    unregisterPathClass(parentPath);
    registerPathClass(parentPath);

    reregisterParentModules(parentModule);
  }
}

// ipc messages
ipcRenderer.on('generate-src-file-complete', (event, src, dst) => {
  let name = Path.basenameNoExt(dst);
  let module = qp.modules[name];

  unregisterPathClass(dst);
  registerPathClass(dst);

  reregisterParentModules(module);

  reload();
});

ipcRenderer.on('reload-scene', () => {
  reload();
});


let watcher;

// quick preview
window.qp = {
  modules: {},
  
  _updateModules: function (cb) {
    let pattern = Path.join(_CCSettings.tmpScriptPath, '**/*.js');

    Globby.sync(pattern)
      .forEach(path => {
        path = Path.normalize(path);
        this._addModule(path);
      }
    );
  },

  _addModule: function (path) {
    let name = Path.basenameNoExt(path);
    let module = this.modules[name];
    if (!module) {
      module = this.modules[name] = {
        name: name,
        path: path,
        parents: []
      };
    }

    return module;
  },

  _watch: function () {
    if (watcher) return;

    const Chokidar = require('chokidar');

    watcher = Chokidar.watch(Path.join(_CCSettings.assetPath, '**/*.js'), {
      ignoreInitial: true
    });
    
    watcher.on('all', (event, path) => {
      let src = path;
      let dst = Path.join(_CCSettings.tmpScriptPath, 'assets', Path.relative(_CCSettings.assetPath, path));

      if (event === 'change') {
        ipcRenderer.send('generate-src-file', src, dst);
      }
      else if (event === 'add') {
        qp._updateModules();
        ipcRenderer.send('generate-src-file', src, dst);
      }
      else if (event === 'unlink') {
        unregisterPathClass(dst);
      }
    });
  },

  _init: function () {
    qp._updateModules();

    for (let name in this.modules) {
      registerPathClass(this.modules[name].path);
    }

    qp._watch();
  },

  _moduleStack: [],
  _RFpush: function (module) {
    let stack = this._moduleStack;
    if (stack.length > 0) {
      module.ccParent = stack[stack.length - 1];
    }
    stack.push(module);

    cc._RFpush.apply(cc._RFpush, arguments);
  },

  _RFpop: function (module) {
    this._moduleStack.pop();

    cc._RFpop.apply(cc._RFpush, arguments);
  }
};

qp._init();
