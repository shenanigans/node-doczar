
/*      @module doczar:Patterns
    Syntax information and regular expressions used throughout doczar. Abandon all hope ye who enter
    here.
*/
var util = require ('util');

/*      @property/String pathWord
    String rep of a RegExp that selects an individual path word, without delimiter, potentially from
    among a complex path.
*/
var pathWord = '[\\w\\$_@\x7f-\xff]+';
module.exports.pathWord = pathWord;
/*      @local/String pathDelimit
    A character class, as a String, containing all available path delimiters.
*/
var pathDelimit = '[/:\\.#~\\(\\)+%]';
/*      @local/String cpath
    A selector, as a String, for a standard Component path string. Stands for Component Path.
*/
var cpath =
    '[\\w\\$_@/:\\.#~\\(\\)+%\\[]?' // delimiter or [
  + '(?:[/:\\.#~\\(\\)+%]\\[|[\\w\\$_@\x7f-\xff:\\.#~\\(\\)+%\\]])+' // delimiter-[ or non-[
  ;
/*      @local/String tpath
    A selector, as a String, for either a [cpath](%cpath), an es6 symbol (a [cpath](%cpath) wrapped
    in square brackets) or an arbitrary String wrapped in backticks. Stands for Tricky Path.

    Backticks are escapable with backslash. Paired backslashes do not escape a backtick.
*/
var tpath = util.format (
    '(?:%s|`(?:[^`]|[^\\\\](?:\\\\\\\\)*\\\\`)+`)+',
        cpath
);
module.exports.cpath = cpath;
module.exports.tpath = tpath;
var modtypes    = 'development|api|super|implements|public|protected|private|abstract|final'
  + '|volatile|optional|const|root|alias|patches|remote|default'
  ;

/*      @property/RegExp jpath
    Splits a javadoc-flavor path.
*/
module.exports.jpathSplitter = new RegExp (util.format ('(event:|module:)?(%s)', pathWord));

var jpath = util.format (
    '(?:event:|module:)?%s(?:[.#](?:event:|module:)?%s)*',
                        pathWord,                   pathWord
);

/*      @property/RegExp jtag
    Parses a
*/
module.exports.jtag = new RegExp (util.format (
    '@(\\w+)(?:[ \\t]{(%s)})?(?:[ \\t]+(%s))?[ \\t]*(.*)',
                       jpath,           jpath
));

/*      @property/Object booleanModifiers
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

/*      @property/Object flagModifiers
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
    const:      true,
    constant:   true
};

/*      @property/Object ctypes
    Simple map of valid Component types which may be used to start a new comment, to `true`.
*/
module.exports.ctypes = {
    property:       true,
    member:         true,
    spare:          true,
    module:         true,
    submodule:      true,
    class:          true,
    struct:         true,
    interface:      true,
    enum:           true,
    throws:         true,
    event:          true,
    argument:       true,
    local:          true,
    args:           true,
    kwargs:         true,
    iterator:       true,
    generator:      true,
    constructor:    true
};
var ctypes = Object.keys (module.exports.ctypes).join ('|');

/*      @property/Object innerCtypes
    Simple map of valid Component types for inner declarations or new comments, to `true`.
*/
module.exports.innerCtypes = {
    load:           true,
    property:       true,
    member:         true,
    spare:          true,
    module:         true,
    submodule:      true,
    class:          true,
    struct:         true,
    interface:      true,
    enum:           true,
    throws:         true,
    event:          true,
    argument:       true,
    kwarg:          true,
    args:           true,
    kwargs:         true,
    returns:        true,
    callback:       true,
    named:          true,
    signature:      true,
    local:          true,
    iterator:       true,
    generator:      true,
    constructor:    true
};
var inCT = Object.keys (module.exports.innerCtypes).join ('|');

/*      @property/String typeSelector
    String rep of a RegExp that Selects a complex type descriptor. For example,
    `Object[String, MyMod.FooClass]|Array[String]|undefined`.
*/
var tSel = module.exports.typeSelector = util.format (
    '%s\\*?(?:<[ \\t]*(?:%s)?[ \\t]*(?:,[ \\t]*%s)*>)?(?:\\|%s(?:<[ \\t]*(?:%s)?(?:,[ \\t]*%s)*[ \\t]*>)?)*',
     tpath,              tpath,                tpath,       tpath,          tpath,         tpath
);

/*      @property/RegExp typeSelectorWord
    String rep of a RegExp that Selects a single type descriptor. For example,
    `Object[String, MyMod.FooClass]`.
*/
module.exports.typeSelectorWord = new RegExp (
    util.format (
        '\\|?(%s)(\\*?)[ \\t]*(?:<[ \\t]*((?:%s)?(?:,[ \\t]*%s)*)[ \\t]*>)?',
              tpath,                         tpath,         tpath
    )
);

/*      @property/RegExp jdocLeadSplitter

*/
module.exports.jdocLeadSplitter = /^[ \t]*(?:\*(?:[ \t]+|$))?(.*)/;

