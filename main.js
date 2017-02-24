'use strict';

const {app, BrowserWindow, ipcMain} = require('electron');
const Path = require('fire-path');
const Url = require('url');
const Jade = require('jade');
const Globby = require('globby');
const Fs = require('fire-fs');
const Del = require('del');

const UuidUtils = require( Editor.url('app://editor/share/editor-utils/uuid-utils') );

const assetPath = Path.join(Editor.projectPath, 'assets').replace(/\\/g, '/');
const tmpScriptPath = Path.join(Editor.projectPath, 'temp/qp-scripts').replace(/\\/g, '/');


function generateHtml () {
  let content = Fs.readFileSync(Path.join(__dirname, 'template/index.jade'), 'utf8');
  
  let fn = Jade.compile(content, {
    filename: Path.join(__dirname, 'template'),
    pretty: true
  });

  let urlPrefix = `http://localhost:${Editor.PreviewServer.previewPort}`;

  let libraryPath = `${urlPrefix}/res/import`;
  let rawAssetsBase = `${urlPrefix}/res/raw-`;

  content = fn({
    engine: Editor.url('unpack://engine').replace(/\\/g, '/'),
    settings: `${urlPrefix}/settings.js`,
    libraryPath: libraryPath,
    rawAssetsBase: rawAssetsBase,
    previewScene: `${urlPrefix}/preview-scene.json`,
    appPath: Editor.App.path.replace(/\\/g, '/'),
    assetPath: assetPath,
    projectPath: Editor.projectPath.replace(/\\/g, '/'),
    tmpScriptPath: tmpScriptPath
  });

  Fs.writeFileSync(Path.join(__dirname, 'panel/index.html'), content);
}

function generateContent () {
  generateHtml();
  generateSrcFiles();
}

function url (path) {
  return Url.format({
    pathname: path,
    protocol: 'file:',
    slashes: true
  });
}

function getUuidAndScriptName (path, callback) {
    var name = Path.basenameNoExt(path);
    var uuid = Editor.assetdb.fspathToUuid(path);
    return callback(uuid || '', name);
}

function addMetaData (src, dst) {
    var footer = "\nqp._RFpop();";
    var newLineFooter = '\n' + footer;

    // read uuid
    getUuidAndScriptName(src, function (uuid, name) {
        var contents = Fs.readFileSync(src, 'utf8');
        var header;
        if (uuid) {
            uuid = UuidUtils.compressUuid(uuid);
            header = `"use strict";` +
                     `qp._RFpush(module, '${uuid}', '${name}');`;
        }
        else {
            header = `"use strict";` +
                     `qp._RFpush(module, '${name}');`;
        }
        var endsWithNewLine = (contents[contents.length - 1] === '\n' || contents[contents.length - 1] === '\r');
        contents = header + contents + (endsWithNewLine ? footer : newLineFooter);
       
        Fs.ensureDirSync(Path.dirname(dst));
        Fs.writeFileSync(dst, contents);
    });
}

function generateSrcFiles () {
  Del.sync(tmpScriptPath, {force: true});
  let pattern = Path.join(assetPath, '**/*.js');

  Globby.sync(pattern)
    .forEach(path => {
      path = Path.normalize(path);
      let dst = Path.join(tmpScriptPath, 'assets', Path.relative(assetPath, path));
      addMetaData(path, dst);
    }
  );
}

let win;
function openWindow () {
  if (win) {
    win.focus();
    return;
  }

  win = new BrowserWindow({
    x: 100,
    y: 100,
    width: 960,
    height: 640,
    minWidth: 400,
    minHeight: 300,

    webPreferences: {
      devTools: true
    }
  });

  win.webContents.openDevTools();

  win.once('closed', function () {
      win = null;
  });

  generateContent();
  win.loadURL( url(Path.join(__dirname, 'panel/index.html')) );
}

ipcMain.on('generate-src-file', (event, src, dst) => {
  addMetaData(src, dst);
  event.sender.send('generate-src-file-complete', src, dst);
});

ipcMain.on('app:reload-on-device', () => {
  if (win) {
    win.webContents.send('reload-scene');
  }
});

Editor.App.on('quit', function () {
  if (win) {
    win.close();
  }
});

module.exports = {
  load () {
    Editor.Metrics.trackEvent({
      category: 'Packages',
      label: 'quick-preview',
      action: 'Panel Load'
    }, null);
  },

  unload () {
  },

  messages: {
    'open' () {
      openWindow();

      Editor.Metrics.trackEvent({
        category: 'Packages',
        label: 'quick-preview',
        action: 'Panel Open'
      }, null);
    },
    'reload' () {
      if (win) {
        win.loadURL( url(Path.join(__dirname, 'panel/index.html')) );
      }
    }
  },
};
