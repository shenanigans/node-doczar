
/*      @module
    Digs document comments out of source files, splits them into Declarations and Modifiers, then
    reports everything it finds to a [ComponentCache](skeleton/skl/ComponentCache) instance.
*/

/*      @submodule:Array<Array> Path
    Paths are represented as Arrays of Arrays, each child Array representing the individual portions
    of a fragement path. That is, the delimiter, the String fragment name, and in the case that the
    fragment is an es6 symbol a third child contains another `Path` representing the parsed form of
    the fragment name. Examplia gratia:
    ```javascript
    [ [ ".", "name" ], ...]
    ```
    Or with a symbol:
    ```javascript
    [ [ ".", "Symbol.iterator", [ [ ".", "Symbol" ], [ ".", "iterator" ] ] ]
    ```
*/

/*      @submodule:class Valtype
    Represents a value type.
@member:String name
    The simple String representation of the type name.
@member:/Path path
    A [Path](:Path) representing the type.
@member:Boolean isPointer
    Whether the type was followed by an asterisk to identify it as a pointer.
@member:Boolean isArray
    Whether the type was followed by an empty set of square brackets to indicate that it is a bare
    array of its own type.
@member:Array</Generic> generics
    Any included generic types, e.g. `Array<String>`.
*/

/*      @submodule:class Generic
    Represents a type slotted into a generic/template type.
@member:String name
    The simple String representation of the type name.
@member:/Path path
    A [Path](:Path) representing the type.
*/

/*      @submodule:class Modifier
    Represents a modifier declaration.
@member:String mod
    The name of the modifier, without the `@`.
@member:/Path|undefined path
    If the modifier declaration included a path, it is provided here.
*/

/*      @submodule:class DocumentFragment
    Represents a single block of markdown text and wraps it with its context to ensure proper
    crosslinking. The same markdown doc is often rendered twice, once in a parent context and again
    on the Component's own page. To make generated docs compatible with local file view, either all
    links must be local paths or the entire page must be initialized to root with a `<base>`.
    Because `skeleton` chooses to use local links, the `href` for a given path changes between
    rendering contexts.
@member:String value
    The markdown text.
@member:/Path context
    The scope path which should be appended to crosslink target paths begining with a delimiter
    character.
*/

/*      @submodule:class Submission
    An intermediate structure for data hot off the `Parser` and ready to integrate into a
    [Component](skeleton.Component). Encapsulates information included in a single declaration or
    inner declaration.
@member:String ctype
    The Component type of the declaration.
@member:/DocumentFragment doc
    Markdown documentation String or Array of Strings.
@member:Array</Valtype> valtype
    Value types loaded from the declaration.
@member:Array</Modifier> modifiers
    All the modifiers in the declaration.
*/

// var fs                = require ('fs-extra');
var pathLib           = require ('path');
// var resolve           = require ('resolve');
// var filth             = require ('filth');
var tools             = require ('tools');
var langs             = require ('./langs');

/* An Object map of filenames already loaded to their cached file content Strings. */
var loadedDocuments = {};

/*
    Convert a path String to a path Array. If no path is generated, `[ [ ] ]` is returned. This is
    because **all** paths have a length but the final element may be filled contextually rather than
    explicitly.
@argument:String pathstr
@argument:/Path fileScope
@returns:/Path
    Returns Arrays of path fragment Arrays. These are of the form `[ [ ".", "name" ], ...]` or when
    Symbols are used, `[ [ ".", "Symbols.iterator", [ [ ".", "Symbols" ], [ ".", "iterator" ] ] ]`.
*/
function parsePath (pathstr, fileScope) {

}

/*
    Parse a standard type String. This may include any number of pipe-delimited iterations of paths
    with optional generic types.
@argument:String typestr
@argument:/Path fileScope
@returns:Array</Valtype>
    Each type in the pipe-delimited sequence (by default, length 1) represented as a [Valtype]
    (/Valtype).
*/
function parseType (typeStr, fileScope) {

}

/*
    @api
    Submit every Modifier and Declaration in a single source file to a [ComponentCache]
    (skeleton.ComponentCache) instance.
@argument:String fname
    An OS-localized absolute filename to read.
@argument:String fstr
@argument:/Path defaultScope
@argument:skeleton/skl/ComponentCache context
    Parsed information will be [reported](skeleton/skl/ComponentCache#submit) to this
    [ComponentCache](skeleton/skl/ComponentCache) instance.
@callback next
    Called any number of times to request that additional files be processed.
    @argument:String fname
        The OS-localized absolute filename of another file that should be processed.
    @returns
@callback
    @argument:Error|undefined err
        Any fatal filesystem Error that prevents the parser from completing.
*/
var parseFile = function (fname, fstr, defaultScope, context, next) {

}

/*
    Parse the contents of a documentation tag with its header already broken out.
*/
function parseTag (context, fname, ctype, valtype, pathfrags, fileScope, defaultScope, docstr, next) {

}

/*
    Parse a documentation tag written in javadoc-flavored syntax.
*/
function parseJavadocFlavorTag (docstr, scopeParent, logger) {

}

/*
    Parse an entire document of mixed code and documentation tags.
*/
function parseSyntaxFile (context, fname, referer, fstr, mode, defaultScope, next) {

}

/*
    Use the compiled information from syntax parsing to add Component definitions to a
    [ComponentCache](skeleton.ComponentCache).
*/
function generateComponents (context, mode, defaultScope) {

}

module.exports = {
    parseFile:              parseFile,
    parsePath:              parsePath,
    parseType:              parseType,
    parseTag:               parseTag,
    parseSyntaxFile:        parseSyntaxFile,
    generateComponents:     generateComponents
};
