
var path = require ('path');
var fs = require ('fs-extra');

var DELIMIT = process.platform == 'win32' ? '\\' : '/';

function getNodeModulePath (context, root, source, target) {
    var frags = target.split (DELIMIT);
    var refFrags = source.split (DELIMIT);
    var sameFromRoot = 0;
    for (var i=0,j=refFrags.length; i<j; i++) {
        if (frags[i] !== refFrags[i])
            break;
        sameFromRoot++;
    }
    var modFrags = frags.slice (sameFromRoot, frags.length-1);
    // if (modFrags.length)
        modFrags.push (path.parse (frags[frags.length-1]).name);

    var isDep = false;
    for (var i=refFrags.length-1, j=sameFromRoot-1; i>j; i--) {
        var frag = refFrags[i];
        try {
            var packageText = fs.readFileSync (
                refFrags.slice (0, i).join (DELIMIT)
              + DELIMIT
              + 'package.json'
            );
            var packageInfo = JSON.parse (packageText);
            if (
                packageInfo.dependencies
             && Object.hasOwnProperty.call (packageInfo.dependencies, frags[sameFromRoot])
            ) {
                // dependency module - do not use the root path!
                isDep = true;
                modFrags = [ frags[sameFromRoot] ];
                root = [];
            }
        } catch (err) {
            if (err.code == 'ENOENT')
                continue;
            return context.logger.fatal (err, 'failed to resolve dependencies');
        }

        // we only care about the first dependent directory entered
        break;
    }
    if (!isDep) for (var i=sameFromRoot-1,j=frags.length; i<j; i++) {
        var frag = frags[i];
        if (frag != 'node_modules')
            continue;
        if (i + 2 >= j) // too close to the end for this to be dependency module
            break;
        try {
            var packageText = fs.readFileSync (
                frags.slice (0, i).join (DELIMIT)
              + DELIMIT
              + 'package.json'
            );
            var packageInfo = JSON.parse (packageText);
            if (
                packageInfo.dependencies
             && Object.hasOwnProperty.call (packageInfo.dependencies, frags[i+1])
            ) {
                // dependency module - do not use the root path!
                isDep = true;
                modFrags = [ frags[i+1] ];
                root = [];
            }
        } catch (err) {
            if (err.code == 'ENOENT')
                continue;
            return context.logger.fatal (err, 'failed to resolve dependencies');
        }

        // we only care about the first dependent directory entered
        break;
    }

    var modulePath =
     root
     // .slice (0, refFrags.length - 1 - sameFromRoot)
     .slice (0, root.length - (refFrags.length - sameFromRoot - 1))
     .concat (modFrags.map (function (fname) { return [ '/', fname ]; }))
     ;

    if (isDep && !Object.hasOwnProperty.call (context.resolvedDependencies, modFrags[0])) {
        context.resolvedDependencies[modFrags[0]] = true;
        var modpathstr = modulePath.map (function (frag) { return frag[0] + frag[1] }).join ('');
        context.logger.info ({ path:modFrags[0], root:modpathstr }, 'resolved dependency');
    }

    context.logger.debug (
        { path:modulePath, from:source, to:target },
        'generated default module path'
    );
    return modulePath;
}

module.exports = getNodeModulePath;
