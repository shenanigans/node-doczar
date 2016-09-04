
require ('async');
// require ('fs');

var Thingy = require ('./NodeParseModules/Thingy');
var mixedModule = require ('./NodeParseModules/SeveralThings');

var myThing = new Thingy (4, 'four');
var stored = mixedModule.otherThing (myThing, mixedModule.oneLastThing, 'four');
mixedModule.modEx (exports);
