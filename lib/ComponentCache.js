
/**     @module doczar.ComponentCache
*/

var path = require ('path');
var async = require ('async');
var mkdirp = require ('mkdirp');
var fs = require ('fs-extra');
var Component = require ('./Component');
var Patterns = require ('./Patterns');

var concatArrs = function(){
    var out = [];
    for (var i in arguments)
        out.push.apply (out, arguments[i]);
    return out;
};
var isArr = function (a) {
    return a.__proto__ === Array.prototype;
};

module.exports = function(){
    var Cache = {};

    var root = { property:{} };
    var getComponent = function (tpath) {
        console.log ('get '+JSON.stringify (tpath));
        var pointer = root;
        for (var i in tpath) {
            var step = tpath[i];
            var fragCType = Patterns.delimiters[step[0]];
            var location = pointer[fragCType];
            var fragName = step[1] || '';
            if (isArr (location))
                if (step[1] && Object.hasOwnProperty.call (pointer[fragCType+'ByName'], step[1]))
                    pointer = pointer[fragCType+'ByName'][step[1]];
                else {
                    location.push (pointer = new Component (Cache, tpath.slice (0, i+1), pointer));
                    console.log (location.length);
                    if (fragName)
                        pointer[fragCType+'ByName'][fragName] = pointer;
                }
            else if (Object.hasOwnProperty.call (location, fragName))
                pointer = location[fragName];
            else
                pointer = location[fragName] = new Component (Cache, tpath.slice (0, i+1), pointer);
        }
        return pointer;
    };

    Cache.submit = function (tpath, info) {
        var pointer = getComponent (tpath);
        pointer.submit (info);
    };

    Cache.finalize = function (options, callback) {
        var errors = [];
        var warnings = [];
        async.each (Object.keys (root.property), function (propname, callback) {
            root.property[propname].finalize (errors, warnings, options, callback);
        }, function(){
            callback (errors, warnings);
        });
    };

    Cache.writeFiles = function (basedir, options, callback) {
        var rootdir = path.join (basedir, 'root');
        mkdirp (rootdir, function (err) {
            if (err) return callback (err);

            var indexSourcePath = path.join (
                path.resolve (path.dirname (module.filename), '../'),
                'indexFiles'
            );
            async.each ([
                'index.html',
                'index.css',
                'index.js',
                'unknown.html',
            ], function (fnameToCopy, callback) {
                fs.copy (
                    path.join (indexSourcePath, fnameToCopy),
                    path.join (basedir, fnameToCopy),
                    callback
                );
            }, function (err) {
                if (err)
                    return callback (err);

                fs.copy (
                    path.join (
                        path.resolve (path.dirname (module.filename), '../'),
                        'node_modules',
                        'highlight.js',
                        'styles',
                        options.codeStyle + '.css'
                    ),
                    path.join (basedir, 'highlight.css'),
                    function (err) {
                        if (err)
                            return callback (err);
                        basedir = rootdir;
                        async.each (Object.keys (root.property), function (propname, callback) {
                            var prop = root.property[propname];
                            if (
                                ( options.showAPI && ( prop.isAPI || prop.hasAPI ))
                             || ( !options.showAPI && ( options.showDev || !prop.isDev ) )
                            )
                                root.property[propname].writeFiles (
                                    path.join (rootdir, propname),
                                    '../../',
                                    callback
                                );
                            else return callback();
                        }, callback);
                    }
                );
            });
        });
    };

    Cache.getRelativeURLForType = function (start, type) {
        if (!type || !type.length) return '#';
        var sameFromRoot = 0;
        for (var i in start)
            if (start[i][0] == type[i][0] && start[i][1] == type[i][1])
                sameFromRoot++;
            else break;

        var str = '';
        var pointer = root;
        for (var i=0, j=start.length-sameFromRoot-1; i<j; i++) {
            try {
                pointer = pointer[Patterns.delimiters[type[i][0]||'.']][type[i][1]];
            } catch (err) {
                // not found!
                var errstr = '';
                for (var i=start.length-1; i>0; i--)
                    errstr += '../../';
                var typestr = '';
                for (var i in type)
                    typestr += type[i][0] + type[i][1];
                return errstr + 'unknown.html?type=' + typestr;
            }
            str += '../../';
        }

        // the root is structured a little differently
        if (!sameFromRoot) str = str.slice (3);

        for (var i=sameFromRoot, j=type.length; i<j; i++) {
            try {
                pointer = pointer[Patterns.delimiters[type[i][0]||'.']][type[i][1]];
            } catch (err) {
                // not found!
                var errstr = '';
                for (var i=start.length; i; i--)
                    errstr += '../../';
                var typestr = '';
                for (var i in type)
                    typestr += Patterns.delimiters[type[i][0]||'.'] + type[i][1];
                return errstr.slice (3) + 'unknown.html?type=' + typestr;
            }
            var frag = type[i];
            str += Patterns.delimiters[frag[0]||'.'] + '/';
            if (frag[1])
                str += frag[1] + '/';
        }
        return str + 'index.html';
    };

    return Cache;
};
