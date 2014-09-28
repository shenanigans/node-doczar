
/**     @module doczar.Patterns
*/

var util = require ('util');

var pathWord    = '[\\w$]+';
var pathDelimit     = '[\\.#~\\(\\)]';
var cpath       = '[\\w$\\.#~\\(\\)]+';
var ctypes      = 'property|member|spare|module|class';
var ctypesInner = 'property|member|spare|module|class|argument|returns|callback|default';
var modtypes    = 'super|interface|abstract|development|public|protected|private|api';

module.exports.ctypes = {
    property:   true,
    member:     true,
    spare:      true,
    module:     true,
    class:      true
};

module.exports.innerCtypes = {
    property:   true,
    member:     true,
    spare:      true,
    module:     true,
    class:      true,
    argument:   true,
    returns:    true,
    callback:   true
};

module.exports.tag = new RegExp (
    util.format (
        '^(?:/\\*+|\'\'\'|"""|=begin)[ \\t]*@(%s)(?:/(%s(?:\\|%s)*))?[ \\t]+(%s)[ \\t]*\\r?[\\n\\r]',
                                              ctypes, cpath,  cpath,         cpath
    ) + '((?:.|[\\n\\r])*?)(?:\\*/|\'\'\'|"""|^=end)',
    'mg'
);

module.exports.innerTag = new RegExp (
    util.format (
        '[\\s\\n\\r]*@(%s|(?:%s(?:\\|%s)*))(?:/(%s(?:\\|%s)*))?[ \\t]+(%s)?[ \\t]*\\r?[\\n\\r]((?:.|[\\n\\r])*)',
                       ctypesInner, cpath, cpath, cpath, cpath,        cpath
    )
);

module.exports.modifier = new RegExp (
    util.format (
        '^[ \\t]*@(%s)(?:[ \\t]+(%s))?[ \\t]*\\r?[\\n\\r]?',
                   modtypes,     cpath
    )
);

module.exports.word = new RegExp (
    util.format (
        '(%s)?(%s)',
          pathDelimit, pathWord
    ),
    'g'
);

module.exports.inlineLink = new RegExp (
    util.format (
        '\\(type://(%s)\\)',
                    cpath
    ),
    'g'
);

module.exports.delimiters = {
    '~':        "spare",
    '.':        "property",
    '#':        "member",
    '(':        "argument",
    ')':        "returns"
};

var PATHFINDER = {
    '.':    { 'function':'functions' },
    '#':    { 'function':'methods' },
    '~':    {},
    '(':    {},
    ')':    {}
};
var PATHFINDER_DEFAULT = {
    '~':        "spares",
    '.':        "statics",
    '#':        "members",
    '(':        "arguments",
    ')':        "returns"
};

module.exports.delimitersInverse = {
    spare:      '~',
    property:   ".",
    module:     ".",
    class:      ".",
    member:     '#',
    argument:   '(',
    callback:   '{',
    returns:    ')'
};
