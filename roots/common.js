
var fs = require ('fs')
var filth = require ('filth');

var ROOTS = [ 'es5', 'es6', 'browser', 'node' ];
ROOTS.forEach (function (root) {
    var terms = fs.readFileSync (root + '.root').toString().split ('\n');
    var newDoc = Object.create (null);
    for (var i=0,j=terms.length; i<j; i++) {
        var term = terms[i];
        newDoc[term] = new filth.SafeMap ({
            '.types':   [],
            '.deref':   [],
            '.silent':  true,
            '.path':    [ [ '.', term ] ]
        });
    }
    fs.writeFileSync (root + '.json', JSON.stringify (newDoc));
});
