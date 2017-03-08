let Module = require('module');
let Path = require('path');

function basenameNoExt(path) {
  return Path.basename(path, Path.extname(path) );
}

let originRequire = Module.prototype.require;
Module.prototype.require = function (path) {
  if (path.indexOf('modular-cocos2d-cut') !== -1) {
    return null;
  }
  return originRequire.apply(this, arguments);
};

// reimplement Module._findPath
let originFindPath = Module._findPath;
Module._findPath = function (request, paths, isMain) {
  if (window.qp && qp.modules) {
    let module = qp.modules[request];
    if (module) {
      return module.path;
    }
  }
  
  return originFindPath.apply(Module, arguments);
};

let originLoad = Module._load;
Module._load = function (request, parent, isMain) {
  let exports = originLoad.apply(Module, arguments);

  if (window.qp && qp.modules) {
    let parentName = basenameNoExt(parent.filename);
    let parentModule = qp.modules[parentName];
    if (!parentModule) {
      return exports;
    }

    let filename = Module._resolveFilename(request, parent, isMain);
    let cachedModule = Module._cache[filename];
    let name = basenameNoExt(cachedModule.filename);

    let module = qp.modules[name];
    if (!module) {
      return exports;
    }

    if (module.parents.indexOf(parentModule) === -1) {
      module.parents.push(parentModule);
    }
  }

  return exports;
};

// reimplement Module._nodeModulePaths
let appPaths = Module._nodeModulePaths( _Settings.appPath );
let originResolveLookupPaths = Module._resolveLookupPaths;
Module._resolveLookupPaths = function () {
  let resolvedModule = originResolveLookupPaths.apply(Module, arguments);
  let paths = resolvedModule[1];
  appPaths.forEach(path => {
    if (paths.indexOf(path) === -1) {
      paths.push(path);
    }
  });
  return resolvedModule;
};
