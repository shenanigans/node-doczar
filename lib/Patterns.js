
/**     @module doczar.Patterns
    Syntax information and regular expressions used throughout doczar.
*/
var util = require ('util');

// for replacing into regex strings
var pathWord    = '[\\w\\$_@\x7f-\xff]+';
var pathDelimit =                  '[\\.#~\\(\\)+]';
var cpath       = '[\\w\\$_@\x7f-\xff\\.#~\\(\\)+]+';
var modtypes    = 'development|api|super|implements|public|protected'
                 + '|private|abstract|final|volatile|optional|const'
                 ;

/**     @property/Object booleanModifiers
    Truth map of Modifier types which are considered to be simple booleans. Many of these are also
    "flag" modifiers.
*/
module.exports.booleanModifiers = {
    development:    true,
    api:            true,
    public:         true,
    protected:      true,
    private:        true,
    abstract:       true,
    final:          true,
    volatile:       true,
    optional:       true,
    const:          true
};

/**     @property/Object flagModifiers
    A truthmap of modifiers which become "flags", such as `@private` and `@const`.
*/
module.exports.flagModifiers = {
    public:     true,
    protected:  true,
    private:    true,
    abstract:   true,
    final:      true,
    volatile:   true,
    optional:   true,
    const:      true
};

/**     @property/Object ctypes
    Simple map of valid Component types which may be used to start a new comment, to `true`.
*/
module.exports.ctypes = {
    property:   true,
    member:     true,
    spare:      true,
    module:     true,
    class:      true,
    interface:  true,
    enum:       true,
    throws:     true,
    event:      true
};
var ctypes = Object.keys (module.exports.ctypes).join ('|');

/**     @property/Object innerCtypes
    Simple map of valid Component types for inner declarations or new comments, to `true`.
*/
module.exports.innerCtypes = {
    property:   true,
    member:     true,
    spare:      true,
    module:     true,
    class:      true,
    interface:  true,
    enum:       true,
    throws:     true,
    event:      true,
    argument:   true,
    kwarg:      true,
    returns:    true,
    callback:   true,
    named:      true,
    signature:  true
};
var inCT = Object.keys (module.exports.innerCtypes).join ('|');

// var tSel = module.exports.typeSelector = util.format (
//     '%s(?:\\[%s(?:, *%s)*\\])?(?:\\|%s(?:\\[%s(?:, *%s)*\\])?)*',
//      cpath,  cpath,  cpath,         cpath,  cpath,  cpath
// );
var tSel = module.exports.typeSelector = util.format (
    '%s(?:\\[%s(?:, *%s)*\\])?(?:\\|%s(?:\\[%s(?:, *%s)*\\])?)*',
     cpath,  cpath,  cpath,         cpath,  cpath,  cpath
);

module.exports.typeSelectorWord = new RegExp (
    util.format (
        '\\|?(%s)[ \\t]*(?:\\[(%s(?:,[ \\t]*%s)*)\\])?',
              cpath,           cpath,       cpath
    )
);

/**     @property/RegExp tag
    Selects an entire document comment. Groups out Component type, value type, Component path, and
    the remaining document after the first line.
*/
module.exports.tag = new RegExp (
       '^[ \\t]*(?:/\\*+|<!--|\'\'\'|"""|=begin)'
     + util.format (
        '[ \\t]*@(%s)(?:/(%s))?[ \\t]+(%s)[ \\t]*\\r?[\\n\\r]',
                  ctypes, tSel, cpath
     )
     + '((?:.|[\\n\\r])*?)(?:\\*/|-->|\'\'\'|"""|^=end)',
    'mg'
);

/**     @property/RegExp innerTag
    Selects an inner Declaration line and the contents afterward. Groups out Component type, value
    type, and Component path.
*/
// module.exports.innerTag = new RegExp (
//         util.format (
//             '[\\s\\n\\r]*@(%s|%s)(?:/(%s))?[ \\t]*(%s)?',
//                inCT, tSel, tSel,       cpath
//         )
//      + '[ \\t]*\\r?[\\n\\r]((?:.|[\\n\\r])*)'
// );
module.exports.innerTag = new RegExp (
        util.format (
            '[ \\t\\n\\r]*@(%s|%s)(?:/(%s))?[ \\t]*((?:\\([ \\t]*(?:%s[ \\t]+)?%s(?:[ \\t]*,[ \\t]*(?:%s[ \\t]+)?%s[ \\t]*)*\\)|%s)?)',
                           inCT, tSel, tSel,                     tSel,      cpath,                 tSel,      cpath,  cpath
        )
     + '[ \\t]*\\r?[\\n\\r]((?:.|[\\n\\r])*)'
);

/**     @property/RegExp modifier
    Select a Modifier line. Does not select contents afterward. Groups out Modifier type and
    Modifier path.
*/
module.exports.modifier = new RegExp (
    util.format (
        '^[ \\t]*@(%s)[ \\t]*(%s)?[ \\t]*\\r?[\\n\\r]?',
                   modtypes, cpath
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

module.exports.signatureTag = new RegExp (
    '^\\s*(?:/\\*+|<!--|\'\'\'|"""|=begin)\\s*'
  + util.format (
        '@signature(?:/(%s(?:\\|%s)*))?\\s+(%s)\\s*',
                        cpath,  cpath,      cpath
    )
  + util.format (
        '\\(\\s*(%s(?:,\\s*%s)*\\s*)\\)',
                 cpath,    cpath
    )
  + '((?:.|[\\n\\r])*)(?:\\*/|-->|\'\'\'|"""|^=end)',
    'mg'
);

module.exports.signatureArgument = new RegExp (
    util.format (
        ',?[ \\t]*(?:(%s)[ \\t]+)?(%s)',
                      tSel,       pathWord
    ),
    'g'
);

/**     @property/Object delimiters
    Maps delimiter characters to their Component type. The ambiguous period delimiter maps to
    "property".
*/
module.exports.delimiters = {
    '~':        'spare',
    '.':        'property',
    '#':        'member',
    '(':        'argument',
    ')':        'returns',
    '{':        'argument', // callbacks masquerade as arguments
    '!':        'throws',
    '+':        'event',
    '&':        'signature'
};

/**     @property/Object delimitersInverse
    Maps Component types to their delimiter characters.
*/
module.exports.delimitersInverse = {
    spare:      '~',
    property:   '.',
    module:     '.',
    class:      '.',
    interface:  '.',
    enum:       '.',
    named:      '.',
    member:     '#',
    argument:   '(',
    kwarg:      '(',
    callback:   '{',
    returns:    ')',
    throws:     '!',
    event:      '+',
    signature:  '&'
};

var HEIRARCHY = [
    "spare",        "module",       "enum",         "named",        "interface",    "class",
    "property",     "member",       "argument",     "kwarg",        "callback",     "returns",
    "throws"
];
module.exports.HEIRARCHY = {};
for (var i in HEIRARCHY) module.exports.HEIRARCHY[HEIRARCHY[i]] = i;
// argument and callback are special!
module.exports.HEIRARCHY.argument = module.exports.HEIRARCHY.callback;
