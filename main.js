'use strict';

const {app, BrowserWindow, ipcMain} = require('electron');
const Path = require('fire-path');
const Url = require('url');
const Jade = require('jade');
const Globby = require('globby');
const Async = require('async');
const Fs = require('fire-fs');

const UuidUtils = require( Editor.url('app://editor/share/editor-utils/uuid-utils') );

const assetPath = Path.join(Editor.projectPath, 'assets');
const tmpScriptPath = Path.join(Editor.projectPath, 'temp/scripts');

let urlPrefix = `http://localhost:${Editor.PreviewServer.previewPort}`;

function generateHtml () {
  let content = Fs.readFileSync(Path.join(__dirname, 'template/index.jade'), 'utf8');
  
  let fn = Jade.compile(content, {
    filename: Path.join(__dirname, 'template'),
    pretty: true
  });

  let libraryPath = `${urlPrefix}/res/import`;
  let rawAssetsBase = `${urlPrefix}/res/raw-`;

  content = fn({
    engine: Editor.url('unpack://engine'),
    settings: `${urlPrefix}/settings.js`,
    socketio: Editor.url('unpack://engine/external/socketio/socket.io.js'),
    libraryPath: libraryPath,
    rawAssetsBase: rawAssetsBase,
    previewScene: `${urlPrefix}/preview-scene.json`,
    appPath: Editor.App.path,
    assetPath: assetPath,
    projectPath: Editor.projectPath
  });

  Fs.writeFileSync(Path.join(__dirname, 'panel/index.html'), content);
}

function generateSrcs () {
  let content = 'var list = [\n';

  let pattern = Path.join(tmpScriptPath, '**/*.js');
  console.log('pattern : ' + pattern);
  Globby.sync(pattern)
    .forEach(path => {
      path = Path.normalize(path);
      content += `  '${path}',\n`;
    }
  );

  content += '];\n\n';
  content += `qp.initSrcList(list);`;

  Fs.writeFileSync(Path.join(__dirname, 'panel/scripts/src.js'), content);
}

function generateContent () {
  generateHtml();
  generateSrcs();
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
    // const Fs = require('fs-extra');

    var footer = "\ncc._RFpop();";
    var newLineFooter = '\n' + footer;

    // read uuid
    getUuidAndScriptName(src, function (uuid, name) {
        var contents = Fs.readFileSync(src, 'utf8');
        var header;
        if (uuid) {
            uuid = UuidUtils.compressUuid(uuid);
            header = `"use strict";\n` +
                     `cc._RFpush(module, '${uuid}', '${name}');\n`;
        }
        else {
            header = `"use strict";\n` +
                     `cc._RFpush(module, '${name}');\n`;
        }
        var endsWithNewLine = (contents[contents.length - 1] === '\n' || contents[contents.length - 1] === '\r');
        contents = header + contents + (endsWithNewLine ? footer : newLineFooter);
       
        Fs.ensureDirSync(Path.dirname(dst));
        Fs.writeFileSync(dst, contents);
    });
}

let win;
function openWindow () {
  if (win) return;

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

  win.once('closed', function () {
      win = null;
  });

  generateContent();
  win.loadURL( url(Path.join(__dirname, 'panel/index.html')) );
}

ipcMain.on('before-unload', function (event) {
  console.log('quick-preview : before-unload');

  generateContent();
  if (win) {
    win.loadURL( url(Path.join(__dirname, 'panel/index.html')) );
  }

  event.returnValue = true;
});

ipcMain.on('generate-src-file', (event, src, dst) => {
  addMetaData(src, dst);
  event.sender.send('generate-src-file-complete', src, dst);
});

ipcMain.on('app:reload-on-device', () => {
  if (win) {
    win.webContents.send('reload-scene');
  //   win.webContents.reloadIgnoringCache();
  }
});

Editor.App.on('quit', function () {
  if (win) {
    win.close();
  }
});

module.exports = {
  load () {
  },

  unload () {
  },

  // register your ipc messages here
  messages: {
    'open' () {
      // open entry panel registered in package.json
      
      openWindow();
    }
  },
};
