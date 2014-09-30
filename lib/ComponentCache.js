
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
    var cleverRoot = {};
    var cleverDepth = {};

    var getComponent = function (tpath) {
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
                    var newComponent = new Component (Cache, tpath.slice (0, i+1), pointer);
                    location.push (newComponent);
                    if (fragName)
                        pointer[fragCType+'ByName'][fragName] = newComponent;
                    pointer = newComponent;
                }
            else if (Object.hasOwnProperty.call (location, fragName))
                pointer = location[fragName];
            else
                pointer = location[fragName] = new Component (Cache, tpath.slice (0, i+1), pointer);
        }

        // process clever root management
        var name = tpath[tpath.length-1][1];
        if (!Object.hasOwnProperty (cleverRoot, name)) {
            cleverRoot[name] = pointer;
            cleverDepth[name] = tpath.length;
        } else if (cleverDepth[name] > tpath.length) {
            cleverRoot[name] = pointer;
            cleverDepth[name] = tpath.length;
        }

        return pointer;
    };

    Cache.resolve = function (tpath) {
        if (!tpath || !tpath.length)
            throw new Error ('invalid');

        var rootName = tpath[0][1];
        var pointer;
        if (Object.hasOwnProperty.call (root.property, rootName)) // naturally rooted
            pointer = root;
        else if (!Object.hasOwnProperty.call (cleverRoot, rootName))
            throw new Error ('not found');
        else
            pointer = cleverRoot[rootName];

        for (var i in tpath.slice (1)) {
            var step = tpath[i];
            var stepCType = Patterns.delimiters[step[0]];
            var location = pointer[stepCType];
            var fragName = step[1] || '';
            if (isArr (location))
                if (step[1] && Object.hasOwnProperty.call (pointer[stepCType+'ByName'], step[1]))
                    pointer = pointer[stepCType+'ByName'][step[1]];
                else
                    throw new Error ('not found');
            else if (Object.hasOwnProperty.call (location, fragName))
                pointer = location[fragName];
            else
                throw new Error ('not found');
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
        try {
            for (var i in start)
                if (
                    type[i]
                 && (
                        !start[i][0]
                     || !type[i][0]
                     || (
                            start[i][0] == type[i][0]
                         && start[i][1] == type[i][1]
                        )
                    )
                )
                    sameFromRoot++;
                else
                    break;
        } catch (err) {
            return '#';
        }

        // advance a pointer to ensure existence of the type
        var str = '';
        var pointer = root;
        for (var i=0; i<sameFromRoot; i++) {
            try {
                var location = pointer[Patterns.delimiters[type[i][0]||'.']];
                if (isArr (location))
                    location = pointer[Patterns.delimiters[type[i][0]||'.']+'ByName'];
                pointer = location[type[i][1]];
                if (!pointer) throw 'not found';
            } catch (err) {
                // not found!
                var errstr = '';
                for (var i=start.length-1; i>0; i--)
                    errstr += '../../';
                var typestr = '';
                for (var i in type)
                    typestr += type[i][0] + type[i][1];
                return errstr + '../unknown.html?type=' + typestr;
            }
        }

        // create a ../../ navback
        for (var i=0, j=start.length-sameFromRoot; i<j; i++)
            str += '../../';
        if (!sameFromRoot) // the root is structured a little differently
            str = str.slice (3);

        for (var i=sameFromRoot, j=type.length; i<j; i++) {
            try {
                var location = pointer[Patterns.delimiters[type[i][0]||'.']];
                if (isArr (location))
                    location = pointer[Patterns.delimiters[type[i][0]||'.']+'ByName'];
                pointer = location[type[i][1]];
                if (!pointer) throw 'not found';
            } catch (err) {
                // not found!
                var errstr = '';
                for (var i=start.length; i; i--)
                    errstr += '../../';
                var typestr = '';
                for (var i in type)
                    typestr += type[i][0] + type[i][1];
                return errstr.slice (3) + '../unknown.html?type=' + typestr;
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