/*      @property/RegExp tag
    Selects a Declaration and its entire document comment. Groups out Component type, value type,
    Component path, and the remaining document after the first line.
*/
module.exports.tag = new RegExp (
       '(?:/\\*+|<!--|\'\'\'|"""|=begin)'
     + util.format (
        '[ \\t]*@(%s)(?:/(%s))?[ \\t]+(%s|\\[%s\\])[ \\t]*',
                  ctypes, tSel,        tpath, cpath
     )
     + '(?:\\r?[\\n\\r]((?:.|[\\n\\r])*?))?(?:\\*/|-->|\'\'\'|"""|^=end)',
    'mg'
);

/*      @property/RegExp jtag

*/
// module.exports.jtag = new RegExp (
//     '/* [ \\t\\n\\r]*'
//   + util.format (

//     )
//   + '*/'
// );

/*      @property/RegExp innerTag
    Selects an inner Declaration line and the contents afterward. Groups out Component type, value
    type, and Component path.
*/
module.exports.innerTag = new RegExp (
        util.format (
            '(?:^|[\\n\\r])[ \\t\\n\\r]*@(%s|%s)(?:/(%s))?(?:[ \\t]+',
                                          inCT, tSel, tSel
        )
     +  util.format (
            '((?:\\([ \\t]*(?:%s[ \\t]+)?%s(?:[ \\t]*,[ \\t]*(?:%s[ \\t]+)?%s[ \\t]*)*\\)|%s)?)[ \\t]*',
                              tSel,      tpath,                 tSel,      tpath,         tpath
        )
     + ')?\\r?[\\n\\r]((?:.|[\\n\\r])*)'
);

/*      @property/RegExp modifier
    Select a Modifier line. Does not select contents afterward. Groups out Modifier type and
    Modifier path.
*/
module.exports.modifier = new RegExp (
    util.format (
        '^[ \\t]*@(%s)[ \\t]*(%s|\\[%s\\])?[ \\t]*\\r?[\\n\\r]?',
                   modtypes,  tpath, cpath
    )
);

/*      @property/RegExp word
    Used for splitting paths. Groups out a delimiter/name pair.
*/
module.exports.word = new RegExp (
    util.format (
        '^(%s)?(%s|`.+?(?:[^\\\\]|[^\\\\]\\\\\\\\)`|\\[%s\\])',
          pathDelimit, pathWord,                      cpath
    )
);

/*      @property/RegExp signatureTag
    Selects an entire comment tag dedicated to a `@signature` Declaration.
*/
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

/*      @property/RegExp signatureArgument
    Selects an individual argument from a `@signature` Declaration.
*/
module.exports.signatureArgument = new RegExp (
    util.format (
        ',?[ \\t]*(?:(%s)[ \\t]+)?(%s)',
                      tSel,       pathWord
    ),
    'g'
);

/*      @property/Object delimiters
    Maps delimiter characters to their Component type. The ambiguous period delimiter maps to
    "property".
*/
module.exports.delimiters = {
    '~':        'spare',
    ':':        'module',
    '/':        'module',
    '.':        'property',
    '#':        'member',
    '(':        'argument',
    ')':        'returns',
    '{':        'argument', // callbacks masquerade as arguments
    '!':        'throws',
    '+':        'event',
    '&':        'signature',
    '%':        'local'
};

/*      @property/Object delimitersInverse
    Maps Component types to their delimiter characters.
*/
module.exports.delimitersInverse = {
    spare:          '~',
    constructor:    '~',
    module:         '/',
    submodule:      '/',
    property:       '.',
    class:          '.',
    struct:         '.',
    interface:      '.',
    enum:           '.',
    named:          '.',
    member:         '#',
    argument:       '(',
    kwarg:          '(',
    args:           '(',
    kwargs:         '(',
    callback:       '{',
    returns:        ')',
    throws:         '!',
    event:          '+',
    signature:      '&',
    local:          '%'
};

/*      @property/Object ctypeDisambiguator
    Maps component type's that share delimiters to the canonical component type which owns the
    delimiter. Also maps canonical component types to themselves.
*/
module.exports.ctypeDisambiguator = {
    submodule:      'module',
    constructor:    'spare',
    class:          'property',
    struct:         'property',
    interface:      'property',
    enum:           'property',
    named:          'property',
    kwarg:          'argument',
    args:           'argument',
    // canonical section
    spare:          'spare',
    property:       'property',
    module:         'module',
    member:         'member',
    argument:       'argument',
    callback:       'callback',
    returns:        'returns',
    throws:         'throws',
    event:          'event',
    signature:      'signature',
    local:          'local'
};

var HEIRARCHY = [
    "spare",        "module",       "enum",         "named",        "interface",    "class",
    "property",     "member",       "argument",     "kwarg",        "callback",     "returns",
    "throws"
];
/*      @property/Object[String, Number] HEIRARCHY
    A map of Component types to Number sort priorities. This is used when sorting unordered child
    sets during [finalize](doczar.Component#finalize).
*/
module.exports.HEIRARCHY = {};
for (var i in HEIRARCHY) module.exports.HEIRARCHY[HEIRARCHY[i]] = i;
// argument and callback are special!
module.exports.HEIRARCHY.argument = module.exports.HEIRARCHY.callback;
