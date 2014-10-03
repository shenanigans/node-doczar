
/**     @module doczar.Patterns
    Syntax information and regular expressions used throughout doczar.
*/
var util = require ('util');

// for replacing into regex strings
var pathWord    = '[\\w$]+';
var pathDelimit     = '[\\.#~\\(\\)]';
var cpath       = '[\\w$\\.#~\\(\\)]+';
var ctypes      = 'property|member|spare|module|class';
var ctypesInner = 'property|member|spare|module|class|argument|returns|callback|default';
var modtypes    = 'super|interface|abstract|development|public|protected|private|api';

/**     @property/Object ctypes
    Simple map of valid Component types which may be used to start a new comment, to `true`.
*/
module.exports.ctypes = {
    property:   true,
    member:     true,
    spare:      true,
    module:     true,
    class:      true
};

/**     @property/Object innerCtypes
    Simple map of valid Component types for inner declarations or new comments, to `true`.
*/
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

/**     @property/RegExp tag
    Selects an entire document comment. Groups out Component type, value type, Component path, and
    the remaining document after the first line.
*/
module.exports.tag = new RegExp (
    util.format (
        '^[ \\t]*(?:/\\*+|\'\'\'|"""|=begin)[ \\t]*@(%s)(?:/(%s(?:\\|%s)*))?[ \\t]+(%s)[ \\t]*\\r?[\\n\\r]',
                                                     ctypes, cpath,  cpath,         cpath
    ) + '((?:.|[\\n\\r])*?)(?:\\*/|\'\'\'|"""|^=end)',
    'mg'
);

/**     @property/RegExp innerTag
    Selects an inner Declaration line and the contents afterward. Groups out Component type, value
    type, and Component path.
*/
module.exports.innerTag = new RegExp (
    util.format (
        '[\\s\\n\\r]*@(%s|(?:%s(?:\\|%s)*))(?:/(%s(?:\\|%s)*))?[ \\t]*(%s)?[ \\t]*\\r?[\\n\\r]((?:.|[\\n\\r])*)',
                       ctypesInner, cpath, cpath, cpath, cpath,        cpath
    )
);

/**     @property/RegExp modifier
    Select a Modifier line. Does not select contents afterward. Groups out Modifier type and
    Modifier path.
*/
module.exports.modifier = new RegExp (
    util.format (
        '^[ \\t]*@(%s)(?:[ \\t]+(%s))?[ \\t]*\\r?[\\n\\r]?',
                   modtypes,     cpath
    )
);

/**     @property/RegExp word
    Used for splitting paths. Groups out a delimiter/name pair.
*/
module.exports.word = new RegExp (
    util.format (
        '(%s)?(%s)',
          pathDelimit, pathWord
    ),
    'g'
);

/**     @property/Object delimiters
    Maps delimiter characters to their Component type. The ambiguous period delimiter maps to
    "property".
*/
module.exports.delimiters = {
    '~':        "spare",
    '.':        "property",
    '#':        "member",
    '(':        "argument",
    ')':        "returns",
    '{':        "argument"
};

/**     @property/Object delimitersInverse
    Maps Component types to their delimiter characters.
*/
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
