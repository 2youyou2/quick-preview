let Module = require('module');

let originFindPath = Module._findPath;
Module._findPath = function (request, paths, isMain) {
  if (window.qp && qp.nameList) {
    let index = qp.nameList.indexOf(request);
    if (index !== -1) {
      return qp.srcList[index];  
    }
  }
  
  return originFindPath.apply(Module, arguments);
};

let appPaths = Module._nodeModulePaths( _CCSettings.appPath );

let originNodeModulePaths = Module._nodeModulePaths;
Module._nodeModulePaths = function () {
  let paths = originNodeModulePaths.apply(Module, arguments);
  appPaths.forEach(path => {
    if (paths.indexOf(path) === -1) {
      paths.push(path);
    }
  });
  return paths;
};
