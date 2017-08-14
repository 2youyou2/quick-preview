'use strict';

const {app, BrowserWindow, ipcMain} = require('electron');
const Path = require('fire-path');
const Url = require('url');
const Jade = require('jade');
const Globby = require('globby');
const Fs = require('fire-fs');
const Del = require('del');
const Async = require('async');

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

function generateContent (cb) {
  generateHtml();
  generateSrcFiles(cb);
}

function url (path) {
  return Url.format({
    pathname: path,
    protocol: 'file:',
    slashes: true
  });
}

let compiledJsMap = {};

function transformJs (src, dest, uuid, reimportScript, time, cb) {
  let meta = Editor.assetdb.loadMetaByUuid(uuid);

  if (!meta) {
    return cb(new Error(`load meta for [${src}] failed`));
  }

  function copyDests (cb) {
    let dstDir = Path.dirname(dest);

    if (meta.isPlugin) {
      Fs.copySync(src, dest);
      return cb();
    }

    let dests = [
      Editor.assetdb._uuidToImportPathNoExt( meta.uuid ) + '.js',
      Editor.assetdb._uuidToImportPathNoExt( meta.uuid ) + '.js.map'
    ];

    dests.forEach(importPath => {
      let basenameNoExt = Path.basenameNoExt(src);
      let extname = Path.extname(src);

      let importBasename = Path.basename(importPath);
      let importExtname = importBasename.substr(importBasename.indexOf('.'), importBasename.length);

      if (importExtname === '.js.map') {
        dest = Path.join(dstDir, `${basenameNoExt}-${time}.js.map`);
        let contents = JSON.parse( Fs.readFileSync(importPath, 'utf8') );
        
        contents.sources = [`${basenameNoExt}-${time}${extname}`];
        contents = JSON.stringify(contents);

        Fs.writeFileSync(dest, contents);
      }
      else {
        dest = Path.join(dstDir, basenameNoExt + importExtname);
        Fs.copySync( importPath,  dest );
      }
    });

    cb();
  }

  if (!reimportScript) {
    copyDests( cb );
  }
  else {
    meta.import(src, (err) => {
      if (err) return cb(err);
      copyDests( cb );
    });
  }
}

function addMetaData (src, dst, reimportScript, cb) {
    let name = Path.basenameNoExt(dst);
    let uuid = Editor.assetdb.fspathToUuid(src) || '';

    if (!compiledJsMap[src]) {
      compiledJsMap[src] = 1;
    }
    let time = compiledJsMap[src]++;

    transformJs(src, dst, uuid, reimportScript, time, (err) => {
      if (err) return cb(err);

      let contents = Fs.readFileSync(dst, 'utf8');
      let header;
      if (uuid) {
          uuid = UuidUtils.compressUuid(uuid);
          header = `"use strict";` +
                   `qp._RFpush(module, '${uuid}', '${name}');`;
      }
      else {
          header = `"use strict";` +
                   `qp._RFpush(module, '${name}');`;
      }
      let endsWithNewLine = (contents[contents.length - 1] === '\n' || contents[contents.length - 1] === '\r');

      let footer = "\nqp._RFpop();";
      footer += `\n//# sourceMappingURL=${Path.basenameNoExt(dst)}-${time}.js.map`;

      // let mapPath = dst + '.map';
      // if (Fs.existsSync(mapPath)) {
      //   let json = Fs.readFileSync(mapPath, 'utf8');

      //   let convert = require('convert-source-map');
      //   let mapping = convert.fromJSON(json)
      //     .setProperty('sources', [`${Path.basenameNoExt(src)}-${time}${Path.extname(src)}`])
      //     .toComment();

      //   footer += mapping;
      // }

      let newLineFooter = '\n' + footer;
      contents = header + contents + (endsWithNewLine ? footer : newLineFooter);
     
      Fs.ensureDirSync(Path.dirname(dst));
      Fs.writeFileSync(dst, contents);

      cb ();
    });
}

function generateSrcFiles (cb) {
  Del.sync(tmpScriptPath, {force: true});

  let pattern = require('./types').map(extname => {
    return Path.join(assetPath, '**/*' + extname);
  });

  Globby(pattern, (err, paths) => {
    Async.forEach(paths, (path, done) => {
      path = Path.normalize(path);
      let dst = Path.join(tmpScriptPath, 'assets', Path.relative(assetPath, path));
      dst = Path.join(Path.dirname(dst), Path.basenameNoExt(dst) + '.js');
      addMetaData(path, dst, false, done);
    }, err => {
      if (err) Editor.error(err);
      cb ();
    });
  });
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

  generateContent(() => {
    win.loadURL( url(Path.join(__dirname, 'panel/index.html')) );
  });
}

Editor.App.on('quit', function () {
  if (win) {
    win.close();
  }
});

function onGenerateSrcFile (event, src, dst) {
  addMetaData(src, dst, true, (err) => {
    if (err) Editor.error(err);
    event.sender.send('generate-src-file-complete', src, dst);
  });
}

function onAppReloadOnDevice () {
  if (win) {
    win.webContents.send('reload-scene');
  }
}

module.exports = {
  load () {
    Editor.Metrics.trackEvent({
      category: 'Packages',
      label: 'quick-preview',
      action: 'Panel Load'
    }, null);

    ipcMain.on('generate-src-file', onGenerateSrcFile);
    ipcMain.on('app:reload-on-device', onAppReloadOnDevice);
  },

  unload () {
    ipcMain.removeListener('generate-src-file', onGenerateSrcFile);
    ipcMain.removeListener('app:reload-on-device', onAppReloadOnDevice);
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
