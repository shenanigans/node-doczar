
var path = require ('path');
var fs = require ('fs-extra');
var tools = require ('tools');

var ROOTS_RECURSE_NAMES_OBJ = [ ".props", ".members" ];
var ROOTS_RECURSE_NAMES_ARR = [ ".arguments" ];
var ROOTS_RECURSE_NAMES_NOD = [ ".returns", ".throws" ];

function LangPack (pack) {
    pack.trip = function (eventName) {
        var tripName = 'on'+eventName;
        if (!pack[tripName])
            return true;
        var args = [];
        for (var i=1,r=0,j=arguments.length; i<j; i++, r++)
            args[r] = arguments[i];
        return pack[tripName].apply (pack, args);
    };
    return pack;
}
module.exports = LangPack;

LangPack.loadRootFiles = function (names) {
    var newRoot = tools.newCollection();
    function convert (node) {
        for (var subkey in node) {
            if (subkey[0] !== '.')
                continue;
            var sym = tools[subkey.slice(1).toUpperCase()];
            if (sym === INSTANCE)
                node[sym] = node[subkey].map (function (name) { return newRoot[name]; });
            else if (ROOTS_RECURSE_NAMES_OBJ.indexOf (subkey) >= 0) {
                if (!node[sym]) {
                    node[sym] = tools.newCollection();
                    node[sym][PARENT] = node;
                }
                for (var subsubkey in node[subkey])
                    node[sym][subsubkey] = convert (node[subkey][subsubkey]);
            } else if (ROOTS_RECURSE_NAMES_ARR.indexOf (subkey) >= 0) {
                if (!node[sym])
                    node[sym] = [];
                for (var i=0,j=node[subkey].length; i<j; i++)
                    node[sym][i] = convert (node[subkey][i]);
            } else if (ROOTS_RECURSE_NAMES_NOD.indexOf (subkey) >= 0)
                node[sym] = convert (node[subkey]);
            else
                node[sym] = node[subkey];
            delete node[subkey];
        }
        node[LOCKED] = true;
        return node;
    }
    for (var i=0,j=names.length; i<j; i++) {
        var rootFile = require ('./roots/' + names[i]);
        for (var key in rootFile)
            newRoot[key] = convert (rootFile[key]);
    }
    return newRoot;
};
